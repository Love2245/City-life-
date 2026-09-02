@echo off
chcp 65001 >nul
title Urban Life v1.39 - Launcher (Portable)
echo ============================================
echo   Urban Life v1.39 - Portable Launcher
echo   (免安装单文件版，双击即玩)
echo ============================================
echo.

REM ---- 解析本 bat 所在目录（兼容含空格/中文路径）----
set "BAT_DIR=%~dp0"
if "%BAT_DIR:~-1%"=="\" set "BAT_DIR=%BAT_DIR:~0,-1%"

set "GAME_HTML=%BAT_DIR%\dist-portable\index.html"

REM ---- 优先打开免安装单文件成品 ----
if exist "%GAME_HTML%" (
    echo [OK] 正在用默认浏览器打开游戏...
    echo   文件: %GAME_HTML%
    echo.
    start "" "%GAME_HTML%"
    if errorlevel 1 (
        echo [WARN] 自动打开失败，请手动双击下列文件：
        echo   %GAME_HTML%
        pause
    ) else (
        echo [OK] 已尝试打开。若浏览器未自动弹出，请手动打开上面的文件。
        timeout /t 3 >nul 2>&1 || ping -n 4 127.0.0.1 >nul
    )
    exit /b 0
)

REM ---- 找不到单文件成品时的兜底提示 ----
echo [ERROR] 找不到免安装单文件成品:
echo   %GAME_HTML%
echo.
echo   该版本尚未生成便携构建。可选方案：
echo   1) 手动用浏览器打开 dist-portable\index.html（若已存在）
echo   2) 重新生成：pnpm build:portable
echo      （注意：当前 pnpm 存在 safe-delete 错误，dev 模式暂不可用）
echo.
pause
exit /b 1
