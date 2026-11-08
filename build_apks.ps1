# PowerShell script to build Dactor APKs with automatic version incrementing & naming
# Usage:
#   .\build_apks.ps1                  (Builds both apps, auto-incrementing versionCode and patch versionName)
#   .\build_apks.ps1 -App Clinic      (Builds only Clinic App)
#   .\build_apks.ps1 -App Patient     (Builds only Patient App)
#   .\build_apks.ps1 -Version "1.1.0" (Sets explicit version name, auto-increments versionCode)

param(
    [ValidateSet("All", "Clinic", "Patient")]
    [string]$App = "All",
    [string]$Version = "",
    [ValidateSet("Release", "Debug")]
    [string]$BuildType = "Release"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$apksDir = Join-Path $root "APKs"
if (-not (Test-Path $apksDir)) {
    New-Item -ItemType Directory -Path $apksDir | Out-Null
}

function Bump-App {
    param(
        [string]$AppName,
        [string]$AppDir,
        [string]$OutputPrefix
    )

    $gradlePath = Join-Path $AppDir "app\build.gradle.kts"
    if (-not (Test-Path $gradlePath)) {
        Write-Error "Cannot find build.gradle.kts at $gradlePath"
        return
    }

    $content = Get-Content $gradlePath -Raw

    # Parse current versionCode
    if ($content -match 'versionCode\s*=\s*(\d+)') {
        $oldCode = [int]$matches[1]
        $newCode = $oldCode + 1
    } else {
        $oldCode = 1
        $newCode = 2
    }

    # Parse current versionName
    if ($content -match 'versionName\s*=\s*"([^"]+)"') {
        $oldName = $matches[1]
    } else {
        $oldName = "1.0"
    }

    # Determine new versionName
    if ($Version -ne "") {
        $newName = $Version
    } else {
        # Auto-increment patch: e.g. "1.0" -> "1.0.1", "1.0.1" -> "1.0.2"
        $parts = $oldName.Split('.')
        if ($parts.Count -eq 2) {
            $newName = "$($parts[0]).$($parts[1]).1"
        } elseif ($parts.Count -ge 3) {
            $lastIndex = $parts.Count - 1
            $patch = 0
            [int]::TryParse($parts[$lastIndex], [ref]$patch) | Out-Null
            $parts[$lastIndex] = ($patch + 1).ToString()
            $newName = $parts -join '.'
        } else {
            $newName = "$oldName.1"
        }
    }

    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "Building ${AppName}: v${newName} (versionCode: ${newCode}, previous: v${oldName} / ${oldCode})" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan

    # Replace versionCode and versionName in build.gradle.kts
    $updatedContent = $content -replace 'versionCode\s*=\s*\d+', "versionCode = $newCode"
    $updatedContent = $updatedContent -replace 'versionName\s*=\s*"[^"]+"', "versionName = `"$newName`""
    $written = $false
    for ($retry = 0; $retry -lt 10; $retry++) {
        try {
            Set-Content -Path $gradlePath -Value $updatedContent -NoNewline -ErrorAction Stop
            $written = $true
            break
        } catch {
            Start-Sleep -Milliseconds 1500
        }
    }
    if (-not $written) {
        Set-Content -Path $gradlePath -Value $updatedContent -NoNewline
    }

    $appNameClean = if ($AppName -match 'Clinic') { 'clinic-app' } else { 'patient-app' }
    $localWorkDir = Join-Path $env:LOCALAPPDATA "Temp\dactor-src\$appNameClean"
    Write-Host "Syncing source files to local SSD at $localWorkDir to bypass Google Drive locks..." -ForegroundColor Yellow
    robocopy $AppDir $localWorkDir /XD build* .gradle .idea .git /XF *.apk *.zip /MT:16 /E /R:1 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) {
        Write-Warning "Robocopy exit code $LASTEXITCODE during SSD sync"
    }
    $global:LASTEXITCODE = 0

    # Run Gradle build on local SSD
    Push-Location $localWorkDir
    try {
        # Clean previous output APKs, stale intermediates, and stale KSP caches to prevent stale pickup and incremental crashes
        Get-ChildItem -Path (Join-Path $localWorkDir "app\build\outputs\apk") -Filter "*.apk" -Recurse -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $localWorkDir "app\build\kspCaches") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $localWorkDir "app\build\intermediates") -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Running Gradle assemble${BuildType} on SSD ($localWorkDir)..." -ForegroundColor Yellow
        $msftJdk = Get-ChildItem -Path "C:\Program Files\Microsoft" -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
        if ($msftJdk -and (Test-Path $msftJdk)) {
            $env:JAVA_HOME = $msftJdk
            $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
        } elseif (Test-Path "C:\Users\notan\tools\jdk-17") {
            $env:JAVA_HOME = "C:\Users\notan\tools\jdk-17"
            $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
        } elseif (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
            $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
            $env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
        } elseif (Test-Path "D:\jdk17") {
            $env:JAVA_HOME = "D:\jdk17"
            $env:PATH = "D:\jdk17\bin;$env:PATH"
        }

        $sdkCandidates = @(
            "C:\Users\nitup\AppData\Local\Android\Sdk",
            "$env:LOCALAPPDATA\Android\Sdk",
            "C:\Android\sdk"
        )
        foreach ($cand in $sdkCandidates) {
            if (Test-Path $cand) {
                $env:ANDROID_HOME = $cand
                $env:ANDROID_SDK_ROOT = $cand
                break
            }
        }
        if ($env:ANDROID_HOME) {
            Set-Content -Path (Join-Path $localWorkDir "local.properties") -Value "sdk.dir=$($env:ANDROID_HOME -replace '\\', '/')" -Force
            Set-Content -Path (Join-Path $AppDir "local.properties") -Value "sdk.dir=$($env:ANDROID_HOME -replace '\\', '/')" -Force
        }
        $gradleArgs = @("assemble$BuildType", "--no-daemon", "--console=plain")
        & .\gradlew.bat @gradleArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }

    $btLower = $BuildType.ToLower()
    $searchLocations = @(
        (Join-Path $localWorkDir "app\build\outputs\apk\$btLower"),
        (Join-Path $localWorkDir "app\build\outputs\apk\debug"),
        (Join-Path $AppDir "app\build\outputs\apk\$btLower"),
        (Join-Path $AppDir "app\build\outputs\apk\debug"),
        (Join-Path $AppDir "app\build6\outputs\apk\$btLower"),
        (Join-Path $AppDir "app\build5\outputs\apk\$btLower")
    ) | Where-Object { Test-Path $_ }

    $found = Get-ChildItem -Path $searchLocations -Filter "*.apk" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if (-not $found) {
        throw "Could not find built APK in $($searchLocations -join ', ')"
    }
    $builtApk = $found.FullName

    # Destination versioned APK
    $destVersionedName = "$OutputPrefix-v$newName.apk"
    $destVersionedPath = Join-Path $apksDir $destVersionedName
    Copy-Item $builtApk $destVersionedPath -Force

    # Also save directly to SSD location
    $ssdApksDir = "C:\Users\nitup\Dactor-APKs"
    if (-not (Test-Path $ssdApksDir)) {
        New-Item -ItemType Directory -Path $ssdApksDir -Force | Out-Null
    }
    $destSsdPath = Join-Path $ssdApksDir $destVersionedName
    Copy-Item $builtApk $destSsdPath -Force
    Write-Host "✅ Copied to SSD: $destSsdPath" -ForegroundColor Green

    # Also keep standard alias for backward compatibility
    try {
        $destAliasPath = Join-Path $apksDir "$OutputPrefix-$btLower.apk"
        Copy-Item $builtApk $destAliasPath -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Warning "Could not update alias file due to file lock: $_"
    }

    $fileSizeMB = [math]::Round(((Get-Item $destVersionedPath).Length / 1MB), 2)
    Write-Host "✅ Successfully generated: $destVersionedPath ($fileSizeMB MB)" -ForegroundColor Green
    return [PSCustomObject]@{
        AppName     = $AppName
        VersionName = $newName
        VersionCode = $newCode
        Path        = $destVersionedPath
        SizeMB      = $fileSizeMB
    }
}

$results = @()

if ($App -eq "All" -or $App -eq "Clinic") {
    $results += Bump-App -AppName "Clinic & Doctor App" -AppDir (Join-Path $root "clinic-app") -OutputPrefix "Dactor-ClinicApp"
}

if ($App -eq "All" -or $App -eq "Patient") {
    $results += Bump-App -AppName "Patient App" -AppDir (Join-Path $root "patient-app") -OutputPrefix "Dactor-PatientApp"
}

Write-Host "`n🎉 Build completed successfully!" -ForegroundColor Magenta
Write-Host "Artifacts stored in: $apksDir" -ForegroundColor Cyan
foreach ($res in $results) {
    Write-Host "  - $($res.AppName): v$($res.VersionName) (code $($res.VersionCode)) -> $($res.Path)" -ForegroundColor White
}
