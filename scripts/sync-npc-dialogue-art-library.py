"""Sync accepted complete portrait sheets and their native crops to the art library."""
from pathlib import Path
import hashlib,json,shutil

root=Path(__file__).resolve().parents[1]
library=root.parents[1]/'素材库'/'角色人物立绘'
folders={'npc_chen_jie':'陈姐立绘','npc_suburb_farmer':'陈守田立绘',
    'npc_fan_kejie':'范柯杰立绘','npc_fan_kexi':'范珂汐立绘','npc_jack_fanma':'杰克范马立绘',
    'npc_lin_xiaoyu':'林小雨立绘','npc_snack_street_vendor':'马师傅立绘',
    'npc_flower_market_owner':'苏荷立绘','npc_librarian':'图书馆大姐立绘',
    'npc_wang_lei':'王爷爷立绘','npc_netbar_boss':'网咖老板立绘','npc_zhao_gang':'赵刚立绘'}
weather_names={'default':'常态','summer':'夏季','rain':'雨天','winter':'冬季'}
definitions=json.loads((root/'src/game/data/npcDialogueArt.json').read_text(encoding='utf-8'))
active={row['id']for row in json.loads((root/'src/game/data/npcs.json').read_text(encoding='utf-8'))}
assert set(definitions)==active==set(folders),'All active NPCs must be complete before sync'
assert sum(len(sheets)for sheets in definitions.values())==31,'Expected 12 default and 19 existing weather sheets'
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest().upper()
records=[]
for npc_id,sheets in definitions.items():
    directory=library/folders[npc_id]/'情绪立绘'/'完整半身对话_20261015'
    directory.mkdir(parents=True,exist_ok=True)
    local={}
    for weather,sheet in sheets.items():
        source=root/'src/assets/portraits/npc_dialogue'/npc_id/sheet['file']
        destination=directory/(weather_names[weather]+'_九种表情.png')
        assert sha(source)==sheet['sha256']
        if not destination.exists() or sha(destination)!=sha(source):
            shutil.copyfile(source,destination)
        assert sha(source)==sha(destination)
        local[weather]={**sheet,'file':destination.name}
        records.append({'npcId':npc_id,'folder':folders[npc_id],'weather':weather,
            'source':str(source),'libraryPath':str(destination),'sha256':sha(destination),
            'expressions':9})
    (directory/'裁取与来源.json').write_text(json.dumps(local,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
index={'date':'2026-10-15','npcCount':len(active),'sheetCount':len(records),'expressionCount':len(records)*9,
    'order':['自然','微笑','低落','不满','意外','害羞','担心','自信','思考'],
    'rendering':'One complete authored half-body per tile. Native uniform SVG crop only. No head/body joining or isolated eyes/lips.',
    'records':records}
output=library/'NPC完整半身对话立绘索引_20261015.json'
staging_source=root/'src/game/data/npcDialogueStaging.json'
staging_destination=library/'NPC对话取景与身高配置_20261015.json'
if not staging_destination.exists() or sha(staging_destination)!=sha(staging_source):
    shutil.copyfile(staging_source,staging_destination)
assert sha(staging_source)==sha(staging_destination)
index['staging']={'source':str(staging_source),'libraryPath':str(staging_destination),'sha256':sha(staging_destination),
    'note':'Visual height estimates and whole-canvas head landmarks. Does not change player stats or saved data.'}
output.write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'docs/npc-dialogue-repair-20261015/library-sync.json').write_text(json.dumps(index,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'library':str(library),'npcs':len(active),'sheets':len(records),'expressions':len(records)*9},ensure_ascii=False))
