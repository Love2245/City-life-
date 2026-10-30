"""Import reviewed outfit sheets without changing generated pixels or prior artwork."""
from pathlib import Path
import hashlib,json,shutil,subprocess,sys

root=Path(__file__).resolve().parents[1]
library=root.parents[1]/'素材库'/'角色人物立绘'
folders={'npc_fan_kejie':'范柯杰立绘','npc_fan_kexi':'范珂汐立绘','npc_jack_fanma':'杰克范马立绘'}
names={'summer':'夏季','rain':'雨天','winter':'冬季','autumn':'秋季','service':'工作装'}
sha=lambda file:hashlib.sha256(file.read_bytes()).hexdigest().upper()
records=[]
for npc_id,folder in folders.items():
    variants=['summer','rain','winter']+(['service']if npc_id=='npc_fan_kexi'else['autumn'])
    directories={}
    for variant in variants:
        candidate=root/'docs/npc-followup-20261016/ai-art'/npc_id/(f'{npc_id}_{variant}_sheet_20261016.png'if npc_id=='npc_jack_fanma'else f'{variant}.png')
        if npc_id=='npc_jack_fanma'and variant=='winter':candidate=candidate.parent/'winter_retry.png'
        jstyle=npc_id=='npc_fan_kejie'and variant in('summer','winter','autumn')
        if jstyle:candidate=root/'docs/npc-followup-20261016/ai-art'/npc_id/('jstyle-'+variant)/'output.png'
        layered=npc_id=='npc_jack_fanma'and variant in('winter','autumn')
        if layered:
            candidate=root/'docs/npc-followup-20261016/ai-art'/npc_id/('layered-'+variant)/'output.png'
            if variant=='autumn'and(candidate.parent/'output_retry.png').exists():candidate=candidate.parent/'output_retry.png'
        relative=Path('情绪立绘')/('完整半身对话_20261016_日式穿搭'if jstyle else'完整半身对话_20261016_层次穿搭'if layered else'完整半身对话_20261016')/(names[variant]+'_九种表情.png')
        command=[sys.executable,str(root/'scripts/import-npc-dialogue-art.py'),npc_id,str(candidate),'--weather',variant,
            '--stamp','20261016','--report-dir','docs/npc-followup-20261016/imports-jstyle'if jstyle else'docs/npc-followup-20261016/imports-layered'if layered else'docs/npc-followup-20261016/imports','--library-file',relative.as_posix()]
        if jstyle:command+=['--file-tag','jstyle']
        if layered:command+=['--file-tag','layered']
        subprocess.run(command,check=True)
        destination=library/folder/relative
        destination.parent.mkdir(parents=True,exist_ok=True)
        if destination.exists()and sha(destination)!=sha(candidate):raise ValueError(f'Formal destination already differs: {destination}')
        shutil.copyfile(candidate,destination)
        assert sha(candidate)==sha(destination)
        sheet=json.loads((root/'src/game/data/npcDialogueArt.json').read_text(encoding='utf-8'))[npc_id][variant]
        directories.setdefault(destination.parent,{})[variant]=sheet
        manifest=candidate.parent/'manifest.json'if jstyle or layered else root/'docs/npc-followup-20261016/ai-art'/npc_id/'manifest.json'
        shutil.copyfile(manifest,destination.parent/('生成记录_'+names[variant]+'.json'))
        records.append({'npcId':npc_id,'variant':variant,'source':str(candidate),'runtimeFile':sheet['file'],
            'libraryPath':str(destination),'sha256':sha(destination),'expressions':9})
    for directory,local in directories.items():
        (directory/'裁取与来源.json').write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
index={'date':'2026-10-16','npcCount':3,'sheetCount':len(records),'expressionCount':len(records)*9,
    'order':['自然','微笑','低落','不满','意外','害羞','担心','自信','思考'],
    'note':'Supplementary whole-portrait outfits; original PNG bytes preserved; existing default and full-body art preserved.',
    'records':records}
staging=root/'src/game/data/npcDialogueStaging.json'
staging_copy=library/'NPC对话取景与身高配置_20261016.json'
shutil.copyfile(staging,staging_copy)
index['staging']={'source':str(staging),'libraryPath':str(staging_copy),'sha256':sha(staging_copy)}
(root/'docs/npc-followup-20261016/library-sync.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(library/'NPC情境服装补充索引_20261016.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sheetCount':len(records),'expressions':len(records)*9},ensure_ascii=False))
