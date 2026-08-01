@echo off
setlocal
chcp 65001 >nul 2>nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
exit /b %ERRORLEVEL%
