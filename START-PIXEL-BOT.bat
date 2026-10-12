@echo off
title Pixel Bot
cd /d "%~dp0"

rem ---- 0. Apply an update if Claude left one ----
if exist "update.zip" (
  echo Installing a Pixel Bot update...
  tar -xf "update.zip"
  if errorlevel 1 (
    echo Could not install the update. Send Claude a screenshot of this window.
    pause
    exit /b 1
  )
  del "update.zip"
)

rem ---- 1. Unpack the bot the first time ----
if not exist "src\index.js" (
  echo Unpacking Pixel Bot...
  tar -xf "pixel-bot.zip"
  if errorlevel 1 (
    echo Could not unpack pixel-bot.zip. Send Claude a screenshot of this window.
    pause
    exit /b 1
  )
)

rem ---- 2. Make sure Node.js is installed ----
where node >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Pixel Bot needs Node.js, which is not installed on this PC.
  echo It is free and installs with winget, the installer built into Windows.
  echo Choosing Y installs Node.js LTS and accepts its license.
  echo.
  choice /M "Install Node.js now"
  if errorlevel 2 (
    echo No problem. Install the LTS version from https://nodejs.org and run this again.
    pause
    exit /b 1
  )
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js still is not available. Close this window and double-click START-PIXEL-BOT again.
  pause
  exit /b 1
)

rem ---- 3. Download the bot's parts the first time ----
if not exist "node_modules\discord.js" (
  echo.
  echo Installing Pixel Bot's parts. This takes a minute...
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo The install failed. Send Claude a screenshot of this window.
    pause
    exit /b 1
  )
)

rem ---- 4. Start the bot ----
echo.
echo Starting Pixel Bot. Keep this window open to keep the bot online.
echo.
:run
node index.js
if errorlevel 3 if not errorlevel 4 goto run
echo.
echo Pixel Bot has stopped. If there is an error above, send Claude a screenshot.
pause
