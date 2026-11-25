@echo off
setlocal enabledelayedexpansion
title Dactor Healthcare - APK Generator Launcher

:: If arguments were passed, forward directly to PowerShell script
if not "%~1"=="" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_apks.ps1" %*
    goto :end
)

:menu
cls
echo ============================================================
echo         DACTOR HEALTHCARE - APK GENERATOR (1-CLICK)
echo ============================================================
echo.
echo Please choose an option:
echo   [1] Build All APKs (Release - Signed)  [Default]
echo   [2] Build Clinic ^& Doctor App APK (Release)
echo   [3] Build Patient App APK (Release)
echo   [4] Build All APKs (Debug)
echo   [5] Run Environment Check / Setup (JDK 17 ^& Android SDK)
echo   [6] Exit
echo.
set /p choice="Enter your selection (1-6) [default: 1]: "

if "%choice%"=="" set choice=1
if "%choice%"=="1" goto :build_all_release
if "%choice%"=="2" goto :build_clinic_release
if "%choice%"=="3" goto :build_patient_release
if "%choice%"=="4" goto :build_all_debug
if "%choice%"=="5" goto :run_setup
if "%choice%"=="6" goto :exit

echo Invalid option selected.
pause
goto :menu

:build_all_release
echo.
echo Starting build for All apps (Release)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_apks.ps1" -App All -BuildType Release
goto :end

:build_clinic_release
echo.
echo Starting build for Clinic App (Release)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_apks.ps1" -App Clinic -BuildType Release
goto :end

:build_patient_release
echo.
echo Starting build for Patient App (Release)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_apks.ps1" -App Patient -BuildType Release
goto :end

:build_all_debug
echo.
echo Starting build for All apps (Debug)...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_apks.ps1" -App All -BuildType Debug
goto :end

:run_setup
echo.
echo Launching environment diagnostics and setup tool...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup_android_env.ps1"
goto :end

:end
echo.
echo ============================================================
echo Execution finished. Press any key to exit...
echo ============================================================
pause >nul

:exit
endlocal
