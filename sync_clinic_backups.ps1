<#
.SYNOPSIS
    DACTOR Clinic Data Backup & Synchronization PowerShell Wrapper
.DESCRIPTION
    Launches the Node.js backup engine with local SSD staging to prevent
    Google Drive virtual filesystem locks during concurrent desktop syncing.
.EXAMPLE
    .\sync_clinic_backups.ps1 -All
.EXAMPLE
    .\sync_clinic_backups.ps1 -ClinicId "c1000000-0000-0000-0000-000000000001" -Verbose
.EXAMPLE
    .\sync_clinic_backups.ps1 -All -DryRun
#>

param(
    [switch]$All,
    [string]$ClinicId,
    [switch]$DryRun,
    [string]$OutputDir,
    [string]$StagingDir
)

$IsVerbose = $PSBoundParameters.ContainsKey('Verbose') -or ($VerbosePreference -ne 'SilentlyContinue')

$ErrorActionPreference = "Stop"

# Verify Node.js runtime is installed
try {
    $nodeVersion = & node --version 2>&1
    Write-Host "[DACTOR BACKUP] Runtime verified: Node $nodeVersion" -ForegroundColor Cyan
} catch {
    Write-Host "FATAL: Node.js runtime not found in system PATH." -ForegroundColor Red
    Write-Host "Please install Node.js v18+ to execute backup and synchronization tasks." -ForegroundColor Yellow
    exit 1
}

$scriptPath = Join-Path $PSScriptRoot "scripts\sync_clinic_backups.mjs"

if (-not (Test-Path $scriptPath)) {
    Write-Host "FATAL: Backup engine script not found at: $scriptPath" -ForegroundColor Red
    exit 1
}

# Translate PowerShell parameters to Node CLI flags
$nodeArgs = @($scriptPath)

if ($All) {
    $nodeArgs += "--all"
}

if ($ClinicId -and $ClinicId.Trim() -ne "") {
    $nodeArgs += @("--clinic-id", $ClinicId)
}

if ($DryRun) {
    $nodeArgs += "--dry-run"
}

if ($OutputDir -and $OutputDir.Trim() -ne "") {
    $nodeArgs += @("--output-dir", $OutputDir)
}

if ($StagingDir -and $StagingDir.Trim() -ne "") {
    $nodeArgs += @("--staging-dir", $StagingDir)
}

if ($IsVerbose) {
    $nodeArgs += "--verbose"
}

Write-Host "[DACTOR BACKUP] Initiating clinic data & storage synchronization..." -ForegroundColor Green

& node @nodeArgs

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "[DACTOR BACKUP] Operation completed successfully (Exit Code: $exitCode)." -ForegroundColor Green
} elseif ($exitCode -eq 2) {
    Write-Host "[DACTOR BACKUP] Operation aborted: Invalid command line arguments (Exit Code: $exitCode)." -ForegroundColor Yellow
} elseif ($exitCode -eq 3) {
    Write-Host "[DACTOR BACKUP] Operation aborted: Requested clinic UUID not found (Exit Code: $exitCode)." -ForegroundColor Yellow
} elseif ($exitCode -eq 4) {
    Write-Host "[DACTOR BACKUP] Operation failed: Checksum integrity verification failed (Exit Code: $exitCode)." -ForegroundColor Red
} else {
    Write-Host "[DACTOR BACKUP] Operation terminated with error (Exit Code: $exitCode)." -ForegroundColor Red
}

exit $exitCode
