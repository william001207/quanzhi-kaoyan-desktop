#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「索引层」对齐到「详情层」。

背景：
  server/data-export/ 里每种内容都有两个文件——
    详情层 xxx_details.json：真正的题库内容（题干、答案、卡片、章节路径），应用启动时只读这个
    索引层 xxx.json       ：同一批条目的精简投影 + 学习统计字段（掌握度、复习次数……）
  索引层原本由 scripts/export_data.py 从运行中的数据库整体导出，一旦我们直接手改详情层
  （加题、补答案、改章节），索引层不会跟着变，于是条数、标题、备注就对不上，看起来像「旧数据」。

这个脚本做的是「对齐」，不是「导出」：
  · 条目的增删以详情层为准（详情有索引无 → 补一条；索引有详情无 → 删掉）
  · 内容字段（标题、科目、章节、难度、备注、章节路径……）一律以详情层为准
  · 学习统计字段（掌握度、复习状态、答题次数……）保持索引层原值，没有就填默认值
  · 不读数据库、不联网，可随时重复执行（幂等）

用法：
    python3 scripts/sync_index.py           # 对齐
    python3 scripts/sync_index.py --check   # 只检查不写盘，有差异时退出码 1
"""
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(ROOT, "server", "data-export")

# 知识点索引：学习统计字段的默认值（与平台导出的空库快照一致）
KP_DEFAULTS = {
    "masteryScore": 0,
    "recallMastery": 0,
    "questionMastery": 0,
    "answeredQuestionCount": 0,
    "status": "not_started",
    "firstLearnedAt": None,
    "lastReviewedAt": None,
    "nextReviewAt": None,
    "reviewStage": 0,
    "consecutiveCorrect": 0,
    "consecutiveWrong": 0,
    "totalReviewCount": 0,
    "totalQuestionCount": 0,
    "correctQuestionCount": 0,
    "manuallyPinned": False,
    "isWeakMarked": False,
    "weakMarkedAt": None,
    "weakMarkReason": None,
}

# 题目索引：学习统计字段的默认值
EQ_DEFAULTS = {
    "masteryScore": 0,
    "answered": False,
    "answerCount": 0,
    "lastAnsweredAt": None,
    "examFrequency": 0,
}

# 知识点索引的字段顺序（保持与历史文件一致，避免无意义的整文件 diff）
KP_ORDER = [
    "id", "subjectId", "chapterId", "syllabusItemId", "title", "keywords",
    "requirementLevel", "importanceScore", "examFrequency",
    "masteryScore", "recallMastery", "questionMastery", "answeredQuestionCount",
    "status", "firstLearnedAt", "lastReviewedAt", "nextReviewAt", "reviewStage",
    "consecutiveCorrect", "consecutiveWrong", "totalReviewCount",
    "totalQuestionCount", "correctQuestionCount",
    "manuallyPinned", "isWeakMarked", "weakMarkedAt", "weakMarkReason",
    "summary", "content", "cardData", "latestExamYear", "examSources", "chapterPaths",
]

EQ_ORDER = [
    "id", "year", "subjectId", "questionType", "questionText", "answer",
    "answerKeywords", "source", "notes", "difficulty",
    "masteryScore", "answered", "answerCount", "lastAnsweredAt", "examFrequency",
]


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def save(name, obj):
    p = os.path.join(DATA, name)
    with open(p, "w", encoding="utf-8") as f:
        # 与仓库其余快照一致：单行紧凑、不转义中文
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(p)


def ordered(src, order, extra=None):
    """按固定字段顺序重排；order 里没有的字段原样挂在末尾（防止丢数据）。"""
    out = {}
    for k in order:
        if extra and k in extra:
            out[k] = extra[k]
        elif k in src:
            out[k] = src[k]
    for k in src:
        if k not in out:
            out[k] = src[k]
    return out


def pick(d, keys, fallback=None):
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    return fallback


def sync_knowledge_points(write=True):
    details = load("knowledge_point_details.json")
    try:
        index = load("knowledge_points.json")
    except FileNotFoundError:
        index = []
    old = {e["id"]: e for e in index}

    # 题目挂载关系 → 反推每个知识点的「考过哪些学校/年份」
    linked = {}
    for q in load("exam_question_details.json").values():
        for p in (q.get("knowledgePoints") or []):
            linked.setdefault(p["id"], []).append(q)

    kept, added, dropped = [], [], [i for i in old if i not in details]
    for kp_id, d in details.items():
        o = old.get(kp_id)
        qs = linked.get(kp_id, [])
        years = [q["year"] for q in qs if isinstance(q.get("year"), int)]
        sources = sorted({q["source"] for q in qs if q.get("source")})
        src = dict(o or {})
        src.update({
            "id": kp_id,
            "subjectId": d.get("subjectId"),
            "chapterId": d.get("chapterId"),
            "syllabusItemId": d.get("syllabusItemId"),
            "title": d.get("title"),
            "keywords": d.get("keywords") or [],
            "requirementLevel": d.get("requirementLevel") or "unmarked",
            "importanceScore": pick(d, ["importanceScore"], 50),
            "examFrequency": pick(d, ["examFrequency"], 0),
            # 索引层不重复存正文，正文只在详情层
            "summary": "",
            "content": "",
            "cardData": {"blocks": [], "summary": "", "flowSteps": []},
            "latestExamYear": src.get("latestExamYear") or (max(years) if years else None),
            "examSources": src.get("examSources") or sources,
            "chapterPaths": d.get("chapterPaths") or {},
        })
        for k, v in KP_DEFAULTS.items():
            src.setdefault(k, v)
        entry = ordered(src, KP_ORDER)
        (kept if o else added).append(entry)

    result = kept + added

    changed = (
        len(index) != len(result)
        or any(old.get(e["id"], {}).get("title") != e["title"] for e in result)
        or any(old.get(e["id"], {}).get("subjectId") != e["subjectId"] for e in result)
        or any(old.get(e["id"], {}).get("chapterId") != e["chapterId"] for e in result)
        or any((old.get(e["id"], {}).get("chapterPaths") or {}) != e["chapterPaths"] for e in result)
    )
    print(
        f"[知识点] 索引 {len(index)} 条 → 详情 {len(details)} 条"
        f"（补 {len(added)}、删残留 {len(dropped)}）"
    )
    if dropped:
        print("         删掉的残留：" + "、".join(old[i].get("title", i) for i in dropped))
    if write and changed:
        size = save("knowledge_points.json", result)
        print(f"         已写盘，{size/1024/1024:.1f} MB")
    return changed


def sync_exam_questions(write=True):
    details = load("exam_question_details.json")
    try:
        index = load("exam_questions.json")
    except FileNotFoundError:
        index = []
    old = {e["id"]: e for e in index}

    kept, added, dropped = [], [], [i for i in old if i not in details]
    fixed_notes = 0
    for q_id, d in details.items():
        o = old.get(q_id, {})
        src = dict(o)
        src.update({
            "id": q_id,
            "year": d.get("year"),
            "subjectId": d.get("subjectId"),
            "questionType": d.get("questionType"),
            "questionText": d.get("questionText"),
            # 索引层刻意不存答案正文（列表接口也不返回 answer），保持空
            "answer": o.get("answer", ""),
            "answerKeywords": o.get("answerKeywords", []),
            "source": d.get("source"),
            "notes": d.get("notes") or "",
            "difficulty": d.get("difficulty"),
        })
        for k, v in EQ_DEFAULTS.items():
            src.setdefault(k, v)
        if o and (o.get("notes") or "") != (d.get("notes") or ""):
            fixed_notes += 1
        entry = ordered(src, EQ_ORDER)
        (kept if o else added).append(entry)

    result = kept + added
    changed = len(index) != len(result) or fixed_notes > 0
    print(
        f"[题目]   索引 {len(index)} 条 → 详情 {len(details)} 条"
        f"（补 {len(added)}、删残留 {len(dropped)}、备注修正 {fixed_notes}）"
    )
    if write and changed:
        size = save("exam_questions.json", result)
        print(f"         已写盘，{size/1024/1024:.1f} MB")
    return changed


def main():
    check_only = "--check" in sys.argv
    changed_kp = sync_knowledge_points(write=not check_only)
    changed_eq = sync_exam_questions(write=not check_only)
    if not changed_kp and not changed_eq:
        print("\n索引与详情已一致，无需改动。")
        return 0
    if check_only:
        print("\n索引落后于详情（--check 模式未写盘）。运行 python3 scripts/sync_index.py 修复。")
        return 1
    print("\n已对齐。索引层不参与启动同步，改完不需要动 DATA_VERSION。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
