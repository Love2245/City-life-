"""Integrate image_gen originals as encoded WebP assets; no creative image editing."""
import argparse
import json
import shutil
from pathlib import Path
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument("metadata")
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
base=root/"src/assets/bg/v1.48"
manifest_path=base/"ASSET_MANIFEST.json"
preview=root/"art-previews/boyue-map"
preview.mkdir(parents=True,exist_ok=True)
manifest=json.loads(manifest_path.read_text(encoding="utf-8-sig"))
record_path=preview/"generation-record.json"
records=json.loads(record_path.read_text(encoding="utf-8")) if record_path.exists() else []
inputs=json.loads(Path(args.metadata).read_text(encoding="utf-8"))
for item in inputs:
    if item["kind"] not in ("atlas","scene") or "/" in item["id"] or "\\" in item["id"]:
        raise ValueError("Invalid asset key")
    folder="atlas" if item["kind"]=="atlas" else "scenes"
    output=base/folder/(item["id"]+".webp")
    source=Path(item["source"])
    with Image.open(source) as image:
        image.convert("RGB").save(output,"WEBP",quality=90,method=6)
        entry={"id":item["id"],"kind":item["kind"],"source":str(source),"file":f"{folder}/{item['id']}.webp","prompt":item["prompt"],"reference":item.get("reference"),"width":image.width,"height":image.height,"bytes":output.stat().st_size,"lighting":"night" if item["id"].endswith("_night") else "day"}
    manifest["assets"]=[x for x in manifest["assets"] if x["id"]!=item["id"]]+[entry]
    records=[x for x in records if x["id"]!=item["id"]]+[entry]
    if item["kind"]=="atlas":
        shutil.copyfile(source,preview/(item["id"]+".png"))
manifest["lighting"]="Independent daylight originals with existing dusk/night filters; separately generated night variants for Boyue overview, night market and fountain preserve real illuminated architecture."
manifest["selectedOverview"]="A2 road revision with adjacent Boyue east district"
manifest["layout"]="Development west: teacher college above/right, reserve left (mountain above lake), culture middle/right; road tunnel foreground and subtle railway behind athletics field. Boyue east: engineering campus top/left, small mall top/right, night market middle/left, Olympic center middle/right, small general aviation airport below."
manifest["worldRegionNames"]={"downtown":"树堰区","suburb":"紫羊区","development":"伯月新区","boyue":"泊月区"}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
record_path.write_text(json.dumps(records,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"integrated":len(inputs),"assets":len(manifest["assets"]),"bytes":sum(x["bytes"] for x in manifest["assets"])},ensure_ascii=False))

