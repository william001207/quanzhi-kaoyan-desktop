#!/bin/bash
# 双击这个文件即可构建 macOS 安装包。
# 如果双击没反应：右键 → 打开方式 → 终端；或在终端执行 chmod +x 一键构建安装包.command
cd "$(dirname "$0")" || exit 1

clear
echo "================================================"
echo "  全职高手考研系统 · 构建 macOS 安装包"
echo "================================================"
echo ""
echo "全程大约 2-5 分钟。中途不要关闭这个窗口。"
echo ""

bash scripts/build-desktop.sh mac
RESULT=$?

echo ""
echo "================================================"
if [ $RESULT -eq 0 ]; then
  echo "  构建成功"
  echo "  安装包在 release/ 文件夹里"
  echo "  在访达里打开："
  echo ""
  open release 2>/dev/null
else
  echo "  构建失败（错误码 $RESULT）"
  echo ""
  echo "  请把上面红色的报错内容，整段复制发给 AI。"
fi
echo "================================================"
echo ""
read -n 1 -s -r -p "按任意键关闭窗口"
echo ""
