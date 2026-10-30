<script lang="ts">
  import DuelCard from "./DuelCard.svelte";
  import type { GameState } from '../game/types';
  import { gameState } from '../stores/gameStore.svelte';
  import { DUEL_CARDS, getDuelCard } from '../game/core/catDuelCards';
  import { collectionDefId, duelStateOf, deckOf, deckCheck, duelDeckLocked, saveDuelDeck, starterDeck } from '../game/core/catDuelCollection';
  let {session=gameState as GameState,petUid=session.activePet??'',onSaved=()=>{}}: {session?:GameState;petUid?:string;onSaved?:()=>void} = $props();
  let draft=$state<string[]>([]),context=$state(''),notice=$state(''),filter=$state('全部'),search=$state('');
  const data=$derived(duelStateOf(session));
  $effect(()=>{if(context!==petUid){context=petUid;draft=[...deckOf(session,petUid)];notice='';}});
  const valid=$derived(deckCheck(session,draft));
  const locked=$derived(duelDeckLocked(session));
  const selected=$derived(draft.flatMap(uid=>{const c=data.collection.find(c=>c.uid===uid);return c?[{...c,def:getDuelCard(collectionDefId(c))!}]:[];}));
  const groups=$derived(DUEL_CARDS.flatMap(base=>[false,true].flatMap(upgraded=>{
    const copies=data.collection.filter(c=>c.cardId===base.id&&c.upgraded===upgraded);if(!copies.length&&upgraded)return [];
    const def=getDuelCard(base.id+(upgraded?'_plus':''))!;
    if(filter!=='全部'&&filter!==def.family)return [];
    if(search&&!`${def.name}${def.desc}`.includes(search))return [];
    return [{def,copies,owned:copies.length,used:copies.filter(c=>draft.includes(c.uid)).length}];
  })));
  function add(id:string,upgraded:boolean):void{
    const card=data.collection.find(c=>c.cardId===id&&c.upgraded===upgraded&&!draft.includes(c.uid));
    if(!card||locked)return;
    if(draft.length>=20){notice='牌组最多20张。';return;}
    if(selected.filter(c=>c.cardId===id).length>=2){notice='同名普通牌与＋牌合计最多2张。';return;}
    draft=[...draft,card.uid];notice='';
  }
  function save():void{const r=saveDuelDeck(session,petUid,draft);notice=r.ok?'牌组已保存，新卡不会自动加入牌组。':r.reason??'保存失败';if(r.ok)onSaved();}
</script>

