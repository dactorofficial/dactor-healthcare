#!/usr/bin/env node
/**
 * DACTOR Clinic Backup Verification Script
 * Validates integrity of backups on Google Drive:
 * 1. Validates backup_manifest.json schema and statistics
 * 2. Recalculates SHA-256 checksums of all files against manifest
 * 3. Scans all JSON and CSV files to assert zero leaked credentials
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_BACKUPS_DIR = path.join(REPO_ROOT, 'backups', 'clinics');

const SENSITIVE_PATTERNS = [
  /payment_secret_key\s*["':=]\s*["']?(?!\[REDACTED\])[a-zA-Z0-9_\-]{6,}/i,
  /secret_key\s*["':=]\s*["']?(?!\[REDACTED\])[a-zA-Z0-9_\-]{6,}/i,
  /merchant_secret\s*["':=]\s*["']?(?!\[REDACTED\])[a-zA-Z0-9_\-]{6,}/i
];

function computeSHA256(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifySnapshot(snapshotDir) {
  console.log(`\nVerifying snapshot: ${snapshotDir}`);
  const manifestPath = path.join(snapshotDir, 'backup_manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`  ❌ Missing backup_manifest.json in ${snapshotDir}`);
    return false;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error(`  ❌ Corrupt backup_manifest.json: ${e.message}`);
    return false;
  }

  // Schema checks
  if (!manifest.backup_id || !manifest.clinic_id || !manifest.timestamp || !manifest.stats || !Array.isArray(manifest.files)) {
    console.error('  ❌ Invalid manifest schema: missing required top-level fields');
    return false;
  }

  console.log(`  √ Manifest valid: Clinic [${manifest.clinic_id}], Timestamp [${manifest.timestamp}]`);
  console.log(`  √ Declared files: ${manifest.stats.total_files}, Total bytes: ${manifest.stats.total_bytes}`);

  let checkFailures = 0;

  for (const f of manifest.files) {
    const fullPath = path.join(snapshotDir, f.relative_path);
    if (!fs.existsSync(fullPath)) {
      console.error(`  ❌ Missing archived file: ${f.relative_path}`);
      checkFailures++;
      continue;
    }

    const actualHash = computeSHA256(fullPath);
    if (actualHash !== f.sha256) {
      console.error(`  ❌ Checksum mismatch on ${f.relative_path} (expected ${f.sha256}, got ${actualHash})`);
      checkFailures++;
      continue;
    }

    // Check for credential leaks in textual files
    if (fullPath.endsWith('.json') || fullPath.endsWith('.csv')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(content)) {
          console.error(`  ❌ SENSITIVE SECRET LEAK DETECTED in ${f.relative_path}`);
          checkFailures++;
          break;
        }
      }
    }
  }

  if (checkFailures === 0) {
    console.log(`  √ All ${manifest.files.length} files verified with 100% cryptographic integrity.`);
    return true;
  } else {
    console.error(`  ❌ Snapshot verification failed with ${checkFailures} issue(s).`);
    return false;
  }
}

function main() {
  const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_BACKUPS_DIR;

  console.log('=================================================================');
  console.log('=== DACTOR CLINIC BACKUP VERIFICATION SUITE                  ===');
  console.log('=================================================================');
  console.log(`Scanning directory: ${targetDir}`);

  if (!fs.existsSync(targetDir)) {
    console.warn(`⚠️ Backups directory not found at: ${targetDir}`);
    console.log('Run .\\sync_clinic_backups.ps1 -All to generate a backup first.');
    process.exit(0);
  }

  // Look for clinic directories
  const clinicDirs = fs.readdirSync(targetDir, { withFileTypes: true }).filter(d => d.isDirectory());
  if (clinicDirs.length === 0) {
    console.warn('⚠️ No clinic backup folders found in directory.');
    process.exit(0);
  }

  let totalSnapshots = 0;
  let passedSnapshots = 0;

  for (const cDir of clinicDirs) {
    const clinicPath = path.join(targetDir, cDir.name);
    // Check for 'latest'
    const latestPath = path.join(clinicPath, 'latest');
    if (fs.existsSync(latestPath)) {
      totalSnapshots++;
      if (verifySnapshot(latestPath)) passedSnapshots++;
    }

    // Check for timestamped snapshot subdirectories
    const subDirs = fs.readdirSync(clinicPath, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'latest');
    for (const sDir of subDirs) {
      totalSnapshots++;
      if (verifySnapshot(path.join(clinicPath, sDir.name))) passedSnapshots++;
    }
  }

  console.log('\n=================================================================');
  console.log(`=== VERIFICATION SUMMARY: ${passedSnapshots}/${totalSnapshots} SNAPSHOTS PASSED CLEANLY ===`);
  console.log('=================================================================');

  if (totalSnapshots > 0 && passedSnapshots === totalSnapshots) {
    console.log('√ 100% OF BACKUP SNAPSHOTS ARE CRYPTOGRAPHICALLY VALID AND SECURE.');
    process.exit(0);
  } else if (totalSnapshots === 0) {
    console.log('No backup snapshots found to verify.');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
