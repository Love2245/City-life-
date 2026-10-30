<script lang="ts">
  import type { GameState } from '../game/types';
  import { gameState } from '../stores/gameStore.svelte';
  import { uiState,closeModal } from '../stores/uiStore.svelte';
  import { allOpponents,getBossDef,getOpponentDef,startFunMatch,startBattle,resumeDuelRecovery } from '../game/core/catBattle';
  import { currentOpponentId,enterTournamentArena } from '../game/core/tournament';
  import { duelOpponentProfile } from '../game/core/catDuelCombat';
  import { deckCheck,deckOf } from '../game/core/catDuelCollection';
  import { opponentArt,playerArt,playerBattleScaleX,opponentBattleScaleX } from '../lib/catArt';
  import CatDuelDeck from './CatDuelDeck.svelte';
  import CatDuelReward from './CatDuelReward.svelte';
  let {session=gameState as GameState,practice=false,source='fun',onStart=()=>{uiState.modal='battle';},onClose=()=>closeModal()}: {session?:GameState;practice?:boolean;source?:'fun'|'tournament';onStart?:()=>void;onClose?:()=>void} = $props();
  let tab=$state<'battle'|'deck'|'rules'>('battle'),selectedId=$state('wild_stray'),message=$state('');
  const pet=$derived(session.pets.find(p=>p.uid===session.activePet));
  const recovery=$derived(session.catDuel?.recovery);
  const pendingOpponent=$derived(session.catTournament?.entry&&!session.catTournament.entry.settled?session.catTournament.entry.queue[session.catTournament.entry.roundIndex]:undefined);
  const candidates=$derived(source==='tournament'?([getOpponentDef(currentOpponentId(session)??pendingOpponent??'')].filter(Boolean) as ReturnType<typeof allOpponents>):
    [...allOpponents(),...(practice?[getBossDef()]:[])].filter(o=>practice||((o.minLevel??1)<=(pet?.level??0)&&o.level<=13&&o.tier!=='boss')));
  const opponent=$derived(source==='tournament'?candidates[0]:getOpponentDef(recovery?.opponentId??selectedId)??candidates[0]);
  const valid=$derived(pet?deckCheck(session,deckOf(session,pet.uid)):{ok:false,reason:'请先携带一只猫咪'});
  function start():void{
    if(!opponent){message='请先在城市论坛报名赛事。';return;}
    const result=recovery?resumeDuelRecovery(session):practice?startBattle(session,opponent.id,undefined,{casual:true}):source==='tournament'?enterTournamentArena(session):startFunMatch(session,opponent.id);
    if(!result.ok){message=result.reason??'暂时不能开始对决';return;}onStart();
  }
