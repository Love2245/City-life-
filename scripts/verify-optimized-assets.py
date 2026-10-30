import json,math
from pathlib import Path
from PIL import Image,ImageChops,ImageStat,ImageOps,ImageDraw
root=Path(__file__).resolve().parent.parent
cache=root/'.cache/release-assets';out=root/'docs/performance-1498-20261030'
rows=json.loads((cache/'manifest.json').read_text(encoding='utf8'))['entries'];masks=[]
for r in rows:
    paths=[root/p for p in r.get('originals',[]) if (root/p).is_file()]
    if paths and r.get('depthRGPreserved'):masks.append((r,paths[0]))
for r,p in masks[::max(1,len(masks)//16)][:16]:
    a=Image.open(p).convert('RGBA').resize(tuple(r['after']),Image.Resampling.NEAREST);b=Image.open(cache/r['file']).convert('RGBA')
    assert a.tobytes()==b.tobytes(),p
samples=[];panels=[]
for category in ['bg/battle/duel-1498','npc-tasks','duel-roundhead-1498','mobile-stills/home']:
    for r in rows:
        paths=[root/p for p in r.get('originals',[]) if category in p.replace('\\','/') and (root/p).is_file()]
        if not paths or r.get('depthRGPreserved'):continue
        p=paths[0];a=Image.open(p).convert('RGBA').resize(tuple(r['after']),Image.Resampling.LANCZOS);b=Image.open(cache/r['file']).convert('RGBA')
        # WebP may discard RGB behind fully transparent pixels; measure visible content.
        composite=lambda im:Image.alpha_composite(Image.new('RGBA',im.size,'#273542'),im).convert('RGB')
        ac,bc=composite(a),composite(b);rms=math.sqrt(sum(v*v for v in ImageStat.Stat(ImageChops.difference(ac,bc)).rms)/3);psnr=None if rms==0 else round(20*math.log10(255/rms),2)
        samples.append({'path':p.relative_to(root).as_posix(),'visiblePSNR':psnr,'visiblePixelsExact':rms==0,'alphaExact':a.getchannel('A').tobytes()==b.getchannel('A').tobytes()})
        panel=Image.new('RGB',(800,290),'#273542');panel.paste(ImageOps.contain(ac,(390,260)),(0,26));panel.paste(ImageOps.contain(bc,(390,260)),(400,26));ImageDraw.Draw(panel).text((8,8),'Original / Optimized: '+p.name,fill='white');panels.append(panel);break
board=Image.new('RGB',(800,290*len(panels)),'#273542')
for i,p in enumerate(panels):board.paste(p,(0,i*290))
board.save(out/'asset-quality-review.jpg',quality=95)
report={'maskSamples':min(16,len(masks)),'maskChannelsExact':True,'visualSamples':samples}
(out/'asset-quality.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False))
