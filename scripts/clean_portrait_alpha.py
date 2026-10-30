#!/usr/bin/env python3
"""清理角色透明 PNG 中与主体脱离的抠图残片。

生成图的透明通道偶尔会留下棋盘格、黑点或鞋底外的孤立像素。这个脚本
只保留 alpha 连通区域中最大的主体，不改动主体内部的颜色、姿势和尺寸。
默认写到独立输出目录，确认预览后再由发布流程替换源图。
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path
from statistics import pstdev

from PIL import Image


def largest_component(alpha: bytes, width: int, height: int, threshold: int = 1) -> bytearray:
    labels = bytearray(width * height)
    next_label = 0
    areas: list[int] = [0]

    for start, value in enumerate(alpha):
        if value < threshold or labels[start]:
            continue
        next_label += 1
        label = next_label if next_label < 256 else 255
        queue = deque([start])
        labels[start] = label
        area = 0
        while queue:
            pos = queue.popleft()
            area += 1
            y, x = divmod(pos, width)
            if x and not labels[pos - 1] and alpha[pos - 1] >= threshold:
                labels[pos - 1] = label
                queue.append(pos - 1)
            if x + 1 < width and not labels[pos + 1] and alpha[pos + 1] >= threshold:
                labels[pos + 1] = label
                queue.append(pos + 1)
            if y and not labels[pos - width] and alpha[pos - width] >= threshold:
                labels[pos - width] = label
                queue.append(pos - width)
            if y + 1 < height and not labels[pos + width] and alpha[pos + width] >= threshold:
                labels[pos + width] = label
                queue.append(pos + width)
        areas.append(area)

    keep = max(range(1, len(areas)), key=areas.__getitem__, default=0)
    return bytearray(1 if label == keep else 0 for label in labels)


def remove_edge_checkerboard(rgba: Image.Image) -> None:
    """从透明区域向内清掉相连的中性灰棋盘格和黑色残点。"""
    width, height = rgba.size
    pixels = list(rgba.getdata())
    alpha = [pixel[3] for pixel in pixels]
    candidate = bytearray(width * height)
    for index, (red, green, blue, value) in enumerate(pixels):
        brightness = (red + green + blue) // 3
        neutral = max(red, green, blue) - min(red, green, blue) <= 8
        # 保留真正的白色衣物/鞋面；背景棋盘格和黑点通常落在这个范围。
        if value == 0 or (value > 0 and neutral and 8 <= brightness <= 240):
            candidate[index] = 1

    queue = deque(index for index, value in enumerate(alpha) if value == 0)
    visited = bytearray(width * height)
    for index in queue:
        visited[index] = 1
    while queue:
        pos = queue.popleft()
        y, x = divmod(pos, width)
        neighbours = []
        if x:
            neighbours.append(pos - 1)
        if x + 1 < width:
            neighbours.append(pos + 1)
        if y:
            neighbours.append(pos - width)
        if y + 1 < height:
            neighbours.append(pos + width)
        for neighbour in neighbours:
            if candidate[neighbour] and not visited[neighbour]:
                visited[neighbour] = 1
                queue.append(neighbour)

    cleaned_alpha = bytes(0 if visited[index] and alpha[index] > 0 else alpha[index] for index in range(width * height))
    rgba.putalpha(Image.frombytes("L", (width, height), cleaned_alpha))


def remove_enclosed_checkerboard(rgba: Image.Image) -> None:
    """清掉被错误接入主体的狭长灰白棋盘格区域。"""
    width, height = rgba.size
    pixels = list(rgba.getdata())
    alpha = [pixel[3] for pixel in pixels]
    candidate = bytearray(
        1
        if value and max(red, green, blue) - min(red, green, blue) <= 8
        and 150 <= (red + green + blue) // 3 <= 245
        else 0
        for red, green, blue, value in pixels
    )
    visited = bytearray(width * height)
    remove = bytearray(width * height)
    for start in range(width * height):
        if not candidate[start] or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        min_x, max_x, min_y, max_y = width, 0, height, 0
        while queue:
            pos = queue.popleft()
            component.append(pos)
            y, x = divmod(pos, width)
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            neighbours = []
            if x:
                neighbours.append(pos - 1)
            if x + 1 < width:
                neighbours.append(pos + 1)
            if y:
                neighbours.append(pos - width)
            if y + 1 < height:
                neighbours.append(pos + width)
            for neighbour in neighbours:
                if candidate[neighbour] and not visited[neighbour]:
                    visited[neighbour] = 1
                    queue.append(neighbour)

        component_width = max_x - min_x + 1
        component_height = max_y - min_y + 1
        touches_side = min_x <= int(width * 0.43) or max_x >= int(width * 0.57)
        narrow_vertical_patch = (
            len(component) >= 80
            and component_width <= 100
            and component_height >= 45
            and touches_side
            and min_y >= 180
            and max_y <= height - 100
        )
        if narrow_vertical_patch:
            for pos in component:
                remove[pos] = 1

    cleaned_alpha = bytes(0 if remove[index] else alpha[index] for index in range(width * height))
    rgba.putalpha(Image.frombytes("L", (width, height), cleaned_alpha))


def obvious_neutral_artifacts(rgba: Image.Image) -> tuple[bytearray, list[dict[str, int | float]]]:
    """找到明显的灰白棋盘格残片，但不触碰彩色主体或大块衣物。

    旧版的 flood-fill 会把白衣、鞋子等真实主体也当成背景。本规则只接受
    形状狭长、位置位于人物内部留白、颜色接近中性灰且颜色种类很少的连通块，
    因此只会生成需要抠除的 alpha mask，不会修改 RGB、尺寸或姿势。
    """
    width, height = rgba.size
    pixels = list(rgba.getdata())
    candidate = bytearray(width * height)
    brightness = [0] * (width * height)
    for index, (red, green, blue, value) in enumerate(pixels):
        level = (red + green + blue) // 3
        brightness[index] = level
        neutral = max(red, green, blue) - min(red, green, blue) <= 18
        if value and neutral and 145 <= level <= 255:
            candidate[index] = 1

    visited = bytearray(width * height)
    remove = bytearray(width * height)
    reports: list[dict[str, int | float]] = []

    for start in range(width * height):
        if not candidate[start] or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        min_x, max_x, min_y, max_y = width, 0, height, 0
        while queue:
            pos = queue.popleft()
            component.append(pos)
            y, x = divmod(pos, width)
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            neighbours = []
            if x:
                neighbours.append(pos - 1)
            if x + 1 < width:
                neighbours.append(pos + 1)
            if y:
                neighbours.append(pos - width)
            if y + 1 < height:
                neighbours.append(pos + width)
            for neighbour in neighbours:
                if candidate[neighbour] and not visited[neighbour]:
                    visited[neighbour] = 1
                    queue.append(neighbour)

        component_width = max_x - min_x + 1
        component_height = max_y - min_y + 1
        levels = [brightness[pos] for pos in component]
        level_range = max(levels) - min(levels)
        component_set = set(component)
        adjacent_pairs = 0
        sharp_transitions = 0
        for pos in component:
            y, x = divmod(pos, width)
            for neighbour in (
                pos + 1 if x + 1 < width else -1,
                pos + width if y + 1 < height else -1,
            ):
                if neighbour in component_set:
                    adjacent_pairs += 1
                    if abs(brightness[pos] - brightness[neighbour]) >= 20:
                        sharp_transitions += 1
        edge_density = sharp_transitions / adjacent_pairs if adjacent_pairs else 0
        looks_like_checker = (
            len(component) >= 500
            and len(component) <= 15000
            and min_y >= 180
            and max_y <= height - 180
            and component_width <= 150
            and component_height >= 48
            and component_width / component_height <= 1.05
            and pstdev(levels) >= 18
            and level_range >= 50
            and edge_density >= 0.10
        )
        if looks_like_checker:
            for pos in component:
                remove[pos] = 1
            reports.append({
                "area": len(component),
                "x": min_x,
                "y": min_y,
                "width": component_width,
                "height": component_height,
                "stddev": round(pstdev(levels), 2),
                "edge_density": round(edge_density, 3),
            })

    return remove, reports


def detached_specks(alpha: bytes, width: int, height: int, max_area: int = 240) -> bytearray:
    """抠除与人物主体脱离的小面积黑点、白点和鞋底外溢像素。"""
    opaque = bytearray(1 if value else 0 for value in alpha)
    visited = bytearray(width * height)
    components: list[list[int]] = []
    for start, value in enumerate(opaque):
        if not value or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        while queue:
            pos = queue.popleft()
            component.append(pos)
            y, x = divmod(pos, width)
            for neighbour in (
                pos - 1 if x else -1,
                pos + 1 if x + 1 < width else -1,
                pos - width if y else -1,
                pos + width if y + 1 < height else -1,
            ):
                if neighbour >= 0 and opaque[neighbour] and not visited[neighbour]:
                    visited[neighbour] = 1
                    queue.append(neighbour)
        components.append(component)

    remove = bytearray(width * height)
    if not components:
        return remove
    largest = max(range(len(components)), key=lambda index: len(components[index]))
    for index, component in enumerate(components):
        if index == largest or len(component) > max_area:
            continue
        for pos in component:
            remove[pos] = 1
    return remove


def clear_transparent_rgb(rgba: Image.Image) -> Image.Image:
    """清除完全透明像素残留的 RGB，避免内嵌渲染时露出棋盘格。"""
    cleaned = Image.new("RGBA", rgba.size)
    cleaned.putdata([
        (red, green, blue, value) if value else (0, 0, 0, 0)
        for red, green, blue, value in rgba.getdata()
    ])
    return cleaned


def clean_image(source: Path, target: Path, sanitize_only: bool = False) -> None:
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        if sanitize_only:
            rgba = clear_transparent_rgb(rgba)
            target.parent.mkdir(parents=True, exist_ok=True)
            rgba.save(target, "PNG", optimize=True)
            return
        # 先从真实透明区向内剥离棋盘格残片，再处理被边缘粘住的狭长区域。
        # 这两步只会触碰中性灰色的透明抠图噪点，不会改动皮肤、头发或服装。
        remove_edge_checkerboard(rgba)
        remove_enclosed_checkerboard(rgba)
        remove, _ = obvious_neutral_artifacts(rgba)
        width, height = rgba.size
        alpha = bytes(rgba.getchannel("A").getdata())
        specks = detached_specks(alpha, width, height)
        cleaned_alpha = bytes(0 if remove[index] or specks[index] else value for index, value in enumerate(alpha))
        rgba.putalpha(Image.frombytes("L", (width, height), cleaned_alpha))
        # 有些内嵌/缩放路径会错误使用透明像素的 RGB。把完全透明区域归零，
        # 即使渲染器出错也不会把生成器的灰白棋盘格带回画面。
        rgba = clear_transparent_rgb(rgba)
        target.parent.mkdir(parents=True, exist_ok=True)
        rgba.save(target, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="清理角色透明 PNG 的孤立抠图残片")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", action="store_true", help="输出每张图片中被清理的候选残片")
    parser.add_argument("--sanitize-only", action="store_true", help="仅归零透明像素的 RGB，适合发布前批量净化")
    args = parser.parse_args()

    source = args.source.resolve()
    output = args.output.resolve()
    files = sorted(source.rglob("*.png"))
    if not files:
        raise SystemExit(f"未找到 PNG：{source}")

    for path in files:
        clean_image(path, output / path.relative_to(source), args.sanitize_only)
        if args.report and not args.sanitize_only:
            with Image.open(path) as image:
                _, reports = obvious_neutral_artifacts(image.convert("RGBA"))
            for report in reports:
                print(f"{path.relative_to(source)} {report}")
    print(f"cleaned={len(files)} output={output}")


if __name__ == "__main__":
    main()
