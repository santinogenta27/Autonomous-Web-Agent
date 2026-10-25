@echo off
rem GhostOperator launcher for Windows (cmd). Delegates to run.ps1 so setup logic lives in one place.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
if errorlevel 1 (
  echo.
  echo GhostOperator exited with an error. See the messages above.
  pause
)
endlocal
