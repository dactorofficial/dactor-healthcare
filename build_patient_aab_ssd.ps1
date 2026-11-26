param(
    [string]$VersionName = "",
    [int]$VersionCode = 0
)

$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$workspaceRoot = $PSScriptRoot
if (-not (Test-Path "$workspaceRoot\patient-app")) {
    $workspaceRoot = (Get-Location).Path
}

$repoGradle = Join-Path $workspaceRoot "patient-app\app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw

if ($VersionCode -eq 0) {
    if ($content -match 'versionCode\s*=\s*(\d+)') {
        $VersionCode = [int]$matches[1]
    } else {
        $VersionCode = 141
    }
}

if ([string]::IsNullOrWhiteSpace($VersionName)) {
    if ($content -match 'versionName\s*=\s*"([^"]+)"') {
        $VersionName = $matches[1]
    } else {
        $VersionName = "1.0.41"
    }
}

Write-Host "=== Fast SSD Build for Patient App AAB ===" -ForegroundColor Cyan
Write-Host "Target Version: v$VersionName (Code: $VersionCode)" -ForegroundColor Green

# 1. Update version in main repository build.gradle.kts with retry loop
$content = $content -replace 'versionCode\s*=\s*\d+', "versionCode = $VersionCode"
$content = $content -replace 'versionName\s*=\s*"[^"]+"', "versionName = `"$VersionName`""
$content = $content -replace 'layout\.buildDirectory\.set\(.*?\)', '// layout.buildDirectory default'

$written = $false
for ($retry = 0; $retry -lt 10; $retry++) {
    try {
        Set-Content -Path $repoGradle -Value $content -NoNewline -ErrorAction Stop
        $written = $true
        break
    } catch {
        Start-Sleep -Milliseconds 1000
    }
}
if (-not $written) {
    Set-Content -Path $repoGradle -Value $content -NoNewline
}

# 2. SSD Staging Directory
$ssdRoot = "C:\dactor-ssd-build\patient-app"
if (-not (Test-Path "$ssdRoot\app")) {
    New-Item -ItemType Directory -Path "$ssdRoot\app" -Force | Out-Null
}

# 3. Copy only necessary files to SSD with MIR
Write-Host "Staging source to local SSD ($ssdRoot)..." -ForegroundColor Yellow
$patientAppDir = Join-Path $workspaceRoot "patient-app"
Copy-Item (Join-Path $patientAppDir "gradlew*") "$ssdRoot\" -Force
Copy-Item (Join-Path $patientAppDir "*.gradle.kts") "$ssdRoot\" -Force
Copy-Item (Join-Path $patientAppDir "gradle.properties") "$ssdRoot\" -Force

New-Item -ItemType Directory -Path "$ssdRoot\gradle" -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\app\keystores" -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\app\src" -Force | Out-Null

robocopy (Join-Path $patientAppDir "gradle") "$ssdRoot\gradle" /MIR /FFT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed on gradle with code $LASTEXITCODE" }
robocopy (Join-Path $patientAppDir "app\keystores") "$ssdRoot\app\keystores" /MIR /FFT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed on keystores with code $LASTEXITCODE" }
robocopy (Join-Path $patientAppDir "app\src") "$ssdRoot\app\src" /MIR /FFT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed on src with code $LASTEXITCODE" }
$global:LASTEXITCODE = 0

Copy-Item (Join-Path $patientAppDir "app\build.gradle.kts") "$ssdRoot\app\" -Force
Copy-Item (Join-Path $patientAppDir "app\google-services.json") "$ssdRoot\app\" -Force
if (Test-Path (Join-Path $patientAppDir "app\proguard-rules.pro")) {
    Copy-Item (Join-Path $patientAppDir "app\proguard-rules.pro") "$ssdRoot\app\" -Force
}

# 4. Configure SDK and Java
$msftJdk = Get-ChildItem -Path "C:\Program Files\Microsoft" -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if ($msftJdk -and (Test-Path $msftJdk)) {
    $env:JAVA_HOME = $msftJdk
} elseif (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

if (-not $env:DACTOR_KEYSTORE_PASSWORD) { $env:DACTOR_KEYSTORE_PASSWORD = "DactorUpload2026!" }
if (-not $env:DACTOR_KEY_PASSWORD) { $env:DACTOR_KEY_PASSWORD = "DactorUpload2026!" }
if (-not $env:DACTOR_KEY_ALIAS) { $env:DACTOR_KEY_ALIAS = "dactor-upload" }

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
if ($env:ANDROID_HOME) {
    $escapedSdk = $env:ANDROID_HOME -replace '\\', '/'
    Set-Content -Path "$ssdRoot\local.properties" -Value "sdk.dir=$escapedSdk" -Force
}

# 5. Clean prior build outputs and KSP caches on SSD to avoid stale bundle or incremental cache corruption
if (Test-Path "$ssdRoot\app\build\outputs\bundle") {
    Remove-Item -Path "$ssdRoot\app\build\outputs\bundle" -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$ssdRoot\app\build\kspCaches") {
    Remove-Item -Path "$ssdRoot\app\build\kspCaches" -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$ssdRoot\app\build\intermediates") {
    Remove-Item -Path "$ssdRoot\app\build\intermediates" -Recurse -Force -ErrorAction SilentlyContinue
}

# 6. Build AAB on SSD
Push-Location $ssdRoot
try {
    Write-Host "Executing Gradle bundleRelease on SSD..." -ForegroundColor Cyan
    & .\gradlew.bat bundleRelease --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) {
        throw "bundleRelease failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# 7. Locate built AAB
$aabFound = Get-ChildItem -Path "$ssdRoot\app\build\outputs\bundle\release" -Filter "*.aab" -Recurse | Select-Object -First 1
if (-not $aabFound) {
    $aabFound = Get-ChildItem -Path "$ssdRoot\app" -Filter "*.aab" -Recurse | Select-Object -First 1
}

if (-not $aabFound) {
    throw "AAB not found after successful build!"
}

# 8. Copy to destinations
$destAabName = "Dactor-PatientApp-v$VersionName.aab"
$aabsDir = Join-Path $workspaceRoot "AABs"
$playStoreDir = Join-Path $workspaceRoot "PlayStore\patient-app"
$ssdApksDir = if (Test-Path "C:\Users\nitup\Dactor-APKs") { "C:\Users\nitup\Dactor-APKs" } else { Join-Path $env:USERPROFILE "Dactor-APKs" }

if (-not (Test-Path $aabsDir)) { New-Item -ItemType Directory -Path $aabsDir -Force | Out-Null }
if (-not (Test-Path $playStoreDir)) { New-Item -ItemType Directory -Path $playStoreDir -Force | Out-Null }
if (-not (Test-Path $ssdApksDir)) { New-Item -ItemType Directory -Path $ssdApksDir -Force | Out-Null }

$dest1 = "$aabsDir\$destAabName"
$dest2 = "$playStoreDir\$destAabName"
$dest3 = "$aabsDir\Dactor-PatientApp-release.aab"
$dest4 = "$aabsDir\Dactor-PatientApp-v$VersionCode.aab"
$dest5 = "$playStoreDir\Dactor-PatientApp-v$VersionCode.aab"
$dest6 = "$ssdApksDir\$destAabName"
$dest7 = "$ssdApksDir\Dactor-PatientApp-v$VersionCode.aab"

Copy-Item $aabFound.FullName $dest1 -Force
Copy-Item $aabFound.FullName $dest2 -Force -ErrorAction SilentlyContinue
Copy-Item $aabFound.FullName $dest3 -Force
Copy-Item $aabFound.FullName $dest4 -Force
Copy-Item $aabFound.FullName $dest5 -Force -ErrorAction SilentlyContinue
Copy-Item $aabFound.FullName $dest6 -Force -ErrorAction SilentlyContinue
Copy-Item $aabFound.FullName $dest7 -Force -ErrorAction SilentlyContinue

$sw.Stop()
$sizeMB = [math]::Round(($aabFound.Length / 1MB), 2)
Write-Host "============================================================" -ForegroundColor Green
Write-Host "🎉 SUCCESS! Built Patient App AAB in $($sw.Elapsed.TotalSeconds.ToString('F1')) seconds" -ForegroundColor Green
Write-Host "Version: v$VersionName (Code: $VersionCode)" -ForegroundColor Green
Write-Host "Size: $sizeMB MB ($($aabFound.Length) bytes)" -ForegroundColor Green
Write-Host "Central AAB: $dest1" -ForegroundColor Cyan
Write-Host "PlayStore AAB: $dest2" -ForegroundColor Cyan
Write-Host "Code Alias: $dest4" -ForegroundColor Cyan
Write-Host "SSD Backup: $dest6" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
