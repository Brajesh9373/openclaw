@echo off
REM OpenClaw Activity Monitor Control Script for Windows
REM Provides easy commands to monitor OpenClaw activity and idle states

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "MONITOR_SCRIPT=%SCRIPT_DIR%activity-monitor.ts"
set "DASHBOARD_SCRIPT=%SCRIPT_DIR%activity-dashboard.ts"
set "PID_FILE=%USERPROFILE%\.openclaw\monitor.pid"
set "LOG_FILE=%USERPROFILE%\.openclaw\monitor.log"

if "%1"=="" goto show_help
if "%1"=="help" goto show_help
if "%1"=="--help" goto show_help
if "%1"=="-h" goto show_help

if "%1"=="start" goto start_monitor
if "%1"=="stop" goto stop_monitor
if "%1"=="restart" goto restart_monitor
if "%1"=="status" goto show_status
if "%1"=="dashboard" goto show_dashboard
if "%1"=="live" goto show_live
if "%1"=="history" goto show_history
if "%1"=="idle" goto show_idle
if "%1"=="resources" goto show_resources
if "%1"=="logs" goto show_logs
if "%1"=="is-running" goto check_running

echo ❌ Unknown command: %1
echo.
goto show_help

:show_help
echo OpenClaw Activity Monitor Control
echo.
echo Usage: %0 ^<command^> [options]
echo.
echo Commands:
echo   start           Start the activity monitor in background
echo   stop            Stop the activity monitor
echo   restart         Restart the activity monitor
echo   status          Show current OpenClaw status
echo   dashboard       Show activity dashboard
echo   live            Show live monitoring view
echo   history [hours] Show activity history (default: 24 hours)
echo   idle            Analyze idle periods
echo   resources       Show resource usage
echo   logs            Show monitor logs
echo   is-running      Check if monitor is running (exit code 0/1)
echo.
echo Examples:
echo   %0 start                 # Start monitoring
echo   %0 dashboard             # Show current dashboard
echo   %0 history 12            # Show last 12 hours of activity
echo   %0 live                  # Live monitoring view
goto end

:is_monitor_running
if not exist "%PID_FILE%" (
    exit /b 1
)

set /p PID=<"%PID_FILE%"
tasklist /FI "PID eq %PID%" 2>nul | find /I "%PID%" >nul
if errorlevel 1 (
    del "%PID_FILE%" 2>nul
    exit /b 1
)
exit /b 0

:start_monitor
call :is_monitor_running
if %errorlevel%==0 (
    set /p PID=<"%PID_FILE%"
    echo ✅ Activity monitor is already running (PID: !PID!)
    goto end
)

echo 🚀 Starting OpenClaw activity monitor...

REM Ensure log directory exists
if not exist "%USERPROFILE%\.openclaw" mkdir "%USERPROFILE%\.openclaw"

REM Start monitor in background
start /B node "%MONITOR_SCRIPT%" start > "%LOG_FILE%" 2>&1

REM Get the PID (this is tricky in batch, we'll use a workaround)
timeout /t 2 /nobreak >nul

REM Find the node process running our script
for /f "tokens=2" %%i in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV ^| find "node.exe"') do (
    set "FOUND_PID=%%i"
    set "FOUND_PID=!FOUND_PID:"=!"
    echo !FOUND_PID! > "%PID_FILE%"
    goto pid_found
)

:pid_found
call :is_monitor_running
if %errorlevel%==0 (
    set /p PID=<"%PID_FILE%"
    echo ✅ Activity monitor started successfully (PID: !PID!)
    echo 📝 Logs: %LOG_FILE%
    echo 📊 Data: %USERPROFILE%\.openclaw\activity-monitor.json
) else (
    echo ❌ Failed to start activity monitor
    echo Check logs: %LOG_FILE%
)
goto end

:stop_monitor
call :is_monitor_running
if %errorlevel%==1 (
    echo ⚠️  Activity monitor is not running
    goto end
)

set /p PID=<"%PID_FILE%"
echo 🛑 Stopping activity monitor (PID: %PID%)...

taskkill /PID %PID% /F >nul 2>&1
del "%PID_FILE%" 2>nul
echo ✅ Activity monitor stopped
goto end

:restart_monitor
echo 🔄 Restarting activity monitor...
call :stop_monitor
timeout /t 1 /nobreak >nul
call :start_monitor
goto end

:show_status
call :is_monitor_running
if %errorlevel%==0 (
    set /p PID=<"%PID_FILE%"
    echo 🟢 Monitor Status: Running (PID: !PID!)
) else (
    echo 🔴 Monitor Status: Not running
)
echo.
node "%DASHBOARD_SCRIPT%" status
goto end

:show_dashboard
node "%DASHBOARD_SCRIPT%" full
goto end

:show_live
node "%DASHBOARD_SCRIPT%" live
goto end

:show_history
set "HOURS=%2"
if "%HOURS%"=="" set "HOURS=24"
node "%DASHBOARD_SCRIPT%" history %HOURS%
goto end

:show_idle
node "%DASHBOARD_SCRIPT%" idle
goto end

:show_resources
node "%DASHBOARD_SCRIPT%" resources
goto end

:show_logs
if not exist "%LOG_FILE%" (
    echo ❌ No log file found at %LOG_FILE%
    goto end
)

echo 📝 Monitor Logs (last 50 lines):
echo ─────────────────────────────────
powershell "Get-Content '%LOG_FILE%' | Select-Object -Last 50"
goto end

:check_running
call :is_monitor_running
exit /b %errorlevel%

:end
endlocal
