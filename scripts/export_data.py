#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全职高手考研系统 · 全量数据导出脚本
通过应用公开 API（匿名 + CSRF 双提交）导出全部业务数据到 data-export/ 目录。

用途：
1) 本地：生成 server/data-export/ 全量 JSON（桌面版首次启动自动导入）
2) CI：macOS/Windows 打包前在 runner 上运行，产出与线上一致的全量数据
   （数据文件体积大且随时间更新，按开源惯例不入 git 仓库，由本脚本实时导出）

用法：
  EXPORT_OUT=<输出目录> python3 scripts/export_data.py
  不设置 EXPORT_OUT 时输出到 <脚本目录>/../server/data-export
"""
import json, os, time, urllib.request, urllib.error, concurrent.futures, sys

BASE = os.environ.get("EXPORT_BASE", "https://4m95ysesq0ayu.doubaoapps.com/app/app_17g1b8sj7x4/api")
TOKEN = os.environ.get("EXPORT_TOKEN", "desktop-export-20261020")
OUT = os.environ.get(
    "EXPORT_OUT",
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", "data-export")),
)
os.makedirs(OUT, exist_ok=True)

HEADERS = {
    "Cookie": f"suda-csrf-token={TOKEN}",
    "X-Suda-Csrf-Token": TOKEN,
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) desktop-export",
}


def fetch(path, timeout=60):
    url = BASE + path
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(2 + attempt * 2)
                continue
            raise
        except Exception as e:
            if attempt < 2:
                time.sleep(2 + attempt * 2)
                continue
            raise
    return None


def save(name, data):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"  saved {name} ({len(json.dumps(data))//1024} KB)")


def fetch_paginated(path_prefix, page_size=100, key="items"):
    """循环分页拉取全部条目。"""
    items, page, total = [], 1, None
    while True:
        d = fetch(f"{path_prefix}?page={page}&pageSize={page_size}")
        if d is None:
            break
        if total is None:
            total = d.get("total", 0)
            print(f"  total={total}")
        items.extend(d.get(key, []))
        if not d.get(key) or len(items) >= (total or 0) or page > 200:
            break
        page += 1
    return items


def main():
    print(f"== 导出到 {OUT} ==")
    print("== 1. subjects ==")
    save("subjects.json", fetch("/subjects"))

    print("== 2. chapters tree (per subject x source) ==")
    subjects = json.load(open(os.path.join(OUT, "subjects.json")))
    trees = {}
    for s in subjects:
        for src in ("exam_syllabus", "textbook"):
            try:
                trees[f"{s['id']}:{src}"] = fetch(f"/chapters/tree?subjectId={s['id']}&source={src}")
            except Exception as e:
                print(f"  ! tree {s['id']} {src}: {e}")
    save("chapter_trees.json", trees)

    print("== 3. knowledge-points (paginated) ==")
    kps = fetch_paginated("/knowledge-points", 100)
    save("knowledge_points.json", kps)
    print(f"  got {len(kps)} kps")

    print("== 4. exam-questions (paginated) ==")
    eqs = fetch_paginated("/exam-questions", 100)
    save("exam_questions.json", eqs)
    print(f"  got {len(eqs)} questions")

    print("== 5. settings ==")
    save("settings.json", fetch("/settings"))

    print("== 6. daily-plan/today ==")
    try:
        save("daily_plan_today.json", fetch("/daily-plan/today"))
    except Exception as e:
        print(f"  ! {e}")

    print("== 7. mock-exam templates / papers / records ==")
    for name, path in [
        ("mock_templates.json", "/mock-exam/templates"),
        ("mock_papers.json", "/mock-exam/papers"),
        ("mock_records.json", "/mock-exam/records"),
    ]:
        try:
            save(name, fetch(path, timeout=120))
        except Exception as e:
            print(f"  ! {name}: {e}")

    print("== 8. review/wrong (expected empty) ==")
    for name, path in [
        ("review_queue.json", "/review/queue"),
        ("wrong_questions.json", "/wrong-questions"),
        ("wrong_stats.json", "/wrong-questions/stats"),
        ("weak_kps.json", "/wrong-questions/weak-knowledge-points"),
    ]:
        try:
            save(name, fetch(path))
        except Exception as e:
            print(f"  ! {name}: {e}")

    print("== 9. stats (reference) ==")
    for name, path in [
        ("stats_overview.json", "/stats/overview"),
        ("stats_by_subject.json", "/stats/by-subject"),
        ("stats_mastery.json", "/stats/mastery-distribution"),
        ("stats_high_freq.json", "/stats/high-freq"),
        ("stats_freq_mastery.json", "/stats/freq-mastery"),
        ("stats_review_load.json", "/stats/review-load"),
    ]:
        try:
            save(name, fetch(path))
        except Exception as e:
            print(f"  ! {name}: {e}")

    print("== 10. question details (parallel, for QKP associations) ==")
    qids = [q["id"] for q in eqs]
    details = {}

    def fetch_q(qid):
        try:
            return qid, fetch(f"/exam-questions/{qid}")
        except Exception as e:
            return qid, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as ex:
        for i, (qid, d) in enumerate(ex.map(fetch_q, qids)):
            if d:
                details[qid] = d
            if (i + 1) % 200 == 0:
                print(f"  {i+1}/{len(qids)}")
    save("exam_question_details.json", details)
    print(f"  got {len(details)} details")

    print("== 11. kp details (parallel, for syllabus_item + chapter associations) ==")
    kpids = [k["id"] for k in kps]
    kp_details = {}

    def fetch_kp(kid):
        try:
            return kid, fetch(f"/knowledge-points/{kid}")
        except Exception as e:
            return kid, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as ex:
        for i, (kid, d) in enumerate(ex.map(fetch_kp, kpids)):
            if d:
                kp_details[kid] = d
            if (i + 1) % 200 == 0:
                print(f"  {i+1}/{len(kpids)}")
    save("knowledge_point_details.json", kp_details)
    print(f"  got {len(kp_details)} details")

    print("\nDONE")


if __name__ == "__main__":
    main()
