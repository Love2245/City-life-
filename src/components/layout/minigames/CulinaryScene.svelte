<script lang="ts">
 import {onMount} from 'svelte';
 import {artDefs,foodGlyph,drinkGlyph,plateGlyph,streetFoodGlyph} from '../../../lib/culinaryIllustration';
 import {sceneBackdrop,coffeeMachine,sealMachine,grillEquipment,westernEquipment} from '../../../lib/culinarySceneArt';
 import {motionProgress,cookingMethod,plateIngredients,type CraftKind,type CraftState} from '../../../lib/restaurantCraft';
 let {kind,scene,craftState:s,ids,recipe,title,heat=0,onPlace}:{kind:CraftKind;scene:string;craftState:CraftState;ids:string[];recipe:string[];title:string;heat?:number;onPlace:(x?:number,y?:number)=>void}=$props();
 const artworkId=$props.id(); const p=artworkId.replace(/[^a-zA-Z0-9]/g,'')+'scene';
 let visualProgress=$state(0),motionFrame=$state(1);
 // A single local animation loop reads the current customer, avoiding effect
 // restarts during interpolation and keeping the 5 Hz simulation independent.
 onMount(()=>{
  if(typeof requestAnimationFrame==='undefined')return;
  let frame=0,lastPaint=0,lastLeft=-1,lastSequence=-1,motionAnchor=0;
  let lastProgress=-1,progressFrom=0,progressAnchor=0;
  const draw=(now:number)=>{
   if(now-lastPaint<12){frame=requestAnimationFrame(draw);return;}lastPaint=now;
   if(lastLeft!==s.motionLeft||lastSequence!==s.sequence){lastLeft=s.motionLeft;lastSequence=s.sequence;motionAnchor=now;}
   motionFrame=s.motionLeft&&s.motionTotal?Math.min(1,1-(s.motionLeft-(now-motionAnchor))/s.motionTotal):1;
   if(lastProgress!==s.progress){lastProgress=s.progress;progressFrom=visualProgress;progressAnchor=now;}
   visualProgress=progressFrom+(s.progress-progressFrom)*Math.min(1,(now-progressAnchor)/180);
   frame=requestAnimationFrame(draw);
  };
  frame=requestAnimationFrame(draw);return ()=>cancelAnimationFrame(frame);
 });
 const t=$derived(typeof requestAnimationFrame==='undefined'?motionProgress(s):motionFrame);
 const ease=(v:number)=>v*v*(3-2*v);
 const lift=$derived(s.phase==='finish'||s.phase==='done'?s.animation==='lift'&&s.motionLeft>0?ease(kind==='grill'?Math.max(0,Math.min(1,(t-.15)/.6)):t):1:0);
 const mix=$derived(s.animation==='shake'||s.animation==='toss'?s.motionLeft>0?Math.sin(t*Math.PI*6)*Math.sin(t*Math.PI):0:0);
 const flip=$derived(s.animation==='flip'&&s.motionLeft>0?Math.sin(t*Math.PI):0);
 const finishing=$derived(s.phase==='done'?1:s.running&&s.phase==='finish'?visualProgress/100:0);
 const method=$derived(cookingMethod(recipe));
 const tea=$derived(kind==='coffee'&&!recipe.includes('espresso'));
 const barReady=$derived(s.phase==='finish'||s.phase==='done');
 const barTransfer=$derived(s.strokes>=3&&s.animation==='shake'&&s.motionLeft>0?ease(Math.max(0,(t-.45)/.55)):barReady?1:0);
 const liquidIds=$derived(ids.filter(id=>!['cup','ice','pearl'].includes(id)));
 const brewFill=$derived(!liquidIds.length?0:s.phase==='prep'?.1:s.phase==='cook'?.12+visualProgress/100*.65:.78+finishing*.22);
 const foodHeat=$derived(s.phase==='prep'?.05:s.phase==='cook'?.2+(kind==='grill'?heat:visualProgress)/100*.8:1);
 const mainFood=$derived(ids.includes('steak')?'steak':ids.includes('fish')?'fish':ids.includes('pasta')?'pasta':'salad');
 const grillStyle=$derived(recipe.includes('wrap')?'wrap':recipe.includes('box')?'box':'skewer');
 const pouring=$derived(s.running&&s.phase==='finish'?Math.sin(finishing*Math.PI):0);
 // The lip is on the left: lower it toward the cup while the handle rises.
 // Calculate the liquid source from that same transformed lip (local 2, 15).
 const pitcherX=$derived(405+pouring*82);
 const pitcherY=$derived(137-pouring*5);
 const pourAngle=$derived(-pouring*42*Math.PI/180);
 const streamX=$derived(pitcherX+25-23*Math.cos(pourAngle)+55*Math.sin(pourAngle));
 const streamY=$derived(pitcherY+70-23*Math.sin(pourAngle)-55*Math.cos(pourAngle));
 const carryX=$derived(205+lift*270);
 const carryY=$derived(85+lift*78-Math.sin(lift*Math.PI)*38);
 const tongX=$derived(s.animation==='lift'&&s.motionLeft>0?t<.15?286+(205-286)*ease(t/.15):t>.75?carryX+(286-carryX)*ease((t-.75)/.25):carryX:286-flip*63);
 const tongY=$derived(s.animation==='lift'&&s.motionLeft>0?t<.15?88+(85-88)*ease(t/.15):t>.75?carryY+(88-carryY)*ease((t-.75)/.25):carryY:88+flip*40);
 const cupX=$derived(kind==='coffee'?143+lift*239:100+barTransfer*276);
 const cupY=$derived(kind==='coffee'?207-lift*6:202);
 const cupMouthX=$derived(cupX+60*1.1);
 const cupMouthY=$derived(cupY+(tea?23:36)*1.1);
 const plateFoods=$derived(s.placed);
 const nextFood=$derived(plateIngredients(recipe)[s.placed.length]);
 const instruction=$derived(s.phase==='done'?'成品已就绪 · 配好小食后出餐':kind==='western'?s.phase==='finish'?'点击餐位放入下一道菜':method==='boil'?'煮面沥水 · 逐份摆盘':method==='toss'?'拌匀前菜 · 逐份摆盘':'煎好两面 · 起锅摆盘':kind==='coffee'?'从萃取到出杯，留意制作火候':kind==='bar'?'调匀后移入封口机':grillStyle==='wrap'?'翻面煎熟 · 离火卷饼':grillStyle==='box'?'翻炒入味 · 离火装盒':'两面炭烤 · 离火刷酱');
 function place(event:MouseEvent){const box=(event.currentTarget as HTMLElement).getBoundingClientRect();onPlace(event.detail?(event.clientX-box.left)/box.width*100:undefined,event.detail?(event.clientY-box.top)/box.height*100:undefined);}
