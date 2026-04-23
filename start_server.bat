@echo off
REM ===========================================================================
REM  IC Memo Web - Portable local static server
REM  Serves this folder on http://localhost:5500 using Python's http.server.
REM  Works on any PC: no hardcoded user paths, auto-detects python/py launcher.
REM  Usage: double-click, or run from terminal. Optional port arg: start_server.bat 8000
REM ===========================================================================
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=5500"

where python >nul 2>&1
if %errorlevel%==0 (
    echo Starting server at http://localhost:%PORT%/  (Ctrl+C to stop)
    python -m http.server %PORT%
    goto :end
)

where py >nul 2>&1
if %errorlevel%==0 (
    echo Starting server at http://localhost:%PORT%/  (Ctrl+C to stop)
    py -3 -m http.server %PORT%
    goto :end
)

echo [ERROR] Python not found in PATH.
echo Install Python from https://www.python.org/ and ensure it is on PATH.
pause
exit /b 1

:end
endlocal
