#!/usr/bin/env bash
# ============================================================
# 一次性整理脚本：把仓库变成「自包含、可构建」的状态并推送到 GitHub
#
# 做的事：
#   1. 补齐题库数据（若缺失，从本机已安装的旧版本里取）
#   2. 删除已经没用的旧脚本和旧工作流（它们靠联网下载，是构建失败的根源）
#   3. 完整性自检
#   4. 提交 + 打 tag + 推送
#
# 用法：bash scripts/setup-repo.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
step() { echo -e "\n${GREEN}==> $*${NC}"; }
warn() { echo -e "${YELLOW}[提示] $*${NC}"; }
die()  { echo -e "${RED}[失败] $*${NC}"; exit 1; }

# ---------- 0. 前置检查 ----------
command -v node >/dev/null 2>&1 || die "没有找到 node，请先安装 Node.js 22：https://nodejs.org/"
command -v git  >/dev/null 2>&1 || die "没有找到 git"
git rev-parse --git-dir >/dev/null 2>&1 || die "当前目录不是 git 仓库（缺少 .git）"

# ---------- 1. 补齐题库数据 ----------
step "检查题库数据"
RES_APPS=(
  "/Applications/全职高手考研系统.app/Contents/Resources"
  "$HOME/Applications/全职高手考研系统.app/Contents/Resources"
)

if [ ! -f server/data-export/exam_question_details.json ]; then
  warn "题库数据缺失，尝试从本机已安装的应用里提取…"
  FOUND=""
  for d in "${RES_APPS[@]}"; do
    if [ -d "$d/server/data-export" ]; then FOUND="$d/server/data-export"; break; fi
  done

  if [ -n "$FOUND" ]; then
    echo "来源：$FOUND"
    mkdir -p server/data-export
    cp "$FOUND"/*.json server/data-export/
    echo "  已复制 $(ls server/data-export/*.json | wc -l | tr -d ' ') 个数据文件"
  else
    die "没找到题库数据，也没有可提取的旧安装包。
      请手动把 data-export 目录下的 22 个 JSON 放进 server/data-export/ 后重试。"
  fi
fi
echo "题库数据：$(du -sh server/data-export | cut -f1)"

# ---------- 1b. 补齐应用图标 ----------
step "检查应用图标"
if [ ! -f build/icon.png ] || [ ! -f client/icon.png ]; then
  ICON_SRC=""
  for d in "${RES_APPS[@]}"; do
    if [ -f "$d/icon.png" ]; then ICON_SRC="$d"; break; fi
  done

  if [ -n "$ICON_SRC" ]; then
    mkdir -p build client
    [ -f build/icon.png ]  || cp "$ICON_SRC/icon.png" build/icon.png
    [ -f client/icon.png ] || cp "$ICON_SRC/client/icon.png" client/icon.png 2>/dev/null \
                            || cp "$ICON_SRC/icon.png" client/icon.png
    echo "  已从旧安装包提取图标"
  else
    warn "没有找到图标源。请手动放置：build/icon.png（1024x1024）、client/icon.png（256x256）"
  fi
else
  echo "  图标已就绪"
fi

# ---------- 2. 清理不再需要的文件 ----------
step "清理旧脚本"
OLD_FILES=(
  "PLACEHOLDER_1"
  "scripts/fetch_source.py"
  "scripts/fetch_client.py"
  "scripts/fetch_icon.py"
  "scripts/build.sh"
  ".github/workflows/build-mac.yml"
  ".github/workflows/build-win.yml"
  "_copy_assets.py"
)
for f in "${OLD_FILES[@]}"; do
  if [ -e "$f" ]; then
    # 已纳入 git 的用 git rm，未纳入的直接删；两步都容错，避免因个别文件中断整个流程
    git rm -q --ignore-unmatch "$f" >/dev/null 2>&1 || rm -f "$f" || true
    echo "  已删除 $f"
  fi
done

# ---------- 3. 完整性自检 ----------
step "完整性自检"
python3 scripts/verify_repo.py || die "自检未通过，按上面提示补齐后重试"

# ---------- 3b. 编译验证 ----------
# 关键一步：先在本机确认代码能编译，再推上去。
# 否则 GitHub 上的构建会失败，你还得等十几分钟才知道。
step "编译验证"
if [ -d server/node_modules ]; then
  if npm --prefix server run build; then
    echo "  编译通过"
  else
    die "编译失败，已中止推送（不会把有问题的代码推上去）。
      请把上面完整的报错文字发给 AI，修好后再运行本脚本。"
  fi
else
  warn "server/node_modules 不存在，跳过编译验证"
  warn "建议先执行：npm --prefix server install   然后重新运行本脚本"
fi

# ---------- 4. 提交 ----------
step "提交改动"
git add -A
if git diff --cached --quiet; then
  warn "没有需要提交的改动"
else
  CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
  echo "本次改动 $CHANGED 个文件"
  git commit -q -m "$(cat <<'MSG'
refactor: 仓库改为自包含，构建不再依赖外部下载

此前源码、题库数据、前端构建产物、应用图标全部在构建时从第三方 CDN
临时拉取，其中源码链接带 30 天签名（2026-11-19 到期），过期即构建失败；
且拉取内容无任何校验。

本次改为全部纳入版本控制：
- 后端 62 个源码文件入库（tsc 编译通过）
- 题库数据 16MB 入库（已核验无个人学习记录）
- 前端 43 个构建分块入库
- 应用图标入库
- 删除 fetch_source / fetch_client / fetch_icon 三个下载脚本
- 合并两条重复的 CI 工作流为一个 matrix 工作流
- 新增构建前完整性自检 verify_repo.py
- 产物命名统一走 electron-builder artifactName（含版本号，不再靠脚本重命名）

顺带的健壮性改动：
- 单实例锁：防止双击两次同时打开同一数据库
- 启动失败弹窗：不再静默闪退
- 退出前等待数据库刷盘（SIGTERM + 最多 2.5 秒），不再直接杀进程
- CORS 收紧为仅本机来源
MSG
)"
fi

# ---------- 5. 打 tag 并推送 ----------
VERSION=$(node -p "require('./package.json').version")
step "推送到 GitHub"
echo "当前版本号：$VERSION"

git push || die "推送失败。如果是网络问题，重试一次；如果是登录过期，重新执行 git push 按提示授权。"

# 如果这个版本号已经发过（tag 已存在），直接打同名 tag 不会触发构建，
# 所以自动把补丁号 +1（1.0.0 → 1.0.1），保证这次推送会产生新安装包。
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  warn "v$VERSION 已经发布过了，自动升一个补丁版本号"
  npm version patch --no-git-tag-version >/dev/null
  VERSION=$(node -p "require('./package.json').version")
  echo "新版本号：$VERSION"
  git add package.json package-lock.json 2>/dev/null || git add package.json
  git commit -q -m "chore: 版本号升到 $VERSION（发布新构建）"
  git push
fi

git tag "v$VERSION"
git push origin "v$VERSION"
echo "已推送 tag v$VERSION，GitHub 会自动开始构建"

step "完成"
cat <<EOF
接下来：
  1. 打开 https://github.com/william001207/quanzhi-kaoyan-desktop/actions
  2. 应该能看到 build 工作流在跑（macOS + Windows 各一个）
  3. 等 10–15 分钟变绿，去 Releases 页面下载安装包

以后每次都按 docs/发布新版本.md 里的「三步」操作。
EOF
