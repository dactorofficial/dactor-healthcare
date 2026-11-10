$ErrorActionPreference = "Stop"
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "=== Fast SSD Bundle Build for Patient App (API 36) ===" -ForegroundColor Cyan

# 1. Enforce locked version
$repoGradle = "G:\My Drive\New folder\patient-app\app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw
if ($content -match 'versionCode\s*=\s*(\d+)') {
    $vCode = $matches[1]
}
if ($content -match 'versionName\s*=\s*"([^"]+)"') {
    $vName = $matches[1]
}
Write-Host "Locked Version: v$vName (Code: $vCode)" -ForegroundColor Green

# 2. SSD Staging Directory
$ssdRoot = "C:\dactor-ssd-build\patient-app"
if (Test-Path $ssdRoot) {
    cmd /c rd /s /q "$ssdRoot" 2>$null
}
New-Item -ItemType Directory -Path "$ssdRoot\app" -Force | Out-Null

# 3. Copy files to SSD using robocopy for directories
Write-Host "Staging source to local SSD ($ssdRoot)..." -ForegroundColor Yellow
Copy-Item "G:\My Drive\New folder\patient-app\gradlew*" "$ssdRoot\" -Force
Copy-Item "G:\My Drive\New folder\patient-app\*.gradle.kts" "$ssdRoot\" -Force
Copy-Item "G:\My Drive\New folder\patient-app\gradle.properties" "$ssdRoot\" -Force

robocopy "G:\My Drive\New folder\patient-app\gradle" "$ssdRoot\gradle" /E /NFL /NDL /NJH /NJS | Out-Null
Copy-Item "G:\My Drive\New folder\patient-app\app\build.gradle.kts" "$ssdRoot\app\" -Force
Copy-Item "G:\My Drive\New folder\patient-app\app\google-services.json" "$ssdRoot\app\" -Force
if (Test-Path "G:\My Drive\New folder\patient-app\app\proguard-rules.pro") {
    Copy-Item "G:\My Drive\New folder\patient-app\app\proguard-rules.pro" "$ssdRoot\app\" -Force
}
robocopy "G:\My Drive\New folder\patient-app\app\keystores" "$ssdRoot\app\keystores" /E /NFL /NDL /NJH /NJS | Out-Null
robocopy "G:\My Drive\New folder\patient-app\app\src" "$ssdRoot\app\src" /E /NFL /NDL /NJH /NJS | Out-Null

# 4. Configure SDK and Java
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$sdkPath = "C:/Users/nitup/AppData/Local/Android/Sdk"
Set-Content -Path "$ssdRoot\local.properties" -Value "sdk.dir=$sdkPath" -Force

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
$bundleFound = Get-ChildItem -Path "$ssdRoot\app\build\outputs\bundle\release" -Filter "*.aab" -Recurse | Select-Object -First 1
if (-not $bundleFound) {
    $bundleFound = Get-ChildItem -Path "$ssdRoot\app" -Filter "*.aab" -Recurse | Select-Object -First 1
}

if (-not $bundleFound) {
    throw "AAB bundle not found after build!"
}

# 7. Copy to destinations
$destBundleName = "Dactor-PatientApp-v$vName.aab"
$destCodeBundleName = "Dactor-PatientApp-v$vCode.aab"
$aabsDest = "G:\My Drive\New folder\AABs\$destBundleName"
$aabsCodeDest = "G:\My Drive\New folder\AABs\$destCodeBundleName"
$aabsReleaseDest = "G:\My Drive\New folder\AABs\Dactor-PatientApp-release.aab"
$apksDest = "G:\My Drive\New folder\APKs\$destBundleName"
$apksReleaseDest = "G:\My Drive\New folder\APKs\Dactor-PatientApp-release.aab"
$playStoreDest = "G:\My Drive\New folder\PlayStore\patient-app\$destBundleName"
$ssdDir = "C:\Users\nitup\Dactor-APKs"
if (-not (Test-Path $ssdDir)) {
    New-Item -ItemType Directory -Path $ssdDir -Force | Out-Null
}
$ssdBkp = "$ssdDir\$destBundleName"

Copy-Item $bundleFound.FullName $aabsDest -Force
Copy-Item $bundleFound.FullName $aabsCodeDest -Force
Copy-Item $bundleFound.FullName $aabsReleaseDest -Force
Copy-Item $bundleFound.FullName $apksDest -Force
Copy-Item $bundleFound.FullName $apksReleaseDest -Force
Copy-Item $bundleFound.FullName $playStoreDest -Force
Copy-Item $bundleFound.FullName $ssdBkp -Force

$sw.Stop()
$sizeMB = [math]::Round(($bundleFound.Length / 1MB), 2)
Write-Host "============================================================" -ForegroundColor Green
Write-Host "SUCCESS! Built in $($sw.Elapsed.TotalSeconds.ToString('F1')) seconds" -ForegroundColor Green
Write-Host "Size: $sizeMB MB ($($bundleFound.Length) bytes)" -ForegroundColor Green
Write-Host "Bundle Location: $aabsDest" -ForegroundColor Cyan
Write-Host "PlayStore Location: $playStoreDest" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
