#!/usr/bin/env node
/**
 * DACTOR Clinic Data Backup & Synchronization Pipeline
 * Zero-dependency Node.js ESM execution engine.
 * Exports relational datasets and mirrors binary media from Supabase to Google Drive.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { extractClinicData, listClinics, extractMediaTargets } from './backup/lib/aggregator.mjs';
import { toJSON, toCSV } from './backup/lib/serializer.mjs';
import { syncClinicAttachments, computeSHA256 } from './backup/lib/storage_downloader.mjs';
import { buildManifest, writeManifest, scanDirectoryFiles } from './backup/lib/manifest_builder.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Standard Exit Codes
export const EXIT_CODES = {
  SUCCESS: 0,
  NETWORK_OR_FATAL: 1,
  BAD_ARGS: 2,
  NOT_FOUND: 3,
  INTEGRITY_FAIL: 4
};

const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, 'backups', 'clinics');
const DEFAULT_STAGING_DIR = path.join(
  process.env.LOCALAPPDATA || os.tmpdir(),
  'Temp',
  'dactor_backup_staging'
);

function printHelp() {
  console.log(`
Usage: node scripts/sync_clinic_backups.mjs [options]

Options:
  --all                 Backup all active clinics
  --clinic-id <uuid>    Backup single clinic by UUID
  --dry-run             Simulate without writing files
  --output-dir <path>   Destination directory (default: backups/clinics)
  --staging-dir <path>  Scratch staging directory (default: %LOCALAPPDATA%\\Temp\\dactor_backup_staging)
  --verbose             Verbose logging
  --help                Show help
`);
}

export function parseCliArgs(argv) {
  const options = {
    all: false,
    clinicId: null,
    dryRun: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    stagingDir: DEFAULT_STAGING_DIR,
    verbose: false,
    help: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') {
      options.all = true;
    } else if (arg === '--clinic-id') {
      options.clinicId = argv[++i];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--output-dir') {
      options.outputDir = path.resolve(argv[++i]);
    } else if (arg === '--staging-dir') {
      options.stagingDir = path.resolve(argv[++i]);
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

/**
 * Copies a directory recursively with retry logic to avoid Google Drive virtual file locks (EBUSY / EPERM).
 */
export async function copyDirectoryAtomicWithRetry(srcDir, destDir, maxRetries = 5) {
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(srcDir, ent.name);
    const destPath = path.join(destDir, ent.name);

    if (ent.isDirectory()) {
      await copyDirectoryAtomicWithRetry(srcPath, destPath, maxRetries);
    } else if (ent.isFile()) {
      let attempts = 0;
      let copied = false;
      while (attempts < maxRetries && !copied) {
        attempts++;
        try {
          fs.copyFileSync(srcPath, destPath);
          copied = true;
        } catch (err) {
          if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempts < maxRetries) {
            const backoff = attempts * 250;
            await new Promise((res) => setTimeout(res, backoff));
          } else {
            throw err;
          }
        }
      }
    }
  }
}

/**
 * Executes backup for a single clinic bundle.
 */
