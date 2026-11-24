@echo off
chcp 65001 > nul
echo ========================================================
echo   กำลังรันชุดทดสอบระบบค้นหา Thungara Search Engine
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% equ 0 (
  node "%~dp0run_all.js"
  goto end
)

where python >nul 2>nul
if %errorlevel% equ 0 (
  python "%~dp0test_full_system.py"
  goto end
)

echo [ERROR] Neither Node.js nor Python was found on PATH.
exit /b 1

:end
echo.
echo ========================================================
pause
