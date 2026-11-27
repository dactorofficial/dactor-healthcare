const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ADMIN_DIR = path.resolve(__dirname, '..', 'admin-panel');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is required to push admin portal.');
  process.exit(1);
}

const REPOS = [
  {
    owner: 'dactorofficial',
    repo: 'admin-portal',
    token: TOKEN
  },
  {
    owner: 'rajanpurbe',
    repo: 'dactoradmin',
    token: TOKEN
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

function computeGitBlobSha(buffer) {
  const header = `blob ${buffer.length}\0`;
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
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

  // 4. Scan all local files and find missing or modified by Git SHA
  const allLocal = getAllFiles(ADMIN_DIR);
  const localRelPaths = new Set();
  const treeItems = [];

  for (const f of allLocal) {
    localRelPaths.add(f.relPath);
    const isBinary = f.relPath.endsWith('.png') || f.relPath.endsWith('.jpg') || f.relPath.endsWith('.ico') || f.relPath.endsWith('.pfx');
    const buffer = fs.readFileSync(f.fullPath);
    const localSha = computeGitBlobSha(buffer);
    const remoteSha = remoteFilesMap.get(f.relPath);

    if (!remoteSha) {
      console.log(`[NEW FILE]: ${f.relPath}`);
      if (isBinary) {
        const blobData = await githubApi(`/repos/${target.owner}/${target.repo}/git/blobs`, target.token, {
          method: 'POST',
          body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' })
        });
        treeItems.push({ path: f.relPath, mode: '100644', type: 'blob', sha: blobData.sha });
      } else {
        const content = buffer.toString('utf8');
        treeItems.push({ path: f.relPath, mode: '100644', type: 'blob', content });
      }
    } else if (remoteSha !== localSha) {
      console.log(`[MODIFIED]: ${f.relPath} (remote: ${remoteSha.slice(0, 7)}, local: ${localSha.slice(0, 7)})`);
      if (isBinary) {
        const blobData = await githubApi(`/repos/${target.owner}/${target.repo}/git/blobs`, target.token, {
          method: 'POST',
          body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' })
        });
        treeItems.push({ path: f.relPath, mode: '100644', type: 'blob', sha: blobData.sha });
      } else {
        const content = buffer.toString('utf8');
        treeItems.push({ path: f.relPath, mode: '100644', type: 'blob', content });
      }
    }
  }

  if (treeItems.length === 0) {
    console.log(`No files need updating on ${target.owner}/${target.repo}. Everything is 100% up-to-date.`);
    return;
  }

  console.log(`Creating new tree with ${treeItems.length} changed/new files...`);
  const newTreeData = await githubApi(`/repos/${target.owner}/${target.repo}/git/trees`, target.token, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems
    })
  });
  console.log(`New tree SHA: ${newTreeData.sha}`);

  // 5. Create new commit
  const commitMessage = 'deploy: sync latest admin portal source files and build configurations';
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
