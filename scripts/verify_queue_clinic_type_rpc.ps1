$apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y"
$headers = @{
    "apikey" = $apiKey
    "Authorization" = "Bearer $apiKey"
    "Content-Type" = "application/json"
}

$cases = @(
    @{ code = "8928581048"; label = "NOBEL HEALTHCARE (multi_visit OPD)"; expectedType = "multi_visit"; expectedLab = $false },
    @{ code = "C0C38255E2"; label = "NOBEL HEALTHCARE (multi_visit Lab Order)"; expectedType = "multi_visit"; expectedLab = $true },
    @{ code = "6307679793"; label = "happy bday bro (multi_visit OPD)"; expectedType = "multi_visit"; expectedLab = $false },
    @{ code = "1795938439"; label = "try (single_visit Completed OPD)"; expectedType = "single_visit"; expectedLab = $false },
    @{ code = "7268030118"; label = "hehe clinic (diagnostic_lab)"; expectedType = "diagnostic_lab"; expectedLab = $true }
)

$allPassed = $true

foreach ($c in $cases) {
    $resLive = Invoke-RestMethod -Uri "https://ojfoofojcpabqegxmsab.supabase.co/rest/v1/rpc/get_live_queue_status" -Method Post -Headers $headers -Body (@{ p_code_or_id = $c.code } | ConvertTo-Json)
    $resPub = Invoke-RestMethod -Uri "https://ojfoofojcpabqegxmsab.supabase.co/rest/v1/rpc/get_public_queue_status" -Method Post -Headers $headers -Body (@{ p_tracking_code = $c.code } | ConvertTo-Json)

    $liveRow = if ($resLive -is [System.Array]) { $resLive[0] } else { $resLive }
    $pubRow = if ($resPub -is [System.Array]) { $resPub[0] } else { $resPub }

    $liveOk = ($liveRow.clinic_type -eq $c.expectedType) -and ($liveRow.is_lab_appointment -eq $c.expectedLab)
    $pubOk = ($pubRow.clinic_type -eq $c.expectedType) -and ($pubRow.is_lab_appointment -eq $c.expectedLab)

    if ($liveOk -and $pubOk) {
        Write-Host "[PASS] $($c.label) -> clinic_type=$($liveRow.clinic_type), is_lab_appointment=$($liveRow.is_lab_appointment)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $($c.label) -> live=($($liveRow.clinic_type), $($liveRow.is_lab_appointment)), pub=($($pubRow.clinic_type), $($pubRow.is_lab_appointment))" -ForegroundColor Red
        $allPassed = $false
    }
}

if (-not $allPassed) { exit 1 }
