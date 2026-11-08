$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "C:\Users\nitup\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\nitup\AppData\Local\Android\Sdk"

$appDir = Join-Path $root "patient-app"
$localProps = Join-Path $appDir "local.properties"
Set-Content -Path $localProps -Value "sdk.dir=C:/Users/nitup/AppData/Local/Android/Sdk" -Force

Push-Location $appDir
try {
    Write-Host "Running gradlew.bat assembleRelease in $appDir..." -ForegroundColor Cyan
    & .\gradlew.bat assembleRelease --console=plain
    if ($LASTEXITCODE -ne 0) {
        throw "assembleRelease failed with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$apksDir = Join-Path $root "APKs"
if (-not (Test-Path $apksDir)) {
    New-Item -ItemType Directory -Path $apksDir -Force | Out-Null
}

$searchDirs = @(
    (Join-Path $appDir "app\build5\outputs\apk\release"),
    (Join-Path $appDir "app\build\outputs\apk\release")
) | Where-Object { Test-Path $_ }

$apk = Get-ChildItem -Path $searchDirs -Filter "*.apk" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $apk) {
    throw "No built release APK found in $searchDirs"
}

$destPath = Join-Path $apksDir "Dactor-PatientApp-v1.0.67.apk"
$aliasPath = Join-Path $apksDir "Dactor-PatientApp-release.apk"

Copy-Item $apk.FullName $destPath -Force
Copy-Item $apk.FullName $aliasPath -Force -ErrorAction SilentlyContinue

$sizeMB = [math]::Round(((Get-Item $destPath).Length / 1MB), 2)
Write-Host "SUCCESS: $destPath ($sizeMB MB)" -ForegroundColor Green
