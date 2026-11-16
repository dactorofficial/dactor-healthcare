$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$msJdk = Get-ChildItem "C:\Program Files\Microsoft" -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msJdk) {
    $env:JAVA_HOME = $msJdk.FullName
} elseif (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$sdkCandidates = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "C:\Users\nitup\AppData\Local\Android\Sdk",
    "C:\Android\sdk"
)
foreach ($cand in $sdkCandidates) {
    if (Test-Path $cand) {
        $env:ANDROID_HOME = $cand
        $env:ANDROID_SDK_ROOT = $cand
        break
    }
}

# 1. Enforce version from build.gradle.kts
$repoGradle = Join-Path $root "clinic-app\app\build.gradle.kts"
$content = Get-Content $repoGradle -Raw
$vName = "1.0.0"
if ($content -match 'versionName\s*=\s*"([^"]+)"') {
    $vName = $matches[1]
}

# 2. Build on SSD for reliable file locking and speed
& (Join-Path $root "build_clinic_bundle_ssd.ps1")
