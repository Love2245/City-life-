#!/usr/bin/env python3
"""v1.42: 处理 AI 生成的主题过场背景图
- 裁掉底部 5%（马路+水印）
- 缩放到 1280 宽（保留比例）
- 转 WebP 质量 82
- 输出到 src/assets/transition/themes，供 transitionThemes.ts 以静态 URL 引入

脚本默认以自身所在项目为根目录，也可通过 --base 指定其他 checkout。
"""
import argparse
from pathlib import Path
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description="处理过场主题背景并生成兼容资源")
parser.add_argument(
    "--base",
    type=Path,
    default=PROJECT_ROOT,
    help="项目根目录（默认根据脚本位置自动推断）",
)
args = parser.parse_args()
BASE = args.base.resolve()
SRC = BASE / "assets" / "transition_bg"

TARGET_W = 1280
WEBP_QUALITY = 82
THEMES = ["city", "industry", "rural", "suburb"]

for t in THEMES:
    src = SRC / f"{t}.png"
    im = Image.open(src).convert("RGB")
    w, h = im.size
    crop_h = int(h * 0.95)  # 裁掉底部 5%（马路+水印）
    im = im.crop((0, 0, w, crop_h))
    if w > TARGET_W:
        ratio = TARGET_W / w
        im = im.resize((TARGET_W, int(crop_h * ratio)), Image.LANCZOS)
    out_dir = BASE / "src" / "assets" / "transition" / "themes"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{t}.webp"
    im.save(out_path, "WEBP", quality=WEBP_QUALITY, method=6)
    print(f"{t}: webp={out_path.stat().st_size//1024}KB dims={im.size}")

print(f"wrote {BASE / 'src' / 'assets' / 'transition' / 'themes'}")
