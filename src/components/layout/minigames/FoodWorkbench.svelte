<script lang="ts">
  import FoodArt from './FoodArt.svelte';
  import BurgerStack from './BurgerStack.svelte';
  let { mode, ids, names, title, heat = 0 }: { mode: string; ids: string[]; names: Record<string,string>; title: string; heat?: number } = $props();
  const colors: Record<string,string> = {espresso:'#563020',coffee:'#563020',tea:'#b16e2d',milk:'#f8e8cc',foam:'#fff9e8',caramel:'#c68a38',choco:'#61392d',hot_water:'#b2d8df',sugar:'#d4ad66'};
  const liquids = $derived(ids.filter(id=>colors[id]));
  function mixHex(base: string, tint: string, amount: number): string {
    const channels = [0, 2, 4].map((offset) => {
      const original = Number.parseInt(base.slice(offset + 1, offset + 3), 16);
      const target = Number.parseInt(tint.slice(offset + 1, offset + 3), 16);
      return Math.round(original * (1 - amount) + target * amount).toString(16).padStart(2, '0');
    });
    return `#${channels.join('')}`;
  }
  function blendLiquidColors(ids: string[]): string {
    if (!ids.length) return '#563020';
    const channels = [0, 2, 4].map((offset) => {
      const total = ids.reduce((sum, id) => sum + Number.parseInt(colors[id].slice(offset + 1, offset + 3), 16), 0);
      return Math.round(total / ids.length).toString(16).padStart(2, '0');
    });
    return `#${channels.join('')}`;
  }
  const liquidColor = $derived(blendLiquidColors(liquids));
  const liquidTop = $derived(mixHex(liquidColor, '#fff6e8', 0.26));
  const liquidDeep = $derived(mixHex(liquidColor, '#14202a', 0.2));
  const liquidHeight = $derived(Math.min(78, 20 + liquids.length * 14));
  const cup = $derived(mode==='cup');
  const burger = $derived(mode==='burger');
  const grill = $derived(mode==='grill');
  const plated = $derived(ids.filter(id=>!['plate','box','skewer','wrap','sauce','chili'].includes(id)));
  const wrapped = $derived(grill && ids.includes('wrap'));
  const boxed = $derived(grill && ids.includes('box'));
