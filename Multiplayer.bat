@echo off
setlocal
title Sundown Run - Multiplayer
cd /d "%~dp0"

echo.
echo   Sundown Run - MULTIPLAYER HOST
echo   ====================================
echo.
echo   Only ONE computer runs this file. Everyone else just opens
echo   the link it prints, in their browser - nothing to install.
echo.

rem ---- hosting needs Bun (the relay server is Bun-only) ----
where bun >nul 2>&1
if errorlevel 1 goto :noBun

rem ---- install dependencies on first run ----
if exist "node_modules\vite" goto :haveDeps
echo   Installing dependencies...     first run only, this takes a minute
echo.
call bun install
if errorlevel 1 goto :installFail
echo.
:haveDeps

rem ---- firewall: friends' computers must be able to REACH this one ----
rem One inbound allow rule for the game (5199) + relay (5200). Without it
rem Windows silently blocks friends. Added once; needs a one-time admin YES.
netsh advfirewall firewall show rule name=SundownRunMultiplayer >nul 2>&1
if not errorlevel 1 goto :fwDone
echo   Adding a Windows Firewall rule so friends can connect...
echo   Click YES on the admin prompt - one time only.
echo.
powershell -Command "Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=SundownRunMultiplayer dir=in action=allow protocol=TCP localport=5199-5200 profile=any' -Verb RunAs -Wait"
netsh advfirewall firewall show rule name=SundownRunMultiplayer >nul 2>&1
if not errorlevel 1 goto :fwDone
echo.
echo   The firewall rule was NOT added - friends probably cannot
echo   connect. Run this file again and click YES to retry.
echo.
:fwDone

echo   Starting the multiplayer host...
echo.
call bun run mp

echo.
echo   Multiplayer host stopped.
pause
exit /b 0

:noBun
echo   Multiplayer hosting needs Bun - the relay server runs on it.
echo   The normal game works without it, but hosting does not.
echo.
echo   Install it by pasting this line into PowerShell, then run
echo   this file again:
echo.
echo     powershell -c "irm bun.sh/install.ps1 | iex"
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
