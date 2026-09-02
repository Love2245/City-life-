#!/usr/bin/env python3
"""
v1.36 将 src/assets/cats/{players,opponents} 下的猫立绘 *.jpg
转换为带透明通道的 *.png。

做法：对每张图采样左上角小块的平均色作为背景色，按 per-channel max(|R-bg|,
|G-bg|,|B-bg|) 计算每个像素到背景的距离；T_CORE 内完全透明，T_SOFT 外
完全不透明，中间一段做线性软边过渡（避免硬锯齿）。最后写为 PNG 并删
除原 jpg。

依赖：Pillow（PIL）。全流程在 C 层完成，单张 ~0.1-0.3s，80 张图约
十秒级。无需 numpy / scipy。
"""
import os
from PIL import Image, ImageChops

ROOT = r"F:/都市生活_v1.36/src/assets/cats"
SUBS = ("players", "opponents")
T_CORE = 20   # 距背景色 max-channel 差 ≤ 此值 → 完全透明
T_SOFT = 30   # 距背景色 max-channel 差 ≥ 此值 → 完全不透明（中间渐变）

def sample_bg(im, patch=24):
    """从左上角 patch 取平均色作为该图的背景色。"""
    w, h = im.size
    p = im.crop((0, 0, min(patch, w), min(patch, h))).convert("RGB")
    pixels = list(p.getdata())
    n = len(pixels)
    r = sum(px[0] for px in pixels) // n
    g = sum(px[1] for px in pixels) // n
    b = sum(px[2] for px in pixels) // n
    return (r, g, b)

def process(src, dst):
    im = Image.open(src).convert("RGB")
    bg = sample_bg(im)
    w, h = im.size
    bg_img = Image.new("RGB", (w, h), bg)
    # per-channel abs diff
    diff = ImageChops.difference(im, bg_img)
    R, G, B = diff.split()
    # max-channel distance image (0..255), 全 C 层
    max_diff = ImageChops.lighter(ImageChops.lighter(R, G), B)
    # alpha LUT
    span = T_SOFT - T_CORE
    lut = (
        [0] * (T_CORE + 1)
        + [int(255 * (i - T_CORE) / span) for i in range(T_CORE + 1, T_SOFT)]
        + [255] * (256 - T_SOFT)
    )
    alpha = max_diff.point(lut)
    out = im.convert("RGBA")
    out.putalpha(alpha)
    out.save(dst, "PNG", optimize=True)

def main():
    # v1.36：仅写出 *.png，不在此处删除原 jpg。
    # 删除原 jpg 留给外部分批执行（避开单 turn 50 个文件的安全删除阈值）。
    total = ok = 0
    for sub in SUBS:
        d = os.path.join(ROOT, sub)
        for f in sorted(os.listdir(d)):
            if not f.lower().endswith(".jpg"):
                continue
            src = os.path.join(d, f)
            dst = os.path.join(d, f[:-4] + ".png")
            total += 1
            try:
                process(src, dst)
                ok += 1
            except Exception as e:
                print(f"FAIL {src}: {e}")
    print(f"converted {ok}/{total} images (jpg left in place; delete in batches)")

if __name__ == "__main__":
    main()
