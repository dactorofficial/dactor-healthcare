# APK Preservation & Deployment Rules

1. **Never Delete Generated APKs**:
   - Never remove or delete past APK releases.
   - All historical and versioned APK builds must remain permanently archived in `APKs/` and the root folder (e.g., `Dactor-PatientApp-vX.Y.Z.apk`, `Dactor-ClinicApp-vX.Y.Z.apk`).

2. **Automated ADB Device Installation**:
   - Whenever a new release or debug APK is built, automatically install the latest APK onto the user's connected physical phone via ADB (`adb install -r <apkPath>`) using the Android SDK platform-tools at `C:\Users\nitup\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