</script>

<svg class="culinary-scene" viewBox="0 0 600 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${title}制作工位`} data-scene={scene} data-motion-progress={t.toFixed(3)}>
 {@html artDefs(p)+sceneBackdrop(scene,p)}
 <!-- The camera and equipment persist for every phase. Food travels between work areas. -->
 <g data-art-part="equipment">
 {#if kind==='coffee'}{@html coffeeMachine(p,tea)}
 {:else if kind==='bar'}{@html sealMachine(p,scene==='netbar-night')}
   <g stroke="#52646a" stroke-width="2"><path d="M45 294H303V301H45Z" fill="#80979b"/><path d="M49 282H299V294H49Z" fill="#d8dfcd"/>{#each [0,1,2,3,4,5,6] as i}<path d={`M${65+i*35} 283V292`} stroke="#9aaea9"/>{/each}</g>
 {:else if kind==='western'}{@html westernEquipment(p,method)}
 {:else}{@html grillEquipment(p,grillStyle!=='skewer')}{/if}
 </g>
 {#if kind!=='bar'}<g data-art-part="serving-tray" stroke="#88775f" stroke-width="2"><path d="M349 235L394 207L568 231L535 308L352 288Z" fill="#c5ac85"/><path d="M349 235L394 207L568 231L533 296L352 277Z" fill="#f5e7c5"/><path d="M361 239L395 218L551 239L529 285L363 268Z" fill="#e7d4ac" stroke="#dac29b"/></g>{/if}
 {#if kind==='coffee'||kind==='bar'}
   {#if kind==='bar'}
    {#if recipe.includes('coffee')&&!recipe.includes('ice')}<g data-art-part="stir-spoon" transform={`translate(${149+mix*10} 172) rotate(${mix*12} 0 45)`} stroke="#52636a" stroke-width="2"><path d="M-3-38H3V57H-3Z" fill={`url(#${p}steel)`}/><ellipse cy="57" rx="7" ry="11" fill={`url(#${p}steel)`}/></g>
    {:else}<g transform={`translate(${56+mix*5} 116) rotate(${mix*11} 72 113)`} data-art-part="shaker" stroke="#52636a" stroke-width="2.5"><path d="M28 21L92 21L86 135Q58 146 34 135Z" fill={`url(#${p}steel)`}/><path d="M28 21L35 7L84 7L92 21Z" fill="#dde3ce"/><path d="M45 7V0H74V7" fill="#a6bdba"/><path d="M39 31L43 122" fill="none" stroke="#eef2df" stroke-width="5"/><path d="M49 137L71 137" stroke="#6c8989" stroke-width="3"/></g>{/if}
   {/if}
   <g class="tracked-food" data-art-part="vessel" transform={`translate(${cupX+(kind==='bar'?mix*8:0)} ${cupY-(s.animation==='lift'?Math.sin(t*Math.PI)*23:0)}) scale(1.1)`}>
     {@html drinkGlyph(p,ids,kind==='coffee'?brewFill:liquidIds.length?.35+s.strokes*.2:0,s.phase==='done'&&kind==='bar',kind==='coffee'&&!tea,finishing)}
   </g>
   {#if kind==='coffee'}
     <g data-art-part="pitcher" transform={`translate(${pitcherX} ${pitcherY}) rotate(${-pouring*42} 25 70)`} stroke="#58615b" stroke-width="2.5"><path d="M9 24L60 24L70 81Q36 98 12 80Z" fill={`url(#${p}steel)`}/><path d="M9 24L2 15L30 22" fill="#e4eada"/><path d="M61 30Q95 28 78 69L68 64Q80 38 63 41Z" fill="#a8bdbc"/><ellipse cx="35" cy="24" rx="25" ry="7" fill="#f2ebd4"/><path d="M21 37L24 72" stroke="#eaf1dd" stroke-width="4"/></g>
     {#if s.running&&s.phase==='cook'}<g class="flowing" stroke={tea?'#c7974d':'#91613e'} stroke-width="4" stroke-linecap="round"><path d={tea?'M180 230L187 239':'M185 215V245M218 215V243'}/><ellipse cx={tea?188:201} cy="249" rx="17" ry="3" fill="#c49759" stroke="none"/></g>{/if}
     {#if s.running&&s.phase==='finish'}<g class="pouring-stream" opacity={pouring}><path d={`M${streamX} ${streamY}Q${streamX} ${cupMouthY-20} ${cupMouthX} ${cupMouthY}`} fill="none" stroke={recipe.includes('milk')||recipe.includes('foam')?'#fff5d9':tea?'#caa15e':'#987048'} stroke-width="5" stroke-linecap="round"/></g>{/if}
   {:else}
     <g data-art-part="seal-head" transform={`translate(0 ${s.animation==='sealPress'?Math.sin(t*Math.PI)*38:s.running?s.progress/100*8:0})`} stroke="#49535b" stroke-width="2.5"><path d="M400 164H494V184H400Z" fill={`url(#${p}steel)`}/><path d="M414 184H482V190H414Z" fill="#e6e8d2"/></g>
     {#if s.animation==='shake'&&s.motionLeft>0}<g class="mix-drops" fill="#e6c99b" stroke="#8a7960" stroke-width="1"><circle cx={148+mix*5} cy="186" r="3"/><circle cx={169-mix*7} cy="191" r="2"/></g>{/if}
     {#if s.phase==='done'}<g data-art-part="seal-check"><circle cx="525" cy="196" r="12" fill="#7a9c67"/><path d="M519 196L523 200L531 191" stroke="#fff3d1" stroke-width="3" fill="none"/></g>{/if}
   {/if}
 {:else if kind==='western'}
   <g transform="translate(350 187) scale(1.8 1.35)" data-art-part="plate">{@html plateGlyph(p)}</g>
   <!-- Food in the pan is hidden only after it has reached the plate. -->
   {#if ids.some(id=>['steak','fish','pasta','salad'].includes(id))&&!s.placed.some(f=>f.id===mainFood)}
    <g class="tracked-food" data-art-part="pan-food" transform={`translate(${117+mix*5} ${(method==='boil'?116:138)-flip*35-Math.abs(mix)*20}) rotate(${flip*145+mix*8} 60 50) scale(.98)`}>
     {@html foodGlyph(mainFood,p,foodHeat,false)}
    </g>
   {/if}
   {#each plateFoods as food,i (food.id+':'+i)}
    {@const landing=s.animation==='plate'&&s.motionLeft>0&&i===plateFoods.length-1?ease(t):1}
    <g class="tracked-food" data-art-part="plated-food" data-placement-index={i} transform={`translate(${(357+food.x*2.01-37)*landing+(food.id===mainFood?117:287)*(1-landing)} ${(192+food.y*1.13-32)*landing+(food.id===mainFood?method==='boil'?116:138:130)*(1-landing)-Math.sin(landing*Math.PI)*36}) scale(${food.id===mainFood?.98-.32*landing:.66})`}>{@html foodGlyph(food.id,p,1,false)}</g>
   {/each}
   {#if s.phase==='finish'&&nextFood&&s.motionLeft===0}<g class="plate-guide" stroke="#84936a" fill="none" stroke-width="2" stroke-dasharray="4 5"><ellipse cx="450" cy="254" rx="68" ry="29"/><path d="M443 254H457M450 247V261"/></g>{/if}
   <g data-art-part="spatula" transform={`translate(${270+flip*-85} ${75+flip*47}) rotate(${-30+flip*90} 0 90)`} stroke="#655746" stroke-width="2"><path d="M0 0H12V67H0Z" fill="#b69770"/><path d="M-13 67H25V102H-13Z" fill={`url(#${p}steel)`}/><path d="M-5 76V94M5 76V94M15 76V94" stroke="#8ca4a0"/></g>
 {:else}
   <g transform="translate(385 215) scale(1.15 .9)" opacity={grillStyle==='skewer'?1:0} stroke="#a28863" stroke-width="2"><path d="M5 23L108 14L111 69L12 83Z" fill="#eddbc0"/><path d="M10 38L106 28M11 55L108 45M29 28L35 76M52 23L56 74M74 19L78 70" stroke="#cfb68e" stroke-width="1"/></g>
   {#if ids.some(id=>['meat','veg','sausage'].includes(id))}
    <g class="tracked-food" data-art-part="grill-food" transform={`translate(${grillStyle==='skewer'?115+lift*270:105+lift*282} ${125+lift*78-(s.animation==='lift'?Math.sin(lift*Math.PI)*38:flip*35)}) rotate(${flip*160} 60 50) scale(1.13)`}>
      {#if grillStyle==='box'&&lift<1}<g opacity={1-lift}>{@html foodGlyph('veg',p)}<g transform="translate(16 5) scale(.8)">{@html foodGlyph('meat',p,Math.max(.08,foodHeat))}</g></g><g opacity={lift}>{@html streetFoodGlyph(p,ids,Math.max(.08,foodHeat),finishing)}</g>
      {:else}{@html streetFoodGlyph(p,ids,Math.max(.08,foodHeat),s.phase==='done'?1:finishing)}{/if}
    </g>
   {/if}
   <g data-art-part="tongs" transform={`translate(${tongX} ${tongY}) rotate(${18+flip*35} 0 60)`} stroke="#615b4e" stroke-width="3" fill={`url(#${p}steel)`}><path d="M0 0Q13-6 18 4L3 94L-9 94Z"/><path d="M18 4L37 93L25 98L11 12Z"/><path d="M-9 94L3 94L1 106L-10 106M25 98L37 93L40 104L28 109"/></g>
   <g data-art-part="brush" transform={`translate(${472+(s.running&&s.phase==='finish'?Math.sin(finishing*Math.PI*6)*14:0)} ${132+(s.running&&s.phase==='finish'?Math.sin(finishing*Math.PI)*44:0)}) rotate(${-32+(s.running&&s.phase==='finish'?Math.sin(finishing*Math.PI*6)*20:0)} 8 65)`} stroke="#64503f" stroke-width="2"><path d="M0 0H14V51H0Z" fill="#b28a57"/><path d="M-4 51H18V72H-4Z" fill="#c08b54"/><path d="M-1 55V71M5 55V71M11 55V71M15 55V71" stroke="#745136"/></g>
 {/if}
 {#if s.running&&s.phase==='cook'||kind==='grill'&&s.phase==='cook'}
   <g class="steam" data-art-part="steam" fill="none" stroke={scene==='street'?'#e6d9b5':'#fff4d6'} stroke-width="3" stroke-linecap="round" opacity=".65">{#each [0,1,2] as i}<path style={`--delay:${i*-.6}s`} d={`M${144+i*34} 153Q${134+i*34} 140 ${145+i*34} 126T${144+i*34} 98`}/>{/each}</g>
   {#if method==='boil'&&kind==='western'}<g class="bubbles" fill="#e3ead4" opacity=".8">{#each [0,1,2,3,4] as i}<circle cx={130+i*20} cy={157-i%2*7} r={3+i%2} style={`--delay:${i*-.25}s`}/>{/each}</g>{/if}
   {#if kind==='grill'}<g class="embers" fill="#e8a35b" opacity=".85"><circle cx="98" cy="231" r="4"/><circle cx="156" cy="238" r="4"/><circle cx="214" cy="246" r="4"/></g>{/if}
 {/if}
 <g data-art-part="ingredient-dishes">
 {#each ids as id,i (id+':'+i)}<g class="prep-ingredient" transform={`translate(${28+i*45} 303) scale(.35)`}>{@html foodGlyph(id,p,0)}</g>{/each}
 </g>
 <g class="station-footer"><rect x="300" y="334" width="280" height="19" rx="8" fill={scene==='street'||scene==='netbar-night'?'#494554':'#f3e6c9'} opacity=".88"/><text x="440" y="347" fill={scene==='street'||scene==='netbar-night'?'#f3d9b2':'#6d604f'} font-size="10" text-anchor="middle">{instruction}</text></g>
 {#if s.phase==='done'}<g class="ready-mark"><circle cx="557" cy="181" r="17" fill="#7b9868" stroke="#f6efcf" stroke-width="2"/><path d="M548 181L554 188L567 174" fill="none" stroke="#ffefd0" stroke-width="4" stroke-linecap="round"/></g>{/if}
 {#if kind==='western'&&s.phase==='finish'}<foreignObject x="357" y="192" width="201" height="113"><button class="plating-zone" type="button" disabled={s.motionLeft>0} aria-label="在餐盘上放置当前菜品" onclick={place}></button></foreignObject>{/if}
</svg>
<style>
 .culinary-scene{width:100%;height:100%;display:block;min-height:0;cursor:default;touch-action:manipulation;}
 .plating-zone{width:100%;height:100%;background:transparent;border:0;border-radius:50%;cursor:crosshair;}.plating-zone:focus-visible{outline:3px dashed #8a9d69;outline-offset:-5px;}.plating-zone:disabled{cursor:default;}
 .steam path{animation:steam-rise 2.4s ease-in-out infinite;animation-delay:var(--delay);}.bubbles circle{animation:bubble 1.3s ease-in-out infinite;animation-delay:var(--delay);}.flowing{animation:flow .45s linear infinite;}.embers{animation:ember 1.6s ease-in-out infinite alternate;}.prep-ingredient{animation:ingredient-land .35s ease-out;}.plate-guide{animation:guide 1.8s ease-in-out infinite;}.ready-mark{animation:check-in .35s ease-out;}
 @keyframes steam-rise{0%{opacity:0;transform:translateY(8px);}35%{opacity:.7;}100%{opacity:0;transform:translateY(-20px);}}
 @keyframes bubble{0%,100%{opacity:0;transform:translateY(4px);}50%{opacity:1;transform:translateY(-3px);}}
 @keyframes flow{50%{opacity:.65;}}@keyframes ember{to{opacity:.5;}}@keyframes guide{50%{opacity:.4;}}@keyframes check-in{from{opacity:0;translate:0 8px;}to{opacity:1;translate:0 0;}}@keyframes ingredient-land{from{opacity:0;translate:0 -18px;}to{opacity:1;translate:0 0;}}
 @media(prefers-reduced-motion:reduce){.steam path,.bubbles circle,.flowing,.embers,.prep-ingredient,.plate-guide,.ready-mark{animation:none;}.tracked-food{transition:none;}}
</style>



