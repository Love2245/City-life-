"""Build an unsigned APK from a portable HTML or a split WebView bundle.

The project keeps the Android shell intentionally small: the verified APK
template contains the WebView activity, launcher resources and a single
assets/index.html file.  Keeping that shell means the APK uses the same
Android packaging/signing path that was already tested for v1.44.5.

The Android build may use ``--web-root`` instead of ``--html``.  In that mode
the generated WebView shell stays small and the emitted assets are copied
under ``assets/`` beside ``index.html``.  This is important for TapPlay:
inlining several hundred MiB of images into one HTML string can make the
device WebView renderer crash during startup, while relative asset files are
loaded on demand.

This script deliberately removes the template's META-INF signatures.  The
caller must zipalign and sign the result with the preserved project key.
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import zipfile
from pathlib import Path


def project_version() -> str:
    version_source = (Path(__file__).resolve().parents[1] / "src" / "version.ts").read_text(encoding="utf-8")
    match = re.search(r'export const VERSION\s*=\s*["\']([^"\']+)["\']', version_source)
    if not match:
        raise ValueError("src/version.ts 中找不到 VERSION")
    return match.group(1)


def project_android_metadata() -> tuple[str, int]:
    config_path = Path(__file__).resolve().parents[1] / "src-tauri" / "tauri.conf.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    version_code = config["bundle"]["android"]["versionCode"]
    if not isinstance(version_code, int) or version_code <= 0:
        raise ValueError("tauri.conf.json 中的 Android versionCode 必须是正整数")
    return config["version"], version_code


def _read_string_pool(data: bytes) -> tuple[int, int, list[int], list[str]]:
    chunk_offset = 8
    chunk_type, header_size, _chunk_size = struct.unpack_from("<HHI", data, chunk_offset)
    if chunk_type != 0x0001 or header_size != 0x001C:
        raise ValueError("AndroidManifest.xml 缺少标准 UTF-16 字符串池")
    string_count, _style_count, _flags, strings_start, _styles_start = struct.unpack_from(
        "<IIIII", data, chunk_offset + 8
    )
    offsets = [
        struct.unpack_from("<I", data, chunk_offset + 28 + index * 4)[0]
        for index in range(string_count)
    ]
    string_base = chunk_offset + strings_start
    strings: list[str] = []
    for offset in offsets:
        cursor = string_base + offset
        length = struct.unpack_from("<H", data, cursor)[0]
        cursor += 2
        strings.append(data[cursor : cursor + length * 2].decode("utf-16le"))
    return string_base, chunk_offset + _chunk_size, offsets, strings


def _patch_manifest(data: bytes, version_name: str, version_code: int) -> bytes:
    mutable = bytearray(data)
    string_base, string_pool_end, offsets, strings = _read_string_pool(data)
    version_candidates = [
        (index, value)
        for index, value in enumerate(strings)
        if re.fullmatch(r"\d+\.\d+(?:\.\d+)?", value)
    ]
    if not version_candidates:
        raise ValueError("模板 APK 中没有找到 versionName")
    version_name_index = version_candidates[0][0]

    # Keep all offsets and chunk sizes stable.  Android's string pool allows
    # padding between entries; a shorter v1.45 name therefore needs no risky
    # rewrite of every following chunk in the binary XML.
    string_start = string_base + offsets[version_name_index]
    later_offsets = [offset for offset in offsets if offset > offsets[version_name_index]]
    string_end = string_base + min(later_offsets, default=string_pool_end - string_base)
    encoded = struct.pack("<H", len(version_name)) + version_name.encode("utf-16le") + b"\x00\x00"
    if len(encoded) > string_end - string_start:
        raise ValueError("新的 versionName 超出模板字符串池空间")
    mutable[string_start:string_end] = encoded + b"\x00" * (string_end - string_start - len(encoded))

    # Walk XML start-element chunks.  AttributeStart is relative to the
    # namespace/name header (pos + 16), as defined by ResXMLTree.
    cursor = 8
    while cursor + 8 <= len(mutable):
        chunk_type, _header_size, chunk_size = struct.unpack_from("<HHI", mutable, cursor)
        if chunk_size < 8 or cursor + chunk_size > len(mutable):
            raise ValueError("AndroidManifest.xml chunk 边界无效")
        if chunk_type == 0x0102:
            name_index = struct.unpack_from("<I", mutable, cursor + 20)[0]
            attribute_start = struct.unpack_from("<H", mutable, cursor + 24)[0]
            attribute_size = struct.unpack_from("<H", mutable, cursor + 26)[0]
            attribute_count = struct.unpack_from("<H", mutable, cursor + 28)[0]
            if name_index == strings.index("manifest"):
                attributes = cursor + 16 + attribute_start
                for index in range(attribute_count):
                    attribute = attributes + index * attribute_size
                    attribute_name_index = struct.unpack_from("<I", mutable, attribute + 4)[0]
                    if attribute_name_index == strings.index("versionCode"):
                        # Res_value.data is the final uint32 in each 20-byte
                        # attribute record; its type byte remains TYPE_INT.
                        struct.pack_into("<I", mutable, attribute + 16, version_code)
                        return bytes(mutable)
        cursor += chunk_size
    raise ValueError("AndroidManifest.xml 中没有找到 manifest.versionCode")


def _asset_zip_info(name: str) -> zipfile.ZipInfo:
    """Return a portable ZipInfo for a generated Android asset.

    Already-compressed media should not be deflated a second time.  Keeping
    those entries stored also reduces CPU work in TapPlay's sandbox while
    preserving normal compression for text and markup.
    """

    info = zipfile.ZipInfo(name)
    suffix = Path(name).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".mp3", ".ogg", ".wav", ".woff", ".woff2"}:
        info.compress_type = zipfile.ZIP_STORED
    else:
        info.compress_type = zipfile.ZIP_DEFLATED
    return info


def build_unsigned(
    template: Path,
    html: Path | None,
    output: Path,
    version_name: str,
    version_code: int,
    web_root: Path | None = None,
) -> None:
    if (html is None) == (web_root is None):
        raise ValueError("必须且只能提供 --html 或 --web-root")

    if web_root is not None:
        index_path = web_root / "index.html"
        if not index_path.is_file():
            raise ValueError(f"分包目录缺少 index.html: {index_path}")
        generated_assets = [
            path
            for path in sorted(web_root.rglob("*"))
            if path.is_file() and path.relative_to(web_root).as_posix() != "index.html"
        ]
    else:
        assert html is not None
        if not html.is_file():
            raise ValueError(f"HTML 文件不存在: {html}")
        generated_assets = []

    output.parent.mkdir(parents=True, exist_ok=True)
    manifest_patched = False
    html_replaced = False
    copied_asset_names: set[str] = set()
    with zipfile.ZipFile(template, "r") as source, zipfile.ZipFile(
        output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as target:
        source_names = {item.filename for item in source.infolist()}
        for item in source.infolist():
            if item.filename.startswith("META-INF/"):
                continue
            if item.filename == "AndroidManifest.xml":
                payload = _patch_manifest(source.read(item), version_name, version_code)
                manifest_patched = True
            elif item.filename == "assets/index.html":
                payload = (web_root / "index.html").read_bytes() if web_root is not None else html.read_bytes()  # type: ignore[union-attr]
                html_replaced = True
            else:
                payload = source.read(item)

            info = zipfile.ZipInfo(item.filename, item.date_time)
            info.external_attr = item.external_attr
            info.create_system = item.create_system
            # Preserve the APK shell's stored entries (notably
            # resources.arsc); only the HTML follows the template's normal
            # deflated asset treatment.
            info.compress_type = item.compress_type
            target.writestr(info, payload)

        for asset_path in generated_assets:
            relative = asset_path.relative_to(web_root).as_posix()  # type: ignore[union-attr]
            target_name = f"assets/{relative}"
            if target_name in source_names or target_name in copied_asset_names:
                raise ValueError(f"分包资源与 APK 模板重名: {target_name}")
            copied_asset_names.add(target_name)
            target.writestr(_asset_zip_info(target_name), asset_path.read_bytes())

    if not manifest_patched or not html_replaced:
        raise ValueError("模板 APK 缺少 AndroidManifest.xml 或 assets/index.html")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", type=Path, required=True)
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument("--html", type=Path)
    source_group.add_argument(
        "--web-root",
        type=Path,
        help="包含 index.html 和相对资源的 WebView 分包目录；资源会复制到 APK assets/",
    )
    parser.add_argument("--output", type=Path, required=True)
    current_version, current_version_code = project_android_metadata()
    parser.add_argument("--version-name", default=current_version)
    parser.add_argument("--version-code", type=int, default=current_version_code)
    args = parser.parse_args()
    build_unsigned(args.template, args.html, args.output, args.version_name, args.version_code, args.web_root)
    print(f"unsigned APK: {args.output} ({args.output.stat().st_size / 1024 / 1024:.1f} MiB)")


if __name__ == "__main__":
    main()
