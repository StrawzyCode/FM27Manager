@echo off
rem Builds dist\FM27Plus.exe  (needs Python 3 with numpy + pyinstaller installed)
cd /d "%~dp0"
python -m PyInstaller --noconfirm --clean --onefile --noconsole --name FM27Plus --distpath "%~dp0dist" --workpath "%~dp0build" --specpath "%~dp0build" --add-data "%~dp0index.html;." --add-data "%~dp0app.js;." --add-data "%~dp0engine.js;." --add-data "%~dp0styles.css;." --add-data "%~dp0memory-bridge.js;." --paths "%~dp0." server.py
if exist "%~dp0dist\FM27Plus.exe" (echo. & echo Built: %~dp0dist\FM27Plus.exe) else (echo. & echo Build failed.)
