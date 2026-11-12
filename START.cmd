@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or 24 is required. Install Node.js and try again.
  pause
  exit /b 1
)
if not exist "node_modules\hardhat\package.json" (
  echo Install dependencies first: npm install --ignore-scripts
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 after the deployment message appears.
node server.cjs
pause
