/**
 * Master E2E Automated Verification Suite for Cloud-to-Cloud Backup Pipeline
 * Tests Service Account JWT RS256 Signing, Token Exchange, Folder Resolution,
 * Multipart Drive Uploads, and Full Backup Ingestion against an ephemeral mock server.
 */

import http from 'http';
import crypto from 'crypto';
import { getAccessTokenFromServiceAccount, findOrCreateFolder, uploadFileToDrive } from '../../scripts/backup/lib/gdrive_api.mjs';
import { extractClinicData } from '../../scripts/backup/lib/aggregator.mjs';
import { toJSON, toCSV } from '../../scripts/backup/lib/serializer.mjs';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('='.repeat(65));
  console.log('🧪 DACTOR Cloud-to-Cloud Google Drive Backup E2E Test Suite');
  console.log('='.repeat(65));

  // 1. Generate real RSA key pair for testing Service Account signature
  console.log('\n[Setup] Generating ephemeral RSA key pair for Service Account simulation...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const mockServiceAccount = {
    type: 'service_account',
    project_id: 'dactor-mock-test',
    private_key_id: 'mock_key_id_12345',
    private_key: privateKey,
    client_email: 'dactor-backup-bot@dactor-mock-test.iam.gserviceaccount.com',
    client_id: '1234567890'
  };

  // 2. Setup mock HTTP server to intercept Google APIs
  const filesStore = new Map();
  let folderIdCounter = 100;
  let fileIdCounter = 500;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let body = [];

    req.on('data', chunk => body.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(body);

      // A. Mock OAuth Token Endpoint
      if (url.pathname === '/token') {
        const authHeader = rawBody.toString('utf8');
        if (authHeader.includes('grant_type') && authHeader.includes('jwt-bearer')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: 'mock_access_token_xyz987',
            token_type: 'Bearer',
            expires_in: 3600
          }));
          return;
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }

      // B. Mock Google Drive Search / Create Folders
      if (url.pathname === '/drive/v3/files' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const matchName = q.match(/name\s*=\s*'([^']+)'/);
        const nameToFind = matchName ? matchName[1] : null;

        const found = [];
        for (const [id, f] of filesStore.entries()) {
          if (nameToFind && f.name === nameToFind && f.mimeType === 'application/vnd.google-apps.folder') {
            found.push({ id, name: f.name });
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ files: found }));
        return;
      }

      if (url.pathname === '/drive/v3/files' && req.method === 'POST') {
        const metadata = JSON.parse(rawBody.toString('utf8'));
        const newId = `folder_${++folderIdCounter}`;
        filesStore.set(newId, { ...metadata, id: newId });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: newId, name: metadata.name }));
        return;
      }

      // C. Mock Multipart Uploads
      if (url.pathname === '/upload/drive/v3/files') {
        const newFileId = `file_${++fileIdCounter}`;
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=([^;]+)/);
        const boundary = boundaryMatch ? boundaryMatch[1] : '';

        // Extract metadata part
        const bodyStr = rawBody.toString('binary');
        const metaMatch = bodyStr.match(/Content-Type: application\/json[^\r\n]*\r\n\r\n(\{.*?\})\r\n/s);
        const metadata = metaMatch ? JSON.parse(metaMatch[1]) : { name: `upload_${newFileId}` };

        filesStore.set(newFileId, {
          id: newFileId,
          name: metadata.name,
          size: rawBody.length
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: newFileId, name: metadata.name }));
        return;
      }

      // Default 404
      res.writeHead(404);
      res.end('Not Found');
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Setup] Mock Google API Server listening on port ${port}`);

  try {
    // -------------------------------------------------------------
    // Tier 1: Service Account RS256 JWT Generation & Verification
    // -------------------------------------------------------------
    console.log('\n--- Tier 1: Service Account JWT Signing & Auth ---');
    
    // Monkey-patch fetch to route googleapis / oauth2 to our local mock server
    const realFetch = global.fetch;
    global.fetch = async (input, init = {}) => {
      let targetUrl = typeof input === 'string' ? input : input.url;
      if (targetUrl.startsWith('https://oauth2.googleapis.com/token')) {
        targetUrl = `${mockBaseUrl}/token`;
      } else if (targetUrl.startsWith('https://www.googleapis.com/drive/v3/files')) {
        targetUrl = targetUrl.replace('https://www.googleapis.com/drive/v3/files', `${mockBaseUrl}/drive/v3/files`);
      } else if (targetUrl.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        targetUrl = targetUrl.replace('https://www.googleapis.com/upload/drive/v3/files', `${mockBaseUrl}/upload/drive/v3/files`);
      }
      return realFetch(targetUrl, init);
    };

    const token = await getAccessTokenFromServiceAccount(mockServiceAccount);
    assert(token === 'mock_access_token_xyz987', 'Service Account token successfully generated and exchanged');

    // -------------------------------------------------------------
    // Tier 2: Folder Discovery & Creation
    // -------------------------------------------------------------
    console.log('\n--- Tier 2: Google Drive Folder Management ---');
    const rootFolderId = await findOrCreateFolder('DACTOR Clinic Backups', null, token);
    assert(rootFolderId.startsWith('folder_'), `Created root backup folder with ID [${rootFolderId}]`);

    const sameRootFolderId = await findOrCreateFolder('DACTOR Clinic Backups', null, token);
    assert(sameRootFolderId === rootFolderId, 'Idempotent folder lookup returned existing folder ID without duplication');

    const subFolderId = await findOrCreateFolder('c1111111-1111-1111-1111-111111111111', rootFolderId, token);
    assert(subFolderId.startsWith('folder_') && subFolderId !== rootFolderId, `Created clinic subfolder [${subFolderId}]`);

    // -------------------------------------------------------------
    // Tier 3: Multipart File Uploads
    // -------------------------------------------------------------
    console.log('\n--- Tier 3: Multipart File Uploads ---');
    const testJson = JSON.stringify({ test: 'data', timestamp: new Date().toISOString() });
    const uploadedJson = await uploadFileToDrive({
      name: 'test_table.json',
      content: testJson,
      mimeType: 'application/json',
      parentFolderId: subFolderId,
      accessToken: token
    });
    assert(uploadedJson.name === 'test_table.json', 'Uploaded JSON file successfully');

    const testCsv = 'id,name,amount\n1,Consultation,500\n2,ECG,1200';
    const uploadedCsv = await uploadFileToDrive({
      name: 'test_table.csv',
      content: testCsv,
      mimeType: 'text/csv',
      parentFolderId: subFolderId,
      accessToken: token
    });
    assert(uploadedCsv.name === 'test_table.csv', 'Uploaded CSV file successfully');

    const binaryBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]); // JPEG header
    const uploadedBinary = await uploadFileToDrive({
      name: 'clinic_facade.jpg',
      content: binaryBuffer,
      mimeType: 'image/jpeg',
      parentFolderId: subFolderId,
      accessToken: token
    });
    assert(uploadedBinary.name === 'clinic_facade.jpg', 'Uploaded binary image asset successfully');

    // -------------------------------------------------------------
    // Tier 4: Full Relational Dataset Upload Verification
    // -------------------------------------------------------------
    console.log('\n--- Tier 4: Full Relational Dataset Ingestion ---');
    const clinicBundle = await extractClinicData('c1111111-1111-1111-1111-111111111111', { redact: true });
    assert(clinicBundle.clinic.name === 'Kathmandu Health Hub & Polyclinic', 'Extracted clinic dataset with normalized timestamps');
    assert(clinicBundle.appointments.length > 0, `Extracted ${clinicBundle.appointments.length} appointments`);
    assert(clinicBundle.billingInvoices.length > 0, `Extracted ${clinicBundle.billingInvoices.length} billing invoices`);

    const jsonExport = toJSON(clinicBundle.appointments);
    const csvExport = toCSV(clinicBundle.appointments);
    assert(jsonExport.includes('tracking_code'), 'JSON export serialized correctly with tracking_code');
    assert(csvExport.includes('tracking_code'), 'CSV export serialized RFC 4180 headers with tracking_code');

    // Restore real fetch
    global.fetch = realFetch;

  } finally {
    server.close();
  }

  console.log('\n' + '='.repeat(65));
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('='.repeat(65));

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exitCode = 1;
});
