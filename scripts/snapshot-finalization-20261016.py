from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
out=root/'docs/finalization-20261016'
before=out/'before'
if before.exists():raise RuntimeError('Checkpoint exists; never overwrite it')
paths=[p for folder in ('src','tests','scripts') for p in (root/folder).rglob('*') if p.is_file() and 'assets' not in p.relative_to(root).parts]
paths += [root/name for name in ('1.49.0.html','npc对话修正.txt','package.json','pnpm-lock.yaml','vite.npcPortraitLibrary.ts')]
records=[]
for source in paths:
 relative=source.relative_to(root);destination=before/relative;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,destination)
 with source.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest().upper()
 records.append({'path':relative.as_posix(),'bytes':source.stat().st_size,'sha256':digest})
(out/'before-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(records),'release':next(r for r in records if r['path']=='1.49.0.html')},ensure_ascii=False))
