$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "C:\Users\nitup\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\nitup\AppData\Local\Android\Sdk"

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

$aabsDir = Join-Path $root "AABs"
$playStoreDir = Join-Path $root "PlayStore\patient-app"

if (-not (Test-Path $aabsDir)) { New-Item -ItemType Directory -Path $aabsDir -Force | Out-Null }
if (-not (Test-Path $playStoreDir)) { New-Item -ItemType Directory -Path $playStoreDir -Force | Out-Null }

$dest1 = Join-Path $aabsDir "Dactor-PatientApp-v1.0.0.aab"
$destCode = Join-Path $aabsDir "Dactor-PatientApp-v1.0.0-code101.aab"
$dest2 = Join-Path $playStoreDir "Dactor-PatientApp-v1.0.0.aab"
$dest2Code = Join-Path $playStoreDir "Dactor-PatientApp-v1.0.0-code101.aab"

Copy-Item $bundleOutput $dest1 -Force
Copy-Item $bundleOutput $destCode -Force
Copy-Item $bundleOutput $dest2 -Force
Copy-Item $bundleOutput $dest2Code -Force

$item = Get-Item $dest1
$sizeMB = [math]::Round(($item.Length / 1MB), 2)
Write-Host "SUCCESS! Generated: $dest1 ($sizeMB MB, $($item.Length) bytes)" -ForegroundColor Green
