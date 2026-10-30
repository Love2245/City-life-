import type {ConversationEffects,GameState} from '../types';
import type {NpcTalkNode} from '../core/npcs';
import {gameDay} from '../core/calendar';

export interface NpcDialogueBenefit {
  npcId:string;
  effects:ConversationEffects;
  summary:string;
  /** 小份食物每天只领一次；纪念物等一次性赠礼可使用 once。 */
  frequency:'day'|'once';
}
export const NPC_DIALOGUE_BENEFITS:Readonly<Record<string,NpcDialogueBenefit>>={
  lin_mint:{npcId:'npc_lin_xiaoyu',effects:{items:{mint_candy:1}},summary:'你收下了林小雨给的薄荷糖，放进背包。',frequency:'day'},
  chen_apple:{npcId:'npc_chen_jie',effects:{items:{fruit:1}},summary:'你收下陈姐给的一枚苹果，放进背包，留着洗好再吃。',frequency:'day'},
  wang_bun:{npcId:'npc_wang_lei',effects:{satiety:10,mood:1},summary:'你吃了王磊分给你的萝卜包子，垫了垫肚子。',frequency:'day'},
  netbar_cookie:{npcId:'npc_netbar_boss',effects:{satiety:4,mood:2},summary:'你吃了一块网咖老板的饼干，在旁边安静地坐了一会儿。',frequency:'day'},
  zhao_bun:{npcId:'npc_zhao_gang',effects:{satiety:8,mood:1},summary:'你吃了赵刚分给你的一个馒头，稍微垫了垫肚子。',frequency:'day'},
  zhao_noodles:{npcId:'npc_zhao_gang',effects:{satiety:8,mood:1},summary:'你吃了赵刚分给你的一小碟热面。',frequency:'day'},
  ma_soup:{npcId:'npc_snack_street_vendor',effects:{satiety:3,mood:1},summary:'你尝了马师傅递来的一小碗热汤。',frequency:'day'},
  ma_tasting:{npcId:'npc_snack_street_vendor',effects:{satiety:6,mood:1},summary:'你尝了马师傅请你试吃的一小份新出锅小吃。',frequency:'day'},
  farmer_fruit:{npcId:'npc_suburb_farmer',effects:{satiety:5,mood:1},summary:'你尝了陈守田洗好的果子，清甜的果汁润了润嗓子。',frequency:'day'},
  wang_stretch:{npcId:'npc_wang_lei',effects:{stress:-1},summary:'你跟着王磊活动了几下肩颈，身体放松了一些。',frequency:'day'},
};
function key(id:string){return `npc_dialogue_benefit_${id}`;}
export function npcDialogueBenefitClaimed(state:Pick<GameState,'flags'|'time'>,id:string):boolean{
  const benefit=NPC_DIALOGUE_BENEFITS[id];
  return !!benefit&&(benefit.frequency==='once'?state.flags[key(id)]===true:state.flags[key(id)]===gameDay(state.time));
}
export function recordNpcDialogueBenefit(state:GameState,id:string):void{
  const benefit=NPC_DIALOGUE_BENEFITS[id];
  if(benefit)state.flags[key(id)]=benefit.frequency==='once'?true:gameDay(state.time);
}
/** 将已经逐段核对的赠物绑定到明确的接受分支；不靠关键词自动发奖励。 */
export function attachLiteraryDialogueBenefits(npcId:string,sceneId:string,nodes:NpcTalkNode[]):void{
  const root=nodes.find(node=>node.id.endsWith('_intro'));
  const contracts:Record<string,[string,string]>={
    'npc_lin_xiaoyu/reset_daily_acquaintance_d03':['“要，谢谢。”','lin_mint'],
    'npc_zhao_gang/reset_daily_acquaintance_d01':['“还没，那我拿一个。”','zhao_bun'],
    'npc_chen_jie/reset_daily_close_friend_d10':['“好，我正想吃。”','chen_apple'],
    'npc_wang_lei/reset_daily_close_friend_d10':['“要。皮好像厚了一点。”','wang_bun'],
  };
  const contract=contracts[`${npcId}/${sceneId}`];
  if(contract){
    const option=root?.options.find(option=>option.label===contract[0]);
    if(!option)throw new Error(`Dialogue benefit accept branch missing: ${npcId}/${sceneId}`);
    option.dialogueBenefitId=contract[1];
  }
  if(npcId==='npc_netbar_boss'&&sceneId==='reset_daily_close_friend_d10'){
    const offer=nodes.find(node=>node.id.endsWith('_choice_1'));
    if(!offer)throw new Error('Cookie offer branch missing');
    offer.options=[
      {label:'拿一块饼干尝尝。',playerReply:'那我尝一块，谢谢。',affinity:0,dialogueBenefitId:'netbar_cookie'},
      {label:'谢谢，我坐一会儿就好。',playerReply:'谢谢，我先不吃，在这儿坐一会儿就好。',affinity:0},
    ];
  }
}
