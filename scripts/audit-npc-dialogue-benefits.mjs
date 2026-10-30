import fs from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {NPC_DIALOGUE_REMASTER,remasterRewardOption,remasterSceneReward}=await server.ssrLoadModule('/src/game/data/npcDialogueRemaster.ts');
 const {allNpcs}=await server.ssrLoadModule('/src/game/core/npcs.ts');
 const {greetingScriptTexts}=await server.ssrLoadModule('/src/game/data/npcGreetings.ts');
 const {npcFirstEncounterNode}=await server.ssrLoadModule('/src/game/data/npcFirstEncounters.ts');
 const {npcIntroduction}=await server.ssrLoadModule('/src/game/data/npcSharedIntroductions.ts');
 const {NPC_GROUP_SCENES}=await server.ssrLoadModule('/src/game/data/npcGroupScenes.ts');
 const {NPC_CONTEXT_DIALOGUES,NPC_DIALOGUE_ACTIVITIES}=await server.ssrLoadModule('/src/game/data/npcContextDialogues.ts');
 const {NPC_DIALOGUE_BENEFITS}=await server.ssrLoadModule('/src/game/data/npcDialogueBenefits.ts');
 const rows=[],all=[],help=[],rewards=[];
 const inspect=row=>{
  all.push(row);
  if(/给你|递给|推给|塞给|分你|拿着|收下|接受|请你|送你|分给|拿走|带走|留给你|尝尝|尝一|吃一|喝一|送了|获得/.test(row.text)||row.options.some(o=>/收下|接受|尝|吃|喝|接过|带走/.test(o.label)||o.effects||o.help||o.dialogueBenefitId))rows.push(row);
 };
 for(const npc of allNpcs()){
  const data=NPC_DIALOGUE_REMASTER[npc.id];
  for(const scene of Object.values(data?.scenes??{})){
   const nodes=data.talk[scene.stageKey]?.nodes??{};
   const queue=[scene.startNodeId],visited=new Set();
   while(queue.length){
    const key=queue.shift();if(visited.has(key))continue;visited.add(key);const node=nodes[key];if(!node)throw new Error(`Missing scene node ${npc.id}/${scene.id}/${key}`);
    inspect({source:'manuscript',npcId:npc.id,name:npc.name,sceneId:scene.id,kind:scene.kind,title:scene.title,locationId:scene.locationId,nodeId:node.id,text:node.text,options:node.options});
    for(const o of node.options)if(o.next)queue.push(o.next);
    const option=remasterRewardOption(npc.id,scene.stageKey,node.id);if(option?.help)help.push({npcId:npc.id,sceneId:scene.id,nodeId:node.id,option});
   }
   const reward=remasterSceneReward(npc.id,scene.id);if(reward)rewards.push({npcId:npc.id,sceneId:scene.id,reward});
  }
  for(const location of new Set(npc.weeklySchedule?.map(e=>e.locationId)??[])){
   const n=npcFirstEncounterNode(npc.id,location);if(n)inspect({source:'alternate-meet',npcId:npc.id,locationId:location,nodeId:n.id,text:n.text,options:n.options});
  }
 }
 for(const g of greetingScriptTexts())inspect({source:'greeting',npcId:g.key.split('/')[0],locationId:g.key.split('/')[1],text:g.text,options:[{label:g.reply,...(g.benefitId?{dialogueBenefitId:g.benefitId}:{})}]});
 for(const scene of Object.values(NPC_CONTEXT_DIALOGUES))for(const n of Object.values(scene.nodes))inspect({source:'context',npcId:scene.activity.npcId,sceneId:scene.id,nodeId:n.id,text:n.text,options:n.options});
 for(const scene of [npcIntroduction('M01'),npcIntroduction('M02'),...NPC_GROUP_SCENES])for(const n of Object.values(scene.nodes))inspect({source:'shared',sceneId:scene.id,nodeId:n.id,text:n.speeches.map(s=>s.text).join('\n'),options:n.options});
 const out='docs/npc-context-rewards-20261016';fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(`${out}/benefit-candidates.json`,JSON.stringify(rows,null,2)+'\n');
 const audit={roster:allNpcs().map(n=>({id:n.id,name:n.name})),sources:Object.fromEntries(Object.entries(Object.groupBy(all,r=>r.source)).map(([k,v])=>[k,v.length])),manuscriptScenes:Object.values(NPC_DIALOGUE_REMASTER).reduce((n,d)=>n+Object.keys(d.scenes).length,0),candidateNodes:rows.length,benefits:NPC_DIALOGUE_BENEFITS,preservedHelp:help,preservedSceneRewards:rewards};
 fs.writeFileSync(`${out}/dialogue-audit.json`,JSON.stringify(audit,null,2)+'\n');
 const draft=['都市生活1.49 · 特殊场景短对话新稿','说明：普通闲聊优先轮换当日当前活动的两段短稿，全部用过后才接普通日常；主动选择话题直达正文。',''];
 for(const a of NPC_DIALOGUE_ACTIVITIES){draft.push(`【${allNpcs().find(n=>n.id===a.npcId).name}｜${a.title}】`,`场景：${a.locations.join('、')}`);for(const [i,s]of a.scripts.entries())draft.push(`第${i+1}段`,s.opening,`玩家：${s.answer}`,s.reply,'');draft.push(`提前告辞时：${a.closing}`,'');}
 fs.writeFileSync(`${out}/特殊场景新文案.txt`,draft.join('\n'));
 console.log(JSON.stringify({sources:audit.sources,candidates:rows.length,help:help.length,sceneRewards:rewards.length,byNpc:Object.fromEntries(allNpcs().map(n=>[n.id,rows.filter(r=>r.npcId===n.id).length]))}));
}finally{await server.close();}
