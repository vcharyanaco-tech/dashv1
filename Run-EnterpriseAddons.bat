@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-EnterpriseAddons.ps1"
if errorlevel 1 (
  echo.
  echo Enterprise addons build FAILED. Check the messages above.
  exit /b 1
)
endlocal