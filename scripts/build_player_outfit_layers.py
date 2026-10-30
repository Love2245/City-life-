#!/usr/bin/env python3
"""Build aligned player outfit layers from the existing portrait set.

The original player portraits are complete RGBA illustrations.  This script
keeps those illustrations as the visual source of truth and derives aligned
clothing layers from them, so changing one slot does not require redrawing the
face, hands, pose, or shoes.  The AI baseline is used only for the default
white-vest/black-pants portrait; action variants keep the original pose and
are colour-rebuilt from the existing artwork.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PLAYER_DIR = ROOT / "src" / "assets" / "portraits" / "player"
STAGING_DIR = ROOT / ".generated-player-source"
AI_BASE = STAGING_DIR / "white_vest_black_pants_ai.png"
AI_HAT_SOURCES = {
    "baseball_cap": STAGING_DIR / "baseball_cap_ai.png",
    "knit_cap": STAGING_DIR / "knit_cap_ai.png",
}
AI_GARMENT_SOURCES = {
    "factory_uniform": STAGING_DIR / "factory_uniform_ai.png",
    "farm_workwear": STAGING_DIR / "farm_workwear_ai.png",
}

POSES = [
    "default",
    "action_arms_crossed",
    "action_hands_on_hips",
    "action_shrug",
    "action_thinking",
]


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def mask_from(image: Image.Image, predicate: Callable[[int, int, int, int, int, int], bool]) -> Image.Image:
    pixels = image.load()
    mask = Image.new("L", image.size, 0)
    out = mask.load()
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha and predicate(x, y, red, green, blue, alpha):
                out[x, y] = alpha
    return mask


def union(*masks: Image.Image) -> Image.Image:
    result = Image.new("L", masks[0].size, 0)
    for mask in masks:
        result = Image.fromarray_max(result, mask) if hasattr(Image, "fromarray_max") else _lighter(result, mask)
    return result


def _lighter(left: Image.Image, right: Image.Image) -> Image.Image:
    from PIL import ImageChops

    return ImageChops.lighter(left, right)


def jacket_mask(source: Image.Image) -> Image.Image:
    return mask_from(
        source,
        lambda _x, y, red, green, blue, _a:
        210 <= y <= 760 and blue >= red + 12 and blue >= green + 4,
    )


def pants_mask(source: Image.Image) -> Image.Image:
    return mask_from(
        source,
        lambda _x, y, red, green, blue, _a:
        # Start below the overshirt hem.  Including the blue jacket hem here
        # creates a hard horizontal seam when a different top is overlaid.
        930 <= y <= 1420 and blue >= red + 7 and blue >= green - 4,
    )


def pants_shape_mask(source: Image.Image) -> Image.Image:
    """Find the dark neutral trouser silhouette in the rebuilt baseline.

    Using the baseline rather than the original blue-pants pixels keeps the
    mask connected through the waistband and prevents a hard horizontal seam
    when khaki or jeans are layered over the black default trousers.
    """
    return mask_from(
        source,
        lambda _x, y, red, green, blue, _a:
        650 <= y <= 1430
        and max(red, green, blue) - min(red, green, blue) <= 48
        and (red + green + blue) // 3 <= 105,
    )


def neutral_shirt_mask(source: Image.Image) -> Image.Image:
    return mask_from(
        source,
        lambda _x, y, red, green, blue, _a:
        270 <= y <= 790 and max(red, green, blue) - min(red, green, blue) <= 28
        and (red + green + blue) // 3 >= 145,
    )


def region_mask(source: Image.Image, top: int, bottom: int, left: int = 0, right: int = 1024) -> Image.Image:
    mask = Image.new("L", source.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rectangle((left, top, right, bottom), fill=255)
    alpha = source.getchannel("A")
    return _lighter(mask, alpha)


def tint(source: Image.Image, mask: Image.Image, target: tuple[int, int, int], strength: float = 0.82) -> Image.Image:
    """Keep the source shading while moving the garment toward target."""
    pixels = source.load()
    mask_pixels = mask.load()
    result = Image.new("RGBA", source.size, (0, 0, 0, 0))
    out = result.load()
    for y in range(source.height):
        for x in range(source.width):
            amount = mask_pixels[x, y]
            if not amount:
                continue
            red, green, blue, alpha = pixels[x, y]
            luminance = max(0.34 * red + 0.5 * green + 0.16 * blue, 1)
            scale = min(luminance / 190.0, 1.35)
            color = tuple(max(0, min(255, round(channel * scale))) for channel in target)
            mix = strength * amount / 255.0
            mixed = tuple(round(original * (1 - mix) + replacement * mix) for original, replacement in zip((red, green, blue), color))
            out[x, y] = (*mixed, alpha)
    return result


def copy_with_mask(source: Image.Image, mask: Image.Image) -> Image.Image:
    result = source.copy()
    result.putalpha(mask)
    return result


def reference_tint(path: Path, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
    """Read a restrained color cue from an AI reference without importing its misaligned silhouette."""
    if not path.exists():
        return fallback
    image = rgba(path)
    pixels = image.load()
    samples: list[tuple[int, int, int]] = []
    left = image.width // 5
    right = image.width * 4 // 5
    top = image.height // 5
    bottom = image.height * 3 // 5
    for y in range(top, bottom):
        for x in range(left, right):
            red, green, blue, alpha = pixels[x, y]
            if alpha < 80 or max(red, green, blue) < 18:
                continue
            # Avoid averaging the pale background and exposed skin into the garment cue.
            if min(red, green, blue) > 220:
                continue
            if red > green * 1.18 and red > blue * 1.18:
                continue
            samples.append((red, green, blue))
    if not samples:
        return fallback
    average = tuple(sum(channel[index] for channel in samples) // len(samples) for index in range(3))
    # Keep the original artwork's palette dominant so the generated reference
    # guides color only; it cannot introduce a second, drifting body silhouette.
    return tuple(round(fallback[index] * 0.45 + average[index] * 0.55) for index in range(3))


def clipped_details(size: tuple[int, int], mask: Image.Image, draw_fn: Callable[[ImageDraw.ImageDraw], None]) -> Image.Image:
    """Draw garment details and clip them to the exact existing outer-garment mask."""
    details = Image.new("RGBA", size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(details, "RGBA"))
    details.putalpha(ImageChops.multiply(details.getchannel("A"), mask))
    return details


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def _trim_transparent(image: Image.Image, threshold: int = 20) -> Image.Image:
    """Remove the generated asset's faint glow and empty canvas."""
    alpha = image.getchannel("A").point(lambda value: 255 if value >= threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    cropped = image.crop(bbox)
    cropped.putalpha(alpha.crop(bbox))
    return cropped


def ai_hat_layer(source: Image.Image, hat_path: Path, target_width: int) -> Image.Image:
    """Place an AI-generated transparent hat on the pose's shared head anchor."""
    if not hat_path.exists():
        return Image.new("RGBA", source.size, (0, 0, 0, 0))

    hat = _trim_transparent(rgba(hat_path))
    alpha = source.getchannel("A")
    head_alpha = alpha.crop((0, 0, source.width, min(320, source.height)))
    head_bbox = head_alpha.getbbox()
    if head_bbox is None:
        return Image.new("RGBA", source.size, (0, 0, 0, 0))

    # The full head bbox includes the player's face, which is turned to the
    # right and is much wider than the hair cap.  Centering on that bbox makes
    # the hat drift over the forehead.  Use the dark hair pixels as the visual
    # anchor, with the alpha bbox as a safe fallback for future poses.
    pixels = source.load()
    hair_points = [
        (x, y)
        for y in range(0, min(200, source.height))
        for x in range(source.width)
        if pixels[x, y][3]
        and max(pixels[x, y][0], pixels[x, y][1], pixels[x, y][2]) <= 180
        and max(pixels[x, y][0], pixels[x, y][1], pixels[x, y][2]) - min(pixels[x, y][0], pixels[x, y][1], pixels[x, y][2]) <= 75
    ]
    if hair_points:
        min_x = min(x for x, _y in hair_points)
        min_y = min(y for _x, y in hair_points)
        max_x = max(x for x, _y in hair_points)
        center_x = (min_x + max_x) // 2
    else:
        min_x, min_y, max_x, _max_y = head_bbox
        center_x = (min_x + max_x) // 2
    target_height = max(1, round(hat.height * target_width / hat.width))
    hat = hat.resize((target_width, target_height), Image.Resampling.LANCZOS)

    # Keep the top of both AI hats just above the existing hair cap.  The
    # source poses share a 1024x1536 canvas, so this anchor works for every
    # standing/action variation without redrawing the face or body.
    left = round(center_x - hat.width / 2)
    top = max(0, min_y - 14)
    layer = Image.new("RGBA", source.size, (0, 0, 0, 0))
    layer.alpha_composite(hat, (left, top))
    return layer


def baseline_for(source: Image.Image, pose: str, ai_base: Image.Image | None) -> Image.Image:
    if pose == "default" and ai_base is not None and ai_base.size == source.size:
        return ai_base.copy()
    jacket = jacket_mask(source)
    pants = pants_mask(source)
    result = source.copy()
    result = Image.alpha_composite(result, tint(source, jacket, (245, 246, 248), 0.95))
    result = Image.alpha_composite(result, tint(source, pants, (28, 31, 38), 0.92))
    return result


def build_pose(pose: str, ai_base: Image.Image | None) -> None:
    original = rgba(PLAYER_DIR / f"{pose}.png")
    baseline = baseline_for(original, pose, ai_base)
    jacket = jacket_mask(original)
    pants = pants_shape_mask(baseline)
    vest = neutral_shirt_mask(baseline)

    save(baseline, PLAYER_DIR / "base" / f"{pose}.png")

    # Clothes.  The base already contains the default vest; these layers replace
    # only the top garment, leaving pants and the body below untouched.
    save(copy_with_mask(baseline, vest), PLAYER_DIR / "layers" / "white_vest" / f"{pose}.png")
    save(copy_with_mask(baseline, vest), PLAYER_DIR / "layers" / "underlayer_white" / f"{pose}.png")
    save(tint(baseline, vest, (30, 34, 40), 0.92), PLAYER_DIR / "layers" / "underlayer_black" / f"{pose}.png")
    save(tint(baseline, vest, (132, 138, 146), 0.88), PLAYER_DIR / "layers" / "underlayer_gray" / f"{pose}.png")
    save(copy_with_mask(original, jacket), PLAYER_DIR / "layers" / "cyan_jacket" / f"{pose}.png")
    save(tint(original, jacket, (188, 198, 211), 0.88), PLAYER_DIR / "layers" / "shirt" / f"{pose}.png")
    suit = tint(original, jacket, (30, 48, 78), 0.94)
    suit_draw = ImageDraw.Draw(suit, "RGBA")
    center_x = original.width // 2
    suit_draw.polygon([(center_x - 20, 380), (center_x + 22, 380), (center_x + 34, 720), (center_x - 32, 720)], fill=(23, 31, 52, 230))
    suit_draw.polygon([(center_x - 5, 390), (center_x + 10, 390), (center_x + 12, 655), (center_x - 8, 655)], fill=(185, 63, 70, 235))
    suit.putalpha(jacket)
    save(suit, PLAYER_DIR / "layers" / "suit" / f"{pose}.png")
    luxury = tint(original, jacket, (108, 45, 57), 0.94)
    luxury_draw = ImageDraw.Draw(luxury, "RGBA")
    luxury_draw.line((center_x - 42, 390, center_x - 8, 690), fill=(222, 174, 89, 210), width=7)
    luxury_draw.line((center_x + 28, 390, center_x + 4, 690), fill=(222, 174, 89, 210), width=7)
    luxury.putalpha(jacket)
    save(luxury, PLAYER_DIR / "layers" / "luxury_coat" / f"{pose}.png")

    # Workwear is derived from the same aligned jacket mask.  The generated
    # references only provide a palette cue; pockets, reflective bands and
    # seams are clipped to the original pose so hands and the face never drift.
    factory = tint(original, jacket, reference_tint(AI_GARMENT_SOURCES["factory_uniform"], (46, 71, 104)), 0.93)
    factory = Image.alpha_composite(
        factory,
        clipped_details(original.size, jacket, lambda draw: (
            draw.rectangle((334, 450, 690, 472), fill=(224, 225, 183, 190)),
            draw.rectangle((372, 508, 466, 610), outline=(157, 181, 202, 180), width=5),
            draw.rectangle((558, 508, 652, 610), outline=(157, 181, 202, 180), width=5),
            draw.rectangle((394, 295, 482, 340), fill=(194, 204, 214, 135)),
        )),
    )
    factory.putalpha(jacket)
    save(factory, PLAYER_DIR / "layers" / "factory_uniform" / f"{pose}.png")

    farm = tint(original, jacket, reference_tint(AI_GARMENT_SOURCES["farm_workwear"], (108, 101, 69)), 0.93)
    farm = Image.alpha_composite(
        farm,
        clipped_details(original.size, jacket, lambda draw: (
            draw.line((352, 405, 672, 405), fill=(189, 169, 107, 170), width=7),
            draw.rectangle((372, 505, 470, 625), outline=(76, 72, 51, 190), width=6),
            draw.rectangle((554, 505, 652, 625), outline=(76, 72, 51, 190), width=6),
            draw.line((512, 382, 512, 704), fill=(67, 64, 49, 150), width=5),
        )),
    )
    farm.putalpha(jacket)
    save(farm, PLAYER_DIR / "layers" / "farm_workwear" / f"{pose}.png")

    service = tint(original, jacket, (220, 214, 195), 0.93)
    service = Image.alpha_composite(
        service,
        clipped_details(original.size, jacket, lambda draw: (
            draw.line((364, 432, 660, 432), fill=(104, 85, 72, 190), width=8),
            draw.line((512, 435, 512, 700), fill=(129, 109, 91, 135), width=5),
            draw.rectangle((405, 530, 620, 700), fill=(184, 169, 146, 70)),
        )),
    )
    service.putalpha(jacket)
    save(service, PLAYER_DIR / "layers" / "service_apron" / f"{pose}.png")

    delivery = tint(original, jacket, (214, 92, 53), 0.92)
    delivery = Image.alpha_composite(
        delivery,
        clipped_details(original.size, jacket, lambda draw: (
            draw.line((342, 448, 682, 448), fill=(235, 235, 201, 210), width=12),
            draw.line((342, 478, 682, 478), fill=(235, 235, 201, 150), width=6),
            draw.rectangle((372, 530, 462, 632), outline=(120, 45, 36, 190), width=6),
            draw.rectangle((562, 530, 652, 632), outline=(120, 45, 36, 190), width=6),
        )),
    )
    delivery.putalpha(jacket)
    save(delivery, PLAYER_DIR / "layers" / "delivery_vest" / f"{pose}.png")

    # Pants.  The default layer matches the baseline; the other two recolor the
    # same aligned lower-body mask and therefore combine correctly with any top.
    save(copy_with_mask(baseline, pants), PLAYER_DIR / "layers" / "black_pants" / f"{pose}.png")
    save(copy_with_mask(original, pants), PLAYER_DIR / "layers" / "jeans" / f"{pose}.png")
    save(tint(baseline, pants, (164, 124, 66), 0.9), PLAYER_DIR / "layers" / "khaki_pants" / f"{pose}.png")

    # Hats are AI-generated independent layers and do not affect any other slot.
    save(ai_hat_layer(original, AI_HAT_SOURCES["baseball_cap"], 250), PLAYER_DIR / "layers" / "baseball_cap" / f"{pose}.png")
    # The knit cap has a deeper cuff than the baseball cap; keep it compact so
    # it follows the hair silhouette without covering the eyebrows or eyes.
    save(ai_hat_layer(original, AI_HAT_SOURCES["knit_cap"], 208), PLAYER_DIR / "layers" / "knit_cap" / f"{pose}.png")


def main() -> None:
    ai_base = rgba(AI_BASE) if AI_BASE.exists() else None
    for pose in POSES:
        build_pose(pose, ai_base)
    print(f"built player outfit layers for {len(POSES)} poses")


if __name__ == "__main__":
    main()
