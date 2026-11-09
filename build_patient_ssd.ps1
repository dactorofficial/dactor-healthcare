param(
    [string]$VersionName = "1.0.26",
    [int]$VersionCode = 126,
    [string]$BuildType = "Debug"
)

$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "=== Fast SSD Build for Patient App ($BuildType) ===" -ForegroundColor Cyan
Write-Host "Target Version: v$VersionName (Code: $VersionCode)" -ForegroundColor Green

# 1. Update version in main repository build.gradle.kts
$repoGradle = "G:\My Drive\New folder\patient-app\app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw
$content = $content -replace 'versionCode\s*=\s*\d+', "versionCode = $VersionCode"
$content = $content -replace 'versionName\s*=\s*"[^"]+"', "versionName = `"$VersionName`""
$content = $content -replace 'layout\.buildDirectory\.set\(.*?\)', '// layout.buildDirectory default'
Set-Content -Path $repoGradle -Value $content -NoNewline

# 2. SSD Staging Directory
$ssdRoot = "C:\dactor-ssd-build\patient-app"
if (Test-Path $ssdRoot) {
    Remove-Item -Path $ssdRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $ssdRoot -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\app" -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\gradle" -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\app\keystores" -Force | Out-Null
New-Item -ItemType Directory -Path "$ssdRoot\app\src" -Force | Out-Null

# 3. Copy only necessary files to SSD
Write-Host "Staging source to local SSD ($ssdRoot)..." -ForegroundColor Yellow
Copy-Item "G:\My Drive\New folder\patient-app\gradlew.bat" "$ssdRoot\gradlew.bat" -Force
Copy-Item "G:\My Drive\New folder\patient-app\gradlew" "$ssdRoot\gradlew" -Force
Copy-Item "G:\My Drive\New folder\patient-app\build.gradle.kts" "$ssdRoot\build.gradle.kts" -Force
Copy-Item "G:\My Drive\New folder\patient-app\settings.gradle.kts" "$ssdRoot\settings.gradle.kts" -Force
Copy-Item "G:\My Drive\New folder\patient-app\gradle.properties" "$ssdRoot\gradle.properties" -Force

robocopy "G:\My Drive\New folder\patient-app\gradle" "$ssdRoot\gradle" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
robocopy "G:\My Drive\New folder\patient-app\app\keystores" "$ssdRoot\app\keystores" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
robocopy "G:\My Drive\New folder\patient-app\app\src" "$ssdRoot\app\src" /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null

Copy-Item "G:\My Drive\New folder\patient-app\app\build.gradle.kts" "$ssdRoot\app\build.gradle.kts" -Force
Copy-Item "G:\My Drive\New folder\patient-app\app\google-services.json" "$ssdRoot\app\google-services.json" -Force
if (Test-Path "G:\My Drive\New folder\patient-app\app\proguard-rules.pro") {
    Copy-Item "G:\My Drive\New folder\patient-app\app\proguard-rules.pro" "$ssdRoot\app\proguard-rules.pro" -Force
}

# 4. Configure SDK and Java
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$sdkPath = "C:/Users/nitup/AppData/Local/Android/Sdk"
$env:ANDROID_HOME = "C:\Users\nitup\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\nitup\AppData\Local\Android\Sdk"
Set-Content -Path "$ssdRoot\local.properties" -Value "sdk.dir=C\:/Users/nitup/AppData/Local/Android/Sdk" -Force

# 5. Build on SSD
Push-Location $ssdRoot
try {
    Write-Host "Executing Gradle assemble$BuildType on SSD..." -ForegroundColor Cyan
    & .\gradlew.bat "assemble$BuildType" --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

# 6. Locate built APK
$btLower = $BuildType.ToLower()
$apkFound = Get-ChildItem -Path "$ssdRoot\app\build\outputs\apk" -Filter "*.apk" -Recurse | Where-Object { $_.Name -notmatch "unaligned" } | Select-Object -First 1

if (-not $apkFound) {
    throw "APK not found after successful build!"
}

# 7. Copy to destinations
$destApkName = "Dactor-PatientApp-v$VersionName.apk"
$gDriveApks = "G:\My Drive\New folder\APKs\$destApkName"
$ssdApksDir = "C:\Users\nitup\Dactor-APKs"
if (-not (Test-Path $ssdApksDir)) {
    New-Item -ItemType Directory -Path $ssdApksDir -Force | Out-Null
}
$ssdBkp = "$ssdApksDir\$destApkName"

Copy-Item $apkFound.FullName $gDriveApks -Force
Copy-Item $apkFound.FullName $ssdBkp -Force
Copy-Item $apkFound.FullName "G:\My Drive\New folder\APKs\patient-app-debug.apk" -Force
Copy-Item $apkFound.FullName "G:\My Drive\New folder\APKs\Dactor-PatientApp-debug.apk" -Force

$sw.Stop()
$sizeMB = [math]::Round(($apkFound.Length / 1MB), 2)
Write-Host "============================================================" -ForegroundColor Green
Write-Host "🎉 SUCCESS! Built in $($sw.Elapsed.TotalSeconds.ToString('F1')) seconds" -ForegroundColor Green
Write-Host "Size: $sizeMB MB" -ForegroundColor Green
Write-Host "SSD APK: $ssdBkp" -ForegroundColor Cyan
Write-Host "Workspace APK: $gDriveApks" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
