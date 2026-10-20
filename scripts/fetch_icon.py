#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_icon.py —— 从 CDN 拉取「全职高手考研系统」应用图标并生成打包用 PNG

产物：
  build/icon.png    1024x1024 标准 PNG（每行 filter=0，兼容 electron-builder icns 转换）
  client/icon.png   256x256   标准 PNG（应用内加载页使用）

依赖：Pillow（CI 步骤已 pip install pillow）
兜底：下载失败时用 Pillow 绘制简易占位图标（深蓝底 + 白色「全」字），保证构建不中断。
"""
import os
import sys
import zlib
import struct
import urllib.request

ICON_URL = os.environ.get(
    "ICON_URL",
    "https://aka.doubaocdn.com/s/LxQ9GcqVeP",  # AI 生成的应用图标（全字立体流光设计）
)
BUILD_OUT = os.path.join(os.getcwd(), "build", "icon.png")
CLIENT_OUT = os.path.join(os.getcwd(), "client", "icon.png")


def png_filter0(rgb_bytes, w, h, bpp=3):
    """手写标准 PNG 编码：每行 filter byte=0（None）。
    electron-builder 的 icns 转换不接受压缩 PNG 的 filter 类型，必须全 0。"""
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )
    stride = w * bpp
    scan = bytearray()
    for y in range(h):
        scan.append(0)
        scan += rgb_bytes[y * stride:(y + 1) * stride]
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(scan), 9))
    png += chunk(b"IEND", b"")
    return png


def _download(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "quanzhi-fetch-icon/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def main():
    os.makedirs("build", exist_ok=True)
    os.makedirs("client", exist_ok=True)

    try:
        from PIL import Image
    except ImportError:
        print("[fetch_icon] Pillow 不可用，安装中…")
        os.system(f'"{sys.executable}" -m pip install --quiet pillow')
        from PIL import Image

    try:
        data = _download(ICON_URL)
        im = Image.open(io := __import__("io").BytesIO(data)).convert("RGB")
    except Exception as e:
        print(f"[fetch_icon] 下载失败，使用兜底占位图标: {e}")
        im = None

    if im is None:
        # 兜底：深蓝渐变底 + 白色方块与「全」字
        size = 1024
        base = Image.new("RGB", (size, size))
        px = base.load()
        top = (26, 63, 143)     # #1a3f8f
        bottom = (47, 111, 237)  # #2f6fed
        for y in range(size):
            t = y / (size - 1)
            r = int(top[0] + (bottom[0] - top[0]) * t)
            g = int(top[1] + (bottom[1] - top[1]) * t)
            b = int(top[2] + (bottom[2] - top[2]) * t)
            for x in range(size):
                px[x, y] = (r, g, b)
        from PIL import ImageDraw
        d = ImageDraw.Draw(base)
        d.rounded_rectangle([size*0.28, size*0.28, size*0.72, size*0.72], radius=size*0.08, fill=(255, 255, 255))
        im = base

    im1024 = im.resize((1024, 1024), Image.LANCZOS)
    im256 = im.resize((256, 256), Image.LANCZOS)

    with open(BUILD_OUT, "wb") as f:
        f.write(png_filter0(im1024.tobytes(), 1024, 1024))
    with open(CLIENT_OUT, "wb") as f:
        f.write(png_filter0(im256.tobytes(), 256, 256))

    print(f"[fetch_icon] build/icon.png OK ({os.path.getsize(BUILD_OUT) // 1024} KB), client/icon.png OK")


if __name__ == "__main__":
    main()
