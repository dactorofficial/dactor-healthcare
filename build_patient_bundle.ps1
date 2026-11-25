$ErrorActionPreference = "Stop"
$root = if ($PSScriptRoot) { $PSScriptRoot } else { "G:\My Drive\New folder" }

$msJdk = Get-ChildItem "C:\Program Files\Microsoft" -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msJdk) {
    $env:JAVA_HOME = $msJdk.FullName
} elseif (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$sdkCandidates = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Users\nitup\AppData\Local\Android\Sdk",
    "C:\Android\sdk"
)
foreach ($cand in $sdkCandidates) {
    if (Test-Path $cand) {
        $env:ANDROID_HOME = $cand
        $env:ANDROID_SDK_ROOT = $cand
        break
    }
}

$appDir = Join-Path $root "patient-app"
Push-Location $appDir
try {
    Write-Host "Running .\gradlew.bat bundleRelease in $appDir..." -ForegroundColor Cyan
    & .\gradlew.bat bundleRelease --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) {
        throw "bundleRelease failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$bundleOutput = Join-Path $appDir "app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path $bundleOutput)) {
    throw "Output bundle not found at $bundleOutput"
}

$repoGradle = Join-Path $appDir "app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw
$vCode = 1
$vName = "1.0.0"
if ($content -match 'versionCode\s*=\s*(\d+)') { $vCode = $matches[1] }
if ($content -match 'versionName\s*=\s*"([^"]+)"') { $vName = $matches[1] }

$aabsDir = Join-Path $root "AABs"
$playStoreDir = Join-Path $root "PlayStore\patient-app"

if (-not (Test-Path $aabsDir)) { New-Item -ItemType Directory -Path $aabsDir -Force | Out-Null }
if (-not (Test-Path $playStoreDir)) { New-Item -ItemType Directory -Path $playStoreDir -Force | Out-Null }

$destBundleName = "Dactor-PatientApp-v$vName.aab"
$dest1 = Join-Path $aabsDir $destBundleName
$destCode = Join-Path $aabsDir "Dactor-PatientApp-v$vCode.aab"
$dest2 = Join-Path $playStoreDir $destBundleName
$dest2Code = Join-Path $playStoreDir "Dactor-PatientApp-v$vCode.aab"
$destRelease = Join-Path $aabsDir "Dactor-PatientApp-release.aab"

Copy-Item $bundleOutput $dest1 -Force
Copy-Item $bundleOutput $destCode -Force
Copy-Item $bundleOutput $dest2 -Force
Copy-Item $bundleOutput $dest2Code -Force
Copy-Item $bundleOutput $destRelease -Force

$item = Get-Item $dest1
$sizeMB = [math]::Round(($item.Length / 1MB), 2)
Write-Host "SUCCESS! Generated: $dest1 ($sizeMB MB, $($item.Length) bytes)" -ForegroundColor Green
