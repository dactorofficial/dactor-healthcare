# PowerShell Android Build Environment Setup & Diagnostic Tool for Dactor Healthcare
# Checks and configures Java 17, Android SDK, Keystores, and Gradle wrappers.

param(
    [switch]$AutoInstall
)

$ErrorActionPreference = "Continue"
$root = Split-Path $PSScriptRoot -Parent

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🔍 Dactor Android Environment Diagnostic & Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$diagnostics = [ordered]@{}

# 1. Check Winget
$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
$diagnostics["Windows Package Manager (winget)"] = if ($hasWinget) { "Available" } else { "Not Found" }

# 2. Check Java 17
$javaFound = $null
$javaVersion = $null

$javaCandidates = @(
    $env:JAVA_HOME,
    "C:\Program Files\Microsoft\jdk-17*",
    "C:\Program Files\Eclipse Adoptium\jdk-17*",
    "C:\Program Files\Java\jdk-17*",
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\Zulu\zulu-17*",
    "$env:LOCALAPPDATA\Programs\Eclipse Adoptium\jdk-17*"
)

foreach ($pattern in $javaCandidates) {
    if (-not $pattern) { continue }
    $found = Get-ChildItem -Path (Split-Path $pattern -Parent) -Filter (Split-Path $pattern -Leaf) -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($found -and (Test-Path (Join-Path $found.FullName "bin\java.exe"))) {
        $javaFound = $found.FullName
        break
    }
}

if (-not $javaFound) {
    $cmd = Get-Command java -ErrorAction SilentlyContinue
    if ($cmd) {
        $binDir = Split-Path $cmd.Source -Parent
        $javaFound = Split-Path $binDir -Parent
    }
}

if ($javaFound) {
    $verOutput = & (Join-Path $javaFound "bin\java.exe") -version 2>&1 | Out-String
    if ($verOutput -match '"(\d+[\.\d_]*)') {
        $javaVersion = $matches[1]
    }
    $diagnostics["Java 17 (JDK)"] = "Installed ($javaVersion) at $javaFound"
} else {
    $diagnostics["Java 17 (JDK)"] = "MISSING"
}

# 3. Check Android SDK
$sdkFound = $null
$sdkCandidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Android\sdk",
    "C:\Program Files (x86)\Android\android-sdk"
)

foreach ($cand in $sdkCandidates) {
    if ($cand -and (Test-Path $cand)) {
        $sdkFound = $cand
        break
    }
}

if ($sdkFound) {
    $hasPlatformTools = Test-Path (Join-Path $sdkFound "platform-tools\adb.exe")
    $diagnostics["Android SDK"] = "Found at $sdkFound (adb: $(if ($hasPlatformTools) {'Yes'} else {'No'}))"
} else {
    $diagnostics["Android SDK"] = "MISSING"
}

# 4. Check Keystores
$sharedKeystore = Join-Path $root "shared-keystore\dactor-upload.jks"
$clinicKeystore = Join-Path $root "clinic-app\app\keystores\dactor-upload.jks"
$patientKeystore = Join-Path $root "patient-app\app\keystores\dactor-upload.jks"

$keystoreStatus = "OK"
if (-not (Test-Path $sharedKeystore) -and -not (Test-Path $clinicKeystore)) {
    $keystoreStatus = "MISSING"
}
$diagnostics["Release Keystores (dactor-upload.jks)"] = $keystoreStatus

# 5. Check Gradle Wrappers
$clinicGradlew = Test-Path (Join-Path $root "clinic-app\gradlew.bat")
$patientGradlew = Test-Path (Join-Path $root "patient-app\gradlew.bat")
$diagnostics["Gradle Wrappers (clinic & patient)"] = if ($clinicGradlew -and $patientGradlew) { "OK" } else { "Incomplete" }

Write-Host "`nEnvironment Status Summary:" -ForegroundColor Yellow
foreach ($key in $diagnostics.Keys) {
    $val = $diagnostics[$key]
    $color = if ($val -match "MISSING") { "Red" } elseif ($val -match "Incomplete") { "Yellow" } else { "Green" }
    Write-Host "  • $key : " -NoNewline -ForegroundColor White
    Write-Host "$val" -ForegroundColor $color
}

# Remediation suggestions or auto-install
if ($diagnostics["Java 17 (JDK)"] -eq "MISSING") {
    Write-Host "`n------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "👉 JDK 17 Installation Options" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "To install Microsoft OpenJDK 17 automatically via winget, run:" -ForegroundColor Yellow
    Write-Host "  winget install Microsoft.OpenJDK.17 --accept-package-agreements --accept-source-agreements" -ForegroundColor White

    if ($AutoInstall -or ($Host.UI.RawUI -and $hasWinget)) {
        Write-Host "`nAttempting automated installation of Microsoft OpenJDK 17..." -ForegroundColor Yellow
        try {
            winget install Microsoft.OpenJDK.17 --accept-package-agreements --accept-source-agreements
            Write-Host "Java 17 installation finished. Please restart your terminal/IDE for environment variables to take effect." -ForegroundColor Green
        } catch {
            Write-Warning "Winget installation failed: $_"
        }
    }
}

if ($diagnostics["Android SDK"] -eq "MISSING") {
    Write-Host "`n------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "👉 Android SDK Installation Options" -ForegroundColor Cyan
    Write-Host "------------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "1. Install Android Studio (recommended for full SDK + ADB + Emulators):" -ForegroundColor Yellow
    Write-Host "   winget install Google.AndroidStudio --accept-package-agreements --accept-source-agreements`n" -ForegroundColor White
    Write-Host "2. Or alternatively, use GitHub Actions cloud APK builds with zero local setup:" -ForegroundColor Yellow
    Write-Host "   Open GitHub -> Actions -> 'Generate Dactor APKs' -> Run workflow.`n" -ForegroundColor Green
}

# Synchronize keystores if needed
if (Test-Path (Join-Path $root "shared-keystore")) {
    @("clinic-app", "patient-app") | ForEach-Object {
        $targetDir = Join-Path $root "$_\app\keystores"
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        Copy-Item (Join-Path $root "shared-keystore\*") $targetDir -Force -ErrorAction SilentlyContinue
    }
    Write-Host "✔ Keystores synchronized to app modules." -ForegroundColor Green
}

Write-Host "`nSetup check complete.`n" -ForegroundColor Cyan
