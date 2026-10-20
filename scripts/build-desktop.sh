#!/usr/bin/env bash
# ============================================================
# 一键构建桌面应用（本机执行）
#
# 用法：
#   bash scripts/build-desktop.sh          # 自动识别当前系统
#   bash scripts/build-desktop.sh mac      # 指定平台：mac / win / linux
#
# 产物在 release/ 目录。
# 与旧流程的区别：不需要联网下载源码、数据、前端资源、图标，
# 这些东西都在仓库里，所以不会因为某个链接失效而构建失败。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
step() { echo -e "\n${GREEN}==> $*${NC}"; }
warn() { echo -e "${YELLOW}[提示] $*${NC}"; }
die()  { echo -e "${RED}[失败] $*${NC}"; exit 1; }

# ---------- 0. 识别平台 ----------
PLATFORM="${1:-}"
if [ -z "$PLATFORM" ]; then
  case "$(uname -s)" in
    Darwin) PLATFORM=mac ;;
    Linux)  PLATFORM=linux ;;
    *)      PLATFORM=win ;;
  esac
fi
step "目标平台：$PLATFORM"

# ---------- 1. 环境检查 ----------
step "检查 Node.js"
command -v node >/dev/null 2>&1 || die "没有找到 node，请先安装 Node.js 22：https://nodejs.org/"
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js 版本过低（当前 $(node -v)），请升级到 22"
fi
echo "node $(node -v) / npm $(npm -v)"

# ---------- 2. 依赖 ----------
# 依赖已装过就跳过：双击测试时不必每次都重装（npm ci 会删掉 node_modules 重来，很慢）
step "检查依赖"

if [ -d node_modules ] && [ -d server/node_modules ]; then
  echo "  依赖已就绪，跳过安装"
  echo "  （如果之后有新增依赖，删掉 node_modules 和 server/node_modules 再重新运行即可）"
else
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    warn "没有 package-lock.json，使用 npm install（依赖版本可能漂移）"
    npm install --no-audit --no-fund
  fi

  if [ -f server/package-lock.json ]; then
    npm --prefix server ci --no-audit --no-fund
  else
    warn "没有 server/package-lock.json，使用 npm install"
    npm --prefix server install --no-audit --no-fund
  fi
fi

# ---------- 3. 完整性自检 ----------
step "检查仓库文件是否齐全"
python3 scripts/verify_repo.py || die "仓库文件不齐全，按上面的提示补齐后重试"

# ---------- 4. 编译服务端 ----------
step "编译服务端（TypeScript → JavaScript）"
npm --prefix server run build

# ---------- 5. 打包 ----------
step "打包应用"
VERSION=$(node -p "require('./package.json').version")
ARCH=$(node -p "process.arch")
rm -rf release

case "$PLATFORM" in
  mac)
    # 1) 先出 .app（不签名）
    CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir \
      --config build/electron-builder.yml --publish never

    APP_PATH=$(ls -d release/mac*/全职高手考研系统.app 2>/dev/null | head -1)
    [ -n "$APP_PATH" ] || die "没有找到打包出来的 .app"

    # 2) ad-hoc 签名：不做这一步，新版 macOS 会把应用判为 malware 且无法绕过
    step "ad-hoc 签名"
    codesign --force --deep --sign - "$APP_PATH"
    codesign --verify --deep --strict --verbose=2 "$APP_PATH" || warn "签名校验有警告，通常不影响使用"

    # 3) 封装成 dmg（拖拽安装布局）
    step "制作 dmg"
    DMG="release/quanzhi-kaoyan-${VERSION}-mac-${ARCH}.dmg"
    rm -rf release/dmg-staging
    mkdir -p release/dmg-staging
    cp -R "$APP_PATH" release/dmg-staging/
    ln -s /Applications release/dmg-staging/Applications
    hdiutil create -volname "全职高手考研系统" -srcfolder release/dmg-staging \
      -ov -format UDZO "$DMG"
    ;;
  win)
    npx electron-builder --win --config build/electron-builder.yml --publish never
    ;;
  linux)
    npx electron-builder --linux --config build/electron-builder.yml --publish never
    ;;
  *)
    die "不认识的平台：$PLATFORM（可选 mac / win / linux）"
    ;;
esac

# ---------- 6. 结果 ----------
step "构建完成"
ls -lh release/*.dmg release/*.exe release/*.AppImage release/*.deb 2>/dev/null || ls -lh release/

cat <<'EOF'

安装包在 release/ 目录里。

接下来如果要发布新版本：
  1. 先改 package.json 里的 version（比如 1.0.1）
  2. git add -A && git commit -m "release: v1.0.1"
  3. git tag v1.0.1 && git push && git push --tags

推送 tag 后，GitHub Actions 会自动构建 macOS 和 Windows 两个安装包，
并创建 Release 页面。详细说明见 docs/发布新版本.md
EOF
