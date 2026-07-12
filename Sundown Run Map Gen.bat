@echo off
setlocal
title Sundown Run - Map Gen
cd /d "%~dp0"

echo.
echo   Sundown Run - Map Gen
echo   ====================================
echo.
echo   Rebuilds "World Map.html" from the game code, then opens it.
echo   Run this after changing the world (new jumps, corners, toys)
echo   so the map matches what you built.
echo.

rem ---- the generator runs on Bun ----
where bun >nul 2>&1
if not errorlevel 1 goto :haveBun
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
  set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
  goto :haveBun
)
echo   Bun is not installed - the map generator needs it.
echo   Run Multiplayer.bat once (it offers to install Bun), or paste
echo   this into PowerShell and then run this file again:
echo.
echo     powershell -c "irm bun.sh/install.ps1 | iex"
echo.
pause
exit /b 1
:haveBun

rem ---- dependencies (the generator imports the game's own code) ----
if exist "node_modules\three" goto :haveDeps
echo   Installing dependencies...     first run only, this takes a minute
echo.
call bun install
if errorlevel 1 goto :installFail
echo.
:haveDeps

echo   Generating the map from the game code...
echo.
call bun scripts/world-map.ts
if errorlevel 1 goto :genFail

echo.
echo   Done - opening the map in your browser.
start "" "World Map.html"
exit /b 0

:genFail
echo.
echo   The generator hit an error - read the message above. If you
echo   changed src/core/terrain.ts, the error is probably in there.
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
