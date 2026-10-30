"""Render installed clothing for visual review, without modifying source artwork."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont, ImageChops

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'clothing-review-20260930'
out.mkdir(parents=True, exist_ok=True)
player = root / 'src/assets/portraits/player'
items = [i for i in json.loads((root / 'src/game/data/items.json').read_text(encoding='utf-8-sig'))['items'] if i.get('outfitLayer')]
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 16)
sheet = Image.new('RGB', (1200, ((len(items)+4)//5)*385), '#dce3ed')
draw = ImageDraw.Draw(sheet)
audit = []
for n, item in enumerate(items):
    paths = [player / 'base/default.png']
    ids = dict(pants='black_pants', underlayer='underlayer_white', clothes='white_vest')
    ids[item['slot']] = item['outfitLayer']
    paths += [player / f'layers/{ids[slot]}/default.png' for slot in ('pants', 'underlayer', 'clothes', 'hat') if slot in ids]
    canvas = Image.new('RGBA', (1024,1536))
    for p in paths:
        layer = Image.open(p).convert('RGBA')
        garment = p.parent.name
        mask_path = player / f'masks/{garment}.png'
        if mask_path.exists():
            layer.putalpha(ImageChops.multiply(layer.getchannel('A'), Image.open(mask_path).convert('RGBA').getchannel('A')))
        if garment in ('service_apron','delivery_vest'):
            mask = Image.new('L', layer.size, 255)
            points = [(455,280),(556,290),(590,387),(441,387)] if garment == 'service_apron' else [(445,240),(568,265),(572,450)]
            ImageDraw.Draw(mask).polygon(points, fill=0)
            layer.putalpha(ImageChops.multiply(layer.getchannel('A'), mask))
        if garment == 'service_apron':
            scaled = layer.resize((819,1229), Image.Resampling.LANCZOS)
            layer = Image.new('RGBA',(1024,1536))
            layer.alpha_composite(scaled,(100,52))
        canvas.alpha_composite(layer)
    canvas.save(out / f"{item['id']}.png")
    x, y = n % 5 * 240, n // 5 * 385
    sheet.paste(canvas.resize((240,360)), (x,y+25), canvas.resize((240,360)))
    draw.text((x+4,y+3), item['name'], font=font, fill='#182238')
    audit.append({'id':item['id'], 'name':item['name'], 'source':str(paths[-1].relative_to(root)), 'poses':[p.stem for p in (player / f"layers/{item['outfitLayer']}").glob('*.png')]})
sheet.save(out / 'all-clothing.png')
(out / 'inventory.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf-8')
print(out / 'all-clothing.png')
