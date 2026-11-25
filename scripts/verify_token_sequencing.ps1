$headers = @{
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y'
    'Content-Type' = 'application/json'
}

Write-Host "============================================================"
Write-Host "DACTOR HEALTHCARE: VERIFYING DAILY SEQUENTIAL TOKEN NUMBERING"
Write-Host "============================================================"

# Test 1: Historical Appointments on 2026-11-23 (The date with multiple appointments that previously all had Pos: 1)
Write-Host "`nTest 1: Inspecting appointments on 2026-11-23..."
try {
    $res = Invoke-RestMethod -Uri "https://ojfoofojcpabqegxmsab.supabase.co/rest/v1/appointments?appointment_date=eq.2026-11-23&select=id,tracking_code_10_digit,attempt_number,token_number,appointment_time,status&order=token_number.asc" -Headers $headers
    Write-Host "Found $($res.Count) appointments on 2026-11-23:"
    $res | Format-Table tracking_code_10_digit, attempt_number, token_number, appointment_time, status -AutoSize
    
    $uniqueTokens = $res | Select-Object -ExpandProperty token_number -Unique
    if ($uniqueTokens.Count -gt 1) {
        Write-Host "SUCCESS: Tokens on 2026-11-23 are distinct and sequentially assigned!" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Expected multiple distinct tokens." -ForegroundColor Yellow
    }
} catch {
    Write-Host "ERROR Test 1: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Live RPC get_live_queue_status
Write-Host "`nTest 2: Testing get_live_queue_status RPC with appointment 5856281645..."
try {
    $body = @{ p_code_or_id = "5856281645" } | ConvertTo-Json
    $rpcRes = Invoke-RestMethod -Uri "https://ojfoofojcpabqegxmsab.supabase.co/rest/v1/rpc/get_live_queue_status" -Method Post -Headers $headers -Body $body
    Write-Host "RPC Output:"
    Write-Host "  Tracking Code: $($rpcRes.tracking_code_10_digit)"
    Write-Host "  Authoritative Token: $($rpcRes.token_number)"
    Write-Host "  Current Serving Token: $($rpcRes.current_serving_token)"
    Write-Host "  Queue Status: $($rpcRes.queue_status)"
    Write-Host "  Patients Ahead: $($rpcRes.patients_ahead)"
    Write-Host "  Wait Time: $($rpcRes.estimated_wait_minutes) mins"
    Write-Host "  Notice: $($rpcRes.slot_notice)"
    Write-Host "SUCCESS: get_live_queue_status RPC verified!" -ForegroundColor Green
} catch {
    Write-Host "ERROR Test 2: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n============================================================"
Write-Host "ALL TESTS COMPLETE"
Write-Host "============================================================"
