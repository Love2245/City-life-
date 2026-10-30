<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { createLoadingComposition, type LoadingMotionLayer } from '../../lib/loadingCompositor';
  import type { WeatherId } from '../../game/types';
  import { loadingArtStyle, type LoadingArtTime } from '../../lib/loadingArt';
  let { regionId = 'downtown', time = 'day', weather = 'sunny', onReady }:
    { regionId?: string; time?: LoadingArtTime; weather?: WeatherId; onReady?:(key:string)=>void } = $props();
  let root=$state<HTMLDivElement>(),layers=$state.raw<LoadingMotionLayer[]>([]);
  $effect(()=>{
    const svg=root?.querySelector('svg'),key=[regionId,time,weather].join(':');
    if(!svg)return;
    let stopped=false,release=()=>{};
    const notify=untrack(()=>onReady);layers=[];
    void createLoadingComposition(svg).then(async composition=>{
      if(stopped){composition.dispose();return;}
      release=composition.dispose;layers=composition.layers;await tick();
      if(!stopped)notify?.(key);
    });
    return()=>{stopped=true;release();};
  });
  const uid = $props.id();
  const dark = $derived(time === 'night' || time === 'late-night');
  const district = $derived(['downtown', 'suburb', 'development', 'boyue'].includes(regionId) ? regionId : 'downtown');
  const buildings = [
    { x: 153, y: 215, w: 48, h: 93 }, { x: 215, y: 176, w: 54, h: 132 },
    { x: 281, y: 229, w: 41, h: 79 }, { x: 640, y: 149, w: 58, h: 159 },
    { x: 709, y: 105, w: 69, h: 203 }, { x: 792, y: 193, w: 50, h: 115 },
  ];
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  const stars = [[147, 95], [219, 65], [323, 110], [402, 54], [531, 79], [680, 52], [853, 135], [900, 82]];
</script>

