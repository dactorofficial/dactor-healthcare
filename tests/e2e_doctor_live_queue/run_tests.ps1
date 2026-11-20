# PowerShell runner for Dactor Doctor Portal Personalized Live Queue E2E Test Suite
[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$Tier
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runnerPath = Join-Path $scriptDir "run_all_tests.cjs"

if ($Tier) {
    node $runnerPath $Tier
} else {
    node $runnerPath
}

exit $LASTEXITCODE
