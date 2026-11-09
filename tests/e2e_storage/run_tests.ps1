<#
.SYNOPSIS
    DACTOR Platform Private Storage & Server-Authorized Signed URLs — E2E Test Suite Runner
.DESCRIPTION
    Executes Tiers 1-4 opaque-box requirement tests using Node.js.
.PARAMETER Tier
    Optional tier number (1, 2, 3, or 4) to run an isolated tier. Runs all tiers if omitted.
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("1","2","3","4")]
    [string]$Tier
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  DACTOR Private Storage & Signed URLs: Executable E2E Runner        " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "Working Directory : $repoRoot" -ForegroundColor DarkGray
Write-Host "Runner Script     : $scriptDir\run_all_tests.cjs" -ForegroundColor DarkGray

if ($Tier) {
    Write-Host "Target Tier       : Tier $Tier" -ForegroundColor Yellow
    node "$scriptDir\run_all_tests.cjs" $Tier
} else {
    Write-Host "Target Tier       : All Tiers (1 - 4)" -ForegroundColor Yellow
    node "$scriptDir\run_all_tests.cjs"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nE2E Storage Tests Failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
} else {
    Write-Host "`nAll E2E Storage Tests Passed Successfully." -ForegroundColor Green
    exit 0
}
