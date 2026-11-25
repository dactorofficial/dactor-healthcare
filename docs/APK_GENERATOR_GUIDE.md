# Dactor Healthcare - Complete APK Generator Guide

This guide explains how to generate, configure, and install Android APKs for **Clinic & Doctor App** and **Patient App**.

---

## ⚡ Quick Start: 3 Ways to Generate APKs

### 1. Zero-Install Cloud Generator (GitHub Actions)
If your local machine does not have Android SDK or Java 17 installed:
1. Open the repository on GitHub: [`dactorofficial/dactor-healthcare`](https://github.com/dactorofficial/dactor-healthcare).
2. Click the **Actions** tab at the top.
3. Select the workflow **"Generate Dactor APKs"** in the left sidebar.
4. Click **Run workflow**:
   - **Which app to build**: `All`, `Clinic`, or `Patient`
   - **Build Type**: `Release` or `Debug`
   - **Auto-increment version**: Checked by default
5. When the workflow finishes, download the generated APKs directly from the **Artifacts** section (retained for 90 days).

---

### 2. 1-Click Local Generator (Windows)
Double-click `generate_apks.bat` in the project root:
```text
============================================================
        DACTOR HEALTHCARE - APK GENERATOR (1-CLICK)
============================================================
Please choose an option:
  [1] Build All APKs (Release - Signed)  [Default]
  [2] Build Clinic & Doctor App APK (Release)
  [3] Build Patient App APK (Release)
  [4] Build All APKs (Debug)
  [5] Run Environment Check / Setup (JDK 17 & Android SDK)
  [6] Exit
```
Press `1` and press `Enter` to build signed release APKs for both applications.

---

### 3. PowerShell CLI (`build_apks.ps1`)
Run fine-grained builds directly from PowerShell:

```powershell
# Build both apps (Release) and auto-bump patch version
.\build_apks.ps1

# Build only the Clinic & Doctor App
.\build_apks.ps1 -App Clinic

# Build only the Patient App
.\build_apks.ps1 -App Patient

# Build Debug APKs (fast compile for testing)
.\build_apks.ps1 -BuildType Debug

# Build with an explicit version name (e.g., 1.1.0)
.\build_apks.ps1 -Version "1.1.0"

# Build without incrementing version numbers
.\build_apks.ps1 -NoBump

# Automatically deploy to connected phone via ADB immediately after build
.\build_apks.ps1 -InstallAdb
```

---

## 🛠️ Local Environment Requirements

To generate APKs locally on Windows, the following are needed:
1. **Java Development Kit (JDK 17)**:
   - Microsoft OpenJDK 17, Eclipse Temurin 17, or Android Studio JBR.
   - Install command: `winget install Microsoft.OpenJDK.17`
2. **Android SDK**:
   - Platform tools (`adb.exe`), build-tools, and API level 34/35.
   - Standard location: `%LOCALAPPDATA%\Android\Sdk`
   - Install command: `winget install Google.AndroidStudio`

### Automated Diagnostic Tool
Run the included environment diagnostic tool at any time:
```powershell
.\scripts\setup_android_env.ps1
```
It tests Java, Android SDK, Keystore health, and Gradle wrappers, and offers auto-install options.

---

## 🔐 Keystores & Signing Architecture

Both apps support debug and production release signing:

| Key Type | Store File | Alias | Password | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Release Upload** | `keystores/dactor-upload.jks` | `dactor-upload` | `DactorUpload2026!` | Production release builds & Play Store uploads |
| **Debug Key** | `keystores/debug.keystore` | `androiddebugkey` | `android` | Local debug builds & emulator testing |

*Note: Master keystores are backed up in `shared-keystore/`. The build scripts automatically synchronize them to both app modules before compiling.*

---

## 📂 Output Locations & Preservation Policy

### Permanent Archive:
All generated APKs are preserved in:
- `./APKs/Dactor-ClinicApp-v<version>.apk`
- `./APKs/Dactor-PatientApp-v<version>.apk`
- `%USERPROFILE%\Dactor-APKs\` (Secondary user SSD backup)

> **Rule 1 (Preservation)**: Never delete historical APKs from `APKs/`. Every past build must remain available for rollbacks and verification.

---

## 📲 Installing Built APKs on Android Phones

### Automatic on Build:
Pass `-InstallAdb` to `build_apks.ps1` or keep your phone connected via USB with USB Debugging enabled. The script will detect your device and install the freshly generated APK automatically.

### Manual via ADB:
```powershell
adb install -r -d -g .\APKs\Dactor-ClinicApp-release.apk
adb install -r -d -g .\APKs\Dactor-PatientApp-release.apk
```

### Batch Installer:
```powershell
.\install_apps.ps1
```
