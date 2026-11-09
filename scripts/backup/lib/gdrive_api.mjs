/**
 * Zero-dependency Google Drive REST API Client for Cloud-to-Cloud Backups
 * Uses Node.js built-in 'crypto' for RS256 Service Account JWT authentication
 * and native 'fetch' for Google Drive v3 REST API operations.
 */

import crypto from 'crypto';

/**
 * Exchanges a Google Cloud Service Account JSON key for a short-lived OAuth2 access token.
 * 
 * @param {object|string} serviceAccount - Service Account JSON object or parsed string
 * @param {string[]} scopes - Array of OAuth2 scopes
 * @returns {Promise<string>} OAuth2 Bearer Access Token
 */
export async function getAccessTokenFromServiceAccount(
  serviceAccount,
  scopes = ['https://www.googleapis.com/auth/drive']
) {
  const sa = typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount;

  if (!sa.client_email || !sa.private_key) {
    throw new Error('Invalid Service Account JSON: missing client_email or private_key');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodeBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsignedToken = `${encodeBase64Url(header)}.${encodeBase64Url(claimSet)}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsignedToken);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${unsignedToken}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 token exchange failed: [${res.status}] ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Exchanges an OAuth2 refresh token for a short-lived access token.
 * Enables uploading directly under a personal Google account (e.g. 5 TB Google One) without quota errors.
 * 
 * @param {object} params
 * @param {string} params.clientId - OAuth2 Client ID
 * @param {string} params.clientSecret - OAuth2 Client Secret
 * @param {string} params.refreshToken - OAuth2 Refresh Token
 * @returns {Promise<string>} OAuth2 Bearer Access Token
 */
export async function getAccessTokenFromRefreshToken({ clientId, clientSecret, refreshToken }) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing clientId, clientSecret, or refreshToken for OAuth token exchange');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 refresh token exchange failed: [${res.status}] ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Finds an existing folder by name inside a parent folder, or creates it if not found.
 * 
 * @param {string} folderName - Name of the folder
 * @param {string} [parentFolderId] - Parent folder ID (optional, defaults to root)
 * @param {string} accessToken - Google Drive OAuth2 access token
 * @returns {Promise<string>} Google Drive Folder ID
 */
export async function findOrCreateFolder(folderName, parentFolderId, accessToken) {
  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents and ` : '';
  const escapedName = folderName.replace(/'/g, "\\'");
  const q = `${parentQuery}name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Google Drive folder search failed: [${searchRes.status}] ${errText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentFolderId ? [parentFolderId] : []
  };

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Google Drive folder creation failed: [${createRes.status}] ${errText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Uploads or updates a file in Google Drive via Multipart Upload.
 * 
 * @param {object} params
 * @param {string} params.name - File name
 * @param {string|Buffer} params.content - String or Buffer content
 * @param {string} params.mimeType - MIME type (e.g. 'application/json', 'text/csv', 'image/jpeg')
 * @param {string} [params.parentFolderId] - Parent folder ID
 * @param {string} params.accessToken - OAuth2 access token
 * @returns {Promise<{id: string, name: string}>}
 */
export async function uploadFileToDrive({ name, content, mimeType, parentFolderId, accessToken }) {
  const escapedName = name.replace(/'/g, "\\'");
  const parentQuery = parentFolderId ? `'${parentFolderId}' in parents and ` : '';
  const q = `${parentQuery}name = '${escapedName}' and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;

  let existingFileId = null;
  try {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        existingFileId = searchData.files[0].id;
      }
    }
  } catch {
    // If search fails, proceed to create
  }

  const boundary = `-------dactor_gdrive_upload_${Date.now()}`;
  const metadata = {
    name,
    mimeType,
    parents: !existingFileId && parentFolderId ? [parentFolderId] : undefined
  };

  const fileBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');

  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  let uploadUrl;
  let method;
  if (existingFileId) {
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name`;
    method = 'PATCH';
  } else {
    uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name';
    method = 'POST';
  }

  const uploadRes = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(multipartBody.length)
    },
    body: multipartBody
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Google Drive file upload failed for [${name}]: [${uploadRes.status}] ${errText}`);
  }

  return await uploadRes.json();
}
