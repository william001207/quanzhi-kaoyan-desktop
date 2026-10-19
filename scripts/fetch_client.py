#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全职高手考研系统 · 前端构建产物拉取脚本
client/ 前端为线上应用构建产物（版本 hash 固定，CDN 静态分发），按开源惯例不入 git。
CI 打包前运行本脚本，从 CDN 拉取全部 assets 分块到 client/assets/（index.html 已在仓库）。

用法：
  CLIENT_OUT=<client目录> python3 scripts/fetch_client.py
  不设置 CLIENT_OUT 时输出到 <脚本目录>/../client
"""
import os, urllib.request, concurrent.futures, sys

CDN_ROOT = os.environ.get(
    "CLIENT_CDN_ROOT",
    "https://lf-miaoda-static.feishucdn.com/app_17g1b8sj7x4/39a9def6c224c1df3d9b44ff3ae34d329e26d177/client",
)
OUT = os.environ.get(
    "CLIENT_OUT",
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "client")),
)

FILES = [
    "assets/alert-dialog-CtXMGheo.js",
    "assets/arrow-left-BWfKMGKO.js",
    "assets/arrow-right-B2q2Wsmg.js",
    "assets/book-open-B0l4Rriv.js",
    "assets/button-D89ee02W.js",
    "assets/calendar-days-YeLulfD1.js",
    "assets/chart-DX9k0I6B.js",
    "assets/chevron-down-D4yPIBDK.js",
    "assets/chevron-up-Z7PdsS_t.js",
    "assets/clock-I3PUphmF.js",
    "assets/DashboardPage-Dk1QWhLG.js",
    "assets/flag-s9dJlGAf.js",
    "assets/ImportPage-qFkm4Wo_.js",
    "assets/index-DBjcn8eH.js",
    "assets/index-DwO3XZxs.css",
    "assets/input-Cl9PUNGj.js",
    "assets/KnowledgePointDetailPage-BXgm0hKb.js",
    "assets/KnowledgePointsPage-ZdxbVDI8.js",
    "assets/label-CTbWvtaq.js",
    "assets/lib-DOarzm2y.js",
    "assets/MockExamHistoryPage-BZ--LxcE.js",
    "assets/MockExamIndexPage-BQy6qOv6.js",
    "assets/MockExamPage-TjAhpNXB.js",
    "assets/PaperPrintPage-CKqv-Dxx.js",
    "assets/polyfills.js",
    "assets/popover-DIEVy4UG.js",
    "assets/printer-DsvF9en1.js",
    "assets/QuestionAnswerDialog-CNAP-YL0.js",
    "assets/QuestionsPage-BcDvglLA.js",
    "assets/question-tags-C14BtJzD.js",
    "assets/radix-BFu8ltLO.js",
    "assets/ReviewQueuePage-DXBgHou0.js",
    "assets/rolldown-runtime-hePW80VL.js",
    "assets/SettingsPage-DP-xrx_s.js",
    "assets/star-CPSHfWL7.js",
    "assets/SyllabusPage-CrvVkQDZ.js",
    "assets/table-B1PMf-Di.js",
    "assets/trash-2-CFzNHHtJ.js",
    "assets/trending-up-DIg9CP1J.js",
    "assets/triangle-alert-DolRFx4y.js",
    "assets/use-stats-refresh-BItaSlHh.js",
    "assets/WrongQuestionsPage-DcNiI35V.js",
    "assets/x-q2bxRAHg.js",
]


def download_one(rel):
    url = CDN_ROOT + "/" + rel
    dest = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  skip {rel} (exists)")
        return True
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                data = r.read()
            with open(dest, "wb") as f:
                f.write(data)
            print(f"  ok {rel} ({len(data)//1024} KB)")
            return True
        except Exception as e:
            if attempt < 2:
                print(f"  retry {rel}: {e}")
            else:
                print(f"  FAIL {rel}: {e}")
                return False
    return False


def main():
    print(f"== 拉取 client 构建产物到 {OUT} ==")
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for rel, ok in zip(FILES, ex.map(download_one, FILES)):
            results.append((rel, ok))
    failed = [r for r in results if not r[1]]
    if failed:
        print("FAILED:", failed)
        sys.exit(1)
    print(f"DONE: {len(results)} files OK")


if __name__ == "__main__":
    main()
