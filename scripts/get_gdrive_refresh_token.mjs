#!/usr/bin/env node
/**
 * Interactive OAuth2 Refresh Token Generator for Google Drive
 * Starts a temporary local callback server, opens the browser for authorization,
 * and exchanges the code for a permanent refresh_token.
 */

import http from 'http';
import { URL } from 'url';

const PORT = 8085;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

function parseArgs(argv) {
  let clientId = process.env.GDRIVE_CLIENT_ID;
  let clientSecret = process.env.GDRIVE_CLIENT_SECRET;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--client-id') clientId = argv[++i];
    else if (argv[i] === '--client-secret') clientSecret = argv[++i];
  }
  return { clientId, clientSecret };
}

async function main() {
  const { clientId, clientSecret } = parseArgs(process.argv);

  if (!clientId || !clientSecret) {
    console.error('Usage: node scripts/get_gdrive_refresh_token.mjs --client-id <ID> --client-secret <SECRET>');
    process.exit(1);
  }

  const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  console.log('='.repeat(70));
  console.log('🔑 DACTOR Google Drive OAuth Refresh Token Generator');
  console.log('='.repeat(70));
  console.log(`\n1. Listening for OAuth callback on ${REDIRECT_URI}...`);
  console.log('\n2. Please open the following URL in your browser:\n');
  console.log(authUrl);
  console.log('\n3. Select your Google account (rajanpurbey55@gmail.com) and grant permission.\n');

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
      if (parsedUrl.pathname === '/oauth2callback') {
        const code = parsedUrl.searchParams.get('code');
        const error = parsedUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authentication Failed</h1><p>${error}</p>`);
          console.error(`❌ Authentication error: ${error}`);
          server.close();
          process.exit(1);
        }

        if (code) {
          console.log('\n✅ Authorization code received from Google. Exchanging for refresh token...');

          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: REDIRECT_URI,
              grant_type: 'authorization_code'
            })
          });

          if (!tokenRes.ok) {
            const errBody = await tokenRes.text();
            throw new Error(`Token exchange failed: [${tokenRes.status}] ${errBody}`);
          }

          const tokenData = await tokenRes.json();

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <div style="font-family: sans-serif; text-align: center; padding: 40px;">
              <h1 style="color: #10b981;">🎉 Authorization Successful!</h1>
              <p>Your Google Drive OAuth Refresh Token has been successfully generated.</p>
              <p>You can close this browser tab and return to the assistant.</p>
            </div>
          `);

          console.log('\n' + '='.repeat(70));
          console.log('🎉 REFRESH TOKEN GENERATED SUCCESSFULLY!');
          console.log('='.repeat(70));
          console.log(`GDRIVE_REFRESH_TOKEN: ${tokenData.refresh_token}`);
          console.log(`GDRIVE_CLIENT_ID:     ${clientId}`);
          console.log(`GDRIVE_CLIENT_SECRET: ${clientSecret}`);
          console.log('='.repeat(70));

          server.close();
          process.exitCode = 0;
        }
      }
    } catch (err) {
      console.error(`❌ Error during token exchange: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error</h1><p>${err.message}</p>`);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, '127.0.0.1');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
