#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建前完整性自检。

目的：把「构建到最后一步才发现缺文件」提前到最开始，并明确告诉你缺什么。
任何一项不通过都会以非 0 退出，CI 会立刻停下并显示原因。

用法：python3 scripts/verify_repo.py
"""
import os
import re
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

# 2.1 索引层必须与详情层同步
# 坑：data-export 里每种内容都有「详情层」（应用启动时真正导入的那份）和「索引层」（精简投影）。
# 手改详情层加题/改章节后，索引层不会自动跟着变，条数就会落后，看起来像「仓库里是旧数据」。
# 这里做强制校验，落后就中止构建，并提示用 scripts/sync_index.py 对齐。
import json


def _load_json(rel):
    with open(path("server", "data-export", rel), encoding="utf-8") as f:
        return json.load(f)


def check_index(label, index_name, details_name):
    try:
        idx = _load_json(index_name)
        det = _load_json(details_name)
    except Exception as exc:
        failures.append(f"{label}索引读取失败：{index_name} / {details_name}（{exc}）")
        return
    idx_list = idx if isinstance(idx, list) else list(idx.values())
    det_map = det if isinstance(det, dict) else {e.get("id"): e for e in det}
    idx_ids = {e.get("id") for e in idx_list}
    det_ids = set(det_map)
    if idx_ids != det_ids:
        failures.append(
            f"{label}索引与详情不一致：索引 {len(idx_ids)} 条 / 详情 {len(det_ids)} 条"
            f"（详情有索引无 {len(det_ids - idx_ids)} 条，索引有详情无 {len(idx_ids - det_ids)} 条）"
            f"，请运行 python3 scripts/sync_index.py 对齐"
        )
        return
    # 条数一致后再抽查标题/挂载章节，防止「删了又加、总数没变」的情况漏过去
    drift = 0
    for e in idx_list:
        d = det_map.get(e.get("id")) or {}
        if e.get("title") != d.get("title"):
            drift += 1
        elif "chapterId" in e and e.get("chapterId") != d.get("chapterId"):
            drift += 1
    if drift:
        failures.append(f"{label}索引有 {drift} 条标题或章节与详情不符，请运行 python3 scripts/sync_index.py 对齐")


check_index("知识点", "knowledge_points.json", "knowledge_point_details.json")
check_index("题目", "exam_questions.json", "exam_question_details.json")

# 3. 前端构建产物
need_file(os.path.join("client", "index.html"), 1000)
need_file(os.path.join("client", "loading.html"), 500)
assets = glob.glob(path("client", "assets", "*"))
# 产物数量会随构建变化（合并/拆分会增减 chunk），不能写死个数；
# 真正的完整性标准是：index.html 引用的每个资源都真实存在。
html = open(os.path.join("client", "index.html"), encoding="utf-8").read()
refs = sorted(set(re.findall(r"assets/[A-Za-z0-9._+-]+\.(?:js|css|png|svg|ico|woff2?)", html)))
missing = [r for r in refs if not os.path.exists(path("client", r))]
if missing:
    failures.append("前端资源不完整：index.html 引用了不存在的文件 -> " + ", ".join(missing))
if len(assets) < 20:
    failures.append(f"前端资源过少：client/assets 只有 {len(assets)} 个文件，疑似构建产物没同步进去")

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
