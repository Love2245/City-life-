"""Register authored emotion assets and build the game's concealed face variants.

Only current NPCs are imported. Originals in the material library are read-only.
Uses the existing game face-mosaic pipeline; no repainting or pose composition.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PORTRAITS = ROOT / "src/assets/portraits"
OWNERS = {
    "npc_lin_xiaoyu": "林小雨立绘",
    "npc_zhao_gang": "赵刚立绘",
    "npc_chen_jie": "陈姐立绘",
    "npc_wang_lei": "王爷爷立绘",
    "npc_netbar_boss": "网咖老板立绘",
    "npc_librarian": "图书馆大姐立绘",
    "npc_flower_market_owner": "苏荷立绘",
    "npc_snack_street_vendor": "马师傅立绘",
    "npc_suburb_farmer": "陈守田立绘",
    "npc_fan_kejie": "范柯杰立绘",
    "npc_jack_fanma": "杰克范马立绘",
    "npc_fan_kexi": "范珂汐立绘",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--library", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    npc_ids = {npc["id"] for npc in json.loads((ROOT / "src/game/data/npcs.json").read_text(encoding="utf-8-sig"))}
    assert npc_ids == set(OWNERS), "NPC roster changed: update the explicit library mapping"
    spec = importlib.util.spec_from_file_location("npc_mosaic", ROOT / "scripts/mosaic-npc-faces.py")
    mosaic = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mosaic)
    rows = []
    for owner, folder in OWNERS.items():
        sources = sorted((args.library / folder / "情绪立绘").glob("emotion_*.png"))
        required = {f"emotion_{emotion}.png" for emotion in ("happy", "disappointed", "angry", "surprised")}
        assert required.issubset({source.name for source in sources}), f"Missing emotion images: {owner}"
        for source in sources:
            clean = PORTRAITS / "unmasked-clean" / owner / source.name
            concealed = PORTRAITS / owner / source.name
            with Image.open(source) as opened:
                original = opened.convert("RGBA")
            assert original.size == (1024, 1536), f"Face box needs recalibration: {source}"
            if args.apply:
                clean.parent.mkdir(parents=True, exist_ok=True)
                concealed.parent.mkdir(parents=True, exist_ok=True)
                # Clear portraits remain byte-identical to the authored library images.
                if not clean.exists() or digest(clean) != digest(source):
                    shutil.copy2(source, clean)
                mosaic.face_mosaic(original, mosaic.FACE_BOXES[owner]).save(concealed, format="PNG", optimize=True)
            rows.append({
                "npc": owner, "variant": source.stem, "library": str(source),
                "librarySha256": digest(source), "clean": str(clean.relative_to(ROOT)),
                "concealed": str(concealed.relative_to(ROOT)),
                "cleanSha256": digest(clean) if clean.exists() else None,
                "concealedSha256": digest(concealed) if concealed.exists() else None,
                "size": original.size, "faceBox": mosaic.FACE_BOXES[owner],
            })
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"npcs": len(OWNERS), "emotions": len(rows), "applied": args.apply, "cleanMatchesLibrary": all(row["cleanSha256"] == row["librarySha256"] for row in rows)}))


if __name__ == "__main__":
    main()
