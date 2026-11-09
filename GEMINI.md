# Antigravity Workspace Rules — DACTOR Project

## ⚠️ MANDATORY GLOBAL RULE 1: NEVER COMPILE OR BUILD ANY APP AUTOMATICALLY
- You **MUST NEVER** compile, build, assemble, or run compilation/build commands (e.g., `./gradlew compileDebugKotlin`, `./gradlew build`, `./gradlew assembleDebug`, etc.) for any application (`patient-app`, `clinic-app`, etc.) automatically or proactively.
- You must **ONLY** compile or build an app when the user **explicitly commands or requests it in the conversation** (e.g., "compile app", "test compile", "check compilation", "build apk", "generate apk", etc.).
- Even if all bug fixes, tests, migrations, or code changes are completed, **DO NOT** trigger app compilation or building on your own. Instead, verify code syntax and imports statically, report the status of the changes, and wait for the user's explicit command before compiling or building.

## ⚠️ MANDATORY GLOBAL RULE 2: NEVER GENERATE APK AUTOMATICALLY
- You **MUST NEVER** generate, build, or assemble an APK (or AAB) automatically or proactively.
- You must **ONLY** build/generate an APK when the user **explicitly commands or requests it in the conversation** (e.g., "build apk", "generate apk", "build patient app apk", etc.).
- Even if all bug fixes, tests, migrations, or code changes are completed, **DO NOT** trigger an APK build on your own. Instead, report the status of the changes and wait for the user's explicit command before building.

## ⚠️ MANDATORY GLOBAL RULE 3: MAINTAIN DAILY PROMPT & CHANGE LOG
- After implementing requested changes for a user prompt, you **MUST** record an entry in [`DAILY_PROMPT_LOG.md`](file:///g:/My%20Drive/New%20folder/DAILY_PROMPT_LOG.md).
- Group entries chronologically by Date (e.g., `## YYYY-MM-DD`).
- For each interaction, record:
  1. **Prompt**: The exact or core user instruction/request.
  2. **Changes Applied**: A clear, concise bulleted list of files modified, database changes made, or configurations updated.

## ⚠️ MANDATORY GLOBAL RULE 4: ALWAYS COMMIT AND PUSH NEW UPDATES TO REMOTE REPOSITORY
- After implementing requested changes, bug fixes, features, documentation, or configuration updates for any user prompt, you **MUST ALWAYS** commit and push all new changes to the remote Git repository (`origin/main`).
- Never leave modified files uncommitted or commits unpushed at the end of a task or turn.
- Always use descriptive, conventional commit messages (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`, `build: ...`).
- Always execute `git push origin <branch>` to keep the remote GitHub repository 100% synchronized with the local workspace.

## ⚠️ MANDATORY GLOBAL RULE 5: APK Versioning & Naming Convention (When Commanded by User)

Whenever an APK is generated or commanded by the user to be built/generated, you **MUST** strictly follow this procedure:

### 1. Automatic Version Increment (Before Every Build)
Before building an APK, check the current version in the corresponding app's `app/build.gradle.kts`:
- **`clinic-app/app/build.gradle.kts`**
- **`patient-app/app/build.gradle.kts`**

You **MUST** increment both:
1. **`versionCode`**: Always increment by `+1` (e.g., `1` -> `2` -> `3`...).
2. **`versionName`**: Increment the patch or minor version (e.g., `"1.0"` -> `"1.0.1"` -> `"1.0.2"`). Never build an APK with a previously used version string.

### 2. Versioned APK Naming & Placement
The generated APK file **MUST** explicitly state its version in the filename:
- **Clinic App**: `Dactor-ClinicApp-v<versionName>.apk`  
  *(e.g., `Dactor-ClinicApp-v1.0.1.apk`)*
- **Patient App**: `Dactor-PatientApp-v<versionName>.apk`  
  *(e.g., `Dactor-PatientApp-v1.0.1.apk`)*

All generated APKs must be saved to the central directory:
```
g:\My Drive\New folder\APKs\
```

### 3. Build & Copy Workflow
When building an app:
```powershell
# 1. Update versionCode and versionName in app/build.gradle.kts
# 2. Build Debug APK:
cd <app-folder>
./gradlew.bat assembleDebug

# 3. Copy output APK to APKs/ with the new version name:
Copy-Item "app/build2/outputs/apk/debug/app-debug.apk" "..\APKs\Dactor-<AppName>-v<versionName>.apk" -Force
```
*(Note: If using `./build_apks.ps1`, this is handled automatically).*

### 4. Update Tracking & Handoff
Whenever a new APK is built:
- Update the **Generated APKs / Version Log** table in [`HANDOFF.md`](file:///g:/My%20Drive/New%20folder/HANDOFF.md).
- Clearly mention the newly generated version number and file path in the response to the user so they can immediately verify which APK is the latest.

### 5. Installation Script Alignment
[`install_apps.ps1`](file:///g:/My%20Drive/New%20folder/install_apps.ps1) dynamically discovers the latest versioned APKs in `APKs/` sorted by last modified date.
