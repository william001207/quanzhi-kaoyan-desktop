#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全职高手考研系统 · 服务端源码还原脚本
server/ 的 62 个后端源码文件（总量 ~750KB、条目多）按开源惯例不入 git 仓库，
由本脚本从「源码导出中转页」（feishucdn 签名 URL，30 天有效）抓取并 base64 解码还原。

还原后自动做「平台别名改写」（复刻桌面版改造）：
  @server/<X>            -> <相对深度><X>
  @shared/<X>            -> <相对深度>shared/<X>
  @lark-apaas/fullstack-nestjs-core -> <相对深度>platform
（portal 平台别名在本地无对应依赖，改为相对路径指向本地兼容层/源码）

用途：
  CI（macOS/Windows 打包前）运行：还原全部源码到 server/ 顶层，再执行 tsc 编译。

用法：
  SOURCE_URL=<中转页URL> SOURCE_OUT=<工程根> python3 scripts/fetch_source.py
  不设置时使用默认 URL 与 <脚本目录>/..
"""
import os, re, base64, urllib.request, sys

# Windows runner 控制台默认 cp1252，无法编码中文输出，强制 UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

URL = os.environ.get(
    "SOURCE_URL",
    "https://dataloom-emsvuwrf.feishucdn.com/5129903202/bucket_aadkz5qdnlkdo/1879509501357097.html"
    "?sign=1795032038-e7fa724d85-b4e4eca797dd4dd181619d1d26398113-f7a3e355fd202087bd75759ecd8964c9",
)
OUT = os.environ.get(
    "SOURCE_OUT",
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")),
)


def rewrite_aliases(rel_path, content):
    """把 portal 平台别名改写为相对路径（相对深度按文件所在目录层级计算）。"""
    depth = rel_path.count("/")  # 目录层级数（不含文件名）
    prefix = "./" if depth == 0 else "../" * depth
    content = re.sub(
        r"@server/([A-Za-z0-9_./-]+)",
        lambda m: prefix + m.group(1),
        content,
    )
    content = re.sub(
        r"@shared/([A-Za-z0-9_./-]+)",
        lambda m: prefix + "shared/" + m.group(1),
        content,
    )
    content = content.replace("@lark-apaas/fullstack-nestjs-core", prefix + "platform")
    return content


# drizzle-orm 0.45.4 可空列 $inferInsert/泛型推断补丁 + cache-manager miss 判空修复
# （与桌面版逐字一致，编译/运行必需）
TYPE_PATCHES = {
    "modules/exam-questions/exam-questions.service.ts": [
        (
            "[...new Set(kpRows.map((r) => r.chapterId))]",
            "[...new Set(kpRows.map((r) => r.chapterId))] as string[]",
        ),
    ],
    "modules/knowledge-points/knowledge-points.service.ts": [
        (
            "[...new Set(items.map((kp) => kp.chapterId).filter(Boolean))]",
            "[...new Set(items.map((kp) => kp.chapterId).filter(Boolean))] as string[]",
        ),
        (
            "new Map(examChRows.map((r) => [r.id, r.title]))",
            "new Map<string, string>(examChRows.map((r) => [r.id, r.title] as [string, string]))",
        ),
        (
            "new Map(tbChRows.map((r) => [r.id, r.title]))",
            "new Map<string, string>(tbChRows.map((r) => [r.id, r.title] as [string, string]))",
        ),
    ],
    "modules/stats/stats.service.ts": [
        (
            "if (cached !== null) return cached;",
            "if (cached !== null && cached !== undefined) return cached;",
        ),
        (
            "[...new Set(kpRows.map((r) => r.chapterId))]",
            "[...new Set(kpRows.map((r) => r.chapterId))] as string[]",
        ),
    ],
    "modules/view/view.controller.ts": [
        (
            "const platformData = req.__platform_data__ ?? {};",
            "const platformData = (req as any).__platform_data__ ?? {};",
        ),
    ],
    "modules/wrong-questions/wrong-questions.controller.ts": [
        (
            "const { userId } = req.userContext;",
            "const { userId } = (req as any).userContext;",
        ),
    ],
    "modules/wrong-questions/wrong-questions.service.ts": [
        (
            "[...new Set(kpRows.map((r) => r.chapterId))]",
            "[...new Set(kpRows.map((r) => r.chapterId))] as string[]",
        ),
    ],
}


def apply_type_patches(rel, content):
    for pat, rep in TYPE_PATCHES.get(rel, []):
        if pat in content:
            content = content.replace(pat, rep)
        else:
            print(f"  WARN: 类型补丁未命中 {rel}: {pat[:60]}...")
    return content


def main():
    print(f"== 还原服务端源码到 {OUT}/server（含平台别名改写） ==")
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) desktop-export"})
    with urllib.request.urlopen(req, timeout=180) as r:
        html = r.read().decode("utf-8")
    print(f"  中转页 {len(html)//1024} KB")

    m = re.search(r"<pre>(.*?)</pre>", html, re.S)
    if not m:
        print("FAIL: 未找到 <pre> 源码块")
        sys.exit(1)
    body = m.group(1)
    blocks = re.split(r"^###FILE:\s*", body, flags=re.M)
    count = 0
    # main.ts / app.module.ts 已入库（桌面改造版：本地库初始化、兼容层装配），跳过还原以免被线上原版覆盖
    SKIP = {"main.ts", "app.module.ts"}
    for block in blocks[1:]:
        lines = block.splitlines()
        path = lines[0].strip()
        # 中转页路径形如 server/xxx.ts / shared/xxx.ts -> 工程 server/ 顶层平铺布局
        if path.startswith("server/"):
            rel = path[len("server/"):]
        else:
            rel = path
        if rel in SKIP:
            print(f"  skip {rel} (使用仓库桌面版)")
            continue
        b64 = "".join(l.strip() for l in lines[1:] if l.strip())
        try:
            content = base64.b64decode(b64).decode("utf-8")
        except Exception as e:
            print(f"  FAIL decode {rel}: {e}")
            sys.exit(1)
        content = rewrite_aliases(rel, content)
        content = apply_type_patches(rel, content)
        dest = os.path.join(OUT, "server", rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as f:
            f.write(content)
        count += 1
    print(f"DONE: {count} files -> {OUT}/server")
    if count == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