</script>
<div class="duel-hub hud-scope" role="dialog" aria-modal="true" aria-label="喵喵对决准备">
  <header class="hub-header"><div><small>MEOW DUEL / 喵喵对决</small><h1>出发前，选好你的打法。</h1></div><button class="close" aria-label="关闭对决准备" onclick={onClose}>✕</button></header>
  <nav aria-label="对决准备页签">{#each [['battle','对战准备'],['deck','收藏与组牌'],['rules','玩法说明']] as [id,label]}<button class:active={tab===id} onclick={()=>tab=id as typeof tab}>{label}</button>{/each}<span>{practice?'试玩 · 不影响生活存档':source==='tournament'?'正式赛事':'游乐场娱乐赛'}</span></nav>
  <main>
    {#if session.catDuel?.offer}<CatDuelReward {session}/>
    {:else if tab==='deck'}<CatDuelDeck {session} petUid={pet?.uid??''}/>
    {:else if tab==='rules'}
      <section class="rules"><small>一场对决，一套自己的牌。</small><h2>看懂意图，再决定这一手</h2><p>每场80生命、每回合3能量，抽5张牌。回合结束未出手牌进入弃牌堆；抽牌堆空了会重洗弃牌堆。</p><p>牌组12–20张，同名普通／＋牌合计最多2张。收藏与出战牌组分开，新卡不会自动加入。</p><p>力量增加每段攻击伤害；虚弱让攻击伤害降低25%；易伤让受到的攻击伤害增加50%；卡牌以直接攻击、格挡、力量和破绽为主，不需要计算中毒翻倍或条件连击。</p><p>格挡在自己下回合开始时清除。反击持续到自己下回合开始；消耗牌只退出本场，收藏中的卡牌不会丢失。</p><p>卡牌＋在宠物医院按单张永久强化，每周3次，200／400／600元，各耗1小时。组牌与试打免费。</p><p>连击、防反、力量和削弱敌人可以混搭，每张牌只有一到两项主要效果。猫种、生活等级和饰品不再放大战斗伤害；正式赛事资格和生活奖励沿用原规则。</p><p>敌方意图会提前公布。状态改变可能影响实际伤害，但敌人不会在你出牌后偷偷换招。电脑单击只选中；按住卡牌向上拖到战场，松开鼠标才出牌。拖回手牌或按Esc取消。手机点卡查看，再点击“打出选中牌”。</p><p>每场、包括赛事下一场，都重新获得80生命。试玩开放全部普通卡，不消耗生活时间、不领取收藏或金钱奖励。</p></section>
    {:else}
      {#if recovery}<p class="notice">检测到旧版未结算对决，当前场次可按新规则恢复。不会再次扣门票、时间或次数。</p>{/if}
      <div class="matchup">
        <section class="contender player"><small>你的伙伴</small>{#if pet}{#if playerArt(pet.catId)}<img src={playerArt(pet.catId)} alt={pet.name} style:transform={`scaleX(${playerBattleScaleX(pet.catId)})`}/>{:else}<div class="fallback">{pet.icon}</div>{/if}<h2>{pet.name}</h2><p>统一 80 生命 · 3 能量</p><p>{deckOf(session,pet.uid).length} 张牌 · 普通／＋自由构筑</p>{:else}<h2>先领养并携带一只猫咪</h2>{/if}<button onclick={()=>tab='deck'}>调整出战牌组 →</button></section>
        <div class="versus">VS<span>{source==='tournament'?'赛事场次':'单场对决'}</span></div>
        <section class="contender enemy"><small>下一位对手</small>{#if opponent}{#if opponentArt(opponent.id)}<img src={opponentArt(opponent.id)} alt={opponent.name} style:transform={`scaleX(${opponentBattleScaleX(opponent.id)})`}/>{:else}<div class="fallback">{opponent.icon}</div>{/if}<h2>{opponent.name}</h2><p>{duelOpponentProfile(opponent).hp} 生命 · {opponent.tier==='boss'||opponent.id==='roundhead'?'首领':opponent.tier==='intermediate'?'进阶':'普通'}挑战</p><p>{opponent.desc}</p>{:else}<h2>尚未报名赛事</h2><p>先在城市论坛报名，再按比赛日入场。</p>{/if}</section>
      </div>
      {#if source!=='tournament'&&!recovery}<div class="opponent-picker"><label for="duel-opponent">选择对手</label><select id="duel-opponent" bind:value={selectedId}>{#each candidates as o}<option value={o.id}>{o.name} · {duelOpponentProfile(o).hp}生命</option>{/each}</select></div>{/if}
      <div class="start-line"><div><b>{practice?'自由试打，不领取奖励':source==='tournament'?'开赛后锁定猫咪与牌组':'每场30分钟 · 每日3场'}</b><p>{practice?'试玩里的收藏、强化与配牌均不写入生活存档。':source==='tournament'?'三场连胜夺冠，每场重新开始。门票与赛事奖励沿用原规则。':'胜利获得经验、生活养成奖励与三选一普通卡；失败不受伤。'}</p></div><button class="start" onclick={start} disabled={!valid.ok||!opponent}>{recovery?'恢复当前对决':source==='tournament'?'进入赛事':'开始对决'} →</button></div>
      {#if !valid.ok}<p class="notice">{valid.reason}</p>{/if}{#if message}<p class="notice" role="status">{message}</p>{/if}
    {/if}
  </main>
</div>
<style>
  .duel-hub{position:fixed;inset:0;z-index:135;background:radial-gradient(ellipse at 80% 0,#32403e70,transparent 55%),#101821;color:#ece6d7;display:flex;flex-direction:column;padding:max(20px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom));box-sizing:border-box;font-family:inherit}.hub-header{display:flex;align-items:center;justify-content:space-between;gap:15px;border-bottom:1px solid #ffffff17;padding-bottom:18px}small{font-size:10px;letter-spacing:3px;color:#aacddd}h1{font-size:clamp(20px,2.2vw,31px);margin:9px 0 0;font-weight:650}.close{width:38px;height:38px;padding:0}button,select{font:inherit;border:1px solid #ffffff25;border-radius:7px;background:#ffffff08;color:#eae3d6;cursor:pointer;padding:10px 15px}button:disabled{opacity:.4;cursor:default}button:hover:not(:disabled){border-color:#b3d9e4}nav{display:flex;align-items:center;gap:8px;padding:16px 0;flex-wrap:wrap}nav .active{border-color:#8ab9cc;background:#83b8cf24;color:#d8edf2}nav span{margin-left:auto;color:#9fa9ab;font-size:12px}main{overflow:auto;min-height:0;flex:1;padding-right:6px;scrollbar-color:#8c8266 transparent}.matchup{display:grid;grid-template-columns:1fr 80px 1fr;max-width:1100px;margin:0 auto;align-items:center}.contender{min-width:0;display:flex;align-items:center;flex-direction:column;text-align:center;padding:16px 20px}.contender img{width:min(240px,100%);height:clamp(100px,24vh,250px);object-fit:contain;filter:drop-shadow(0 16px 20px #0008);margin:12px 0}.contender h2{font-size:24px;margin:10px 0}.contender p{font-size:12px;color:#acb5b4;line-height:1.6;margin:5px 0;max-width:400px}.contender button{margin-top:10px}.versus{text-align:center;font-family:Georgia,serif;font-size:32px;color:#b9d7e2}.versus span{display:block;font-family:inherit;font-size:10px;letter-spacing:1px;margin-top:8px}.opponent-picker{display:flex;justify-content:center;gap:14px;align-items:center;font-size:13px;margin:12px 0}.opponent-picker select{background:#1d2931;max-width:65%;color:#eee}.start-line{max-width:1100px;border-top:1px solid #ffffff1b;margin:16px auto 0;padding:20px 8px;display:flex;align-items:center;justify-content:space-between;gap:18px}.start-line b{font-size:14px}.start-line p{font-size:12px;color:#a8b2b1;line-height:1.7}.start{background:#a8d4de;color:#151e23;font-weight:800;padding:14px 27px;white-space:nowrap}.rules{max-width:800px;margin:30px auto;line-height:1.9}.rules h2{font-size:27px}.rules p{padding:12px 0;border-bottom:1px solid #ffffff10;color:#c5ceca}.notice{background:#91c6d314;border:1px solid #88bbc066;padding:12px;color:#d8e8ed;font-size:13px}.fallback{font-size:90px;margin:25px}
  @media(max-width:650px){.duel-hub{padding:14px 12px}.hub-header{padding-bottom:12px}nav{gap:5px;padding:10px 0}nav button{padding:8px 10px;font-size:12px}nav span{font-size:10px}.matchup{grid-template-columns:1fr 36px 1fr}.contender{padding:12px 4px}.contender h2{font-size:18px}.contender img{height:150px}.versus{font-size:23px}.versus span{font-size:8px}.start-line{padding:14px 0;align-items:stretch;flex-direction:column;gap:5px}.start-line p{margin:6px 0}.contender p{font-size:11px}.contender button{padding:8px;font-size:11px}.rules{margin:15px 0}}
  @media(max-height:600px) and (min-width:650px){.duel-hub{padding:10px 22px}.hub-header{padding-bottom:9px}.hub-header h1{font-size:20px;margin-top:5px}nav{padding:9px 0}nav button{padding:7px 12px}.contender{padding:0 15px}.contender img{height:100px;margin:5px 0}.contender h2{font-size:18px;margin:4px 0}.contender p{margin:2px 0}.contender button{padding:6px 10px}.start-line{padding:9px 5px;margin-top:8px}.opponent-picker{margin:5px 0}}
</style>
