$headers = @{
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y'
    'Content-Type' = 'application/json'
}

Write-Host "--- Real Appointment Test for get_live_queue_status ---"
try {
    $body = @{ p_code_or_id = "5856281645" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "https://ojfoofojcpabqegxmsab.supabase.co/rest/v1/rpc/get_live_queue_status" -Method Post -Headers $headers -Body $body
    Write-Host "Result:"
    $res | Format-List *
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
