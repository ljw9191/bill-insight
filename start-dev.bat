@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=5173"
set "OPEN=1"
if /i "%~1"=="--no-open" set "OPEN=0"
if /i "%~2"=="--no-open" set "OPEN=0"
if not "%~1"=="" if /i not "%~1"=="--no-open" set "PORT=%~1"

netstat -ano | findstr /C:":%PORT% " | findstr /C:"LISTENING" >nul
if not errorlevel 1 (
  echo Bill Insight is already running at http://127.0.0.1:%PORT%/
  if "%OPEN%"=="1" start "" "http://127.0.0.1:%PORT%/"
  exit /b 0
)

where node >nul 2>nul
if not errorlevel 1 goto run

for /d %%D in ("%USERPROFILE%\.workbuddy\binaries\node\versions\22.*") do (
  if exist "%%~fD\node.exe" set "PATH=%%~fD;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js 22 from https://nodejs.org/
  pause
  exit /b 1
)

:run
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting Bill Insight at http://127.0.0.1:%PORT%/
echo Vault file: %~dp0data\vault.json
echo Keep this window open. Press Ctrl+C to stop.
if "%OPEN%"=="1" (
  call npm run dev -- --port %PORT% --strictPort --open
) else (
  call npm run dev -- --port %PORT% --strictPort
)
pause
