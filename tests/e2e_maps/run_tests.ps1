param(
    [int]$Tier = 0
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)

Write-Host "`n[DACTOR E2E Test Runner] Invoking 4-tier test suite..." -ForegroundColor Cyan

if ($Tier -ge 1 -and $Tier -le 4) {
    node "$scriptDir\run_all_tests.cjs" $Tier
} else {
    node "$scriptDir\run_all_tests.cjs"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[DACTOR E2E Test Runner] Suite Failed with Exit Code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
} else {
    Write-Host "`n[DACTOR E2E Test Runner] Suite Passed with Exit Code 0" -ForegroundColor Green
    exit 0
}
