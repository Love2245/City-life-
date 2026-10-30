import type {GameState} from '../types';
import type {NpcTalkNode} from '../core/npcs';
import {gameDay} from '../core/calendar';

type ActivityKind='work'|'exercise'|'study'|'errand'|'focus';
interface ShortScript {opening:string;answer:string;reply:string;benefitId?:string}
export interface NpcDialogueActivity {id:string;npcId:string;locations:readonly string[];kind:ActivityKind;title:string;closing:string;scripts:readonly ShortScript[];introCount?:number}
export interface NpcContextDialogue {id:string;activity:NpcDialogueActivity;startNodeId:string;nodes:Record<string,NpcTalkNode>}
const short=(opening:string,answer:string,reply:string,benefitId?:string):ShortScript=>({opening,answer,reply,benefitId});

/** 指定地点的短交流；introCount 表示前几次相遇，之后持续使用日常招呼。 */
export const NPC_DIALOGUE_ACTIVITIES:readonly NpcDialogueActivity[]=[
 {id:'kexi_campus',npcId:'npc_fan_kexi',locations:['dev_university'],kind:'study',title:'教学楼里的相遇',introCount:2,closing:'我先去教室啦，下次再聊。',scripts:[
  short('（抱着课本停在楼梯旁，眨了眨眼。）诶？你怎么在我们学校！刚才从走廊那头看见，还以为是我认错人了。','“来听听课，没想到碰到你。”','那还挺巧的！这边是教学楼，第一次来容易绕到另一侧去。我要去上课了，等有空再带你认路。'),
  short('（从教室门口探出头，笑了起来。）又是你！我还没习惯在学校里碰到你。刚才下课一抬头，就看到熟悉的人站在走廊里。','“以后说不定会常来。”','那下次我就不这么大惊小怪啦。你慢慢看，我得先把这本书还给同学。'),
  short('（把书往怀里拢了拢。）来啦？今天走廊挺安静，下一节课还没开始。','“你今天课多吗？”','下午还有一节。我想先把笔记补完，省得周末又想不起来写的是什么。回头见呀。'),
  short('（在教室门边朝你挥手。）早就猜你会从这边经过。今天也来听课吗？','“嗯，顺路过来看看。”','好呀。我先去占个位子，等老师来了可不能还堵在门口。下次见。'),
 ]},
 {id:'jack_campus',npcId:'npc_jack_fanma',locations:['boyue_engineering_college'],kind:'study',title:'教学楼里的相遇',introCount:2,closing:'我先去上课，回头见。',scripts:[
  short('（在教室门前站住，仔细看了你一眼。）是你？我没想到会在这里见到你。你也来这栋楼上课吗？','“来学校学习，正好碰上了。”','很好。我刚才差点走过去。这里的楼层看起来很像，找教室先看门上的号码，别跟着我走，我也找错过。'),
  short('（把背包从一边肩膀挪到另一边。）又碰到了。上次之后，我还以为只是巧合。你今天也来听课？','“看来以后能经常见面了。”','嗯，这样很好。校园里多一个认识的人。我先去教室，老师已经在放课件了。'),
  short('（拿着水杯走出教室，朝你点头。）来了。今天的课刚结束，我想出去走一会儿。','“学得怎么样？”','有一部分还要再看。我把不懂的地方记下来了，回去再慢慢查。你也加油。'),
  short('（在走廊靠窗处收起笔记。）你好。看到你，我就知道这里没有走错。','“现在已经认得路了吧？”','大部分认得。这个玩笑，我上周就想说了。我要去下一间教室了，回头见。'),
 ]},
 {id:'lin_office',npcId:'npc_lin_xiaoyu',locations:['commercial_office'],kind:'work',title:'写字楼里的招呼',introCount:2,closing:'我先回工位了，等下班再聊。',scripts:[
  short('（抱着文件夹在电梯前站住，眼睛亮了一下。）你怎么在这儿？我刚还在想楼上那份表格，差点没认出你。','“来这边办点事，原来你也在这里工作。”','是呀，这几天都得来。能在上班的时候碰到你还挺意外的，不过我得先把文件送上去，晚一点再说。'),
  short('（从茶水间出来，忍不住笑了。）又遇见了。最近怎么哪儿都能碰到你，我都有点怀疑是不是同一趟电梯带来的。','“以后在这里碰面，就算日常了。”','好，那我下次就自然一点。现在先回去改那张表，刚才倒水的时候又想起一处没对上。'),
  short('（在电梯口朝你抬了抬手。）来啦？今天这边挺忙，我刚出来透口气。','“辛苦了，忙完早点休息。”','嗯，先把手里的事情做好。看见你，倒觉得这一趟没白出来。回头聊。'),
  short('（把文件夹换到另一只手，笑着点头。）又在楼里碰到你了。今天也要待一阵吗？','“办完事就走，你先忙。”','好。我回工位啦，等下班再慢慢说。'),
 ]},
 {id:'wang_checkup',npcId:'npc_wang_lei',locations:['hospital'],kind:'errand',title:'候诊时的招呼',closing:'我得留神叫号，今天先不多聊。等复查办完，下次公园里再慢慢说。',scripts:[
  short('（看了眼叫号屏。）还没到我。你也来这边？先坐，我能说两句，号码一到就得进去。','“你先盯着屏幕，我不耽误。”','好，药袋和单子我都放这儿了。刚才光顾着找眼镜，眼镜还在领口。今天先这样，我得留神。'),
  short('（把单据按顺序叠好。）复查的事快办完了，还等最后一项。别陪我一直等，你有事先去办。','“那我打个招呼，回头公园见。”','成，公园见。到那边再说，这儿一分心，我怕错过叫号。'),
 ]},
 {id:'netbar_parts',npcId:'npc_netbar_boss',locations:['electronics_store'],kind:'errand',title:'买配件的空当',closing:'我得把型号核完，买错还得再跑一趟。咱们回店里再聊。',scripts:[
  short('（拿着配件盒转过身。）正看接口。盒子长得一样，里面倒能差出好几种。你也是来挑东西？','“我随便看看，你先核型号。”','好，省得我聊高兴了，把关键那一行看漏。今天先这样，回店里再说。'),
  short('（看了眼手机上的清单。）少买一根线，整台机器都得等。刚才又想起一项，我先记下来。','“记完再看，别被我打断了。”','嗯，写好了。我还得去问个规格，先不陪你聊了。'),
 ]},
 {id:'kexi_service',npcId:'npc_fan_kexi',locations:['western_restaurant','boyue_western_restaurant'],kind:'work',title:'兼职中的招呼',closing:'谢谢你来找我，不过这边还有事情等着，我得先去忙了。下回再慢慢聊。',scripts:[
  short('（抬头，有些惊讶，又笑了笑。）你怎么来了？我刚在记桌号，差点把你也往空桌那边领。现在正上班，只能说两句。','“我就打个招呼，你先忙。”','好。看见熟人还是挺高兴的，就是刚才脑子里先冒出来一句“几位”。我得回去看看那边，咱们下次再聊。'),
  short('（把托盘放稳，松了口气。）这会儿终于空一点了。你先别站过道，我等会儿还得端东西从这里过去。','“现在做得比刚开始顺了吗？”','顺一点，至少知道先看哪边。还有些事得再确认，我不能一边想一边跟你聊太久。谢谢你问，我先去忙了。'),
 ]},
 {id:'farmer_fishing',npcId:'npc_suburb_farmer',locations:['camping_base'],kind:'focus',title:'湖边等鱼的空当',closing:'我得看着漂，刚才像是动了一下。今天先说这两句，回头再聊。',scripts:[
  short('（把食指竖在唇边，又笑着放下。）是你啊。今天不赶着干活，来湖边坐坐。这鱼比鸡还难招呼，鸡好歹知道饭点。','“那我轻点说，别把你的鱼吓跑了。”','小点声就成，也不全怪说话。我先看着漂，刚才那一下不知道是鱼还是风。今天先不摆长故事了。'),
  short('（抬头认出你，把脚边的小桶挪开。）来，别踢着桶。里面还空着，挪起来倒省力。我刚坐下没多久，想先安静等一会儿。','“那我就打声招呼，你慢慢等。”','好。今天能坐住就算没白来，鱼来了再算另一件好事。我接着看漂，回头到田边再聊。'),
 ]},

];

