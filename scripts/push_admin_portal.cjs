const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.resolve(__dirname, '..', 'admin-panel');

const REPOS = [
  {
    owner: 'dactorofficial',
    repo: 'admin-portal',
    token: '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'
  },
  {
    owner: 'rajanpurbe',
    repo: 'dactoradmin',
    token: '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'
  }
];

function getAllFiles(dir, baseDir = dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, baseDir));
    } else {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

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

async function pushRepo(target) {
  console.log(`\n=== Syncing to ${target.owner}/${target.repo} ===`);
  
  // 1. Get latest commit SHA on main
  const refData = await githubApi(`/repos/${target.owner}/${target.repo}/git/ref/heads/main`, target.token);
  const baseCommitSha = refData.object.sha;
  console.log(`Current main commit SHA: ${baseCommitSha}`);

  // 2. Get base tree SHA
  const commitData = await githubApi(`/repos/${target.owner}/${target.repo}/git/commits/${baseCommitSha}`, target.token);
  const baseTreeSha = commitData.tree.sha;
  console.log(`Current tree SHA: ${baseTreeSha}`);

  // 3. Fetch remote tree recursive
  const remoteTreeData = await githubApi(`/repos/${target.owner}/${target.repo}/git/trees/${baseTreeSha}?recursive=1`, target.token);
  const remoteFilesMap = new Map();
  for (const item of (remoteTreeData.tree || [])) {
    if (item.type === 'blob') {
      remoteFilesMap.set(item.path, item.sha);
    }
  }

  // 4. Scan all local files and find missing/changed
  const allLocal = getAllFiles(ADMIN_DIR);
  const treeItems = [];

  for (const f of allLocal) {
    const isBinary = f.relPath.endsWith('.png') || f.relPath.endsWith('.jpg') || f.relPath.endsWith('.ico') || f.relPath.endsWith('.pfx');
    
    // Check if remote already has it
    if (!remoteFilesMap.has(f.relPath)) {
      console.log(`[NEW / MISSING ON REMOTE]: ${f.relPath}`);
      if (isBinary) {
        const buffer = fs.readFileSync(f.fullPath);
        const blobData = await githubApi(`/repos/${target.owner}/${target.repo}/git/blobs`, target.token, {
          method: 'POST',
          body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' })
        });
        treeItems.push({ path: f.relPath, mode: '100644', type: 'blob', sha: blobData.sha });
      } else {
        const content = fs.readFileSync(f.fullPath, 'utf8');
        treeItems.push({ path: f.relPath, mode: '100644', type: 'blob', content });
      }
    } else {
      // Check if specifically one of our recently edited files
      const recentTargets = [
        'public/checkout.html',
        'src/App.tsx',
        'src/pages/Login.tsx',
        'src/pages/PaymentGateways.tsx',
        'src/pages/AppVersionManager.tsx',
        'src/pages/PayAtDeskSettlements.tsx',
        'src/pages/PaymentLogs.tsx',
        'src/pages/SupportSettings.tsx',
        'HANDOFF.md'
      ];
      if (recentTargets.includes(f.relPath)) {
        console.log(`[FORCE SYNC]: ${f.relPath}`);
        const content = fs.readFileSync(f.fullPath, 'utf8');
        treeItems.push({ path: f.relPath, mode: '100644', type: 'blob', content });
      }
    }
  }

  if (treeItems.length === 0) {
    console.log(`No files need updating on ${target.owner}/${target.repo}.`);
    return;
  }

  console.log(`Creating new tree with ${treeItems.length} files...`);
  const newTreeData = await githubApi(`/repos/${target.owner}/${target.repo}/git/trees`, target.token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems
    })
  });
  console.log(`New tree SHA: ${newTreeData.sha}`);

  // 5. Create new commit
  const commitMessage = 'feat: add interactive try demo payment checkout and sandbox testing suite in payment gateways';
  console.log(`Creating commit...`);
  const newCommitData = await githubApi(`/repos/${target.owner}/${target.repo}/git/commits`, target.token, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMessage,
      tree: newTreeData.sha,
      parents: [baseCommitSha]
    })
  });
  console.log(`New commit SHA: ${newCommitData.sha}`);

  // 6. Update reference on main
  console.log(`Updating refs/heads/main to ${newCommitData.sha}...`);
  await githubApi(`/repos/${target.owner}/${target.repo}/git/refs/heads/main`, target.token, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: newCommitData.sha,
      force: false
    })
  });

  console.log(`SUCCESS: Pushed ${newCommitData.sha.slice(0, 7)} to ${target.owner}/${target.repo}:main`);
}

async function main() {
  for (const repo of REPOS) {
    try {
      await pushRepo(repo);
    } catch (err) {
      console.error(`FAILED pushing to ${repo.owner}/${repo.repo}:`, err.message);
    }
  }
}

main().catch(err => console.error('Fatal error:', err));