<section class="deck-builder" aria-label="共享收藏与出战牌组">
  <div class="deck-summary">
    <div><small>LOADOUT / 出战牌组</small><h3>{session.pets.find(p=>p.uid===petUid)?.name??'猫咪'} · {draft.length}<span> / 12–20 张</span></h3></div>
    <div class="counts"><span>普通 {selected.filter(c=>!c.upgraded).length}</span><span>强化＋ {selected.filter(c=>c.upgraded).length}</span><span>同名上限 2</span></div>
  </div>
  <div class="costs" aria-label="费用分布">{#each [0,1,2,3] as cost}<span>{cost===3?'3＋':cost}费 <b>{selected.filter(c=>cost===3?c.def.cost>=3:c.def.cost===cost).length}</b></span>{/each}</div>
  {#if locked}<p class="notice">当前对决或赛事尚未结束，牌组和强化已锁定。</p>{/if}
  <div class="selected-list" aria-label="当前牌组">
    {#each selected as c (c.uid)}<button class:plus={c.upgraded} disabled={locked} title={`${c.def.desc} 点击从牌组移除，收藏保留。`} onclick={()=>draft=draft.filter(uid=>uid!==c.uid)}><b>{c.def.cost}</b> {c.def.name}<span>−</span></button>{/each}
  </div>
  <div class="deck-actions"><button onclick={()=>draft=starterDeck(data)} disabled={locked}>恢复起始牌组</button><button class="save" onclick={save} disabled={locked||!valid.ok||!petUid}>保存牌组</button><span class:invalid={!valid.ok}>{valid.ok?'牌组合法':valid.reason}</span></div>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  <div class="collection-heading"><div><small>COLLECTION / 所有猫共享</small><h3>卡牌收藏 <span>{new Set(data.collection.map(c=>c.cardId)).size} / 36 种</span></h3></div><input aria-label="搜索卡牌" placeholder="搜索名称或效果" bind:value={search}/></div>
  <div class="filters" aria-label="卡牌打法">{#each ['全部','通用','连击','防反','力量','异常'] as f}<button class:active={filter===f} onclick={()=>filter=f}>{f}</button>{/each}</div>
  <div class="collection-grid">
    {#each groups as group (group.def.id)}
      <article class="collection-card" class:plus={group.def.upgraded} class:unowned={!group.owned}>
        <DuelCard card={group.def}/>
        <footer><span>{group.owned?'已收藏 '+group.owned+' · 已带 '+group.used:'尚未收集'}</span><button aria-label={'加入'+group.def.name} onclick={()=>add(group.def.baseId!,group.def.upgraded)} disabled={locked||group.used>=group.owned||draft.length>=20||selected.filter(c=>c.cardId===group.def.baseId).length>=2}>加入＋</button></footer>
        {#if !group.def.upgraded}<details><summary>查看强化差异</summary><p>{getDuelCard(group.def.id+'_plus')!.desc}</p></details>{/if}
      </article>
    {/each}
  </div>
  {#if Object.keys(data.legacyDecks).length}<details class="legacy"><summary>旧版卡包与强化记录（完整保留）</summary><p>旧品质与强化已映射为普通／＋版。以下原始记录用于追溯，不再叠加战斗倍率；猫咪等级、训练与饰品仍保留在生活档案中。</p>{#each Object.entries(data.legacyDecks) as [uid,cards]}<details><summary>{session.pets.find(p=>p.uid===uid)?.name??uid} · {cards.length} 张旧卡</summary><div>{#each cards as c,i}<span>{i+1}. {c.defId} · {c.uid}</span>{/each}</div></details>{/each}</details>{/if}
</section>

<style>
.deck-builder{color:#e9e3d7;font-size:14px}.deck-summary,.collection-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}small{letter-spacing:2px;color:#a9c7d4;font-size:10px}h3{margin:7px 0 12px;font-size:21px}h3 span{font-size:13px;color:#b2b5b5;font-weight:400}.counts,.costs{display:flex;gap:8px;flex-wrap:wrap}.counts span,.costs span{padding:6px 10px;border:1px solid #ffffff18;border-radius:6px;color:#c8c7bf}.costs{margin-bottom:12px}.costs b{color:#a8d8e5;margin-left:7px}button,input{font:inherit}button{background:#ffffff09;color:#ece5d7;border:1px solid #ffffff20;border-radius:6px;padding:8px 12px;cursor:pointer;min-height:36px}button:hover:not(:disabled){border-color:#a9d9e5;background:#a9d9e519}button:disabled{opacity:.4;cursor:default}.selected-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:7px;margin:12px 0}.selected-list button{display:flex;align-items:center;gap:6px;text-align:left;min-height:40px}.selected-list b{color:#a8d8e5}.selected-list button span{margin-left:auto}.selected-list .plus{border-color:#a7dfd3;color:#c4eee3}.deck-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}.save{background:#8dc3d2;color:#171b23;font-weight:800}.invalid{color:#eda997}.notice{padding:11px;background:#91bfd514;border:1px solid #91bfd555;border-radius:6px}.collection-heading{border-top:1px solid #ffffff18;padding-top:18px}.collection-heading input{background:#101720;border:1px solid #ffffff20;border-radius:7px;padding:10px;color:#eee;max-width:100%;box-sizing:border-box}.filters{display:flex;flex-wrap:wrap;gap:6px;margin:5px 0 20px}.filters .active{background:#85b5cc;color:#121820;border-color:#b5dce4}.collection-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:24px 22px;padding:10px 5px}.collection-card{min-width:0;width:100%;max-width:240px;justify-self:center}.collection-card footer{display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:11px;color:#c4bca8;margin-top:12px}.collection-card footer button{padding:6px 9px}.collection-card details{margin-top:9px;border-top:1px solid #ffffff15;padding-top:8px;color:#b3d6e1;font-size:11px}.collection-card details p{line-height:1.8;margin-top:8px}.unowned{filter:saturate(.25);opacity:.45}.legacy{margin-top:22px;color:#b5b6af;line-height:1.9}.legacy details{margin:10px 0}.legacy details div{display:flex;flex-wrap:wrap;gap:8px}.legacy span{background:#ffffff08;padding:2px 8px;font-size:12px}summary{cursor:pointer}
@media(max-width:600px){.collection-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 12px}.selected-list{grid-template-columns:repeat(2,minmax(0,1fr))}.selected-list button{font-size:12px}.counts{font-size:11px}.deck-actions span{font-size:12px}.collection-heading h3{font-size:19px}.collection-card footer{font-size:10px;flex-wrap:wrap}}
</style>