</script>
<div class="workbench" class:cup class:burger class:grill aria-label={`${title}，已加入${ids.map(id=>names[id]||id).join('、')||'无原料'}`}>
  <div class="station-name">{cup?'萃取 · 注液':burger?'汉堡备餐 · 由下到上':grill?'炭火 · 烤制':'分区 · 摆盘'}</div>
  {#if cup}
    <div class="machine"><i></i><i></i><span>BAR</span></div>
    <div class="glass">
      {#if liquids.length}<div class="fill liquid" data-liquid-color={liquidColor} style={`--liquid-top:${liquidTop};--liquid-base:${liquidColor};--liquid-deep:${liquidDeep};height:${liquidHeight}%`}><span class="liquid-gloss" aria-hidden="true"></span></div>{/if}
      {#if ids.includes('foam')}<div class="milk-foam" style={`bottom:${liquidHeight - 9}%`}></div>{/if}
      {#if ids.includes('pearl')}<div class="pearls">{#each Array(10) as _,i}<i style={`left:${8+i*8}%;bottom:${6+(i%2)*8}px`}></i>{/each}</div>{/if}
      {#if ids.includes('ice')}<div class="ice"><FoodArt id="ice" label="浮冰"/></div>{/if}
      <div class="glass-shine"></div>
    </div>
    {#key ids.length}{#if liquids.length}<div class="pour" style={`--liquid:${liquidColor}`}></div>{/if}{/key}
  {:else if burger}
    <div class="burger-plate"></div><div class="burger-layers"><BurgerStack {ids} {names}/></div>
  {:else}
    <div class="serving-plate" class:hot={grill} class:wrapped class:boxed class:skewered={grill && ids.includes('skewer')} class:burnt={grill && heat>90}>
      {#if grill}<div class="grate"></div>{/if}
      {#if wrapped}<div class="pancake-fold"></div>{/if}
      {#each plated as id,i (id + ':' + i)}
        {#each grill && ids.includes('skewer') ? [0,1,2] : [0] as portion}
          <div class="plated-item" class:skewer-bite={grill && ids.includes('skewer')} style={grill && ids.includes('skewer') ? `left:${12+portion*24}%;top:${37-portion*10}%;transform:rotate(-14deg)` : `left:${18+(i%2)*40}%;top:${14+Math.floor(i/2)*36}%;transform:rotate(${i%2?12:-12}deg)`}><FoodArt {id} label={names[id]}/></div>
        {/each}
      {/each}
      {#if grill && ids.includes('skewer')}<div class="bamboo"></div>{/if}
      {#if ids.includes('sauce') || ids.includes('chili')}<div class="sauce">{#each Array(7) as _,i}<i style={`left:${20+i*9}%;top:${28+(i%3)*18}%`}></i>{/each}</div>{/if}
    </div>
    {#if grill && heat>0}<div class="steam"><i></i><i></i><i></i></div>{/if}
  {/if}
  <div class="caption">{ids.length ? (burger ? `${title} · 已装 ${ids.length} 层` : title) : cup?'选择原料，调制本单饮品':burger?'从下层面包开始，逐层装配':grill?'放齐原料后自动烤制':'选择菜品，完成本单摆盘'}</div>
</div>
<style>
 .workbench{height:240px;position:relative;overflow:hidden;border-radius:14px;background:radial-gradient(ellipse at 50% 100%,#b8926344,transparent 70%),linear-gradient(120deg,#354148,#192329);color:#f3e5c8;box-shadow:inset 0 1px 0 #ffffff1a,0 8px 18px #0003}.workbench.cup{background:radial-gradient(ellipse at 50% 100%,#6bb1ba33,transparent 70%),linear-gradient(120deg,#263f4a,#162431)}.workbench.burger{background:radial-gradient(ellipse at 50% 90%,#dc9c4b3d,transparent 64%),linear-gradient(120deg,#46372d,#1d2931)}.workbench.grill{background:radial-gradient(ellipse at 50% 100%,#ef8c352e,transparent 65%),linear-gradient(120deg,#3e3430,#1d2328)}.station-name{position:absolute;left:12px;top:10px;font-size:11px;letter-spacing:2px;color:#e7c992}.caption{position:absolute;bottom:10px;left:8px;right:8px;text-align:center;font-size:12px;color:#fff0d4}.machine{position:absolute;width:114px;height:56px;left:50%;top:32px;transform:translateX(-50%);background:linear-gradient(110deg,#b1b7b4,#545f65 60%,#b1b7b4);border-radius:8px;box-shadow:0 6px 12px #0005}.machine i{position:absolute;width:7px;height:19px;bottom:-15px;left:43%;background:#a4a9a5}.machine i+ i{left:55%}.machine span{font-size:10px;color:#15202a;padding:8px;display:block}.glass{position:absolute;bottom:37px;left:50%;transform:translateX(-50%);height:116px;width:86px;border:3px solid #cbe7eab0;border-top:5px solid #e2f5f1;border-radius:5px 5px 23px 23px;background:#cbeced18;overflow:hidden;box-shadow:0 5px 10px #0006}.fill{position:absolute;bottom:0;left:0;right:0;display:flex;flex-direction:column-reverse}.liquid{position:relative;animation:fill-in .5s ease-out;flex-shrink:0;box-shadow:inset 0 3px 3px #ffffff38}.liquid span{position:absolute;left:-10%;width:120%;height:5px;background:#ffffff40;top:0;border-radius:50%;animation:ripple 1.3s ease-in-out infinite}.glass-shine{position:absolute;inset:10px auto 12px 8px;width:7px;border-radius:10px;background:#ffffff60}.ice{position:absolute;width:61px;height:56px;left:18px;bottom:25px;animation:ripple 1.8s infinite}.pearls i{position:absolute;width:8px;height:8px;border-radius:50%;background:#30252b;border:1px solid #79614e}.pour{position:absolute;width:6px;left:calc(50% - 3px);top:96px;height:95px;background:var(--liquid);animation:pour .55s forwards}.burger-plate{position:absolute;bottom:35px;left:15%;width:70%;height:25px;background:#e9ddc4;border-radius:50%;box-shadow:0 6px 5px #0005}.burger-layers{position:absolute;bottom:45px;left:25%;width:50%;display:flex;flex-direction:column-reverse;align-items:center}.serving-plate{position:absolute;left:8%;right:8%;top:40px;bottom:38px;background:radial-gradient(ellipse,#fbf1d9 60%,#c8b391 62%,#f2e7ce 66%);border-radius:50%;box-shadow:0 8px 12px #0007,inset 0 0 0 5px #fff3}.plated-item{position:absolute;width:37%;height:43%;animation:drop .35s ease-out}.hot{border-radius:12px;background:linear-gradient(#3f403e,#241f1b);border:7px solid #867663}.grate{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 13px,#8f8879 14px 17px)}.bamboo{position:absolute;width:76%;height:4px;background:#e0bc7a;top:55%;left:12%;transform:rotate(-14deg)}.sauce i{position:absolute;width:8px;height:4px;background:#9c4524;border-radius:50%}.steam{position:absolute;top:62px;left:30%;display:flex;gap:15px}.steam i{width:6px;height:50px;border-left:4px solid #efddbb66;border-radius:50%;animation:steam 1.2s infinite}.steam i:nth-child(2){animation-delay:.3s}.steam i:nth-child(3){animation-delay:.6s}@keyframes fill-in{from{height:0;opacity:.4}}@keyframes ripple{50%{transform:translateY(-3px) rotate(3deg)}}@keyframes pour{0%{opacity:0;transform:scaleY(0);transform-origin:top}25%{opacity:.9;transform:scaleY(1)}100%{opacity:0}}@keyframes drop{from{opacity:0;translate:0 -25px}to{opacity:1;translate:0 0}}@keyframes steam{to{transform:translateY(-30px);opacity:0}}
  /* 位图食材使用固定绘制盒，不能把 128px 原始尺寸泄漏到工作台布局。 */
  .ice :global(svg), .ice :global(.food-art) {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  /* Cup contents use one blended liquid surface instead of per-ingredient horizontal bands. */
  .fill {
    display: block;
    border-radius: 0 0 17px 17px;
    background: linear-gradient(180deg, var(--liquid-top) 0%, var(--liquid-base) 44%, var(--liquid-deep) 100%);
    box-shadow: inset 0 4px 7px #ffffff35, inset 0 -8px 10px #1b0f1838;
    transition: height .38s cubic-bezier(.2,.7,.25,1), filter .25s ease;
    filter: saturate(1.04);
  }
  .fill.liquid {
    position: absolute;
    inset: auto 0 0;
    box-sizing: border-box;
  }
  .fill.liquid .liquid-gloss {
    left: 8px;
    top: 7px;
    bottom: 8px;
    width: 5px;
    height: auto;
    border-radius: 99px;
    background: linear-gradient(90deg, #ffffff55, #ffffff10);
    animation: none;
  }
  .fill::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, #ffffff25 0%, transparent 20%, transparent 75%, #ffffff15 100%);
    pointer-events: none;
  }
  .plated-item :global(svg), .plated-item :global(.food-art) {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .workbench.burger { height:270px; background:radial-gradient(ellipse at 45% 65%, #fff6db 0%, #eed4a1 75%); color:#624125; box-shadow:none; border:1px solid #d3aa6d; }
  .burger .station-name { color:#967345; letter-spacing:1px; }
  .burger .caption { color:#7e5a32; bottom:8px; font-size:11px; }
  .burger .burger-plate { bottom:38px; left:12%; width:68%; height:28px; background:radial-gradient(ellipse,#fffbee 58%,#d8c197 60%,#fff9e8 70%); box-shadow:0 6px 6px #6b3d2528; }
  .burger .burger-layers { bottom:52px; left:46%; width:auto; transform:translateX(-50%); }
  .burger-layers :global(.burger-stack) { --burger-size:clamp(140px,18vw,210px); }
  /* 成品台沿用店铺材质与配色，食物在中心，右侧留出配餐区。 */
  .workbench:not(.burger) { background:radial-gradient(ellipse at 45% 65%,#ffffffd9,var(--shop-soft,#dce5de)); color:var(--shop-ink,#4f543b); border:1px solid var(--shop-border,#adb69f); box-shadow:none; }
  .station-name, .caption { color:var(--shop-ink,#4f543b); }
  .cup .glass { left:45%; width:124px; height:calc(100% - 72px); max-height:185px; bottom:34px; border-color:#b4d4d9; border-top-color:#e9f8f9; background:#e9f8f952; box-shadow:inset 0 0 0 1px #fff,0 7px 9px #284c5e29; }
  .cup .machine { left:20%; width:75px; height:54px; top:30%; opacity:.85; }
  .cup .machine span { color:#3d515a; }
  .cup .pour { left:calc(45% - 3px); top:40px; height:100px; }
  .milk-foam { position:absolute; height:16px; left:0; right:0; background:radial-gradient(ellipse at 25% 50%,#fffdf3 0 25%,#f3e3c2 50%,#fff6e3 80%); border-radius:45%; box-shadow:0 2px 3px #98653025; }
  .pearls i { width:11px; height:11px; }
  .cup .ice { left:30px; width:72px; height:68px; bottom:40%; }
  .serving-plate { left:4%; right:19%; background:radial-gradient(ellipse,#fffef9 56%,#d5cec5 59%,#fff8ee 63%,#e1d6c6 70%); box-shadow:0 8px 12px #554a3226; }
  .serving-plate.hot { background:linear-gradient(#54514b,#302f2b); border:5px solid #8e7d61; }
  .hot.boxed { background:#f1d8a7; border:9px solid #b99461; border-radius:12px; box-shadow:inset 0 0 0 3px #fff0ce; }
  .boxed .grate, .wrapped .grate { display:none; }
  .hot.wrapped { background:radial-gradient(ellipse,#f1c97f,#a6793b); border:5px solid #b29467; border-radius:50%; }
  .pancake-fold { position:absolute; inset:15% 5% 6% 8%; border-radius:45% 20% 50% 45%; background:repeating-linear-gradient(15deg,#e4b565 0 12px,#e8bd72 12px 17px); box-shadow:inset 0 -7px 0 #c790423d,0 3px 6px #74471940; transform:rotate(-8deg); }
  .skewered .skewer-bite { width:28%; height:48%; z-index:1; }
  .bamboo { z-index:2; width:88%; left:6%; top:55%; height:5px; }
  .wrapped .plated-item { z-index:1; width:54%; height:60%; top:16%!important; left:24%!important; }
  .sauce { position:absolute; inset:0; z-index:3; }
  .burnt .plated-item, .burnt .pancake-fold { filter:brightness(.4) saturate(.5); }
  @media (max-height:560px) and (orientation:landscape) { .cup .machine { display:none; } .cup .glass { width:90px; height:calc(100% - 38px); bottom:24px; } .caption { font-size:10px; bottom:4px; } .station-name { display:none; } .serving-plate { top:15px; bottom:25px; } }
</style>
