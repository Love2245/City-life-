import fs from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
  const {createInitialState}=await server.ssrLoadModule('/src/game/core/state.ts');
  const {ensureRelationship}=await server.ssrLoadModule('/src/game/core/relationships.ts');
  const {gameDay}=await server.ssrLoadModule('/src/game/core/calendar.ts');
  const {markGreeted}=await server.ssrLoadModule('/src/game/data/npcGreetings.ts');
  const {NPC_DIALOGUE_REMASTER}=await server.ssrLoadModule('/src/game/data/npcDialogueRemaster.ts');
  const {beginNpcConversation,advanceNpcConversation,npcConversationView,commitNpcConversation}=await server.ssrLoadModule('/src/game/core/npcTalk.ts');
  const result=[];
  for(const [id,day,hour,locationId,region]of [['npc_fan_kejie',3,18,'boyue_lounge_bar','boyue_night_market'],['npc_fan_kexi',8,11,'western_restaurant','downtown_center'],['npc_jack_fanma',3,15,'boyue_gym','boyue_mall']]){
    let s=createInitialState(931);s.time={year:2026,month:8,day,hour,minute:0};s.locationId=locationId;s.region=region;s.flags.npc_introduction_m02_complete=true;ensureRelationship(s,id).affinity=10;markGreeted(s,id,gameDay(s.time));
    const chats=[];
    for(let i=0;i<3;i++){
      const start=beginNpcConversation(s,id,'chat');if(!start.ok){chats.push({error:start.reason});break;}
      let session=start.session;const initial=npcConversationView(s,session);
      for(let j=0;j<50&&session.status!=='ended';j++){
        const v=npcConversationView(s,session),index=v.options.findIndex(o=>!o.leave&&!o.commissionId);
        const next=advanceNpcConversation(s,session,index>=0?index:0);if(!next.ok)throw new Error(next.reason);session=next.session;
      }
      const commit=commitNpcConversation(s,session);if(!commit.ok)throw new Error(commit.reason);s=commit.state??s;
      chats.push({kind:initial.kind,sceneId:session.sceneId,text:initial.text.slice(0,95),counter:s.flags[`npc_remaster_talks_${id}`],chatCount:s.flags[`npc_chat_count_${id}`],greeting:!!session.greetingNode});
    }
    const dailies=Object.values(NPC_DIALOGUE_REMASTER[id].scenes).filter(scene=>scene.kind==='daily').map(scene=>({id:scene.id,affinity:[scene.minAffinity,scene.maxAffinity],location:scene.locationId,conditions:scene.conditions}));
    result.push({id,chats,dailies});
  }
  fs.writeFileSync(process.argv[2]??'docs/npc-followup-20261016/probe-before.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.map(({id,chats,dailies})=>({id,chats,dailyGroups:Object.entries(Object.groupBy(dailies,scene=>`${scene.affinity.join('-')} / ${scene.location}`)).map(([group,rows])=>({group,scenes:rows.map(row=>row.id)}))})),null,2));
}finally{await server.close();}
