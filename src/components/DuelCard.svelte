<script lang="ts">
  import type {DuelCardDef} from '../game/catDuelTypes';
  import {printedCardRules} from '../lib/catDuelPresentation';
  import DuelCardArt from './DuelCardArt.svelte';
  let {card,hint=''}=$props<{card:DuelCardDef;hint?:string}>();
  const lines=$derived(printedCardRules(card));
  const type=$derived(card.type==='attack'?'攻击':card.type==='defend'?'防御':'技能');
</script>
<div class="duel-card-face type-{card.type}" class:upgraded={card.upgraded} data-card={card.id}>
  <div class="frame-inset"></div><div class="frame-corner corner-top"></div><div class="frame-corner corner-bottom"></div>
  <div class="card-top"><span class="name-ribbon"><strong>{card.name}</strong></span><b class="cost-gem" aria-label={`${card.cost}能量`}>{card.cost}</b></div>
  <div class="illustration-window"><DuelCardArt {card}/></div>
  <div class="type-ribbon"><span>{type}</span><i></i><span>{card.family}</span></div>
  <div class="rules-parchment"><div class="printed-rules">{#each lines as line}<p>{#each line.split(/(\d+)/g) as token}{#if /^\d+$/.test(token)}<b>{token}</b>{:else}{token}{/if}{/each}</p>{/each}</div>
    {#if hint}<div class="actual">{hint}</div>{/if}
    {#if card.effect.exhaust}<span class="exhaust-seal">消耗</span>{/if}
  </div>
  <span class="card-signature">MEOW DUEL <i>◆</i> {card.upgraded?'强化＋':'普通'}</span>
</div>
<style>
.duel-card-face{--accent:#cc7669;--edge:#e5b3a5;--ink:#203748;position:relative;width:100%;aspect-ratio:200/292;container-type:inline-size;isolation:isolate;box-sizing:border-box;overflow:visible;background:linear-gradient(145deg,#e0d4c8,var(--accent) 5%,#263c50 24%,#1c2c3c 92%,var(--accent));border:1px solid var(--edge);border-radius:6% 6% 5% 5%;box-shadow:inset 0 0 0 3px #162a3a55,2px 4px 0 #0f2130,0 8px 14px #07142355;color:var(--ink);text-align:center;font-family:Georgia,'Noto Serif SC','SimSun',serif;line-height:1.4;text-shadow:none;user-select:none}
.type-defend{--accent:#66aaba;--edge:#b0dbe0}.type-skill{--accent:#9b8ac2;--edge:#d0c3e8}.upgraded{border-color:#bfe5d5;box-shadow:inset 0 0 0 3px #b4e5d433,2px 4px 0 #0f2130,0 8px 16px #07142366}
.frame-inset{position:absolute;inset:2.2%;border:1px solid var(--edge);border-radius:5%;z-index:2;pointer-events:none}.frame-corner{display:none}.card-top{position:absolute;top:3.4%;left:5%;right:5%;height:11.5%;z-index:6;display:flex;align-items:center;justify-content:center}.name-ribbon{display:flex;align-items:center;justify-content:center;width:100%;height:88%;background:linear-gradient(#fff9ef,#e9e3d7);border:1px solid #ffffffbb;border-radius:9% 9% 4% 4%;box-shadow:0 2px 4px #14263944}.name-ribbon strong{font-size:7.1cqw;white-space:nowrap;font-weight:800;letter-spacing:.3px;padding-left:3%;color:#243c4b}.upgraded .name-ribbon strong{color:#277267}.cost-gem{position:absolute;left:-8%;top:-12%;width:20%;aspect-ratio:1;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle at 30% 22%,#d7ecee,var(--accent) 42%,#2b485c 95%);border:2px solid #f1eee2;outline:1px solid #1c3347;box-shadow:0 2px 5px #09223866;color:#fffdf4;text-shadow:0 1px 2px #163448;font-size:11cqw;font-weight:800;line-height:1}
.illustration-window{position:absolute;top:15.5%;left:8%;right:8%;height:41%;overflow:hidden;border:1px solid var(--edge);border-bottom:0;border-radius:4% 4% 0 0;background:#1b3046;box-shadow:inset 0 3px 8px #08152866}.type-ribbon{position:absolute;top:55.1%;left:6.5%;right:6.5%;height:6.7%;display:flex;align-items:center;justify-content:center;gap:6%;background:var(--accent);border:1px solid var(--edge);z-index:5;color:#122d3c;font-size:5.1cqw;font-weight:700;letter-spacing:1px}.type-ribbon i{display:block;width:3px;height:3px;background:#f5f4e7;transform:rotate(45deg)}.rules-parchment{position:absolute;left:8%;right:8%;top:60.5%;bottom:7.3%;background:linear-gradient(145deg,#fbf7ed,#eee9dc);border:1px solid #f8f6ed;border-top:0;box-shadow:inset 0 -6px 12px #c5d0cd22;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3% 4% 2%;box-sizing:border-box;border-radius:0 0 4% 4%}.printed-rules{font-size:6.5cqw;line-height:1.65;width:100%;letter-spacing:.05px}.printed-rules p{margin:0 0 1.5%}.printed-rules b{font-weight:800;color:#ac514a}.upgraded .printed-rules b{color:#247365}.actual{font-family:system-ui,sans-serif;font-size:4.9cqw;line-height:1.4;border-top:1px solid #749aa640;margin-top:3%;padding-top:3%;color:#326b7d;font-weight:700;width:100%}.exhaust-seal{font-size:4.5cqw;letter-spacing:1px;color:#607183;border:1px solid #829eac88;border-radius:3px;padding:0 4%;margin:2% auto 0}.card-signature{position:absolute;bottom:1.9%;left:9%;right:9%;font-family:Georgia,serif;font-size:3.3cqw;letter-spacing:1.5px;color:#c4d7df;display:flex;justify-content:center;gap:7%;z-index:5}.card-signature i{font-style:normal;color:var(--accent)}
</style>
