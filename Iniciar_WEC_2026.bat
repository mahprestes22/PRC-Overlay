@echo off
title WEC 2026 Broadcast Suite - Central de Controle
echo ========================================================
echo   Iniciando WEC 2026 Broadcast Suite...
echo ========================================================
cd /d "%~dp0"
py run_app.py
if %ERRORLEVEL% NEQ 0 (
    python run_app.py
)
pause
