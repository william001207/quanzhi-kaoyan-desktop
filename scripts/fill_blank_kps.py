#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
方案 A：用挂靠真题的标准答案，填充「空白知识点」的正文与卡片。

背景
----
仓库里有一批知识点只有标题、正文为空（content / summary / cardData 全空），
但每题都被真题挂靠。与其人工写教材正文（有创作风险），不如把**该考点所挂靠
真题的标准答案原文**收录进来作为复习正文，零创作、零杜撰。

用法
----
    python3 scripts/fill_blank_kps.py            # 预演，只打印报告，不写文件
    python3 scripts/fill_blank_kps.py --write    # 真正写回 data-export

写回后会同时更新知识点索引 knowledge_points.json 的同名字段（保持一致）。
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

WRITE = "--write" in sys.argv

# 题目卡片里这一块只是答题提示，收录价值低，跳过
SKIP_BLOCK_TITLES = {"答题思路", "解题思路"}


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def probe_style(path):
    """探测文件原本的落盘风格：本仓库的数据文件都是单行紧凑 JSON、末尾无换行，
    改写时必须保持原样，否则 4MB 的文件会膨胀 20% 以上、diff 也会变成全量。"""
    with open(path, "rb") as f:
        head = f.read(4096)
    pretty = b"\n" in head[:2000]
    return pretty


def save(name, obj):
    path = os.path.join(DATA, name)
    pretty = probe_style(path)
    with open(path, "w", encoding="utf-8") as f:
        if pretty:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")
        else:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def is_blank(d):
    """正文、摘要、卡片三处都为空才算空白知识点。"""
    c = (d.get("content") or "").strip()
    s = (d.get("summary") or "").strip()
    cd = d.get("cardData") or {}
    s2 = (cd.get("summary") or "").strip()
    b = cd.get("blocks") or []
    return not c and not s and not s2 and not b


def question_label(q):
    """真题出处标签，例如「2026 深圳大学」"""
    parts = []
    if q.get("year"):
        parts.append(str(q["year"]))
    if (q.get("source") or "").strip():
        parts.append(q["source"].strip())
    return " ".join(parts) if parts else "真题"


def render_blocks_answer(q):
    """把真题卡片的得分点渲染成 markdown（保留原有加粗与换行）。"""
    blocks = (q.get("cardData") or {}).get("blocks") or []
    out = []
    for b in blocks:
        t = (b.get("title") or "").strip()
        c = (b.get("content") or "").strip()
        if not c:
            continue
        if t and t not in SKIP_BLOCK_TITLES:
            out.append("**%s**\n%s" % (t, c))
        elif t in SKIP_BLOCK_TITLES:
            continue
        else:
            out.append(c)
    return "\n\n".join(out)


