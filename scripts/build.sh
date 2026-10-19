#!/usr/bin/env bash
# 一键构建桌面应用（本地 Linux 包）
# 产物：release/ 目录下的 AppImage / deb
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[1/3] 编译服务端..."
(cd server && npm run build)

echo "[2/3] 安装/核对 electron 依赖..."
if [ ! -d node_modules/electron ]; then
  npm install --no-audit --no-fund
fi

echo "[3/3] electron-builder 打包 (linux)..."
npx electron-builder --linux --config build/electron-builder.yml

echo "完成。产物见 release/ 目录。"
