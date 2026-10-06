@echo off
title Server Catur
cd /d "%~dp0"

rem Cari Node.js: dari PATH, atau dari lokasi instalasi standar
set "NODE=node"
node -v >nul 2>nul
if errorlevel 1 set "NODE=%ProgramFiles%\nodejs\node.exe"
if not "%NODE%"=="node" if not exist "%NODE%" (
  echo Node.js belum terpasang.
  echo Unduh dan pasang dari https://nodejs.org lalu jalankan file ini lagi.
  echo.
  pause
  exit /b 1
)

echo ================================================
echo   Server Catur
echo   Biarkan jendela ini tetap terbuka selama bermain.
echo   Tutup jendela ini (atau tekan Ctrl+C) untuk berhenti.
echo ================================================
echo.

rem Buka game di browser setelah server siap
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:3000"

"%NODE%" server.js

echo.
echo Server berhenti.
pause
