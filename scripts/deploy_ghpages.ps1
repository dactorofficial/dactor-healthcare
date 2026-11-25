# Deploy web-app/dist directly to both GitHub Pages destinations:
# 1. Root user domain: dactorofficial/dactorofficial.github.io (main branch) -> https://dactorofficial.github.io/
# 2. Repo mirror: dactorofficial/dactor (gh-pages branch) -> https://dactorofficial.github.io/dactor/

$distPath = Resolve-Path "web-app/dist"
$env:GIT_TERMINAL_PROMPT = "0"

# Destination 1: Root domain repository (dactorofficial.github.io)
$rootRepoUrl = if ($env:GITHUB_TOKEN) { "https://dactorofficial:$($env:GITHUB_TOKEN)@github.com/dactorofficial/dactorofficial.github.io.git" } else { "https://github.com/dactorofficial/dactorofficial.github.io.git" }
$rootTempDir = "$env:TEMP\dactor-root-publish"
Write-Output "=== Deploying to Root Domain (dactorofficial.github.io) ==="
if (Test-Path $rootTempDir) { cmd.exe /c "rd /s /q `"$rootTempDir`"" 2>$null }
git clone $rootRepoUrl $rootTempDir --depth 1
if (Test-Path "$rootTempDir\.git") {
    Copy-Item -Path "$distPath\*" -Destination $rootTempDir -Recurse -Force
    # Mirror into /dactor/ subfolder so URLs like https://dactorofficial.github.io/dactor/* resolve with 200 OK
    $dactorSubDir = "$rootTempDir\dactor"
    if (-not (Test-Path $dactorSubDir)) { New-Item -ItemType Directory -Path $dactorSubDir -Force | Out-Null }
    Copy-Item -Path "$distPath\*" -Destination $dactorSubDir -Recurse -Force

    Push-Location $rootTempDir
    git config user.name "Dactor AutoDeploy"
    git config user.email "deploy@dactor.health"
    git add -A
    if (git status --porcelain) {
        git commit -m "deploy: update live patient directory deduplication parity"
        git push origin main
        Write-Output "SUCCESS: Published to https://dactorofficial.github.io/"
    } else {
        Write-Output "Root domain repo is already up-to-date."
    }
    Pop-Location
    cmd.exe /c "rd /s /q `"$rootTempDir`"" 2>$null
}

# Destination 2: Project mirror (dactor gh-pages branch)
$mirrorRepoUrl = if ($env:GITHUB_TOKEN) { "https://dactorofficial:$($env:GITHUB_TOKEN)@github.com/dactorofficial/dactor.git" } else { "https://github.com/dactorofficial/dactor.git" }
$mirrorTempDir = "$env:TEMP\dactor-gh-pages-publish"
Write-Output "=== Deploying to Project Mirror (dactor gh-pages) ==="
if (Test-Path $mirrorTempDir) { cmd.exe /c "rd /s /q `"$mirrorTempDir`"" 2>$null }
git clone --branch gh-pages --single-branch $mirrorRepoUrl $mirrorTempDir --depth 1
if (Test-Path "$mirrorTempDir\.git") {
    Copy-Item -Path "$distPath\*" -Destination $mirrorTempDir -Recurse -Force
    Push-Location $mirrorTempDir
    git config user.name "Dactor AutoDeploy"
    git config user.email "deploy@dactor.health"
    git add -A
    if (git status --porcelain) {
        git commit -m "deploy: update live patient directory deduplication parity"
        git push origin gh-pages
        Write-Output "SUCCESS: Published to https://dactorofficial.github.io/dactor/"
    } else {
        Write-Output "Project mirror repo is already up-to-date."
    }
    Pop-Location
    cmd.exe /c "rd /s /q `"$mirrorTempDir`"" 2>$null
}
