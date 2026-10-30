import fs from 'node:fs';
import { reviewNewNpcPerformance } from './review-new-npc-performance.mjs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';

// Retain exact existing annotations; new spoken paragraphs use the current
// character-specific and conservative fallback rules. Never annotate a quoted
// name, narrator or player as the NPC who happens to own the scene.
const root=process.cwd(),file=path.join(root,'src/game/data/npcDialoguePerformance.json');
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const rows=new Map(data.rows.map(row=>[`${row.npcId}\0${row.text}`,row]));
const previous=rows.size,used=new Set();
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {allNpcs}=await server.ssrLoadModule('/src/game/core/npcs.ts');
  const {npcDialogueBeats}=await server.ssrLoadModule('/src/game/core/npcDialoguePlayback.ts');
  const {npcDialogueMoodForText}=await server.ssrLoadModule('/src/game/core/npcDialogueEmotion.ts');
  const {npcIntroduction}=await server.ssrLoadModule('/src/game/data/npcSharedIntroductions.ts');
  function add(npcId,text){
    const key=`${npcId}\0${text.trim()}`; used.add(key);
    if(rows.has(key))return;
    const mood=npcDialogueMoodForText(npcId,text);
    rows.set(key,{npcId,text:text.trim(),category:mood.category??'neutral',intensity:mood.intensity,
      reason:`新增或改写的本人发言，沿用当前角色语气与通用判定：${mood.nuance??'自然陈述'}。`});
  }
  for(const npc of allNpcs())for(const stage of Object.values(npc.talk??{}))for(const node of Object.values(stage.nodes))
    for(const beat of npcDialogueBeats(node.text,npc.id,node.speeches))if(beat.speakerId===npc.id)add(npc.id,beat.portraitText);
  for(const id of ['M01','M02'])for(const node of Object.values(npcIntroduction(id).nodes))
    for(const beat of npcDialogueBeats('',npcIntroduction(id).participants[0],node.speeches))if(beat.speakerId&&beat.speakerId!=='player')add(beat.speakerId,beat.portraitText);
  data.sourceSha256=createHash('sha256').update(fs.readFileSync('npc对话修正.txt')).digest('hex');
  // These two new jokes refer to the speaker's own work; they are mild smiles,
  // rather than laughter attributed to the customer mentioned earlier.
  for(const [npcId,cue,category]of [['npc_chen_jie','酱料台成图书馆了','happy'],['npc_snack_street_vendor','让我坐着过会儿瘾','happy'],['npc_fan_kejie','你还真接得住啊','happy'],['npc_fan_kexi','这个能写。我用过的','embarrassed'],['npc_fan_kexi','范柯杰！刚才不是','angry'],['npc_fan_kexi','你先别拿钱','worried']]){
    for(const row of rows.values())if(row.npcId===npcId&&row.text.includes(cue))Object.assign(row,{category,intensity:1,reason:'结合共同初见或工作场景，使用本人当下的轻微表情。'});
  }
  data.rows=[...rows.values()];
  const changes=reviewNewNpcPerformance(data.rows);
  data.polishReview={date:'2026-10-16',paragraphs:data.rows.filter(row=>['npc_fan_kejie','npc_fan_kexi','npc_jack_fanma'].includes(row.npcId)).length,
    policy:'Reviewed current speaker attitude; clear complete portrait frames available from the first encounter.'};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(changes,null,2)+'\n');
  const retained=data.integration?.retainedAnnotations??previous;
  data.integration={date:'2026-10-16',retainedAnnotations:retained,addedSpokenParagraphs:data.rows.length-retained,currentSpokenParagraphs:used.size,policy:'Preserve existing annotations; individually review new characters using their own current speech and actions.'};
} finally {await server.close();}
fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify(data.integration));
