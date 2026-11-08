$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "=== Fast SSD Bundle Build for Clinic App (API 36) ===" -ForegroundColor Cyan

# 1. Enforce version from build.gradle.kts
$root = if ($PSScriptRoot) { $PSScriptRoot } else { "G:\My Drive\New folder" }
$repoGradle = Join-Path $root "clinic-app\app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw
$vCode = 1
$vName = "1.0.0"
if ($content -match 'versionCode\s*=\s*(\d+)') {
    $vCode = $matches[1]
}
if ($content -match 'versionName\s*=\s*"([^"]+)"') {
    $vName = $matches[1]
}
Write-Host "Locked Version: v$vName (Code: $vCode)" -ForegroundColor Green

# 2. SSD Staging Directory
$ssdRoot = "C:\dactor-ssd-build\clinic-app"
if (Test-Path $ssdRoot) {
    Remove-Item -Path $ssdRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path "$ssdRoot\app" -Force | Out-Null

# 3. Copy files to SSD using robocopy for directories
Write-Host "Staging source to local SSD ($ssdRoot)..." -ForegroundColor Yellow
$clinicDir = Join-Path $root "clinic-app"
Copy-Item (Join-Path $clinicDir "gradlew*") "$ssdRoot\" -Force
Copy-Item (Join-Path $clinicDir "*.gradle.kts") "$ssdRoot\" -Force
Copy-Item (Join-Path $clinicDir "gradle.properties") "$ssdRoot\" -Force

robocopy (Join-Path $clinicDir "gradle") "$ssdRoot\gradle" /E /NFL /NDL /NJH /NJS | Out-Null
Copy-Item (Join-Path $clinicDir "app\build.gradle.kts") "$ssdRoot\app\" -Force
Copy-Item (Join-Path $clinicDir "app\google-services.json") "$ssdRoot\app\" -Force
if (Test-Path (Join-Path $clinicDir "app\proguard-rules.pro")) {
    Copy-Item (Join-Path $clinicDir "app\proguard-rules.pro") "$ssdRoot\app\" -Force
}
robocopy (Join-Path $clinicDir "app\keystores") "$ssdRoot\app\keystores" /E /NFL /NDL /NJH /NJS | Out-Null
robocopy (Join-Path $clinicDir "app\src") "$ssdRoot\app\src" /E /NFL /NDL /NJH /NJS | Out-Null

# 4. Configure SDK and Java
if (Test-Path "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot") {
    $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
} elseif (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$sdkCandidates = @(
    "C:\Users\nitup\AppData\Local\Android\Sdk",
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Android\sdk"
)
$sdkPath = $null
foreach ($cand in $sdkCandidates) {
    if (Test-Path $cand) {
        $sdkPath = $cand
        break
    }
}
if (-not $sdkPath) {
    throw "Android SDK not found in known candidate locations."
}
$env:ANDROID_HOME = $sdkPath
$env:ANDROID_SDK_ROOT = $sdkPath
Set-Content -Path "$ssdRoot\local.properties" -Value "sdk.dir=$($sdkPath -replace '\\', '/')" -Force

# 5. Build AAB on SSD with clean flags
Push-Location $ssdRoot
try {
    Write-Host "Executing Gradle bundleRelease on SSD..." -ForegroundColor Cyan
    & .\gradlew.bat bundleRelease --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# 6. Locate built AAB
$bundleFound = Get-ChildItem -Path "$ssdRoot\app\build\outputs\bundle\release" -Filter "*.aab" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $bundleFound) {
    $bundleFound = Get-ChildItem -Path "$ssdRoot\app" -Filter "*.aab" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (-not $bundleFound) {
    throw "AAB bundle not found after build!"
}

# 7. Copy to destinations
$destBundleName = "Dactor-ClinicApp-v$vName.aab"
$aabsDir = Join-Path $root "AABs"
$playStoreDir = Join-Path $root "PlayStore\clinic-app"
$ssdDir = Join-Path $env:USERPROFILE "Dactor-APKs"

if (-not (Test-Path $aabsDir)) { New-Item -ItemType Directory -Path $aabsDir -Force | Out-Null }
if (-not (Test-Path $playStoreDir)) { New-Item -ItemType Directory -Path $playStoreDir -Force | Out-Null }
if (-not (Test-Path $ssdDir)) { New-Item -ItemType Directory -Path $ssdDir -Force | Out-Null }

$aabsDest = Join-Path $aabsDir $destBundleName
$playStoreDest = Join-Path $playStoreDir $destBundleName
$ssdBkp = Join-Path $ssdDir $destBundleName

Copy-Item $bundleFound.FullName $aabsDest -Force
Copy-Item $bundleFound.FullName $playStoreDest -Force
Copy-Item $bundleFound.FullName $ssdBkp -Force
Copy-Item $bundleFound.FullName (Join-Path $aabsDir 'Dactor-ClinicApp-release.aab') -Force
Copy-Item $bundleFound.FullName (Join-Path $aabsDir "Dactor-ClinicApp-v$vCode.aab") -Force
Copy-Item $bundleFound.FullName (Join-Path $playStoreDir "Dactor-ClinicApp-v$vCode.aab") -Force

# Also sync existing v1.0.60 to PlayStore/clinic-app if it exists in AABs
$v60 = Join-Path $aabsDir "Dactor-ClinicApp-v1.0.60.aab"
if (Test-Path $v60) {
    $playStoreV60 = Join-Path $playStoreDir "Dactor-ClinicApp-v1.0.60.aab"
    if (-not (Test-Path $playStoreV60)) {
        Copy-Item $v60 $playStoreV60 -Force
    }
}

$sw.Stop()
$sizeMB = [math]::Round(($bundleFound.Length / 1MB), 2)
Write-Host "============================================================" -ForegroundColor Green
Write-Host "SUCCESS! Built in $($sw.Elapsed.TotalSeconds.ToString('F1')) seconds" -ForegroundColor Green
Write-Host "Size: $sizeMB MB ($($bundleFound.Length) bytes)" -ForegroundColor Green
Write-Host "Bundle Location: $aabsDest" -ForegroundColor Cyan
Write-Host "PlayStore Location: $playStoreDest" -ForegroundColor Cyan
Write-Host "SSD Backup: $ssdBkp" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
