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
if not errorlevel 1 goto :haveBun

rem Not found in PATH - maybe installed by a previous run of this file,
rem in which case it lives in %USERPROFILE%\.bun\bin.
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
  set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
  goto :haveBun
)

echo   ------------------------------------------------------------
echo   Bun is not installed. The normal game runs without it, but
echo   HOSTING multiplayer needs it (the relay server runs on Bun).
echo   ------------------------------------------------------------
echo.
set /p INSTALLBUN=  Install Bun now? Takes under a minute. (Y/N):
if /i not "%INSTALLBUN%"=="Y" goto :bunDeclined
echo.
echo   Installing Bun...
echo.
powershell -Command "irm bun.sh/install.ps1 | iex"
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
where bun >nul 2>&1
if errorlevel 1 goto :bunFail
echo.
echo   Bun installed!
echo.
:haveBun
echo   Bun...                         found

rem ---- install dependencies on first run ----
if exist "node_modules\vite" goto :haveDeps
echo   Installing dependencies...     first run only, this takes a minute
echo.
call bun install
if errorlevel 1 goto :installFail
echo.
:haveDeps
echo   Dependencies...                ready

rem ---- firewall: friends' computers must be able to REACH this one ----
rem One inbound allow rule for the game (5199) + relay (5200). Without it
rem Windows silently blocks friends. Added once; needs a one-time admin YES.
netsh advfirewall firewall show rule name=SundownRunMultiplayer >nul 2>&1
if not errorlevel 1 goto :fwDone
echo.
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
echo   Firewall...                    friends can connect
echo.
echo   Starting the multiplayer host...
echo.
call bun run mp

echo.
echo   Multiplayer host stopped. If that was unexpected, read any
echo   error above - then close this window.
pause
exit /b 0

:bunDeclined
echo.
echo   No worries - run this file again when you want to host.
echo   (Joining someone ELSE's game needs nothing: just open the
echo   link they send you in your browser.)
echo.
pause
exit /b 1

:bunFail
echo.
echo   Bun did not install cleanly. Two things to try:
echo.
echo     1. Run this file again.
echo     2. Or install it yourself: open PowerShell and paste
echo        irm bun.sh/install.ps1 ^| iex
echo        then run this file again.
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
