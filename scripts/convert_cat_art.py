#!/usr/bin/env python3
"""将猫咪战斗立绘转换为透明 WebP 运行时素材。

默认以脚本所在项目为根目录，保留原 PNG 作为源素材；运行时索引由
src/lib/catArt.ts 切换到同目录的 *.webp，从而避免把大 PNG 带进发布包。
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="转换猫咪战斗立绘为透明 WebP")
    parser.add_argument("--base", type=Path, default=PROJECT_ROOT, help="项目根目录")
    parser.add_argument("--quality", type=int, default=82, help="WebP 质量（默认 82）")
    args = parser.parse_args()

    quality = max(1, min(100, args.quality))
    root = args.base.resolve()
    files = sorted((root / "src" / "assets" / "cats").glob("*/*.png"))
    if not files:
        raise SystemExit("未找到 src/assets/cats/*/*.png")

    before = 0
    after = 0
    for src in files:
        dst = src.with_suffix(".webp")
        before += src.stat().st_size
        with Image.open(src) as image:
            image.convert("RGBA").save(dst, "WEBP", quality=quality, method=6)
        after += dst.stat().st_size
        print(f"{src.name}: {src.stat().st_size // 1024}KB -> {dst.stat().st_size // 1024}KB")

    print(f"converted={len(files)} before={before // 1024}KB after={after // 1024}KB")


if __name__ == "__main__":
    main()
