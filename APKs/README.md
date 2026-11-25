# Dactor Healthcare - APK Archive Directory

This directory permanently stores all compiled Android APK packages for Dactor Healthcare applications.

## 📌 Preservation Policy (Rule 1)
- **NEVER delete historical APK builds.**
- Every release or debug APK compiled locally or downloaded from CI must remain archived here for backward compatibility testing, crash triage, and rollback verification.
- In addition to this folder, local builds are mirrored automatically to `%USERPROFILE%\Dactor-APKs\`.

## 📦 Filename Conventions
All generated APKs follow structured naming conventions:
- **Clinic & Doctor App (Release)**: `Dactor-ClinicApp-v<version>.apk`
- **Clinic & Doctor App (Debug)**: `Dactor-ClinicApp-v<version>-debug.apk`
- **Patient App (Release)**: `Dactor-PatientApp-v<version>.apk`
- **Patient App (Debug)**: `Dactor-PatientApp-v<version>-debug.apk`
- **Convenience Aliases**: `Dactor-ClinicApp-release.apk`, `Dactor-PatientApp-release.apk`

## 📲 How to Install an APK onto a Connected Android Phone
Ensure USB Debugging is enabled on your phone, then run:

```powershell
adb install -r -d -g .\APKs\Dactor-ClinicApp-release.apk
```

Or run the batch installer:
```powershell
.\install_apps.ps1
```
