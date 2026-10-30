import type {GameState} from '../types';
import type {NpcTalkOption} from '../core/npcs';
import {getNpcDef,npcAtLocation} from '../core/npcs';
import {findRelationship} from '../core/relationships';
import {weekdayOf} from '../core/calendar';
import type {NpcSpeech} from '../core/npcDialoguePlayback';
import {npcOrdinaryAppearanceUnlocked} from './npcIntroductionProgress';

export interface NpcGroupNode {id:string;speeches:readonly NpcSpeech[];options:NpcTalkOption[]}
export interface NpcGroupScene {id:string;title:string;participants:readonly string[];locationId:string;regionId:string;description:string;start:string;nodes:Record<string,NpcGroupNode>}
const sister='npc_fan_kexi',brother='npc_fan_kejie';

/** A small shared scene, available from either sibling only when both are present. */
const authoredScenes:readonly NpcGroupScene[]=[{
  id:'fan_siblings_supper',title:'一张小桌，三个人',participants:[sister,brother],locationId:'dev_food_street',regionId:'development_university',
  description:'珂汐和柯杰在同一张小桌旁，招呼你一起聊一会儿。',start:'table',
  nodes:{
    table:{id:'table',speeches:[
      {speakerId:null,text:'你走到小桌旁，两人把放在空椅上的东西收了收，给你腾出一个位置。'},
      {speakerId:sister,text:'（微笑，把帆布包收到膝上）这边还有位置。要是不赶时间，就坐一会儿吧。'},
      {speakerId:brother,text:'（笑着挪开椅子）正好。她刚才还说，我一个人能把两个人的话都说完。'},
      {speakerId:sister,text:'（无奈地看了他一眼）我说的是，吃东西的时候不用急着回答。'},
    ],options:[
      {label:'坐一会儿，聊聊今天的事',playerReply:'那我坐一会儿。你们今天过得怎么样？',next:'today'},
      {label:'问问他们最近各自在忙什么',playerReply:'最近都在忙些什么？看你们带了不少东西。',next:'plans'},
      {label:'你们慢慢吃，我先走了',leave:true},
    ]},
    today:{id:'today',speeches:[
      {speakerId:sister,text:'（思考）今天练习给小朋友讲故事。讲得太快，他们跟不上；讲得太慢，又容易走神。'},
      {speakerId:brother,text:'（微笑）她回来对着我练了一遍。我本来想帮忙挑问题，结果先听完了。'},
      {speakerId:sister,text:'（有些害羞）因为你一直没说话，我还以为你没在听。'},
      {speakerId:brother,text:'（认真地点头）在听。有些地方留一点空，让人想一想，挺好的。唱歌也是。'},
    ],options:[{label:'认真听着，有时候就是最好的回应',playerReply:'我也觉得，认真听着，有时候就是最好的回应。',next:'goodbye'},{label:'今天先歇会儿，别把吃饭也变成练习',playerReply:'今天先歇一会儿吧，别把吃饭也变成练习了。',next:'goodbye'}]},
    plans:{id:'plans',speeches:[
      {speakerId:brother,text:'（指了指包边的谱夹）整理几首常唱的歌。总唱熟悉的也不行，得留一点时间练新的。'},
      {speakerId:sister,text:'（微笑）我在准备试讲的材料。他帮我听节奏，我帮他把写得太小的歌词重新抄一份。'},
      {speakerId:brother,text:'（有些不好意思）主要是自己写的时候觉得看得清，一放远就全糊了。'},
      {speakerId:sister,text:'（轻轻笑了）所以我们今天说好，东西先收起来，把这顿饭好好吃完。'},
    ],options:[{label:'那就把这一会儿留给吃饭和聊天',playerReply:'那就把这一会儿留给吃饭和聊天。忙的事等会儿再说。',next:'goodbye'}]},
    goodbye:{id:'goodbye',speeches:[
      {speakerId:sister,text:'（微笑）嗯。像这样坐着聊一会儿，回去做事也没那么紧绷。'},
      {speakerId:brother,text:'（笑着点头）下次碰上也过来坐。三个人聊，总能聊出点不一样的。'},
    ],options:[{label:'那就说好了，下次见',playerReply:'那就说好了，下次见。'}]},
  },
}];

// Actor directions control their own portrait, while the shared dialogue box
// displays the spoken sentence. Narration remains an explicit separate beat.
export const NPC_GROUP_SCENES:readonly NpcGroupScene[]=authoredScenes.map(scene=>({...scene,nodes:Object.fromEntries(Object.entries(scene.nodes).map(([id,node])=>[id,{...node,speeches:node.speeches.map(speech=>speech.speakerId?{...speech,portraitText:speech.portraitText??speech.text,text:speech.text.replace(/^（[^）]*）\s*/,'')}:speech)}]))}));

export function npcGroupScene(id:string|undefined):NpcGroupScene|undefined{return NPC_GROUP_SCENES.find(s=>s.id===id);}
export function npcGroupDayFlag(id:string):string{return `npc_group_dialogue_day_${id}`;}
export function npcGroupSceneAvailable(state:GameState,scene:NpcGroupScene,entryNpcId:string):boolean{
  if(!scene.participants.includes(entryNpcId)||state.locationId!==scene.locationId||state.region!==scene.regionId||typeof state.flags[npcGroupDayFlag(scene.id)]==='number')return false;
  const time={...state.time,seed:state.rng.seed,weekday:weekdayOf(state.time),regionId:state.region};
  return scene.participants.every(id=>{const relation=findRelationship(state,id),def=getNpcDef(id);return npcOrdinaryAppearanceUnlocked(state,id)&&!!relation&&relation.state!=='blocked'&&!!def&&npcAtLocation(def,state.locationId,time);});
}
export function availableNpcGroupScenes(state:GameState,npcId:string):readonly NpcGroupScene[]{return NPC_GROUP_SCENES.filter(scene=>npcGroupSceneAvailable(state,scene,npcId));}
