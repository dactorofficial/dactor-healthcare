$ErrorActionPreference = "Continue"
if (Test-Path "C:\Program Files\Android\Android Studio\jbr") {
    $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
} elseif (Test-Path "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot") {
    $env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$repo = "G:\My Drive\New folder\clinic-app"
$ssd = "C:\dactor-ssd-build\clinic-app"

Write-Host "Copying modified Kotlin files to SSD staging..." -ForegroundColor Cyan
Copy-Item "$repo\app\src\main\java\com\dactor\clinic\data\repository\AppointmentRepository.kt" "$ssd\app\src\main\java\com\dactor\clinic\data\repository\AppointmentRepository.kt" -Force
Copy-Item "$repo\app\src\main\java\com\dactor\clinic\data\repository\LabReportRepository.kt" "$ssd\app\src\main\java\com\dactor\clinic\data\repository\LabReportRepository.kt" -Force
Copy-Item "$repo\app\src\main\java\com\dactor\clinic\data\repository\QueueRepository.kt" "$ssd\app\src\main\java\com\dactor\clinic\data\repository\QueueRepository.kt" -Force
Copy-Item "$repo\app\src\main\java\com\dactor\clinic\ui\queue\QueueBoardScreen.kt" "$ssd\app\src\main\java\com\dactor\clinic\ui\queue\QueueBoardScreen.kt" -Force
Copy-Item "$repo\app\src\main\java\com\dactor\clinic\ui\dashboard\DoctorDashboardScreen.kt" "$ssd\app\src\main\java\com\dactor\clinic\ui\dashboard\DoctorDashboardScreen.kt" -Force

Set-Location $ssd
Write-Host "Running compileDebugKotlin..." -ForegroundColor Yellow
.\gradlew.bat compileDebugKotlin --no-daemon --console=plain
