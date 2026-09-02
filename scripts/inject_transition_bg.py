#!/usr/bin/env python3
"""v1.3b3-fix6: 处理 AI 生成的主题过场背景图
- 裁掉底部 5%（马路+水印）
- 缩放到 1280 宽（保留比例）
- 转 JPEG 质量 78
- 生成 base64 字符串并写入 TS 模块（供组件 import，单文件 HTML 内联）
"""
import base64
import os
from PIL import Image

BASE = r"F:\来自E\360MoveData\Users\lijia\Desktop\都市生活\都市生活_v1.3_beta2_源码"
SRC = os.path.join(BASE, "assets", "transition_bg")

TARGET_W = 1280
JPEG_QUALITY = 78
THEMES = ["city", "industry", "rural", "suburb"]

out = {}
for t in THEMES:
    src = os.path.join(SRC, f"{t}.png")
    im = Image.open(src).convert("RGB")
    w, h = im.size
    crop_h = int(h * 0.95)  # 裁掉底部 5%（马路+水印）
    im = im.crop((0, 0, w, crop_h))
    if w > TARGET_W:
        ratio = TARGET_W / w
        im = im.resize((TARGET_W, int(crop_h * ratio)), Image.LANCZOS)
    out_path = os.path.join(SRC, f"{t}.jpg")
    im.save(out_path, "JPEG", quality=JPEG_QUALITY, optimize=True)
    jpg_size = os.path.getsize(out_path)
    with open(out_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    out[t] = (jpg_size, len(b64), im.size, b64)
    print(f"{t}: jpg={jpg_size//1024}KB b64={len(b64)//1024}KB dims={im.size}")

# 写 TS 文件
lines = [
    "// v1.3b3-fix6: AI 生成的主题过场背景（base64 内联到单文件 HTML）",
    "// 每张约 100-300KB JPEG，3-4% base64 增量体积，可接受",
    "/* eslint-disable */",
    "export const transitionThemeImages = {",
]
for t in THEMES:
    lines.append(f"  {t}: 'data:image/jpeg;base64,{out[t][3]}',")
lines.append("};")
out_ts = os.path.join(BASE, "src", "game", "data", "transitionThemes.ts")
with open(out_ts, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"wrote {out_ts} ({os.path.getsize(out_ts)//1024} KB)")
