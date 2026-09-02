#!/usr/bin/env bash
# 都市生活 v0.1.0 - macOS / Linux 一键启动脚本
set -e
echo "============================================"
echo "   🌆 都市生活 v0.1.0"
echo "   桌面端都市生活模拟游戏"
echo "============================================"
echo ""

# 检查 Node.js
if ! command -v node &>/dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装 Node.js 20+"
    echo "  macOS:  brew install node"
    echo "  Ubuntu: sudo apt install nodejs npm"
    exit 1
fi
echo "[OK] Node.js: $(node -v)"

# 检查 pnpm
if ! command -v pnpm &>/dev/null; then
    echo "[提示] 未检测到 pnpm，正在安装..."
    npm install -g pnpm
fi
echo "[OK] pnpm: $(pnpm -v)"

# 安装依赖
if [ ! -d node_modules ]; then
    echo "[步骤 1/3] 首次运行，安装依赖（约 1-2 分钟）..."
    pnpm install
else
    echo "[步骤 1/3] 依赖已存在"
fi

# 启动游戏
echo "[步骤 2/3] 启动游戏服务器..."
(pnpm dev >/tmp/urban-life.log 2>&1 &)
echo "[步骤 3/3] 打开游戏窗口..."
sleep 3
if command -v open &>/dev/null; then
    open "http://localhost:1420"
elif command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:1420"
fi

echo ""
echo "✅ 游戏已启动！浏览器将自动打开 http://localhost:1420"
echo "   关闭方式：Ctrl+C"
echo ""
