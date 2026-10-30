"""Normalize a generated atlas image to the map's native wide background size."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance


TARGET_SIZE = (1672, 941)


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Center-crop after scaling so generated 16:9 variants align with the atlas."""
    target_width, target_height = size
    width, height = image.size
    scale = max(target_width / width, target_height / height)
    resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - target_width) // 2)
    top = max(0, (resized.height - target_height) // 2)
    return resized.crop((left, top, left + target_width, top + target_height))


def grade_night(image: Image.Image, lighting: str) -> Image.Image:
    """Keep generated night maps readable while making their light much less theatrical."""
    if lighting == "none":
        return image

    if lighting == "night":
        red_gain, green_gain, blue_gain = (0.90, 0.95, 1.00)
        brightness, navy_opacity = (0.90, 0.035)
    else:
        red_gain, green_gain, blue_gain = (0.94, 0.97, 1.00)
        brightness, navy_opacity = (0.95, 0.020)

    channels = image.split()
    gains = (red_gain, green_gain, blue_gain)
    cooled = Image.merge(
        "RGB",
        tuple(channel.point(lambda value, gain=gain: round(value * gain)) for channel, gain in zip(channels, gains)),
    )
    dimmed = ImageEnhance.Brightness(cooled).enhance(brightness)
    navy = Image.new("RGB", dimmed.size, "#07111f")
    return Image.blend(dimmed, navy, navy_opacity)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--lighting", choices=("none", "night", "late-night"), default="none")
    args = parser.parse_args()

    with Image.open(args.source) as raw:
        atlas = grade_night(cover(raw.convert("RGB"), TARGET_SIZE), args.lighting)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(args.output, "WEBP", quality=92, method=6)
    print(f"saved={args.output.resolve()} size={TARGET_SIZE[0]}x{TARGET_SIZE[1]} lighting={args.lighting}")


if __name__ == "__main__":
    main()
