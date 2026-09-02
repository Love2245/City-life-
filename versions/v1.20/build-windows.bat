@echo off
title Urban Life v0.1.0 - Build Windows Installer
echo ============================================
echo   Urban Life v0.1.0
echo   Build Windows .exe / .msi installer
echo ============================================
echo.

REM ---- check Node.js ----
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js 20+ not found. Install from:
    echo   https://nodejs.org/zh-cn/download
    pause
    exit /b 1
)
echo [OK] Node.js:
node -v

REM ---- check Rust ----
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Rust toolchain not found. Install from:
    echo   https://rustup.rs
    echo Choose the DEFAULT setup (it needs Visual Studio
    echo Build Tools - the installer will tell you).
    pause
    exit /b 1
)
echo [OK] Rust:
cargo --version

REM ---- check pnpm ----
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Installing pnpm...
    call npm install -g pnpm
)

REM ---- install dependencies ----
echo.
echo [STEP 1/3] Installing dependencies...
call pnpm install
if %errorlevel% neq 0 (
    echo [ERROR] Dependency install failed.
    pause
    exit /b 1
)

REM ---- build ----
echo.
echo [STEP 2/3] Building desktop app (first Rust build 5-15 min)...
call pnpm tauri build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. See messages above.
    pause
    exit /b 1
)

REM ---- done ----
echo.
echo [STEP 3/3] Build finished!
echo.
echo Installer locations:
echo   src-tauri\target\release\bundle\msi\   (.msi installer)
echo   src-tauri\target\release\bundle\nsis\  (.exe installer)
echo.
echo Double-click the installer to install the game.
echo.
pause
