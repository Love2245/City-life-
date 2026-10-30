"""Read-only alpha audit for imagegen cat cutouts; never edits bitmap assets."""
import json
from pathlib import Path
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'docs/cat-duel-refine-1498-20261029'
rows=[]
for path in sorted((ROOT/'src/assets/cats/duel-clean').rglob('*.png')):
    with Image.open(path) as source:
        image=source.convert('RGBA'); pixels=np.asarray(image); alpha=pixels[:,:,3]; mask=alpha>200
        edge=[int(mask[0,:].sum()),int(mask[-1,:].sum()),int(mask[:,0].sum()),int(mask[:,-1].sum())]
        rgba_bbox=image.getchannel('A').getbbox()
        rows.append({'path':path.relative_to(ROOT).as_posix(),'size':list(image.size),'alphaRange':[int(alpha.min()),int(alpha.max())],'bbox':rgba_bbox,'opaquePixelsOnCanvasEdge':edge,'touchesEdge':max(edge)>4,'transparentFraction':float(np.mean(alpha==0)),'whiteOpaquePixels':int(np.sum((pixels[:,:,:3].min(axis=2)>230)&mask))})
report={'policy':'Read-only pixel audit. Interior completeness and natural spaces between bones, legs or tail require separate visual review. No automatic erosion, threshold cutout or hole filling is applied.','count':len(rows),'edgeReview':[r['path'] for r in rows if r['touchesEdge']],'rows':rows}
out.mkdir(parents=True,exist_ok=True);(out/'portrait-alpha-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'count':report['count'],'edgeReview':report['edgeReview']},ensure_ascii=False))
