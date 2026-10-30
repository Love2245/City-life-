import {readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {NPC_TASK_ART_IDS,NPC_TASK_ART_LABELS,npcTaskImage} from '../src/lib/npcTaskVisuals';
describe('NPC 任务图片资源映射',()=>{
  it('全部现有图片均可按 ID 读取 URL，并具有标签',()=>{
    const files=readdirSync(new URL('../src/assets/npc-tasks/',import.meta.url)).filter(name=>name.endsWith('.png')).map(name=>name.slice(0,-4)).sort();
    expect(files).toHaveLength(20);expect([...NPC_TASK_ART_IDS].sort()).toEqual(files);
    expect(Object.keys(NPC_TASK_ART_LABELS).sort()).toEqual(files);
    for(const id of files){expect(npcTaskImage(id),id).toContain(`${id}.png`);expect(NPC_TASK_ART_LABELS[id],id).toBeTruthy();}
    expect(npcTaskImage(undefined)).toBeUndefined();expect(npcTaskImage('not-a-real-task-image')).toBeUndefined();
  });
});