def main():
    kp = load("knowledge_point_details.json")
    kp_idx = load("knowledge_points.json")
    qs = load("exam_question_details.json")

    # 反查：知识点 id -> 挂靠它的真题（去重，按相关度降序、年份升序）
    refs = {}
    for qid, q in qs.items():
        for r in (q.get("knowledgePoints") or []):
            kid = r.get("id")
            if kid:
                refs.setdefault(kid, []).append((qid, q))

    blanks = [k for k, d in kp.items() if is_blank(d)]
    blanks.sort(key=lambda k: kp[k]["title"])

    filled = []
    skipped = []

    for kid in blanks:
        pairs = refs.get(kid) or []
        # 同一道题可能被同一知识点重复引用
        seen = set()
        uniq = []
        for qid, q in pairs:
            if qid in seen:
                continue
            seen.add(qid)
            uniq.append((qid, q))
        if not uniq:
            skipped.append((kid, kp[kid]["title"], "无挂靠真题"))
            continue

        uniq.sort(key=lambda t: (-(t[1].get("difficulty") or 0), t[1].get("year") or 0))

        # ---- 正文：逐题「出处 + 题干 + 参考答案」 ----
        lines = []
        for qid, q in uniq:
            head = "【%s】%s" % (question_label(q), (q.get("questionText") or "").strip())
            ans = (q.get("answer") or "").strip()
            if not ans:
                ans = render_blocks_answer(q)
            lines.append(head + "\n" + ans)
        content = "\n\n".join(lines)

        # ---- 摘要：明示「正文=真题答案原文」，避免被误当成教材原文 ----
        labels = [question_label(q) for _, q in uniq]
        n = len(uniq)
        if n == 1:
            summary = "本考点正文取自 %s 真题的参考答案原文（未改写），建议对照原题背诵。" % labels[0]
        else:
            summary = "本考点正文取自 %d 道真题（%s）的参考答案原文（未改写），建议对照原题背诵。" % (
                n, "、".join(labels))

        # ---- 卡片：一题一块，块内沿用真题原有的得分点结构 ----
        blocks = []
        for qid, q in uniq:
            body = render_blocks_answer(q)
            if not body:
                body = (q.get("answer") or "").strip()
            if not body:
                continue
            blocks.append({
                "title": "%s真题精析" % question_label(q),
                "content": "**%s**\n\n%s" % ((q.get("questionText") or "").strip(), body),
                "subtitleEn": "Exam Answer",
            })
        if not blocks:
            skipped.append((kid, kp[kid]["title"], "挂靠题无答案"))
            continue

        flow_steps = ["真题出处", "标准答案", "得分要点", "易错提醒"]

        card = {
            "blocks": blocks,
            "summary": summary,
            "flowSteps": flow_steps,
        }

        filled.append({
            "id": kid,
            "title": kp[kid]["title"],
            "questions": labels,
            "content_len": len(content),
            "blocks": len(blocks),
            "_preview_summary": summary,
            "_preview_content": content[:500],
            "_preview_blocks": [(b["title"], len(b["content"])) for b in blocks],
        })

        if WRITE:
            kp[kid]["content"] = content
            kp[kid]["summary"] = summary
            kp[kid]["cardData"] = card
            for row in kp_idx:
                if row.get("id") == kid:
                    row["content"] = content
                    row["summary"] = summary
                    row["cardData"] = card
                    break

    print("=" * 60)
    print("空白知识点填充报告")
    print("=" * 60)
    print("知识点总数：%d" % len(kp))
    print("空白知识点：%d" % len(blanks))
    print("本次可填充：%d" % len(filled))
    print("跳过（无可用答案）：%d" % len(skipped))
    print("-" * 60)

    for t in skipped:
        print("[跳过] %s %s —— %s" % (t[0][:8], t[1], t[2]))

    lens = [f["content_len"] for f in filled]
    if lens:
        print("正文字数：最短 %d，最长 %d，平均 %d" % (min(lens), max(lens), sum(lens) // len(lens)))
        print("卡片块数：1 块 %d 个，2 块 %d 个，3 块及以上 %d 个" % (
            sum(1 for f in filled if f["blocks"] == 1),
            sum(1 for f in filled if f["blocks"] == 2),
            sum(1 for f in filled if f["blocks"] >= 3),
        ))

    print("-" * 60)
    preview = filled[-3:] if WRITE else filled[:3]
    print("示例预览（%s 3 个）：" % ("最后" if WRITE else "前"))
    for f in preview:
        print("\n### %s  (%s)" % (f["title"], "、".join(f["questions"])))
        if WRITE:
            print(kp[f["id"]]["summary"])
            print("--- content 前 500 字 ---")
            print(kp[f["id"]]["content"][:500])
            print("--- card blocks ---")
            for b in kp[f["id"]]["cardData"]["blocks"]:
                print("  * %s (%d 字)" % (b["title"], len(b["content"])))
        else:
            print(f["_preview_summary"])
            print("--- content 前 500 字 ---")
            print(f["_preview_content"])
            print("--- card blocks ---")
            for t, n in f["_preview_blocks"]:
                print("  * %s (%d 字)" % (t, n))

    if WRITE:
        save("knowledge_point_details.json", kp)
        save("knowledge_points.json", kp_idx)
        print("\n已写回：knowledge_point_details.json / knowledge_points.json")
        rest = [k for k, d in kp.items() if is_blank(d)]
        print("剩余空白知识点：%d" % len(rest))
    else:
        print("\n（预演模式，未修改任何文件；加 --write 才会写回）")


if __name__ == "__main__":
    main()
