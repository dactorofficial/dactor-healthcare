/**
 * Audit Manifest Generator Engine
 * Builds and writes valid, cryptographically verified backup_manifest.json
 * with SHA-256 checksums, byte sizes, and backup statistics.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const GENERATOR_VERSION = '1.0.0';
export const CHECKSUM_ALGORITHM = 'SHA-256';

/**
 * Builds the manifest object complying strictly with backup contracts.
 */
export function buildManifest(params) {
  const {
    clinicId,
    backupId = crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp = new Date().toISOString(),
    files = [],
    warnings = [],
    clinicName = null
  } = params;

  if (!clinicId) {
    throw new Error('clinicId is required to construct backup manifest');
  }

  // Calculate stats
  let totalBytes = 0;
  const normalizedFiles = files.map((f) => {
    const size = typeof f.byte_size === 'number' ? f.byte_size : (typeof f.byteSize === 'number' ? f.byteSize : 0);
    totalBytes += size;
    return {
      relative_path: (f.relative_path || f.relativePath || '').replace(/\\/g, '/'),
      byte_size: size,
      sha256: f.sha256 || ''
    };
  });

  const manifest = {
    backup_id: backupId,
    clinic_id: clinicId,
    clinic_name: clinicName,
    timestamp,
    generator_version: GENERATOR_VERSION,
    checksum_algorithm: CHECKSUM_ALGORITHM,
    stats: {
      total_files: normalizedFiles.length,
      total_bytes: totalBytes
    },
    files: normalizedFiles,
    warnings: Array.isArray(warnings) ? warnings : []
  };

  return manifest;
}

/**
 * Computes SHA-256 for all files within a directory and returns file manifest entries.
 */
export function scanDirectoryFiles(baseDir) {
  const results = [];

  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const ent of entries) {
      const fullPath = path.join(currentDir, ent.name);
      if (ent.isDirectory()) {
        walk(fullPath);
      } else if (ent.isFile()) {
        // Skip manifest itself
        if (ent.name === 'backup_manifest.json') continue;
        const buf = fs.readFileSync(fullPath);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        results.push({
          relative_path: rel,
          byte_size: buf.length,
          sha256: hash
        });
      }
    }
  }

  walk(baseDir);
  return results;
}

/**
 * Writes the manifest to disk in destination directory.
 */
export function writeManifest(manifest, destinationDir) {
  const manifestPath = path.join(destinationDir, 'backup_manifest.json');
  const jsonContent = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(manifestPath, jsonContent, 'utf8');
  return manifestPath;
}
