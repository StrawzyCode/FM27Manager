@echo off
rem Builds dist\FM27Plus.exe.
rem The build runs in its own Python environment, .build-venv, made on the first run from requirements.txt
rem (needs internet, takes a minute or two). Packages in your main Python - an old "typing" backport,
rem another numpy - can't break it. Delete .build-venv to set it up afresh.
rem   build_exe.bat              double-click it, or .\build_exe.bat in PowerShell
rem   build_exe.bat --no-pause   don't wait for a key at the end
setlocal
cd /d "%~dp0"
set "VENV=%~dp0.build-venv"
set "PY=%VENV%\Scripts\python.exe"
set "OUT=%~dp0dist\FM27Plus.exe"

if not exist "%PY%" (
    echo Creating the build environment in .build-venv ...
    python -m venv "%VENV%"
    if errorlevel 1 (
        echo.
        echo Could not create it. Is Python 3 installed and on PATH? Check with: python --version
        goto :end
    )
)
echo Checking the build requirements ...
"%PY%" -m pip install --disable-pip-version-check -q -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo.
    echo Could not install the requirements - see the error above. The first run needs internet.
    goto :end
)

if exist "%OUT%" del "%OUT%" 2>nul
if exist "%OUT%" (
    echo.
    echo dist\FM27Plus.exe is in use. Close FM27 Plus and run this again.
    goto :end
)
"%PY%" -m PyInstaller --noconfirm --clean --onefile --noconsole --name FM27Plus --distpath "%~dp0dist" --workpath "%~dp0build" --specpath "%~dp0build" --add-data "%~dp0index.html;." --add-data "%~dp0app.js;." --add-data "%~dp0engine.js;." --add-data "%~dp0styles.css;." --add-data "%~dp0memory-bridge.js;." --paths "%~dp0." server.py
if exist "%OUT%" (echo. & echo Built: %OUT%) else (echo. & echo Build failed - see the messages above.)

:end
if /i not "%~1"=="--no-pause" pause
endlocal