function build(activity:NpcDialogueActivity,index:number):NpcContextDialogue{
 const script=activity.scripts[index],id=`context_${activity.id}_${index+1}`,intro=`${id}_intro`,reply=`${id}_reply`,bye=`${id}_bye`;
 const speech=(nodeId:string,text:string,options:NpcTalkNode['options']):NpcTalkNode=>({id:nodeId,text,speeches:[{speakerId:activity.npcId,text,portraitText:text}],options});
 return{id,activity,startNodeId:intro,nodes:{
  [intro]:speech(intro,script.opening,[
   {label:script.answer,playerReply:script.answer,affinity:1,next:reply,...(script.benefitId?{dialogueBenefitId:script.benefitId}:{})},
   {label:'“那你先忙，我不打扰了。”',playerReply:'那你先忙，我不打扰了。',affinity:0,next:bye},
  ]),
  [reply]:speech(reply,script.reply,[{label:'结束交流',affinity:0}]),
  [bye]:speech(bye,activity.closing,[{label:'结束交流',affinity:0}]),
 }};
}
export const NPC_CONTEXT_DIALOGUES:Readonly<Record<string,NpcContextDialogue>>=Object.fromEntries(NPC_DIALOGUE_ACTIVITIES.flatMap(activity=>activity.scripts.map((_,i)=>{const scene=build(activity,i);return[scene.id,scene];})));
export function npcDialogueActivity(npcId:string,locationId:string):NpcDialogueActivity|undefined{return NPC_DIALOGUE_ACTIVITIES.find(a=>a.npcId===npcId&&a.locations.includes(locationId));}
export function contextDialogueDayFlag(id:string){return `npc_context_dialogue_day_${id}`;}
export function npcContextDialogueStart(state:GameState,npcId:string):NpcContextDialogue|undefined{
 const activity=npcDialogueActivity(npcId,state.locationId);if(!activity)return;
 const scenes=Object.values(NPC_CONTEXT_DIALOGUES).filter(scene=>scene.activity.id===activity.id);
 if(activity.introCount){
  const count=Math.max(0,Number(state.flags[`npc_context_visits_${activity.id}`])||0);
  if(count<activity.introCount)return scenes[count];
  return scenes[activity.introCount+gameDay(state.time)%(scenes.length-activity.introCount)];
 }
 const offset=((gameDay(state.time)%scenes.length)+scenes.length)%scenes.length;
 return [...scenes.slice(offset),...scenes.slice(0,offset)].find(scene=>typeof state.flags[contextDialogueDayFlag(scene.id)]!=='number');
}
export function recordNpcContextDialogue(state:GameState,id:string):void{
 const scene=NPC_CONTEXT_DIALOGUES[id];
 if(scene?.activity.introCount){
  const key=`npc_context_visits_${scene.activity.id}`;
  const index=Object.values(NPC_CONTEXT_DIALOGUES).filter(s=>s.activity.id===scene.activity.id).findIndex(s=>s.id===id);
  state.flags[key]=Math.max(Number(state.flags[key])||0,Math.min(scene.activity.introCount,index+1));
 }
 state.flags[contextDialogueDayFlag(id)]=gameDay(state.time);
}
