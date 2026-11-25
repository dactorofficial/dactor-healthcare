$headers = @{
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y'
    'Content-Type' = 'application/json'
}

Write-Host "--- Inspecting queue_entries across appointments ---"
try {
    $res = Invoke-RestMethod -Uri "https://ojfoofojcpabqegxmsab.supabase.co/rest/v1/queue_entries?select=id,appointment_id,clinic_id,doctor_id,queue_position,status,created_at&order=created_at.desc&limit=15" -Method Get -Headers $headers
    Write-Host "Queue entries count: $($res.Count)"
    foreach ($r in $res) {
        Write-Host "Appt: $($r.appointment_id) | Pos: $($r.queue_position) | Status: $($r.status) | Doctor: $($r.doctor_id) | Time: $($r.created_at)"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
