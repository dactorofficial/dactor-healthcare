$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:ANDROID_HOME = "C:\Users\nitup\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\nitup\AppData\Local\Android\Sdk"

# 1. Enforce version from build.gradle.kts
$repoGradle = Join-Path $root "clinic-app\app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw
$vName = "1.0.0"
if ($content -match 'versionName\s*=\s*"([^"]+)"') {
    $vName = $matches[1]
}

# 2. Build on SSD for reliable file locking and speed
& (Join-Path $root "build_clinic_bundle_ssd.ps1")
