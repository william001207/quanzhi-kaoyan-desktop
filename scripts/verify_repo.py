#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建前完整性自检。

目的：把「构建到最后一步才发现缺文件」提前到最开始，并明确告诉你缺什么。
任何一项不通过都会以非 0 退出，CI 会立刻停下并显示原因。

用法：python3 scripts/verify_repo.py
"""
import os
import sys
import glob

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
failures = []
warnings = []


def path(*parts):
    return os.path.join(ROOT, *parts)


def need_file(rel, min_bytes=1):
    p = path(rel)
    if not os.path.exists(p):
        failures.append(f"缺少文件：{rel}")
    elif os.path.getsize(p) < min_bytes:
        failures.append(f"文件内容异常（{os.path.getsize(p)} 字节）：{rel}")
    else:
        return True
    return False


# 1. 后端源码
ts_files = glob.glob(path("server", "**", "*.ts"), recursive=True)
ts_files = [f for f in ts_files if "node_modules" not in f and os.sep + "dist" + os.sep not in f]
if len(ts_files) < 60:
    failures.append(f"后端源码不完整：只找到 {len(ts_files)} 个 .ts 文件（应为 60 个以上）")

for f in ("server/main.ts", "server/app.module.ts", "server/database/local-db.ts",
          "server/database/schema.ts", "server/platform/index.ts", "server/shared/api.interface.ts"):
    need_file(f)

# 2. 题库数据（首次安装导入用，缺了应用装上也打不开）
DATA = [
    ("subjects.json", 500),
    ("chapter_trees.json", 50_000),
    ("knowledge_points.json", 200_000),
    ("knowledge_point_details.json", 1_000_000),
    ("exam_questions.json", 100_000),
    ("exam_question_details.json", 1_000_000),
    ("settings.json", 200),
]
for name, minimum in DATA:
    need_file(os.path.join("server", "data-export", name), minimum)

# 3. 前端构建产物
need_file(os.path.join("client", "index.html"), 1000)
need_file(os.path.join("client", "loading.html"), 500)
assets = glob.glob(path("client", "assets", "*"))
if len(assets) < 40:
    failures.append(f"前端资源不完整：client/assets 只有 {len(assets)} 个文件（应为 40 个以上）")

# 4. 图标
need_file(os.path.join("build", "icon.png"), 1000)
need_file(os.path.join("client", "icon.png"), 200)

# 5. 构建配置
need_file("package.json")
need_file("server/package.json")
need_file("build/electron-builder.yml")

# 6. 建议项（不阻断构建）
for lock in ("package-lock.json", os.path.join("server", "package-lock.json")):
    if not os.path.exists(path(lock)):
        warnings.append(f"建议提交 {lock}（锁定依赖版本，避免以后构建时装到不同版本）")

print("=" * 56)
print("构建前完整性自检")
print("=" * 56)
print(f"后端源码：{len(ts_files)} 个 .ts 文件")
print(f"前端资源：{len(assets)} 个文件")
total = 0
for name, _ in DATA:
    p = path("server", "data-export", name)
    if os.path.exists(p):
        total += os.path.getsize(p)
print(f"题库数据：{total / 1024 / 1024:.1f} MB")
print("-" * 56)

for w in warnings:
    print(f"[提示] {w}")

if failures:
    print("")
    for f in failures:
        print(f"[失败] {f}")
    print("")
    print(f"自检未通过（{len(failures)} 项缺失），已中止构建。")
    print("处理办法：确认上面列出的文件都已提交到仓库；")
    print("         若是题库数据缺失，可从已安装的旧版本里取：")
    print("         应用包 → Contents/Resources/server/data-export/")
    sys.exit(1)

print("自检通过，可以开始构建。")
