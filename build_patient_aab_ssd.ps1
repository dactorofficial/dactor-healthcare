param(
    [string]$VersionName = "1.0.25",
    [int]$VersionCode = 125
)

$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "=== Fast SSD Build for Patient App AAB ===" -ForegroundColor Cyan
Write-Host "Target Version: v$VersionName (Code: $VersionCode)" -ForegroundColor Green

# 1. Update version in main repository build.gradle.kts with retry loop
$repoGradle = "G:\My Drive\New folder\patient-app\app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw
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
Copy-Item "G:\My Drive\New folder\patient-app\gradlew*" "$ssdRoot\" -Force
Copy-Item "G:\My Drive\New folder\patient-app\*.gradle.kts" "$ssdRoot\" -Force
Copy-Item "G:\My Drive\New folder\patient-app\gradle.properties" "$ssdRoot\" -Force

New-Item -ItemType Directory -Path "$ssdRoot\gradle" -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\app\keystores" -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\app\src" -Force | Out-Null

robocopy "G:\My Drive\New folder\patient-app\gradle" "$ssdRoot\gradle" /MIR /FFT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed on gradle with code $LASTEXITCODE" }
robocopy "G:\My Drive\New folder\patient-app\app\keystores" "$ssdRoot\app\keystores" /MIR /FFT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed on keystores with code $LASTEXITCODE" }
robocopy "G:\My Drive\New folder\patient-app\app\src" "$ssdRoot\app\src" /MIR /FFT /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed on src with code $LASTEXITCODE" }
$global:LASTEXITCODE = 0

Copy-Item "G:\My Drive\New folder\patient-app\app\build.gradle.kts" "$ssdRoot\app\" -Force
Copy-Item "G:\My Drive\New folder\patient-app\app\google-services.json" "$ssdRoot\app\" -Force
if (Test-Path "G:\My Drive\New folder\patient-app\app\proguard-rules.pro") {
    Copy-Item "G:\My Drive\New folder\patient-app\app\proguard-rules.pro" "$ssdRoot\app\" -Force
}

# 4. Configure SDK and Java
if (Test-Path "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot") {
    $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
} elseif (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$sdkPath = if (Test-Path "$env:LOCALAPPDATA\Android\Sdk") { "$env:LOCALAPPDATA\Android\Sdk" } else { "C:\Users\Ram Rathi\AppData\Local\Android\Sdk" }
$env:ANDROID_HOME = $sdkPath
$env:ANDROID_SDK_ROOT = $sdkPath
$escapedSdk = $sdkPath -replace '\\', '/'
Set-Content -Path "$ssdRoot\local.properties" -Value "sdk.dir=$escapedSdk" -Force

# 5. Clean prior build outputs and KSP caches on SSD to avoid stale bundle or incremental cache corruption
if (Test-Path "$ssdRoot\app\build\outputs\bundle") {
    Remove-Item -Path "$ssdRoot\app\build\outputs\bundle" -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path "$ssdRoot\app\build\kspCaches") {
    Remove-Item -Path "$ssdRoot\app\build\kspCaches" -Recurse -Force -ErrorAction SilentlyContinue
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
$aabsDir = "G:\My Drive\New folder\AABs"
$playStoreDir = "G:\My Drive\New folder\PlayStore\patient-app"
$ssdApksDir = "C:\Users\nitup\Dactor-APKs"

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
Copy-Item $aabFound.FullName $dest2 -Force
Copy-Item $aabFound.FullName $dest3 -Force
Copy-Item $aabFound.FullName $dest4 -Force
Copy-Item $aabFound.FullName $dest5 -Force
Copy-Item $aabFound.FullName $dest6 -Force
Copy-Item $aabFound.FullName $dest7 -Force

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
