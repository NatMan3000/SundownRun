@echo off
setlocal
title Sundown Run
cd /d "%~dp0"

echo.
echo   Sundown Run
echo   ====================================
echo.

rem ---- find a runtime: prefer Bun, fall back to Node/npm ----
set "RUNNER="
where bun >nul 2>&1
if not errorlevel 1 set "RUNNER=bun"
if defined RUNNER goto :haveRunner
where npm >nul 2>&1
if not errorlevel 1 set "RUNNER=npm"
:haveRunner
if not defined RUNNER goto :noRuntime

echo   Checking for Bun / Node.js...  found %RUNNER%

rem ---- install dependencies on first run ----
if exist "node_modules\vite" goto :haveDeps
echo   Installing dependencies...     first run only, this takes a minute
echo.
call %RUNNER% install
if errorlevel 1 goto :installFail
echo.
goto :ready
:haveDeps
echo   Dependencies...               already installed
:ready

echo   Starting Sundown Run...
echo.
echo   The game opens in your browser at http://localhost:5199
echo.
echo   Edit  src\core\config.ts  and save - the game updates instantly.
echo   Close this window to stop playing.
echo.

call %RUNNER% run start

echo.
echo   Sundown Run has stopped.
pause
exit /b 0


:noRuntime
echo   Could not find Bun or Node.js on this computer.
echo.
echo   Install ONE of these, then run this file again:
echo.
echo     Bun      - recommended, faster    https://bun.sh
echo     Node.js  - pick the LTS version   https://nodejs.org
echo.
pause
exit /b 1


:installFail
echo.
echo   Something went wrong installing the dependencies.
echo   Check your internet connection, then run this file again.
echo.
pause
exit /b 1
