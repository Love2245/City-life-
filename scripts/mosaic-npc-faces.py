"""Prepare the shipped NPC portraits.

The first copy of every NPC portrait is kept under portraits/unmasked.  A
cleaned, contact-only copy is generated under portraits/unmasked-clean, while
the portrait used during ordinary conversation receives a pixel mosaic over
the complete face. Running this script again is idempotent: it always starts
from a clean unmasked copy instead of mosaicing an already processed image.
"""

from __future__ import annotations

import argparse
import shutil
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PORTRAITS = ROOT / "src" / "assets" / "portraits"
BACKUP = PORTRAITS / "unmasked"
CLEAN = PORTRAITS / "unmasked-clean"

# Full face bounds in the original 1024 x 1536 portrait canvas. The ellipse
# covers forehead, eyes, nose, mouth and cheeks, while staying inside hair,
# hats, ears and collars.
FACE_BOXES: dict[str, tuple[int, int, int, int]] = {
    "npc_chen_jie": (404, 88, 544, 222),
    "npc_flower_market_owner": (460, 89, 584, 217),
    "npc_librarian": (398, 96, 550, 231),
    "npc_lin_xiaoyu": (406, 110, 562, 242),
    "npc_netbar_boss": (387, 83, 550, 216),
    "npc_pharmacist": (388, 89, 550, 224),
    "npc_snack_street_vendor": (384, 86, 555, 221),
    "npc_suburb_farmer": (390, 110, 552, 234),
    "npc_suburb_station_staff": (400, 85, 556, 216),
    "npc_wang_lei": (394, 92, 556, 230),
    "npc_zhao_gang": (378, 86, 556, 224),
    "npc_fan_kejie": (426, 118, 578, 250),
    "npc_jack_fanma": (382, 44, 588, 210),
    "npc_fan_kexi": (407, 67, 590, 210),
}


def clear_tiny_components(image: Image.Image, minimum_size: int = 16) -> Image.Image:
    """Drop isolated alpha flecks left over from background removal."""

    alpha = image.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)

    for y in range(height):
        for x in range(width):
            offset = y * width + x
            if visited[offset] or pixels[x, y] == 0:
                continue
            visited[offset] = 1
            component: list[tuple[int, int]] = []
            queue: deque[tuple[int, int]] = deque([(x, y)])
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in (
                    (px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1),
                    (px - 1, py - 1), (px + 1, py - 1),
                    (px - 1, py + 1), (px + 1, py + 1),
                ):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    no = ny * width + nx
                    if not visited[no] and pixels[nx, ny] > 0:
                        visited[no] = 1
                        queue.append((nx, ny))
            if len(component) < minimum_size:
                for px, py in component:
                    pixels[px, py] = 0

    cleaned = image.copy()
    cleaned.putalpha(alpha)
    return cleaned


def face_mosaic(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x1, y1, x2, y2 = box
    width = max(1, x2 - x1)
    height = max(1, y2 - y1)
    crop = image.crop(box)
    pixel_w = max(5, width // 11)
    pixel_h = max(5, height // 11)
    pixelated = crop.resize((pixel_w, pixel_h), Image.Resampling.NEAREST).resize(
        (width, height), Image.Resampling.NEAREST
    )

    # A very small inset keeps the outline clean without exposing cheeks or
    # mouth. The larger bounds above already stop at hair and collars.
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    inset_x = max(2, width // 38)
    inset_y = max(2, height // 42)
    draw.ellipse((x1 + inset_x, y1 + inset_y, x2 - inset_x, y2 - inset_y), fill=255)
    feature_mask = ImageChops.multiply(mask, image.getchannel("A"))

    output = image.copy()
    output.paste(pixelated, (x1, y1), feature_mask.crop(box))
    return output


def prepare_owner(owner: str, apply: bool) -> int:
    source_dir = PORTRAITS / owner
    backup_dir = BACKUP / owner
    backup_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(source_dir.glob("*.png"))
    if not files:
        return 0

    for source in files:
        target = backup_dir / source.name
        if not target.exists():
            shutil.copy2(source, target)

    if not apply:
        return len(files)

    box = FACE_BOXES[owner]
    for target in files:
        clean_target = CLEAN / owner / target.name
        original_path = clean_target if clean_target.exists() else backup_dir / target.name
        original = Image.open(original_path).convert("RGBA")
        cleaned = clear_tiny_components(original)
        masked = face_mosaic(cleaned, box)
        masked.save(target, format="PNG", optimize=True)
    return len(files)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write cleaned and mosaiced portraits")
    parser.add_argument(
        "--owners",
        nargs="+",
        choices=sorted(FACE_BOXES),
        help="only process the listed NPC portrait owners",
    )
    args = parser.parse_args()

    total = 0
    for owner in args.owners or sorted(FACE_BOXES):
        total += prepare_owner(owner, args.apply)
    action = "updated" if args.apply else "backed up"
    print(f"{action} {total} NPC portrait files; originals: {BACKUP}")


if __name__ == "__main__":
    main()
