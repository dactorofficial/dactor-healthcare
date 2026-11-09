#!/usr/bin/env node
/**
 * DACTOR Cloud-to-Cloud Backup & Synchronization Pipeline
 * 
 * Runs purely in cloud runners (e.g. GitHub Actions, Cloud Run, Supabase Cron).
 * Extracts data directly from Supabase Cloud and uploads directly to Google Drive
 * via Google Drive REST API v3 using Service Account authentication.
 * 
 * Bypasses local developer laptops entirely — zero files on disk, zero laptop dependencies.
 */

import crypto from 'crypto';
import { extractClinicData, listClinics, extractMediaTargets, DEFAULT_SUPABASE_URL, DEFAULT_ANON_KEY } from './backup/lib/aggregator.mjs';
import { toJSON, toCSV } from './backup/lib/serializer.mjs';
import {
  getAccessTokenFromServiceAccount,
  getAccessTokenFromRefreshToken,
  findOrCreateFolder,
  uploadFileToDrive
} from './backup/lib/gdrive_api.mjs';

export const EXIT_CODES = {
  SUCCESS: 0,
  FATAL: 1,
  BAD_ARGS: 2,
  AUTH_FAIL: 3,
  NETWORK_FAIL: 4
};

function parseArgs(argv) {
  const options = {
    all: false,
    clinicId: null,
    dryRun: false,
    parentFolderId: process.env.GDRIVE_PARENT_FOLDER_ID || null,
    verbose: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') options.all = true;
    else if (arg === '--clinic-id') options.clinicId = argv[++i];
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--parent-folder-id') options.parentFolderId = argv[++i];
    else if (arg === '--verbose') options.verbose = true;
  }
  return options;
}

function computeSHA256(bufferOrString) {
  const hash = crypto.createHash('sha256');
  hash.update(bufferOrString);
  return hash.digest('hex');
}

