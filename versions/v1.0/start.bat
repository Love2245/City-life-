@echo off
title Urban Life v0.85.0 - Launcher (Source Mode)
echo ============================================
echo   Urban Life v0.85.0 - Source Mode
echo   (Tip: just open "UrbanLife.html" instead -
echo    it needs NO installation at all!)
echo ============================================
echo.

REM ---- check Node.js ----
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo Please install Node.js 20+ from:
    echo   https://nodejs.org/zh-cn/download
    echo OR simply open the file "UrbanLife.html" in this folder.
    pause
    exit /b 1
)
echo [OK] Node.js:
node -v

REM ---- check pnpm ----
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] pnpm not found, installing...
    call npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install pnpm. Check network and retry.
        pause
        exit /b 1
    )
)
echo [OK] pnpm:
call pnpm -v

REM ---- install dependencies ----
if not exist node_modules (
    echo [STEP 1/3] Installing dependencies (first run, 1-2 min)...
    call pnpm install
    if %errorlevel% neq 0 (
        echo [ERROR] Dependency install failed. Check network and retry.
        pause
        exit /b 1
    )
) else (
    echo [STEP 1/3] Dependencies already installed.
)

REM ---- start game server (foreground, logs visible) ----
echo [STEP 2/3] Starting game server...
echo   Waiting for server... (do not close this window)
echo.
call pnpm dev
echo.
echo [ERROR] Game server exited unexpectedly.
echo   Please check the messages above.
pause
