"""Check that corrected production art is embedded in the published portable HTML."""
from pathlib import Path
import base64
import hashlib
import json

root = Path(__file__).resolve().parents[1]
release = root / "都市生活_v1.47.0-dev.html"
data = release.read_bytes()
asset_paths = [root / f"src/assets/portraits/player/layers/{name}/default.png"
               for name in ("factory_uniform", "farm_workwear", "service_apron", "delivery_vest")]
asset_paths += list((root / "src/assets/portraits/player/masks").glob("*"))
verified = []
for path in asset_paths:
    assert base64.b64encode(path.read_bytes()) in data, f"Not embedded: {path}"
    verified.append(str(path.relative_to(root)))

digest = hashlib.sha256(data).hexdigest()
other = hashlib.file_digest((root / "urban-life-v1.47.0-dev.html").open("rb"), "sha256").hexdigest()
assert digest == other, "Release copies differ"
report = {"release": str(release), "bytes": len(data), "sha256": digest,
          "releaseCopiesIdentical": True, "verifiedArt": verified}
(root / "artifacts/portable-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