async function main() {
  const args = parseArgs(process.argv);

  console.log('='.repeat(65));
  console.log('🚀 DACTOR Cloud-to-Cloud Backup Pipeline ➔ Google Drive');
  console.log('='.repeat(65));

  const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || DEFAULT_ANON_KEY;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
  const clientId = process.env.GDRIVE_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
  const saKeyRaw = process.env.GDRIVE_SERVICE_ACCOUNT_KEY;

  if (!refreshToken && !saKeyRaw && !args.dryRun) {
    console.error('❌ Error: Missing Google Drive credentials.');
    console.error('   Please provide either GDRIVE_REFRESH_TOKEN or GDRIVE_SERVICE_ACCOUNT_KEY.');
    process.exitCode = EXIT_CODES.AUTH_FAIL;
    return;
  }

  let accessToken = null;
  if (!args.dryRun) {
    try {
      if (refreshToken) {
        console.log('🔑 Authenticating with Google OAuth2 Refresh Token (Personal Drive 5 TB)...');
        accessToken = await getAccessTokenFromRefreshToken({ clientId, clientSecret, refreshToken });
        console.log('✅ Google Drive OAuth2 authentication successful.');
      } else {
        console.log('🔑 Authenticating with Google Cloud Service Account...');
        accessToken = await getAccessTokenFromServiceAccount(saKeyRaw);
        console.log('✅ Google Drive Service Account authentication successful.');
      }
    } catch (err) {
      console.error(`❌ Authentication failed: ${err.message}`);
      process.exitCode = EXIT_CODES.AUTH_FAIL;
      return;
    }
  }

  // 1. Identify clinics to backup
  let clinicIds = [];
  if (args.clinicId) {
    clinicIds = [args.clinicId];
  } else if (args.all) {
    console.log('🔍 Querying active clinics from Supabase Cloud...');
    try {
      const clinics = await listClinics({ supabaseUrl, apiKey: supabaseKey });
      clinicIds = clinics.map(c => c.id);
      console.log(`Found ${clinicIds.length} clinic(s) to synchronize.`);
    } catch (err) {
      console.error(`❌ Failed to list clinics: ${err.message}`);
      process.exitCode = EXIT_CODES.NETWORK_FAIL;
      return;
    }
  } else {
    console.log('ℹ️ No clinics specified. Use --all or --clinic-id <uuid>.');
    return;
  }

  const startTime = Date.now();
  const summary = [];

  for (const clinicId of clinicIds) {
    console.log(`\n🏥 Processing Clinic: [${clinicId}]`);
    const cStartTime = Date.now();

    try {
      // 2. Extract 10 relational tables in memory
      console.log('  ⬇️ Fetching relational data from Supabase...');
      const clinicBundle = await extractClinicData(clinicId, { supabaseUrl, apiKey: supabaseKey, redact: true });
      if (!clinicBundle || !clinicBundle.clinic) {
        throw new Error(`Failed to extract data for clinic ${clinicId}`);
      }

      const tables = [
        { name: 'clinics', data: [clinicBundle.clinic] },
        { name: 'clinic_services', data: clinicBundle.services || [] },
        { name: 'clinic_catalog', data: clinicBundle.catalog || [] },
        { name: 'doctors', data: clinicBundle.doctors || [] },
        { name: 'slots', data: clinicBundle.slots || [] },
        { name: 'appointments', data: clinicBundle.appointments || [] },
        { name: 'queue_entries', data: clinicBundle.queueEntries || [] },
        { name: 'billing_invoices', data: clinicBundle.billingInvoices || [] },
        { name: 'invoice_transactions', data: clinicBundle.invoiceTransactions || [] },
        { name: 'lab_reports', data: clinicBundle.labReports || [] }
      ];

      let totalRecords = 0;
      for (const tbl of tables) {
        totalRecords += tbl.data.length;
      }
      console.log(`  📊 Extracted ${totalRecords} records across 10 tables.`);

      if (args.dryRun) {
        console.log('  [DRY RUN] Skipping Google Drive upload.');
        summary.push({ clinicId, status: 'DRY_RUN', records: totalRecords, files: 20 });
        continue;
      }

      // 3. Resolve Root & Target Folders in Google Drive
      // Root: "DACTOR Clinic Backups" (inside parentFolderId if provided)
      const rootFolderId = await findOrCreateFolder('DACTOR Clinic Backups', args.parentFolderId, accessToken);
      const clinicFolderId = await findOrCreateFolder(clinicId, rootFolderId, accessToken);

      const timestampIso = new Date().toISOString().replace(/[:.]/g, '-');
      const snapFolderId = await findOrCreateFolder(timestampIso, clinicFolderId, accessToken);
      const latestFolderId = await findOrCreateFolder('latest', clinicFolderId, accessToken);

      const snapJsonFolder = await findOrCreateFolder('data_json', snapFolderId, accessToken);
      const snapCsvFolder = await findOrCreateFolder('data_csv', snapFolderId, accessToken);
      const latestJsonFolder = await findOrCreateFolder('data_json', latestFolderId, accessToken);
      const latestCsvFolder = await findOrCreateFolder('data_csv', latestFolderId, accessToken);

      const manifestFiles = [];
      let totalBytesUploaded = 0;

      // 4. Upload JSON & CSV Tables
      console.log('  ☁️ Uploading relational JSON & CSV tables to Google Drive...');
      for (const tbl of tables) {
        const jsonContent = toJSON(tbl.data, { pretty: true, metadata: false });
        const csvContent = toCSV(tbl.data);

        const jsonBuffer = Buffer.from(jsonContent, 'utf8');
        const csvBuffer = Buffer.from(csvContent, 'utf8');

        totalBytesUploaded += jsonBuffer.length + csvBuffer.length;

        // Upload snapshot
        await uploadFileToDrive({
          name: `${tbl.name}.json`,
          content: jsonBuffer,
          mimeType: 'application/json',
          parentFolderId: snapJsonFolder,
          accessToken
        });
        await uploadFileToDrive({
          name: `${tbl.name}.csv`,
          content: csvBuffer,
          mimeType: 'text/csv',
          parentFolderId: snapCsvFolder,
          accessToken
        });

        // Mirror to latest
        await uploadFileToDrive({
          name: `${tbl.name}.json`,
          content: jsonBuffer,
          mimeType: 'application/json',
          parentFolderId: latestJsonFolder,
          accessToken
        });
        await uploadFileToDrive({
          name: `${tbl.name}.csv`,
          content: csvBuffer,
          mimeType: 'text/csv',
          parentFolderId: latestCsvFolder,
          accessToken
        });

        manifestFiles.push({
          path: `data/json/${tbl.name}.json`,
          records: tbl.data.length,
          sizeBytes: jsonBuffer.length,
          sha256: computeSHA256(jsonBuffer)
        });
        manifestFiles.push({
          path: `data/csv/${tbl.name}.csv`,
          records: tbl.data.length,
          sizeBytes: csvBuffer.length,
          sha256: computeSHA256(csvBuffer)
        });
      }

      // 5. Download and Upload Storage Attachments
      const mediaTargets = extractMediaTargets(clinicBundle);
      if (mediaTargets.length > 0) {
        console.log(`  📷 Processing ${mediaTargets.length} media attachments...`);
        const snapMediaFolder = await findOrCreateFolder('media', snapFolderId, accessToken);
        const latestMediaFolder = await findOrCreateFolder('media', latestFolderId, accessToken);

        for (const target of mediaTargets) {
          try {
            const fileUrl = `${supabaseUrl}/storage/v1/object/public/${target.bucket}/${target.storagePath}`;
            const fileRes = await fetch(fileUrl);
            if (fileRes.ok) {
              const fileBuf = Buffer.from(await fileRes.arrayBuffer());
              const mime = fileRes.headers.get('content-type') || 'application/octet-stream';
              const cleanFileName = target.storagePath.replace(/[/\\?%*:|"<>]/g, '_');

              await uploadFileToDrive({
                name: cleanFileName,
                content: fileBuf,
                mimeType: mime,
                parentFolderId: snapMediaFolder,
                accessToken
              });
              await uploadFileToDrive({
                name: cleanFileName,
                content: fileBuf,
                mimeType: mime,
                parentFolderId: latestMediaFolder,
                accessToken
              });

              totalBytesUploaded += fileBuf.length;
              manifestFiles.push({
                path: `media/${cleanFileName}`,
                records: 1,
                sizeBytes: fileBuf.length,
                sha256: computeSHA256(fileBuf)
              });
            }
          } catch (mErr) {
            console.warn(`    ⚠️ Warning: media upload failed for ${target.storagePath}: ${mErr.message}`);
          }
        }
      }

      // 6. Build and Upload Cryptographic Manifest
      const manifest = {
        manifestVersion: '1.0',
        generatedAt: new Date().toISOString(),
        clinicId,
        metadata: {
          totalFiles: manifestFiles.length,
          totalRecords,
          totalBytes: totalBytesUploaded
        },
        files: manifestFiles
      };
      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');

      await uploadFileToDrive({
        name: 'backup_manifest.json',
        content: manifestBuffer,
        mimeType: 'application/json',
        parentFolderId: snapFolderId,
        accessToken
      });
      await uploadFileToDrive({
        name: 'backup_manifest.json',
        content: manifestBuffer,
        mimeType: 'application/json',
        parentFolderId: latestFolderId,
        accessToken
      });

      const elapsedSec = ((Date.now() - cStartTime) / 1000).toFixed(1);
      console.log(`  ✅ Backup complete in ${elapsedSec}s: ${manifestFiles.length} files (${(totalBytesUploaded / 1024).toFixed(1)} KB) synced to Google Drive.`);
      summary.push({ clinicId, status: 'SUCCESS', records: totalRecords, files: manifestFiles.length, bytes: totalBytesUploaded, duration: `${elapsedSec}s` });

    } catch (err) {
      console.error(`  ❌ Failed backup for clinic [${clinicId}]: ${err.message}`);
      summary.push({ clinicId, status: 'FAILED', error: err.message });
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(65));
  console.log(`🎉 Cloud-to-Cloud Backup Run Complete in ${totalTime}s`);
  console.log('='.repeat(65));
  console.table(summary);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exitCode = EXIT_CODES.FATAL;
});
