# PowerShell script to install Dactor Clinic & Patient Android apps sequentially with ADB connection checks
# Usage: Run this script in PowerShell after building the APKs.
# Ensure that adb is in your PATH.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apksDir = Join-Path $scriptDir "APKs"

# Resolve latest Clinic & Patient APKs dynamically (prefer versioned filenames)
$clinicApk = Get-ChildItem -Path $apksDir -Filter "*Clinic*v*.apk" -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $clinicApk) {
    $clinicApk = Get-ChildItem -Path $apksDir -Filter "*Clinic*.apk" -ErrorAction SilentlyContinue | 
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$patientApk = Get-ChildItem -Path $apksDir -Filter "*Patient*v*.apk" -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $patientApk) {
    $patientApk = Get-ChildItem -Path $apksDir -Filter "*Patient*.apk" -ErrorAction SilentlyContinue | 
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$apkPaths = @()
if ($clinicApk) { $apkPaths += $clinicApk.FullName }
if ($patientApk) { $apkPaths += $patientApk.FullName }

if ($apkPaths.Count -eq 0) {
    Write-Host "❌ No APK files found in $apksDir." -ForegroundColor Red
    exit 1
}

$adbCmd = if (Get-Command adb -ErrorAction SilentlyContinue) { "adb" } elseif (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") { "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" } else { "adb" }

foreach ($apk in $apkPaths) {
    Write-Host "Installing $apk ..." -ForegroundColor Cyan
    # Install the APK (replace existing, allow downgrade, grant all permissions)
    $installResult = & $adbCmd install -r -d -g "${apk}"
    Write-Host $installResult
    if ($installResult -match "Success") {
        Write-Host "✅ Installation of $(Split-Path $apk -Leaf) completed successfully." -ForegroundColor Green
    } else {
        Write-Host "⚠️ Installation of $(Split-Path $apk -Leaf) reported issues." -ForegroundColor Yellow
    }

    # Verify device connection before proceeding to the next APK
    $devices = & $adbCmd devices | Select-String "\tdevice" | ForEach-Object { $_.Line.Split("`t")[0] }
    if ($devices.Count -eq 0) {
        Write-Host "Device not detected. Please reconnect your Android device via USB, ensure USB debugging is enabled, and press ENTER to continue..." -ForegroundColor Red
        Read-Host
        # Wait until a device appears
        while ($true) {
            $devices = & $adbCmd devices | Select-String "\tdevice" | ForEach-Object { $_.Line.Split("`t")[0] }
            if ($devices.Count -gt 0) { break }
            Start-Sleep -Seconds 2
        }
        Write-Host "Device reconnected: $($devices -join ", ")" -ForegroundColor Green
    } else {
        Write-Host "Device still connected: $($devices -join ", ")" -ForegroundColor Green
    }
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
}

Write-Host "All APKs have been installed. You may now launch the apps on your device." -ForegroundColor Magenta
