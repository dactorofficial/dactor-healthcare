# PowerShell Test Runner for Pay at Desk E2E Test Suite
Param(
    [Parameter(Position=0, Mandatory=$false)]
    [Int]$Tier
)

$ErrorActionPreference = "Stop"
Write-Host "Executing Pay at Desk Dual-Track E2E Test Suite..." -ForegroundColor Cyan

if ($Tier) {
    node tests/pay_at_desk/test_pay_at_desk_e2e.cjs $Tier
} else {
    node tests/pay_at_desk/test_pay_at_desk_e2e.cjs
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nAll Pay at Desk E2E tests completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`nTest execution failed with exit code $LASTEXITCODE." -ForegroundColor Red
    exit $LASTEXITCODE
}
