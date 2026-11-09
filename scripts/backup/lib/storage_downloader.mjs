/**
 * Storage Attachments Mirroring Engine
 * Downloads binary media from Supabase Storage with path normalization,
 * Windows filename sanitization, atomic .tmp staging, and retry with backoff.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

// Windows Reserved Device Names
export const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

export const STORAGE_BUCKETS = {
  clinic_photos: {
    primary: 'clinic_photos',
    fallback: 'clinic_photos',
    isPrivate: false,
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp']
  },
  clinic_docs: {
    primary: 'clinic-docs-private',
    fallback: 'clinic_docs',
    isPrivate: true,
    allowedExts: ['.pdf', '.jpg', '.jpeg', '.png']
  },
  doctor_photos: {
    primary: 'doctor_photos',
    fallback: 'doctor_photos',
    isPrivate: false,
    allowedExts: ['.jpg', '.jpeg', '.png', '.webp']
  },
  doctor_kyc: {
    primary: 'doctor-kyc-private',
    fallback: 'doctor_kyc',
    isPrivate: true,
    allowedExts: ['.pdf', '.jpg', '.jpeg', '.png']
  },
  lab_reports: {
    primary: 'lab-reports-private',
    fallback: 'lab_reports',
    isPrivate: true,
    allowedExts: ['.pdf', '.jpg', '.png', '.dcm']
  }
};

/**
 * Sanitizes filename for Windows filesystem and Google Drive compatibility.
 * Replaces illegal Windows characters <>:"/\|?* with replacement char,
 * handles control characters, trailing dots/spaces, and reserved device names.
 */
export function sanitizeFilename(name, replacement = '_') {
  if (typeof name !== 'string' || name.length === 0) {
    return 'unnamed_file';
  }

  // Remove query string only if full URL passed
  let clean = name;
  if (/^https?:\/\//i.test(clean)) {
    clean = clean.split('?')[0].split('#')[0];
  }

  // If path segments included, extract basename
  clean = path.basename(clean.replace(/\\/g, '/'));

  // Replace Windows illegal characters: < > : " / \ | ? * and ASCII 0-31
  clean = clean.replace(/[<>:"/\\|?*\x00-\x1F]/g, replacement);

  // Strip trailing spaces and dots
  clean = clean.replace(/[. ]+$/, '');

  if (clean.length === 0) {
    clean = 'unnamed_file';
  }

  // Check reserved Windows names
  const ext = path.extname(clean);
  const baseWithoutExt = path.basename(clean, ext).toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(baseWithoutExt)) {
    clean = `${baseWithoutExt}_safe${ext}`;
  }

  // Limit max length to 255 chars
  if (clean.length > 255) {
    const extLen = ext.length;
    clean = clean.slice(0, 255 - extLen) + ext;
  }

  return clean;
}

/**
 * Cleans relative storage object paths from full Supabase URLs or signed URLs.
 */
export function cleanStoragePath(rawUrlOrPath) {
  if (typeof rawUrlOrPath !== 'string' || rawUrlOrPath.trim() === '') {
    return { bucket: 'unknown', relativePath: '' };
  }

  let cleaned = rawUrlOrPath.trim();

  // Strip query strings and hash anchors
  cleaned = cleaned.split('?')[0].split('#')[0];

  // Decode URI encoding if present
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep as is if decode fails
  }

  // Normalize slashes and eliminate multiple consecutive slashes
  cleaned = cleaned.replace(/\\/g, '/').replace(/\/+/g, '/');

  // Match standard Supabase storage paths
  const storageRegex = /(?:https?:\/\/[^/]+)?(?:\/storage\/v1\/object\/(?:public|sign|authenticated)\/)([^/]+)\/(.+)$/i;
  const match = cleaned.match(storageRegex);
  if (match) {
    return {
      bucket: match[1],
      relativePath: match[2].replace(/^\/+/, '')
    };
  }

  // If format is "<bucket>/<path>"
  const parts = cleaned.replace(/^\/+/, '').split('/');
  if (parts.length > 1 && (STORAGE_BUCKETS[parts[0]] || parts[0].includes('-private'))) {
    return {
      bucket: parts[0],
      relativePath: parts.slice(1).join('/')
    };
  }

  return {
    bucket: 'unknown',
    relativePath: parts.join('/')
  };
}

