$headers = @{
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y'
}

Write-Host "Querying appointments for token_number..."
try {
    $res = Invoke-RestMethod -Uri "https://ojfoofojcpabqegxmsab.supabase.co/rest/v1/appointments?select=id,tracking_code_10_digit,attempt_number,token_number,appointment_date&limit=5" -Headers $headers
    Write-Host "SUCCESS: token_number column is active!"
    $res | Format-Table -AutoSize
} catch {
    Write-Host "ERROR querying token_number: $($_.Exception.Message)"
}
