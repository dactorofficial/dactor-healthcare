const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const TOKEN_OFFICIAL = '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';
const TOKEN_RAJAN = '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';

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

async function pushFilesToRepo(owner, repo, branch, token, fileMap, commitMsg) {
  console.log(`\n=== Pushing to ${owner}/${repo} (${branch}) ===`);
  const refData = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
  const baseCommitSha = refData.object.sha;
  console.log(`Current ${branch} commit: ${baseCommitSha.slice(0, 7)}`);

  const commitData = await githubApi(`/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, token);
  const baseTreeSha = commitData.tree.sha;

  const treeItems = [];
  for (const [targetRelPath, localFullPath] of Object.entries(fileMap)) {
    if (!fs.existsSync(localFullPath)) {
      console.warn(`File not found: ${localFullPath}`);
      continue;
    }
    const content = fs.readFileSync(localFullPath, 'utf8');
    treeItems.push({
      path: targetRelPath.replace(/\\/g, '/'),
      mode: '100644',
      type: 'blob',
      content: content
    });
    console.log(`  Added: ${targetRelPath} (${content.length} bytes)`);
  }

  console.log(`Creating tree with ${treeItems.length} files...`);
  const newTree = await githubApi(`/repos/${owner}/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
  });

  console.log(`Creating commit...`);
  const newCommit = await githubApi(`/repos/${owner}/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMsg,
      tree: newTree.sha,
      parents: [baseCommitSha]
    })
  });

  console.log(`Updating ${branch} ref...`);
  await githubApi(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha, force: false })
  });

  console.log(`SUCCESS: Pushed commit ${newCommit.sha.slice(0, 7)} to ${owner}/${repo}:${branch}`);
  return newCommit.sha;
}

// Push binary / dist directory to GitHub Pages repo
async function deployDistToPages(owner, repo, branch, token, distDir, commitMsg) {
  console.log(`\n=== Deploying dist to ${owner}/${repo} (${branch}) ===`);
  const refData = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
  const baseCommitSha = refData.object.sha;
  const commitData = await githubApi(`/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, token);
  const baseTreeSha = commitData.tree.sha;

  function getAllFiles(dir, baseDir = '') {
    let files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = baseDir ? `${baseDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        files = files.concat(getAllFiles(full, rel));
      } else {
        files.push({ full, rel });
      }
    }
    return files;
  }

  const allFiles = getAllFiles(distDir);
  console.log(`Found ${allFiles.length} files in dist/ to deploy.`);

  // Create blobs for each file
  const treeItems = [];
  for (const f of allFiles) {
    const fileBytes = fs.readFileSync(f.full);
    const base64Content = fileBytes.toString('base64');
    const blobData = await githubApi(`/repos/${owner}/${repo}/git/blobs`, token, {
      method: 'POST',
      body: JSON.stringify({
        content: base64Content,
        encoding: 'base64'
      })
    });
    treeItems.push({
      path: f.rel.replace(/\\/g, '/'),
      mode: '100644',
      type: 'blob',
      sha: blobData.sha
    });
  }

  console.log(`Creating tree with ${treeItems.length} files...`);
  const newTree = await githubApi(`/repos/${owner}/${repo}/git/trees`, token, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
  });

  const newCommit = await githubApi(`/repos/${owner}/${repo}/git/commits`, token, {
    method: 'POST',
    body: JSON.stringify({
      message: commitMsg,
      tree: newTree.sha,
      parents: [baseCommitSha]
    })
  });

  await githubApi(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha, force: false })
  });

  console.log(`SUCCESS: Deployed live website bundle to ${owner}/${repo}:${branch} (${newCommit.sha.slice(0, 7)})`);
}

async function main() {
  const commitMsg = 'feat: arrange pay-at-desk approvals in chronological order oldest on top (FIFO) across clinic app and web portal';

  // 1. Files for rajanpurbe/Dactor (web app repository root)
  const webFiles = {
    'src/services/db.ts': path.join(ROOT_DIR, 'web-app', 'src', 'services', 'db.ts'),
    'src/pages/ClinicPortal.tsx': path.join(ROOT_DIR, 'web-app', 'src', 'pages', 'ClinicPortal.tsx')
  };
  await pushFilesToRepo('rajanpurbe', 'Dactor', 'main', TOKEN_RAJAN, webFiles, commitMsg);

  // 2. Files for dactorofficial/dactor (central monorepo)
  const monorepoFiles = {
    'clinic-app/app/src/main/java/com/dactor/clinic/data/model/Appointment.kt': path.join(ROOT_DIR, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'data', 'model', 'Appointment.kt'),
    'clinic-app/app/src/main/java/com/dactor/clinic/data/local/entity/AppointmentEntity.kt': path.join(ROOT_DIR, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'data', 'local', 'entity', 'AppointmentEntity.kt'),
    'clinic-app/app/src/main/java/com/dactor/clinic/data/repository/AppointmentRepository.kt': path.join(ROOT_DIR, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'data', 'repository', 'AppointmentRepository.kt'),
    'clinic-app/app/src/main/java/com/dactor/clinic/ui/appointments/PayAtDeskRequestsScreen.kt': path.join(ROOT_DIR, 'clinic-app', 'app', 'src', 'main', 'java', 'com', 'dactor', 'clinic', 'ui', 'appointments', 'PayAtDeskRequestsScreen.kt'),
    'clinic-app/app/src/test/java/com/dactor/clinic/domain/util/PayAtDeskOrderingTest.kt': path.join(ROOT_DIR, 'clinic-app', 'app', 'src', 'test', 'java', 'com', 'dactor', 'clinic', 'domain', 'util', 'PayAtDeskOrderingTest.kt'),
    'web-app/src/services/db.ts': path.join(ROOT_DIR, 'web-app', 'src', 'services', 'db.ts'),
    'web-app/src/pages/ClinicPortal.tsx': path.join(ROOT_DIR, 'web-app', 'src', 'pages', 'ClinicPortal.tsx')
  };
  await pushFilesToRepo('dactorofficial', 'dactor', 'main', TOKEN_OFFICIAL, monorepoFiles, commitMsg);

  // 3. Deploy compiled web-app/dist to GitHub Pages (dactorofficial.github.io & dactor:gh-pages)
  const distDir = path.join(ROOT_DIR, 'web-app', 'dist');
  if (fs.existsSync(distDir)) {
    const deployMsg = 'deploy: arrange pay-at-desk approvals in chronological order oldest on top (FIFO)';
    await deployDistToPages('dactorofficial', 'dactorofficial.github.io', 'main', TOKEN_OFFICIAL, distDir, deployMsg);
    await deployDistToPages('dactorofficial', 'dactor', 'gh-pages', TOKEN_OFFICIAL, distDir, deployMsg);
  }

  console.log('\n🎉 ALL PUSHES AND DEPLOYMENTS COMPLETED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Fatal error during push/deploy:', err);
  process.exit(1);
});
