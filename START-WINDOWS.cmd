@echo off
setlocal
cd /d "%~dp0"
if not exist package.json (
  echo ERROR: Extract the entire ZIP first, then run this file.
  pause
  exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22 or later, then run this file again.
  echo https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo Please update Node.js to version 22 or later.
  pause
  exit /b 1
)
echo [1/2] Installing project dependencies...
call npm ci
if errorlevel 1 (
  echo Installation failed. Keep this window open to read the error above.
  pause
  exit /b 1
)
echo [2/2] Starting TIME QUEST...
echo Open http://localhost:3000 after the Ready message appears.
echo If port 3000 is busy, stop the old terminal with Ctrl+C first.
echo Keep this window open while using the site.
call npm run dev -- --port 3000
pause
