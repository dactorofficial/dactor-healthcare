<#
.SYNOPSIS
    DACTOR Clinic Data Daily Backup Scheduled Task Installer
.DESCRIPTION
    Registers a Windows Scheduled Task (DactorClinicDailyBackup) to run daily at 02:00 AM.
.EXAMPLE
    .\scripts\schedule_daily_backup.ps1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Time = "02:00",

    [Parameter(Mandatory = $false)]
    [string]$TaskName = "DactorClinicDailyBackup",

    [Parameter(Mandatory = $false)]
    [switch]$Unregister
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$psScript = Join-Path $repoRoot "sync_clinic_backups.ps1"

# Check administrator elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($Unregister) {
    if (-not $isAdmin) {
        Write-Warning "Administrator privilege required to unregister scheduled task. Please run as Administrator."
        exit 1
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Scheduled task '$TaskName' has been unregistered." -ForegroundColor Yellow
    exit 0
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "=== DACTOR DAILY BACKUP SCHEDULED TASK CONFIGURATION          ===" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Task Name:        $TaskName"
Write-Host "Scheduled Time:   $Time Daily"
Write-Host "Working Directory:$repoRoot"
Write-Host "Target Script:    $psScript"

if (-not $isAdmin) {
    Write-Warning "Notice: Administrator elevation is required to create a permanent Windows Scheduled Task."
    Write-Host "To register this task permanently, launch PowerShell as Administrator and re-run:" -ForegroundColor Yellow
    Write-Host "  powershell.exe -ExecutionPolicy Bypass -File `"$PSScriptRoot\schedule_daily_backup.ps1`"" -ForegroundColor White
    exit 0
}

# Define Action
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File `"$psScript`" -All" `
    -WorkingDirectory $repoRoot

# Define Daily Trigger at specified time
$trigger = New-ScheduledTaskTrigger -Daily -At $Time

# Define Task Settings (Wake computer if sleeping, start when available if missed)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Register or update task
Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Automated daily backup of DACTOR clinic database records and Supabase storage to Google Drive." `
    -Force | Out-Null

Write-Host "√ Scheduled Task '$TaskName' successfully registered for $Time daily." -ForegroundColor Green
