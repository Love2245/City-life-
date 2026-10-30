<script lang="ts">
 import CulinaryScene from './CulinaryScene.svelte';
 import {cocktailIngredientArt,cocktailGlassArt} from '../../../lib/restaurantPresentation';
 import {craftLabel,craftHint,craftBusy,cookingMethod,plateIngredients,type CraftKind,type CraftState} from '../../../lib/restaurantCraft';
 let {kind,scene='cafe',craftState,ids,recipe,names,title,heat=0,correct,onAction,onFlip,onPlace}:{kind:CraftKind;scene?:string;craftState:CraftState;ids:string[];recipe:string[];names:Record<string,string>;title:string;heat?:number;correct:boolean;onAction:()=>void;onFlip:()=>void;onPlace:(x?:number,y?:number)=>void}=$props();
 const phases=$derived(kind==='cocktail'?['配料',recipe.includes('ice')?'加冰':'净杯',recipe.includes('gin')?'摇匀':'轻搅','装饰']:kind==='coffee'?['备料',recipe.includes('espresso')?'萃取':'泡茶','出杯']:kind==='bar'?['调饮','混合','封杯']:kind==='western'?['备料','烹调','摆盘']:recipe.includes('wrap')?['备料','煎制','卷饼']:recipe.includes('box')?['备料','翻炒','装盒']:['串料','炭烤','刷酱']);
 const index=$derived(kind==='cocktail'?craftState.phase==='prep'?craftState.measured?1:0:craftState.phase==='cook'?2:3:craftState.phase==='prep'?0:craftState.phase==='cook'?1:2);
 const gauge=$derived(kind==='grill'?heat:craftState.progress);
 const busy=$derived(craftBusy(craftState));
 const next=$derived(plateIngredients(recipe)[craftState.placed.length]);
