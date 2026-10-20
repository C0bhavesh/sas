@echo off
rem Opens SAS in TEST MODE: builds the app, starts the service, opens the window.
rem On the login page press F2 (or click the dashed button) to continue as the administrator.
rem Closing the SAS window stops everything. Your test data is kept in the .devdata folder.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24 from https://nodejs.org and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing, this takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)
node scripts\demo.mjs %*
if errorlevel 1 (
  echo.
  echo SAS could not start. See the messages above.
  pause
)
