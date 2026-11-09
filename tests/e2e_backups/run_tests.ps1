# PowerShell Test Runner Wrapper for DACTOR Clinic Backup E2E Suite
param (
    [Parameter(Mandatory = $false)]
    [ValidateSet(1, 2, 3, 4)]
    [int]$Tier
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")

Set-Location $repoRoot

$runnerScript = Join-Path $scriptDir "run_all_tests.cjs"

if ($Tier) {
    node $runnerScript $Tier
} else {
    node $runnerScript
}

exit $LASTEXITCODE
