const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET = {
  owner: 'dactorofficial',
  repo: 'dactor',
  token: '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'
};

const FILES_TO_UPDATE = [
  'clinic-app/app/src/main/java/com/dactor/clinic/ui/settings/ClinicSettingsScreen.kt',
  'supabase/functions/appointment-payment/index.ts',
  'supabase/migration_admin_payment_gateways_and_demo_mode.sql'
];

async function githubApi(endpoint, token, options = {}) {
  const url = `https://api.github.com${endpoint}`;
  const headers = {
    'User-Agent': 'Dactor-Deploy-Script',
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error [${response.status}] ${endpoint}: ${errorText}`);
  }
  return response.json();
}

async function main() {
  console.log(`\n=== Syncing to ${TARGET.owner}/${TARGET.repo} ===`);

  const refData = await githubApi(`/repos/${TARGET.owner}/${TARGET.repo}/git/ref/heads/main`, TARGET.token);
  const baseCommitSha = refData.object.sha;
  console.log(`Current main commit SHA: ${baseCommitSha}`);

  const commitData = await githubApi(`/repos/${TARGET.owner}/${TARGET.repo}/git/commits/${baseCommitSha}`, TARGET.token);
  const baseTreeSha = commitData.tree.sha;
  console.log(`Current tree SHA: ${baseTreeSha}`);

  const treeItems = [];
  for (const relPath of FILES_TO_UPDATE) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    treeItems.push({
      path: relPath.replace(/\\/g, '/'),
      mode: '100644',
      type: 'blob',
      content: content
    });
    console.log(`Prepared ${relPath} (${content.length} bytes)`);
  }

  console.log(`Creating new tree...`);
  const newTreeData = await githubApi(`/repos/${TARGET.owner}/${TARGET.repo}/git/trees`, TARGET.token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems
    })
  });
  console.log(`New tree SHA: ${newTreeData.sha}`);

  const commitMessage = 'feat: remove clinic-side demo toggle and add platform payment settings / demo mode backend';
  console.log(`Creating commit...`);
  const newCommitData = await githubApi(`/repos/${TARGET.owner}/${TARGET.repo}/git/commits`, TARGET.token, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: newTreeData.sha,
      parents: [baseCommitSha]
    })
  });
  console.log(`New commit SHA: ${newCommitData.sha}`);

  console.log(`Updating refs/heads/main to ${newCommitData.sha}...`);
  await githubApi(`/repos/${TARGET.owner}/${TARGET.repo}/git/refs/heads/main`, TARGET.token, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: newCommitData.sha,
      force: false
    })
  });

  console.log(`SUCCESS: Pushed ${newCommitData.sha.slice(0, 7)} to ${TARGET.owner}/${TARGET.repo}:main`);
}

main().catch(err => console.error('Fatal error:', err));
