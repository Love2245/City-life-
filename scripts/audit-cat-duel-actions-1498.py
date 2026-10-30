"""Read-only alpha/frame audit. The PNG pixels are never cropped or rewritten."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/cat-duel-art-motion-1498-20261029'
frames={}; rows=[]
for file in sorted((ROOT/'src/assets/cats/duel-actions').rglob('*_actions.png')):
    with Image.open(file) as image:
        alpha=np.asarray(image.convert('RGBA'))[:,:,3]
        h,w=alpha.shape; occupied=(alpha>24).any(axis=0)
        runs=[]; start=None
        for x in range(int(w*.32),int(w*.68)):
            if not occupied[x] and start is None: start=x
            if occupied[x] and start is not None: runs.append((start,x));start=None
        if start is not None:runs.append((start,int(w*.68)))
        gaps=sorted(runs,key=lambda r:(r[1]-r[0])*(1-abs((r[0]+r[1])/2-w/2)/w),reverse=True)
        if not gaps or gaps[0][1]-gaps[0][0]<w*.012:raise RuntimeError(f'No clean gap between poses: {file}')
        gap=gaps[0]; split=(gap[0]+gap[1])//2
        bounds=[]
        for left,right in [(0,split),(split,w)]:
            yy,xx=np.where(alpha[:,left:right]>12)
            if len(xx)<100:raise RuntimeError(f'Missing pose: {file}')
            x0,y0,x1,y1=int(xx.min()+left),int(yy.min()),int(xx.max()+left+1),int(yy.max()+1)
            pad=max(8,int(max(x1-x0,y1-y0)*.035))
            x0=max(left,x0-pad);x1=min(right,x1+pad);y0=max(0,y0-pad);y1=min(h,y1+pad)
            bounds.append([x0,y0,x1-x0,y1-y0])
        strong=alpha>220
        edges=[int(strong[0,:].sum()),int(strong[-1,:].sum()),int(strong[:,0].sum()),int(strong[:,-1].sum())]
        key=file.parent.name+'/'+file.stem.removesuffix('_actions')
        frames[key]={'width':w,'height':h,'attack':bounds[0],'hurt':bounds[1]}
        rows.append({'key':key,'path':file.relative_to(ROOT).as_posix(),'size':[w,h],'alphaRange':[int(alpha.min()),int(alpha.max())],'gap':list(gap),'opaquePixelsOnCanvasEdge':edges,'edgeReview':max(edges)>6})
(ROOT/'src/lib/catActionFrames.json').write_text(json.dumps(frames,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'action-alpha-audit.json').write_text(json.dumps({'policy':'Read-only RGBA and frame bounds; complete pose silhouettes and identity are reviewed separately. Runtime SVG viewports display frames from unmodified sheets.','count':len(rows),'poses':len(rows)*2,'edgeReview':[r['key'] for r in rows if r['edgeReview']],'rows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'sheets':len(rows),'poses':len(rows)*2,'edgeReview':[r['key'] for r in rows if r['edgeReview']]}))