async function backupClinic(clinicRecord, options) {
  const { outputDir, stagingDir, dryRun, verbose } = options;
  const clinicId = clinicRecord.id;
  const clinicName = clinicRecord.name || 'Unnamed Clinic';
  const timestamp = new Date().toISOString();
  const dateSlug = timestamp.replace(/[:.]/g, '-');

  if (verbose) {
    console.log(`\nProcessing clinic: [${clinicId}] "${clinicName}"`);
  }

  // 1. Extract 10 relational tables
  const clinicBundle = await extractClinicData(clinicId, {
    redact: true,
    verbose
  });

  if (!clinicBundle || !clinicBundle.clinic) {
    throw new Error(`Failed to extract data for clinic ${clinicId}`);
  }

  const mediaTargets = extractMediaTargets(clinicBundle);

  if (dryRun) {
    console.log(`[DRY-RUN] Clinic: "${clinicName}" (${clinicId})`);
    console.log(`  - Services: ${clinicBundle.services?.length || 0}`);
    console.log(`  - Doctors: ${clinicBundle.doctors?.length || 0}`);
    console.log(`  - Appointments: ${clinicBundle.appointments?.length || 0}`);
    console.log(`  - Invoices: ${clinicBundle.billingInvoices?.length || 0}`);
    console.log(`  - Lab Reports: ${clinicBundle.labReports?.length || 0}`);
    console.log(`  - Media Assets: ${mediaTargets.length} target(s)`);
    return { success: true, dryRun: true };
  }

  // 2. Setup Staging Directory (Local SSD Scratch Staging)
  const stagingClinicDir = path.join(stagingDir, `${clinicId}_${dateSlug}`);
  const jsonDir = path.join(stagingClinicDir, 'data', 'json');
  const csvDir = path.join(stagingClinicDir, 'data', 'csv');
  const filesDir = path.join(stagingClinicDir, 'files');

  fs.mkdirSync(jsonDir, { recursive: true });
  fs.mkdirSync(csvDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });

  // 3. Serialize Tabular Data
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

  for (const tbl of tables) {
    const jsonPath = path.join(jsonDir, `${tbl.name}.json`);
    const csvPath = path.join(csvDir, `${tbl.name}.csv`);

    fs.writeFileSync(jsonPath, toJSON(tbl.data, { pretty: true, metadata: false }), 'utf8');
    fs.writeFileSync(csvPath, toCSV(tbl.data), 'utf8');
  }

  // 4. Download Storage Attachments
  const { downloadedFiles, warnings } = await syncClinicAttachments(mediaTargets, stagingClinicDir, {
    verbose
  });

  // 5. Scan Staging Directory & Build Manifest
  const allStagedFiles = scanDirectoryFiles(stagingClinicDir);
  const manifest = buildManifest({
    clinicId,
    clinicName,
    timestamp,
    files: allStagedFiles,
    warnings
  });

  writeManifest(manifest, stagingClinicDir);

  // 6. Transfer Atomically from Local SSD Staging to Destination (Google Drive)
  // Target structure: <outputDir>/<clinicId>/latest and <outputDir>/<clinicId>/<dateSlug>
  const targetClinicDir = path.join(outputDir, clinicId);
  const snapshotTargetDir = path.join(targetClinicDir, dateSlug);

  fs.mkdirSync(snapshotTargetDir, { recursive: true });
  await copyDirectoryAtomicWithRetry(stagingClinicDir, snapshotTargetDir);

  // Also maintain a 'latest' snapshot pointer
  const latestTargetDir = path.join(targetClinicDir, 'latest');
  fs.mkdirSync(latestTargetDir, { recursive: true });
  await copyDirectoryAtomicWithRetry(stagingClinicDir, latestTargetDir);

  // 7. Cleanup Local Scratch Staging
  try {
    fs.rmSync(stagingClinicDir, { recursive: true, force: true });
  } catch (_) {
    // Non-fatal scratch cleanup error
  }

  // 8. Post-Transfer Integrity Verification
  for (const fileRecord of manifest.files) {
    const finalDestFile = path.join(snapshotTargetDir, fileRecord.relative_path);
    if (!fs.existsSync(finalDestFile)) {
      console.error(`❌ Integrity Error: Missing file at ${finalDestFile}`);
      return { success: false, integrityFail: true };
    }
    const finalBuf = fs.readFileSync(finalDestFile);
    const finalHash = computeSHA256(finalBuf);
    if (finalHash !== fileRecord.sha256) {
      console.error(`❌ Checksum Mismatch: ${fileRecord.relative_path} (expected ${fileRecord.sha256}, got ${finalHash})`);
      return { success: false, integrityFail: true };
    }
  }

  console.log(`√ Successfully backed up clinic: "${clinicName}"`);
  console.log(`  - Total Files: ${manifest.stats.total_files}`);
  console.log(`  - Total Size: ${(manifest.stats.total_bytes / 1024).toFixed(1)} KB`);
  console.log(`  - Target: ${snapshotTargetDir}`);

  return {
    success: true,
    manifest
  };
}

async function main() {
  const options = parseCliArgs(process.argv);

  if (options.help) {
    printHelp();
    process.exitCode = EXIT_CODES.SUCCESS;
    return;
  }

  // Validate arguments
  if (options.all && options.clinicId) {
    console.error('❌ Error: Conflicting arguments. Use either --all OR --clinic-id <uuid>, not both.');
    printHelp();
    process.exitCode = EXIT_CODES.BAD_ARGS;
    return;
  }

  if (!options.all && !options.clinicId) {
    console.error('❌ Error: Must specify either --all or --clinic-id <uuid>.');
    printHelp();
    process.exitCode = EXIT_CODES.BAD_ARGS;
    return;
  }

  console.log('======================================================================');
  console.log('   DACTOR CLINIC DATA BACKUP & SYNCHRONIZATION PIPELINE               ');
  console.log('======================================================================');
  console.log(`Mode: ${options.dryRun ? 'DRY-RUN (Simulation)' : 'ACTIVE BACKUP'}`);
  console.log(`Destination: ${options.outputDir}`);
  console.log(`Staging: ${options.stagingDir}`);

  const startTime = Date.now();

  try {
    let clinicsToBackup = [];

    if (options.clinicId) {
      const allClinics = await listClinics();
      const match = allClinics.find((c) => c.id === options.clinicId);
      if (!match) {
        console.error(`❌ Clinic Not Found: No clinic matching UUID "${options.clinicId}"`);
        process.exitCode = EXIT_CODES.NOT_FOUND;
        return;
      }
      clinicsToBackup = [match];
    } else {
      clinicsToBackup = await listClinics();
      if (clinicsToBackup.length === 0) {
        console.warn('⚠️ Warning: No clinics found to back up.');
      }
    }

    let overallSuccess = true;
    let integrityFailed = false;

    for (const clinic of clinicsToBackup) {
      const res = await backupClinic(clinic, options);
      if (!res.success) {
        overallSuccess = false;
        if (res.integrityFail) {
          integrityFailed = true;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('======================================================================');
    console.log(`Backup completed in ${elapsed}s.`);

    if (integrityFailed) {
      process.exitCode = EXIT_CODES.INTEGRITY_FAIL;
      return;
    }

    if (!overallSuccess) {
      process.exitCode = EXIT_CODES.NETWORK_OR_FATAL;
      return;
    }

    process.exitCode = EXIT_CODES.SUCCESS;
  } catch (err) {
    console.error(`❌ Fatal Error during backup execution: ${err.message}`);
    if (options.verbose) {
      console.error(err.stack);
    }
    process.exitCode = EXIT_CODES.NETWORK_OR_FATAL;
  }
}

// Unhandled rejection safety
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exitCode = EXIT_CODES.NETWORK_OR_FATAL;
});

// Run if directly executed
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
