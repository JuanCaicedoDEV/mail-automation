@echo off
REM ============================================================
REM Build script -- Email Automation desktop app for Windows
REM Output: dist\EmailAutomation\EmailAutomation.exe
REM         dist\EmailAutomation-Setup.exe  (if Inno Setup is installed)
REM ============================================================
setlocal enabledelayedexpansion

set PROJECT_ROOT=%~dp0..
cd /d "%PROJECT_ROOT%"

echo === [1/4] Building React frontend ===
cd apps\dashboard
call npm install --silent
set VITE_API_URL=http://127.0.0.1:8000
call npm run build
if errorlevel 1 ( echo ERROR: Frontend build failed & exit /b 1 )
cd "%PROJECT_ROOT%"

echo === [2/4] Installing Python dependencies ===
pip install -r backend\requirements.txt --quiet
if errorlevel 1 ( echo ERROR: pip install failed & exit /b 1 )

echo === [3/4] Running PyInstaller ===
pyinstaller build\app.spec ^
  --distpath dist ^
  --workpath build\pyinstaller_work ^
  --noconfirm
if errorlevel 1 ( echo ERROR: PyInstaller failed & exit /b 1 )

echo === [4/4] Creating installer (optional - requires Inno Setup) ===
set ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe
if exist "%ISCC_PATH%" (
    "%ISCC_PATH%" build\setup.iss
    echo Installer created at dist\EmailAutomation-Setup.exe
) else (
    echo Inno Setup not found -- skipping installer creation.
    echo Portable app is at: dist\EmailAutomation\EmailAutomation.exe
)

echo.
echo Build complete!
echo   Executable: %PROJECT_ROOT%\dist\EmailAutomation\EmailAutomation.exe