<div class="landmark-art" class:composited={layers.length>0} bind:this={root} data-loading-landmark={district} data-time={time} data-weather={weather} style={loadingArtStyle(time, weather, district)}>
  <svg viewBox="0 0 1000 430" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <defs>
      <pattern id={`${uid}-rain`} width="60" height="80" patternUnits="userSpaceOnUse"><path d="M34 7 22 33" class="rain-stroke"/><path d="M7 50 1 63" class="rain-stroke fine"/></pattern>
      <pattern id={`${uid}-snow`} width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="19" cy="18" r="1.4" fill="currentColor"/><circle cx="71" cy="65" r="1.8" fill="currentColor"/><path d="M72 15v6m-3-3h6" stroke="currentColor" stroke-width="1"/></pattern>
      <clipPath id={`${uid}-frame`}><rect x="70" y="26" width="860" height="370" rx="12"/></clipPath>
    </defs>
    <g class="drawing" clip-path={`url(#${uid}-frame)`}>
      <path class="sky-arc" d="M104 281a404 404 0 0 1 792 0"/>
      {#if dark}
        <path class="moon" d="M824 69a22 22 0 1 0 21 32 24 24 0 0 1-21-32Z"/>
        <g class="stars">{#each stars as [x, y], i}<path style={`--i:${i}`} d={`M${x-2} ${y}h4m-2-2v4`}/>{/each}</g>
      {:else if weather !== 'rain' && weather !== 'snow' && weather !== 'cloudy'}
        <g class="sun"><circle cx="808" cy="103" r="25"/><circle class="sun-halo" cx="808" cy="103" r="38"/>{#each rays as angle}<path d="M808 56v6" transform={`rotate(${angle} 808 103)`}/>{/each}</g>
      {/if}
      <g class="clouds" class:overcast={weather === 'cloudy' || weather === 'rain' || weather === 'snow'}>
        <path class="cloud cloud-one" d="M154 128h94m-72-9c3-16 24-21 35-7 9-7 23-2 24 7h23"/>
        <path class="cloud cloud-two" d="M560 111h110m-88-9c5-17 26-22 36-7 10-10 28-4 28 7h31"/>
        <path class="cloud cloud-three" d="M349 167h74m-57-8c5-12 20-17 28-5 8-6 18-2 20 5h19"/>
      </g>
      {#if district === 'downtown'}
        <g class="distant"><path class="landfill" d="M105 307v-47h23v-18h28v65h130v-61h22v-30h30v91h205v-46h25v-34h36v80h72v-77h29v-33h25v110h145v-44h24v-31h29v75Z"/><path d="M105 307h790"/></g>
        <g class="city-buildings">
          {#each buildings as building, i}<g><path class="building-fill" d={`M${building.x} 308v-${building.h}h${building.w}v${building.h}`}/><path d={`M${building.x+7} ${building.y}v-9h${building.w-14}v9`}/>
            {#each Array.from({length:Math.floor((building.h-18)/22)},(_,j)=>j) as row}<path class="window-row" class:lit={(row+i)%3 === 0} d={`M${building.x+10} ${building.y+18+row*22}h${building.w-20}`}/>{/each}
            <path class="fine" d={`M${building.x+building.w-9} ${building.y+8}V308`}/></g>{/each}
          <path d="M744 96V79m-8 17h16"/>
        </g>
        <g class="old-street"><path class="building-fill" d="M332 304v-47l33-27 34 27v47m-67-47h67m-55 47v-29h17v29m15-14h12m-6-8v16"/><path class="building-fill" d="M400 304v-36l33-26 33 26v36m-66-36h66m-49 36v-22h15v22m17-22v12"/><path d="m325 257 40-34 41 34m-11 11 38-33 39 33"/></g>
        <path class="water-fill" d="M88 332c125-24 179 36 311 16 175-26 297-13 513 20v31H88Z"/>
        <g class="bridge"><path class="building-fill" d="M271 323h355v15H271Z"/><path d="M288 323c77-79 178-79 306 0m-306 0v-27m306 27v-27M303 309v14m21-29v29m21-43v43m22-53v53m22-60v60m22-65v65m22-66v66m22-66v66m22-61v61m22-55v55m22-47v47m22-36v36m22-23v23m22-9v9M303 338v24m286-24v29"/><path class="accent-line" d="M280 321h338"/></g>
        <g class="waterlines"><path d="M125 366h108m-73 11h54m447-15h106m-133 12h65M350 384h132m39-22h45"/></g>
        <g class="trees"><path d="M111 325v-29m0 15c-32-2-24-31-8-30-4-25 28-25 25-3 22 0 23 31-17 33m754 14v-29m0 15c-32-2-24-31-8-30-4-25 28-25 25-3 22 0 23 31-17 33"/></g>
      {:else if district === 'suburb'}
        <g class="distant"><path class="landfill" d="m98 284 76-76 47 43 75-113 111 146 78-79 94 79 80-100 88 100 72-54 88 66v29H98Z"/><path d="m245 214 51-76 48 65m-68-36 20 17 21-17m265 77 57-60 45 51"/></g>
        <path class="water-fill" d="M329 320c96-47 254-59 457-22l111 46-51 47H322Z"/>
        <g class="wheel"><circle cx="297" cy="242" r="69"/><circle cx="297" cy="242" r="60" class="fine"/><circle cx="297" cy="242" r="7" class="light-fill"/>{#each rays as angle}<g transform={`rotate(${angle} 297 242)`}><path class="fine" d="M297 235v-53"/><circle cx="297" cy="173" r="5" class="wheel-dot"/></g>{/each}</g>
        <path d="m290 250-27 78m41-78 27 78m-76 0h84"/>
        <g class="temple"><path class="building-fill" d="M628 307v-43h104v43Z"/><path class="building-fill" d="m612 264 37-17 31-25 32 25 37 17Zm18-25 30-13 20-25 20 25 30 13Z"/><path d="M647 265v42m66-42v42m-45-42v42m24-42v42m-73 1h122m-118 8h114m-60-121v8"/><path class="accent-line" d="m641 240 39-12 39 12m-88 25 49-15 49 15"/></g>
        <path class="landfill foreground-field" d="M91 342c90-52 172-16 244 0 72 17 132 37 225 54H91Z"/>
        <g class="field-lines"><path d="M117 351c82-21 125-5 191 18m-194-3c75-15 111 0 161 20m-100-54 88 60m-59-66 105 66m-49-58 105 58m-46-44 92 44"/></g>
        <g class="waterlines"><path d="M429 333h83m-19 13h79m107-22h117m-61 22h85M579 368h95"/></g>
        <g class="plant"><path d="M164 327v-43m0 27c-21-4-26-14-26-24 21 3 28 13 26 24m0-12c18-2 25-14 24-24-18 4-24 12-24 24"/></g>
      {:else if district === 'development'}
        <g class="mountain"><path class="landfill" d="M101 308c54-52 93-73 124-119 31-45 48-57 79-69 19-8 30-47 53-56 28 24 36 59 64 80 30 24 51 21 75 58 36 55 80 60 119 106Z"/><path d="m209 210 29-10 37-50 29-30 29 13 24-69m-24 69 21 25 26-4 41-10m-152 94 44-46 25 13 40 58m56-45 32 24 30 42"/><path class="fine" d="m141 279 69-32 45-45m111-82 29 55 40 27 24 45m-130-21-25 55m156-55 42 54"/></g>
        <g class="hill-pavilion"><path class="building-fill" d="M392 181v-30h43v30m-54-30 33-14 32 14Z"/><path d="M404 151v30m20-30v30m-37 1h54m-29-49v5"/></g>
        <g class="museum"><path class="building-fill" d="M615 309v-66h72v66m9 0v-80h73v80m9 0v-57h78v57"/><path d="m605 243 47-19 46 19m-5-14 39-20 41 20m1 23 42-18 45 18M623 259h56m-56 11h56m-56 11h56m25-36h57m-57 12h57m-57 12h57m26-2h59m-59 12h59"/><path class="accent-line" d="M610 311h254"/><path class="museum-door" d="M644 308v-15h17v15m63 0v-22h17v22m67 0v-14h17v14"/></g>
        <path class="water-fill" d="M91 335c161-43 336-11 445 15 157 37 233-16 377-7v54H91Z"/>
        <g class="waterlines"><path d="M165 355h103m26-13h68m32 24h125m-12 16h63m69-28h116m-46 22h102"/></g>
        <g class="mountain-mist"><path d="M159 265h201m-73-18h178m-18 34h139"/></g>
        <g class="plant"><path d="M579 324v-60m-19 18 19-26 19 26m-45 17 26-31 26 31m-52 13 26-32 26 32"/></g>
        <path class="shore" d="M92 333c118-25 209-19 307-1m308 6c82-13 139-10 202 1"/>
      {:else}
        <g class="distant"><path class="landfill" d="M109 308v-76h42v-37h57v113h39v-53h38v-27h35v80h36v-51h43v-56h44v107h330v-78h48v-37h35v115h42v-59h31v59Z"/><path d="M110 308h786"/></g>
        <g class="sphere-building"><circle class="building-fill" cx="618" cy="233" r="76"/><ellipse class="fine" cx="618" cy="233" rx="37" ry="76"/><ellipse class="fine" cx="618" cy="233" rx="65" ry="76"/><path d="M542 233h152m-143-31h134m-134 62h134m-103-93v124"/><path class="building-fill" d="M558 300h120v15H558Z"/><path d="M570 315v11m96-11v11"/></g>
        <g class="stadium"><path class="building-fill" d="M727 307v-28c12-46 135-46 150 0v28Z"/><ellipse cx="802" cy="279" rx="75" ry="19"/><path d="M738 284v22m18-17v17m20-15v15m25-14v14m25-15v15m21-17v17m19-22v22m-132-36 16-19m7 25 8-32m21 34 1-37m25 37-4-35m29 32-12-28"/></g>
        <g class="market"><path class="building-fill" d="M151 308v-45h268v45Z"/><path class="market-canopy" d="m137 263 25-40h245l26 40Z"/><path d="M162 223v40m42-40-8 40m49-40-4 40m49-40v40m49-40 4 40m47-40 8 40m-249 0c7 16 27 16 39 0 9 16 31 16 43 0 10 16 31 16 43 0 12 16 32 16 44 0 12 16 32 16 44 0 12 16 32 16 44 0 13 16 31 16 39 0m-271 0v45m257-45v45"/><path class="accent-line" d="M152 311h267"/><path d="M172 306v-22h35v22m19 0v-22h35v22m19 0v-22h35v22m19 0v-22h35v22m19 0v-22h14v22"/></g>
        <g class="string-lights"><path d="M143 221v-49m284 49v-49m-284 10q142 55 284 0"/>{#each [0,1,2,3,4,5,6] as i}<path class="festival-light" style={`--i:${i}`} d={`M${159+i*41} ${191+Math.sin((i+0.3)/6.6*Math.PI)*19}v9`}/>{/each}</g>
        <g class="fountain"><ellipse class="building-fill" cx="540" cy="355" rx="65" ry="11"/><path d="M479 355v6c30 13 91 13 122 0v-6"/><g class="fountain-jets"><path d="M540 352v-36m-6 37c-8-28-25-30-29-18m42 18c8-28 25-30 29-18m-47 19c-13-10-23-11-30-2m51 2c13-10 23-11 30-2"/></g><path class="waterline" d="M505 358h70"/></g>
        <path class="ground-line" d="M94 328h378m132 0h301M120 377h280m261-17h207"/>
        <g class="plant"><path d="M103 328v-35m0 18c-25-2-22-24-9-26 1-19 26-18 25 1 17 4 12 26-16 25"/></g>
      {/if}
      {#if district !== 'boyue'}
        <g class="lake-ripples">
          {#each [0, 1, 2] as i}<ellipse style={'--ripple-delay:' + i * -1.2 + 's'} cx={district === 'downtown' ? 699 : district === 'suburb' ? 718 : 681} cy={district === 'downtown' ? 383 : district === 'suburb' ? 364 : 378} rx="35" ry="5"/>{/each}
        </g>
      {/if}
      {#if weather === 'rain'}
        <g class="rain"><rect x="-60" y="-80" width="1120" height="590" fill={`url(#${uid}-rain)`}/></g><g class="ripples"><ellipse cx="211" cy="385" rx="23" ry="3"/><ellipse cx="735" cy="389" rx="30" ry="4"/><ellipse cx="478" cy="370" rx="19" ry="3"/></g>
      {:else if weather === 'snow'}
        <g class="snow"><rect x="0" y="-100" width="1000" height="630" fill={`url(#${uid}-snow)`}/></g><path class="snow-ground" d="M107 395h121m475-4h151"/>
      {:else if weather === 'coldwave'}
        <g class="cold-wind"><path d="M114 158h133q20 0 20-10t-17-8M664 139h153q20 0 20-10t-17-8M720 184h107M133 358h87"/></g>
      {:else if weather === 'heatwave'}
        <g class="heat-haze"><path d="M123 301q-10-15 0-30t0-30m745 61q-10-15 0-30t0-30m-419-32q-8-12 0-24t0-24"/></g>
      {/if}
      <path class="frame-baseline" d="M84 397h832"/>
    </g>
  </svg>
  {#each layers as layer (layer.url)}
    <div class={'motion-layer '+layer.className} style={'transform-origin:'+layer.origin+';'+layer.delay} aria-hidden="true"><img src={layer.url} alt="" draggable="false"/></div>
  {/each}
</div>

<style>
  .landmark-art{width:100%;color:var(--load-ink);isolation:isolate}.landmark-art svg{display:block;width:100%;height:auto;overflow:visible}.drawing{stroke:var(--load-ink);stroke-width:1.65;stroke-linejoin:round;stroke-linecap:round}.fine{stroke-width:1;opacity:.65}.sky-arc{stroke:var(--load-faint);stroke-dasharray:2 10;opacity:.6}.landfill{fill:var(--load-fill);stroke:var(--load-faint)}.distant{opacity:.7}.building-fill{fill:var(--load-paper)}.water-fill{fill:var(--load-fill);stroke:none}.window-row{stroke:var(--load-faint);stroke-width:3;stroke-dasharray:4 6}.lit{stroke:var(--load-accent);opacity:.8}.accent-line{stroke:var(--load-accent);stroke-width:2.4}.light-fill,.wheel-dot{fill:var(--load-paper)}.market-canopy{fill:var(--load-fill2)}.museum-door{stroke:var(--load-accent)}.frame-baseline{stroke:var(--load-faint);opacity:.7}.sun{stroke:var(--load-accent);stroke-width:1.3}.sun-halo{stroke-dasharray:2 7;transform-box:fill-box;transform-origin:center;animation:sun-turn 16s linear infinite}.moon{fill:var(--load-light);stroke:var(--load-light);opacity:.8}.stars{stroke:var(--load-light);stroke-width:1.2}.stars path{animation:star-glow 5s ease-in-out infinite;animation-delay:calc(var(--i)*-.7s)}.cloud{stroke:var(--load-muted);opacity:.55;animation:cloud-drift 6s ease-in-out infinite alternate}.cloud-two{animation-duration:8s;animation-delay:-3s}.cloud-three{animation-duration:7s;animation-delay:-2s;opacity:.5}.overcast .cloud{stroke-width:2;opacity:.8}.overcast .cloud-three{opacity:.65}.waterlines,.waterline{stroke:var(--load-accent);stroke-width:1.7;stroke-dasharray:27 8 8 8;animation:water-flow 2.4s linear infinite;opacity:.85}.trees,.plant{fill:var(--load-fill2);stroke:var(--load-muted)}.plant{transform-box:fill-box;transform-origin:center bottom;animation:plant-sway 3.6s ease-in-out infinite}.wheel{transform-box:fill-box;transform-origin:center;animation:wheel-turn 18s linear infinite}.field-lines{stroke:var(--load-muted);opacity:.6}.foreground-field{fill:var(--load-fill2)}.mountain-mist{stroke:var(--load-paper);stroke-width:5;opacity:.8;animation:mist-drift 5s ease-in-out infinite alternate}.shore{stroke:var(--load-faint)}.string-lights{stroke:var(--load-muted);stroke-width:1.3}.festival-light{stroke:var(--load-accent);stroke-width:4;animation:festival-glow 3s ease-in-out infinite;animation-delay:calc(var(--i)*-.4s)}.fountain-jets{stroke:var(--load-accent);stroke-dasharray:5 4;animation:fountain-flow 1.5s linear infinite}.ground-line{stroke:var(--load-faint)}[data-time="night"] .lit,[data-time="late-night"] .lit{stroke:var(--load-light);animation:window-glow 3.6s ease-in-out infinite}[data-time="night"] .festival-light,[data-time="late-night"] .festival-light{stroke:var(--load-light);stroke-width:5}.rain-stroke{stroke:var(--load-muted);stroke-width:1.15;opacity:.5}.rain-stroke.fine{opacity:.3}.rain{animation:rain-fall .9s linear infinite}.snow{stroke:none;color:var(--load-ink);opacity:.55;animation:snow-fall 7s linear infinite}.snow-ground{stroke:var(--load-paper);stroke-width:4}.cold-wind{stroke:var(--load-muted);stroke-dasharray:70 12 8 12;opacity:.6;animation:wind-flow 4s linear infinite}.heat-haze{stroke:var(--load-accent);stroke-width:1.5;opacity:.4;animation:heat-shimmer 4s ease-in-out infinite}.ripples{stroke:var(--load-muted);opacity:.5;stroke-width:1;animation:ripple-glow 2.5s ease-in-out infinite}
  @keyframes cloud-drift{from{transform:translate(-30px,-2px)}to{transform:translate(32px,2px)}}@keyframes sun-turn{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes star-glow{0%,100%{opacity:.25}50%{opacity:.8}}@keyframes water-flow{to{stroke-dashoffset:-102}}@keyframes plant-sway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(3.5deg)}}@keyframes wheel-turn{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes mist-drift{from{transform:translateX(-26px);opacity:.35}to{transform:translateX(30px);opacity:.9}}@keyframes festival-glow{0%,100%{opacity:.55}50%{opacity:1}}@keyframes window-glow{0%,100%{opacity:.4}50%{opacity:1}}@keyframes fountain-flow{to{stroke-dashoffset:-18}}@keyframes rain-fall{to{transform:translate(-60px,80px)}}@keyframes snow-fall{to{transform:translateY(100px)}}@keyframes wind-flow{to{stroke-dashoffset:-102}}@keyframes heat-shimmer{0%,100%{transform:translateY(2px);opacity:.2}50%{transform:translateY(-3px);opacity:.55}}@keyframes ripple-glow{0%,100%{opacity:.25}50%{opacity:.65}}
  .lake-ripples ellipse{stroke:var(--load-accent);stroke-width:1.65;transform-box:fill-box;transform-origin:center;animation:lake-ripple 3.6s ease-out infinite;animation-delay:var(--ripple-delay)}
  @keyframes lake-ripple{0%{transform:scale(.25);opacity:0}15%{opacity:.85}100%{transform:scale(1.5);opacity:0}}
  .landmark-art{position:relative;overflow:hidden}
  .motion-layer{position:absolute;inset:0;pointer-events:none;will-change:transform,opacity;backface-visibility:hidden;transform:translateZ(0)}
  .motion-layer img{display:block;width:100%;height:100%}
  .composited>svg :global([data-loading-motion-source]){visibility:hidden}
  .composited>svg :global(*){animation:none!important}
  .motion-layer.waterlines{animation:surface-drift 2.4s linear infinite}
  .motion-layer.stars{animation:star-glow 5s ease-in-out infinite}
  .motion-layer.window-lights{animation:window-glow 3.6s ease-in-out infinite}
  .motion-layer.fountain-jets{animation:jet-pulse 1.5s ease-in-out infinite}
  .motion-layer.cold-wind{animation:wind-drift 3s linear infinite}
  .ripple-layer{animation:lake-ripple 3.6s ease-out infinite;animation-delay:var(--ripple-delay)}
  @keyframes surface-drift{0%{transform:translateX(-1%);opacity:0}20%,80%{opacity:.85}100%{transform:translateX(1.5%);opacity:0}}
  @keyframes jet-pulse{0%,100%{transform:scaleY(.82);opacity:.6}50%{transform:scaleY(1);opacity:1}}
  @keyframes wind-drift{0%{transform:translateX(-2%);opacity:0}20%,80%{opacity:.6}100%{transform:translateX(2%);opacity:0}}
  @media(prefers-reduced-motion:reduce){.landmark-art *{animation:none!important}.stars path{opacity:.55}.festival-light{opacity:.85}.motion-layer{will-change:auto}}
</style>
