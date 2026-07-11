@echo off
setlocal
title Sundown Run - Get Updates
cd /d "%~dp0"

echo.
echo   Sundown Run - Get Updates
echo   ====================================
echo.

rem ---- git must exist ----
where git >nul 2>&1
if errorlevel 1 goto :noGit

echo   Downloading the latest version...
echo.
git fetch origin
if errorlevel 1 goto :fetchFail

rem ---- force-match this folder to the latest version ----
rem Any local edits (like config.ts experiments) are thrown away - that is the
rem point of this script. Josh's real knobs come back with the update anyway.
git reset --hard origin/main
if errorlevel 1 goto :resetFail

rem ---- refresh dependencies in case the update added any ----
set "RUNNER="
where bun >nul 2>&1
if not errorlevel 1 set "RUNNER=bun"
if defined RUNNER goto :haveRunner
where npm >nul 2>&1
if not errorlevel 1 set "RUNNER=npm"
:haveRunner
if not defined RUNNER goto :done
echo.
echo   Updating dependencies...
call %RUNNER% install >nul 2>&1

:done
echo.
echo   ====================================
echo   All up to date! Start the game with "Sundown Run.bat".
echo.
pause
exit /b 0


:noGit
echo   Could not find git on this computer.
echo.
echo   Install it from https://git-scm.com (all defaults are fine),
echo   then run this file again.
echo.
pause
exit /b 1

:fetchFail
echo.
echo   Could not reach the internet (or GitHub is being slow).
echo   Check the connection, then run this file again.
echo.
pause
exit /b 1

:resetFail
echo.
echo   The download worked but applying it failed. Ask Dad.
echo.
pause
exit /b 1
