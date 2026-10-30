"""Import AI portrait sheets byte-for-byte; generate native SVG crop metadata."""
from pathlib import Path
import argparse,hashlib,json,shutil
from PIL import Image
import numpy as np
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser()
p.add_argument('npc_id');p.add_argument('candidate',type=Path)
p.add_argument('--weather',choices=['default','summer','rain','winter','autumn','service'],default='default')
p.add_argument('--stamp',default='20261015')
p.add_argument('--file-tag',default='',help='Optional new art revision name; preserves previously imported PNGs')
p.add_argument('--report-dir',type=Path,default=Path('docs/npc-dialogue-repair-20261015/ai-art'))
p.add_argument('--library-file',help='Path relative to the named NPC folder in the formal asset library')
args=p.parse_args()
if not args.stamp.isdecimal() or len(args.stamp)!=8:raise ValueError('Expected YYYYMMDD stamp')
if args.file_tag and not args.file_tag.replace('-','').isalnum():raise ValueError('Invalid file tag')
active={row['id'] for row in json.loads((root/'src/game/data/npcs.json').read_text(encoding='utf-8'))}
if args.npc_id not in active:raise ValueError('NPC is not in the current roster')
candidate=args.candidate.resolve();image=Image.open(candidate).convert('RGBA');width,height=image.size;alpha=np.asarray(image.getchannel('A'))
if (alpha==0).sum()<width*height*.15:raise ValueError('Insufficient true transparency')
frames=[];crop_checks=[];separator_checks=[]
# Native clip boundaries follow the transparent gutter between complete figures.
# Separate row/column clips exclude a neighboring hem or arm without changing
# any PNG pixel or any facial/body geometry. Viewports stay equal and uniform.
def seam(pixels, boundary, radius):
    """Find a transparent separator between complete neighboring figures."""
    low=int(boundary-radius);high=int(boundary+radius)
    xs=np.arange(low,high+1)
    cost=pixels[:,low:high+1].astype(float)/255*40+abs(xs-boundary)*.01
    distance=cost[0].copy();parents=np.zeros(cost.shape,dtype=np.int16)
    for y in range(1,len(cost)):
        options=[]
        for delta in range(-3,4):
            previous=np.roll(distance,delta)+abs(delta)*.05
            if delta<0:previous[delta:]=np.inf
            elif delta>0:previous[:delta]=np.inf
            options.append(previous)
        options=np.array(options);choice=options.argmin(0)
        parents[y]=np.arange(len(xs))-(choice-3)
        distance=cost[y]+options[choice,np.arange(len(xs))]
    path=np.empty(len(cost),dtype=np.int16);index=int(distance.argmin())
    for y in range(len(cost)-1,-1,-1):
        path[y]=xs[index]
        if y:index=int(parents[y,index])
    transparency=float((pixels[np.arange(len(path)),path]<=16).mean())
    if transparency<.80:raise ValueError(f'Insufficient transparent separator at {boundary:g}: {transparency:g}')
    separator_checks.append({'boundary':float(boundary),'axis':'column'if pixels.shape==alpha.shape else 'row','transparentFraction':transparency})
    return [(int(x),y)for y,x in enumerate(path)]

def simplify(points,tolerance=1):
    if len(points)<=2:return points
    start=np.array(points[0]);end=np.array(points[-1]);delta=end-start
    values=np.array(points)
    distances=abs(delta[0]*(values[:,1]-start[1])-delta[1]*(values[:,0]-start[0]))/max(float(np.linalg.norm(delta)),1)
    index=int(distances.argmax())
    if distances[index]<=tolerance:return [points[0],points[-1]]
    return simplify(points[:index+1],tolerance)[:-1]+simplify(points[index:],tolerance)

columns=[simplify(seam(alpha,width*column/3,width/3*.20))for column in(1,2)]
rows=[[(x,y)for y,x in simplify(seam(alpha.T,height*row/3,height/3*.15))]for row in(1,2)]
path=lambda points:'M'+'L'.join(f'{x:g} {y:g}'for x,y in points)+'Z'
for tile in range(9):
    row=tile//3;column=tile%3;x0=column*width/3;y0=row*height/3
    region=alpha[int(y0):int(y0+height/3*.45),int(x0):int(x0+width/3)]
    if (region>16).sum()<region.size*.07:raise ValueError(f'Missing upper portrait in tile {tile}')
    left=columns[column-1]if column else[(0,0),(0,height)]
    right=columns[column]if column<2 else[(width,0),(width,height)]
    top=rows[row-1]if row else[(0,0),(width,0)]
    bottom=rows[row]if row<2 else[(0,height),(width,height)]
    frames.append({'viewBox':[x0,y0,width/3,height/3],
                   'clipPath':path(left[:1]+right+left[::-1]),
                   'rowClipPath':path(top+bottom[::-1])})
    crop_checks.append({'tile':tile,'upperOpaqueFraction':float((region>16).mean())})
asset_dir=root/'src/assets/portraits/npc_dialogue'/args.npc_id;asset_dir.mkdir(parents=True,exist_ok=True)
name=args.weather+'_'+(args.file_tag+'_'if args.file_tag else'')+args.stamp+'.png';destination=asset_dir/name
if destination.exists() and destination.read_bytes()!=candidate.read_bytes():raise ValueError('Versioned destination already contains a different image')
shutil.copyfile(candidate,destination)
sha=lambda file:hashlib.sha256(file.read_bytes()).hexdigest().upper()
assert sha(candidate)==sha(destination)
metadata_path=root/'src/game/data/npcDialogueArt.json';metadata=json.loads(metadata_path.read_text(encoding='utf-8'))
report_path=root/args.report_dir/args.npc_id/(args.weather+'-import.json')
metadata.setdefault(args.npc_id,{})[args.weather]={'file':name,'width':width,'height':height,'frames':frames,'sha256':sha(destination),
    'importReport':report_path.relative_to(root).as_posix(),
    **({'libraryFile':args.library_file}if args.library_file else{})}
metadata_path.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report={'npcId':args.npc_id,'weather':args.weather,'source':str(candidate),'destination':str(destination),'sha256':sha(destination),'width':width,'height':height,'transparentFraction':float((alpha==0).mean()),'separatorChecks':separator_checks,'cropChecks':crop_checks,'note':'Native SVG cropping only. Original generated PNG pixels and all facial/body geometry are unchanged. Visual inspection is required.'}
report_path.parent.mkdir(parents=True,exist_ok=True);report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='cropChecks'},ensure_ascii=False))