/**
 * Computes SHA-256 hash of a buffer or string.
 */
export function computeSHA256(data) {
  const hash = crypto.createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else {
    hash.update(JSON.stringify(data), 'utf8');
  }
  return hash.digest('hex');
}

/**
 * Downloads a single media asset atomically with .tmp staging, SHA-256 computation,
 * and retry with backoff.
 */
export async function downloadMediaFile(target, destinationDir, options = {}) {
  const { maxRetries = 3, timeoutMs = 15000, verbose = false } = options;
  const rawUrl = target.rawUrlOrPath;

  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return {
      success: false,
      warning: `Skipped empty media URL for target ${target.defaultFilename || 'unnamed'}`,
      byteSize: 0,
      sha256: null,
      relativePath: null
    };
  }

  const { relativePath: cleanRel } = cleanStoragePath(rawUrl);
  const baseFilename = path.basename(cleanRel || target.defaultFilename || 'asset');
  const safeFilename = sanitizeFilename(baseFilename);
  const subDir = target.destinationSubdir || target.category || 'misc';
  const targetDir = path.join(destinationDir, subDir);

  fs.mkdirSync(targetDir, { recursive: true });

  const finalFilePath = path.join(targetDir, safeFilename);
  const tempFilePath = `${finalFilePath}.tmp`;
  const manifestRelativePath = path.posix.join('files', subDir.replace(/\\/g, '/'), safeFilename);

  // If URL is a mock or non-HTTP local string
  if (!/^https?:\/\//i.test(rawUrl)) {
    // Check if local file exists
    if (fs.existsSync(rawUrl)) {
      try {
        const buf = fs.readFileSync(rawUrl);
        const hash = computeSHA256(buf);
        fs.writeFileSync(tempFilePath, buf);
        fs.renameSync(tempFilePath, finalFilePath);
        return {
          success: true,
          byteSize: buf.length,
          sha256: hash,
          relativePath: manifestRelativePath,
          filePath: finalFilePath
        };
      } catch (e) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return {
          success: false,
          warning: `Local file read error: ${e.message}`,
          byteSize: 0,
          sha256: null,
          relativePath: manifestRelativePath
        };
      }
    }

    // Unresolvable mock/relative URI
    return {
      success: false,
      warning: `Unresolvable non-HTTP media path: ${rawUrl}`,
      byteSize: 0,
      sha256: null,
      relativePath: manifestRelativePath
    };
  }

  // HTTP download with exponential backoff retry
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(rawUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (!resp.ok) {
        if (resp.status === 404) {
          return {
            success: false,
            warning: `Media blob not found (404): ${rawUrl}`,
            byteSize: 0,
            sha256: null,
            relativePath: manifestRelativePath
          };
        }
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      const arrayBuf = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const sha256 = computeSHA256(buffer);

      // Write to .tmp first
      fs.writeFileSync(tempFilePath, buffer);
      
      // Flush & atomic rename
      const fd = fs.openSync(tempFilePath, 'r+');
      fs.fsyncSync(fd);
      fs.closeSync(fd);

      fs.renameSync(tempFilePath, finalFilePath);

      return {
        success: true,
        byteSize: buffer.length,
        sha256,
        relativePath: manifestRelativePath,
        filePath: finalFilePath
      };
    } catch (err) {
      lastError = err;
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 200;
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }
  }

  return {
    success: false,
    warning: `Failed downloading media after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'} (${rawUrl})`,
    byteSize: 0,
    sha256: null,
    relativePath: manifestRelativePath
  };
}

/**
 * Mirrors all media targets belonging to a clinic into destination directory.
 */
export async function syncClinicAttachments(targets, destinationDir, options = {}) {
  const downloadedFiles = [];
  const warnings = [];

  const filesBaseDir = path.join(destinationDir, 'files');
  fs.mkdirSync(filesBaseDir, { recursive: true });

  for (const target of targets) {
    const result = await downloadMediaFile(target, filesBaseDir, options);
    if (result.success) {
      downloadedFiles.push({
        relative_path: result.relativePath,
        byte_size: result.byteSize,
        sha256: result.sha256,
        category: target.category
      });
    } else if (result.warning) {
      warnings.push({
        target: target.rawUrlOrPath,
        category: target.category,
        message: result.warning
      });
    }
  }

  return {
    downloadedFiles,
    warnings
  };
}
