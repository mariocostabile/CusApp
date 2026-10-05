@echo off
REM ==============================================================================
REM   BUILD APK - CUS COSENZA
REM   Fai doppio clic su questo file per compilare l'APK automaticamente.
REM ==============================================================================

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-apk.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRORE] Si e' verificato un errore durante la compilazione.
    pause
)