</script>
<div class="culinary-station" data-craft-kind={kind} data-production-phase={craftState.phase} data-motion={craftState.animation} aria-busy={busy||craftState.running}>
 <div class="phase-rail" aria-label="制作工位">{#each phases as phase,i}<span class:active={i===index} class:passed={i<index||craftState.phase==='done'}><i>{i<index||craftState.phase==='done'?'✓':i+1}</i>{phase}</span>{/each}<b>{craftState.phase==='done'?'成品就绪':busy?'动作进行中':title}</b></div>
 <div class="station-visual">{#if kind==='cocktail'}
  <svg class="cocktail-station" viewBox="0 0 660 280" role="img" aria-label={`${title}调酒工位`} data-art-part="cocktail-workbench">
   <defs><linearGradient id="cocktail-steel" x2="1" y2="0"><stop stop-color="#7b858e"/><stop offset=".5" stop-color="#e8e7db"/><stop offset="1" stop-color="#7b858e"/></linearGradient></defs>
   <rect width="660" height="280" fill="#363247"/><path d="M0 208H660V280H0Z" fill="#8f6c57"/><path d="M0 214H660" stroke="#d6b18a" stroke-width="6"/>
   <text x="22" y="25" fill="#eadbb7" font-size="14">酒单 · {title}</text>
   {#each ids.filter(id=>id!=='cup') as id,i}<g transform={`translate(${15+i*43} 83) scale(.48)`}>{@html cocktailIngredientArt(id)}</g>{/each}
   <g class:mixing={craftState.motionLeft>0&&craftState.animation==='shake'} transform="translate(304 24)"><path d="M-44 89H37L28 177H-32Z" fill="url(#cocktail-steel)" stroke="#e4d3b6" stroke-width="3"/><path d="M-35 89l8-28H21l8 28Z" fill="#b8bdbe" stroke="#e4d3b6" stroke-width="3"/><path d="M-22 59V46H16V59" fill="#8f9b9e" stroke="#e4d3b6" stroke-width="3"/><path d="M-23 97l-4 60" stroke="#fff" opacity=".5" stroke-width="7"/></g>
   <g transform="translate(391 62) scale(1.18)">{@html cocktailGlassArt(ids,craftState.phase==='finish'||craftState.phase==='done',craftState.phase==='done')}</g>
   <g transform="translate(550 116)"><path d="M0 9H50L41 83H9Z" fill="#a0b2b3" stroke="#e9d9c0" stroke-width="3"/><path d="M12 18h24M10 39h29" stroke="#eff1e2" stroke-width="4"/></g>
   <text x="258" y="247" fill="#f9e6c7" font-size="13">调酒器</text><text x="438" y="247" fill="#f9e6c7" font-size="13">出杯与装饰</text><text x="552" y="247" fill="#f9e6c7" font-size="13">量酒器</text>
  </svg>
 {:else}<CulinaryScene {kind} {scene} {craftState} {ids} {recipe} {title} {heat} {onPlace}/>{/if}</div>
 <div class="craft-dashboard">
  {#if kind==='grill'||craftState.running&&!(craftState.phase==='finish'&&kind!=='bar')||craftState.phase==='cook'}
   <div class="craft-gauge" aria-label={`制作进度 ${Math.round(gauge)}%`}><i style={`left:${kind==='grill'?65:55}%;width:${kind==='grill'?25:35}%`}></i><span style={`width:${gauge}%`}></span><b>{Math.round(gauge)}%</b></div>
  {/if}
  <div class="craft-hint">{!correct?'按下方清单备齐原料，再开始制作':busy?craftState.animation==='plate'?`正在放入 ${names[craftState.placed[craftState.placed.length-1]?.id??'']}…`:craftState.animation==='lift'?'正在移至出餐台…':craftState.animation==='flip'?'正在翻面…':'正在完成当前动作…':craftHint(kind,craftState,recipe,heat)}</div>
  <div class="craft-actions">
   {#if kind==='grill'||kind==='western'&&cookingMethod(recipe)==='sear'&&craftState.phase==='cook'}<button type="button" class="craft-flip" disabled={!correct||busy||craftState.flipped||craftState.phase==='finish'||craftState.phase==='done'} onclick={onFlip}>{craftState.flipped?'✓ 已翻面':recipe.includes('box')?'翻炒':'翻面'}</button>{/if}
   <button type="button" class="craft-primary" disabled={!correct||busy||craftState.phase==='done'||craftState.running&&craftState.phase==='finish'&&kind!=='bar'} onclick={onAction}>{busy?'动作进行中…':kind==='western'&&craftState.phase==='finish'?`摆放 ${names[next]??'菜品'}`:craftState.running&&craftState.phase==='finish'&&kind!=='bar'?'正在收尾…':craftLabel(kind,craftState,recipe)}</button>
   {#if kind==='western'&&craftState.phase==='finish'}<span class="placement-counter">{craftState.placed.length}/{plateIngredients(recipe).length}</span>{/if}
  </div>
 </div>
</div>
<style>
 .cocktail-station{position:absolute;inset:0;width:100%;height:100%;}.mixing{animation:cocktail-shake .18s ease-in-out infinite;transform-box:fill-box;transform-origin:center;}@keyframes cocktail-shake{0%,100%{rotate:-7deg;translate:-4px 0}50%{rotate:7deg;translate:4px -3px}}
 .culinary-station{width:100%;flex:1;min-height:230px;display:flex;flex-direction:column;border:1px solid color-mix(in srgb,var(--shop-border) 45%,white);border-radius:10px;background:var(--shop-paper);overflow:hidden;}
 .phase-rail{display:flex;align-items:center;gap:12px;padding:6px 12px;min-height:21px;flex-shrink:0;background:var(--shop-soft);color:var(--shop-ink);font-size:11px;border-bottom:1px solid #79573925;}
 .phase-rail span{display:flex;align-items:center;gap:5px;opacity:.5;}.phase-rail .active,.phase-rail .passed{opacity:1;}.phase-rail i{display:grid;place-items:center;font-style:normal;background:#fff8;width:18px;height:18px;border-radius:50%;}.phase-rail .active i{background:var(--shop-accent);color:white;}.phase-rail b{margin-left:auto;max-width:30%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px;}
 .station-visual{flex:1;min-height:120px;display:flex;align-items:center;justify-content:center;background:var(--shop-soft);position:relative;}.station-visual :global(.culinary-scene){position:absolute;inset:0;}
 .craft-dashboard{padding:8px 12px 9px;background:var(--shop-paper);border-top:1px solid #876e492e;flex-shrink:0;}
 .craft-gauge{height:10px;border:1px solid #a79875;border-radius:20px;position:relative;background:#dfd5b9;overflow:hidden;margin-bottom:5px;}.craft-gauge i{position:absolute;top:0;height:100%;background:#edc276;}.craft-gauge span{position:absolute;inset:0 auto 0 0;background:#789b6b88;transition:width .1s linear;}.craft-gauge b{position:absolute;inset:0;display:grid;place-items:center;font-size:8px;color:#453d33;line-height:10px;}
 .craft-hint{font-size:11px;line-height:1.4;min-height:16px;text-align:center;color:var(--shop-ink);}.craft-actions{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:5px;}.craft-actions button{border:1px solid var(--shop-border);border-radius:7px;padding:6px 19px;min-height:32px;font-family:inherit;cursor:pointer;font-size:12px;font-weight:600;}.craft-primary{background:var(--shop-accent);color:#fff9e9;}.craft-flip{background:var(--shop-soft);color:var(--shop-ink);}.craft-actions button:disabled{opacity:.48;cursor:default;}.placement-counter{font-size:11px;color:var(--shop-ink);}
 @media(max-height:560px) and (orientation:landscape){.culinary-station{min-height:150px;}.phase-rail{font-size:9px;min-height:15px;padding:3px 8px;gap:7px;}.phase-rail i{width:14px;height:14px;}.station-visual{min-height:90px;}.craft-dashboard{padding:4px 8px;}.craft-hint{font-size:9px;min-height:12px;}.craft-actions{margin-top:3px;}.craft-actions button{min-height:26px;padding:3px 12px;font-size:10px;}.craft-gauge{height:8px;margin-bottom:3px;}}
 @media(max-height:560px) and (orientation:landscape){
  .culinary-station{display:grid;grid-template-columns:minmax(0,1fr) 140px;grid-template-rows:22px minmax(0,1fr);min-height:180px;box-sizing:border-box;}
  .phase-rail{grid-column:1/-1;box-sizing:border-box;min-height:0;padding:3px 8px;}
  .phase-rail b{max-width:28%;}.station-visual{min-height:0;grid-column:1;grid-row:2;}
  .craft-dashboard{grid-column:2;grid-row:2;min-width:0;border-top:0;border-left:1px solid #876e492e;display:flex;flex-direction:column;justify-content:center;padding:5px 7px;}
  .craft-actions{flex-direction:column;gap:3px;}.craft-actions button{width:100%;padding:3px 6px;}.craft-hint{font-size:9px;min-height:0;line-height:1.3;}.placement-counter{display:none;}
 }
</style>

