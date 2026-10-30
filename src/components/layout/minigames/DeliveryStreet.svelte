<script lang="ts">
  import { roadVehicleSymbols } from '../../../lib/deliveryRoadArt';
  import type { ShiftSnapshot } from '../../../game/core/deliveryShift';
  import { STOP_LINE } from '../../../game/core/deliveryShift';
  let { frame, variant, destination, mode }: { frame: ShiftSnapshot; variant: number; destination: string; mode: string } = $props();
  const night = $derived(variant === 3);
  const skyline = Array.from({length: 14}, (_, i) => ({x: i * 85 - 60, h: 35 + (i * 31 % 70), w: 50 + i * 7 % 32}));
  const buildings = Array.from({length: 6}, (_, i) => i);
  function project(at: number, lane: number) { const z = Math.max(0, Math.min(1.16, 1 - (at - frame.travel) / 58)); return {z, x: 500 + lane * (28 + z*z*238), y: 140 + z*z*340, scale: .16 + z*z*.87}; }
  const light = $derived(project(STOP_LINE, 0));
</script>
<svg viewBox="0 0 1000 570" class="street-art" role="img" aria-label={`前往${destination}的街道，${frame.green?'绿灯':'红灯'}，车辆位于${frame.laneTarget<0?'左':frame.laneTarget>0?'右':'中'}车道`}>
  <defs>{@html roadVehicleSymbols}
    <linearGradient id="street-sky" x2="0" y2="1"><stop stop-color={night?'#162a45':variant===2?'#9acacc':'#9ec9da'}/><stop offset="1" stop-color={night?'#b77a73':'#fbefd7'}/></linearGradient>
    <linearGradient id="street-road" x2="0" y2="1"><stop stop-color={night?'#586176':'#939994'}/><stop offset="1" stop-color={night?'#242d40':'#596c70'}/></linearGradient>
    <linearGradient id="street-wall" x2="1" y2="0"><stop stop-color={night?'#755f66':'#ddc49e'}/><stop offset="1" stop-color={night?'#4a4253':'#b6a88a'}/></linearGradient>
    <radialGradient id="street-glow"><stop stop-color="#fff0b3" stop-opacity=".55"/><stop offset="1" stop-color="#fff0b3" stop-opacity="0"/></radialGradient>
    
    
    
  </defs>
  <rect width="1000" height="570" fill="url(#street-sky)"/>
  {#if night}<circle cx="814" cy="52" r="22" fill="#ffe9b6"/>{#each [70,170,295,620,723,934] as x}<circle cx={x} cy={22+x%52} r="1.5" fill="#fff1d1"/>{/each}{:else}<circle cx="805" cy="56" r="39" fill="#ffedb6" opacity=".85"/><path d="M120 44q28-20 49 0q20-12 33 5H105zM385 73q30-23 58 0h26q14 6 17 14H362z" fill="#fff9e8" opacity=".6"/>{/if}
  {#each skyline as b}<g opacity=".55"><rect x={b.x} y={143-b.h} width={b.w} height={b.h+18} rx="3" fill={night?'#405271':variant===2?'#5d949f':'#8ba79f'}/>{#each [0,1,2] as col}<path d={`M${b.x+12+col*15} ${153-b.h}v${b.h-17}`} stroke={night?'#d9ae82':'#d9e5d7'} stroke-width="5" stroke-dasharray="8 11"/>{/each}</g>{/each}
  <path d="M0 155h1000v415H0z" fill={night?'#49505b':variant===4?'#91b7a9':'#b9c5a1'}/>
  {#if variant===2||variant===4}<path d="M0 197l367-37-42 410H0z" fill={night?'#476e87':'#7eb7c5'}/><path d="M0 255l338-57M0 327l319-78M0 436l282-79" stroke="#d4e6db" stroke-width="3" opacity=".35"/>{/if}
  <path d="M407 147h186l381 423H26z" fill={night?'#77808b':'#e6dcca'}/><path d="M425 147h150l331 423H94z" fill="url(#street-road)"/>
  {#each [-1,1] as side}
    {#each buildings as i}{@const z=(i/6+frame.travel/110)%1}<g transform={`translate(${500+side*(112+z*z*448)} ${147+z*z*430}) scale(${.25+z*z*1.23})`}>
      {#if variant===2}<path d="M-56-130h100v150H-56z" fill={night?'#506a82':'#8db7c2'}/><path d="M44-130l26 16V20H44z" fill="#648a9d"/><path d="M-49-119h85m-85 25h85m-85 25h85m-85 25h85m-85 25h85" stroke="#d8ebe2" stroke-width="8"/>
      {:else if variant===1}<rect x="-58" y="-85" width="116" height="105" fill="#bbc8c5"/><path d="M-66-84L0-119l66 35z" fill="#658899"/><rect x="-38" y="-48" width="76" height="69" fill="#7e9a9f"/><path d="M-37-37h74m-74 13h74m-74 13h74m-74 13h74" stroke="#acc0bd" stroke-width="5"/>
      {:else}<rect x="-58" y="-88" width="116" height="108" fill="url(#street-wall)"/><path d="M-66-88L0-125l66 37z" fill={night?'#936e68':i%2?'#957859':'#ae7860'}/><rect x="-39" y="-61" width="26" height="24" rx="2" fill={night?'#f7c573':'#7ba0a4'}/><rect x="14" y="-61" width="26" height="24" rx="2" fill={night?'#f5b877':'#7ba0a4'}/><rect x="-16" y="-25" width="32" height="45" fill="#4e6b70"/><path d="M-58-26h116v16H-58z" fill={night?'#c18b71':'#e9c28b'}/><path d="M-58-26h19v16h-19m38-16h19v16h-19m38-16h19v16H18m38-16h2v16h-2" fill="#779891"/>{/if}
      <path d="M-67 21h134" stroke={night?'#8a7980':'#eee2c7'} stroke-width="7"/>
    </g>{/each}
    {#each [200,315,495] as y,i}<g transform={`translate(${500+side*(90+y*.64)} ${y}) scale(${.3+i*.45})`}><path d="M0 0v-85" stroke={night?'#9ca8ae':'#697b7c'} stroke-width="5"/><path d={`M0-85q${-side*24}-15 ${-side*30} 0`} stroke="#65767c" stroke-width="5" fill="none"/><ellipse cx={-side*30} cy="-84" rx="12" ry="5" fill="#ffeab3"/>{#if night}<circle cx={-side*30} cy="-84" r="40" fill="url(#street-glow)"/>{/if}</g>{/each}
  {/each}
  {#if variant===4}<path d="M389 182L40 559M611 182l349 377" stroke="#d9d2b3" stroke-width="10"/><path d="M370 204v45m-51 8v59m-78 26v66m-106 48v87M630 204v45m51 8v59m78 26v66m106 48v87" stroke="#9fae9c" stroke-width="7"/>{/if}
  {#each [0,1,2,3,4,5,6] as i}{@const z=((i/7+frame.travel/33)%1)}{@const y=148+z*z*435}{@const half=25+z*z*115}<path d={`M${500-half} ${y}l${-4-z*11} ${7+z*27}M${500+half} ${y}l${4+z*11} ${7+z*27}`} stroke={night?'#cfcaac':'#f6eed4'} stroke-width={1+z*4}/>{/each}
  {#if STOP_LINE-frame.travel>-9&&STOP_LINE-frame.travel<60}<g opacity={Math.min(1,light.z*2)}><path d={`M${500-(55+light.z*light.z*350)} ${light.y+10}h${110+light.z*light.z*700}`} stroke="#fff1cc" stroke-width={2+light.z*11}/>{#each [-3,-2,-1,0,1,2,3] as i}<path d={`M${500+i*light.z*75} ${light.y-9}l${i*light.z*9} ${-light.z*29}`} stroke="#f9efd7" stroke-width={light.z*36}/>{/each}<g transform={`translate(${500+(68+light.z*light.z*355)} ${light.y}) scale(${.25+light.z})`}><path d="M0 0v-120" stroke="#4c6067" stroke-width="6"/><rect x="-16" y="-144" width="32" height="67" rx="8" fill="#253842" stroke="#b9c0b1" stroke-width="2"/><circle cy="-127" r="9" fill={frame.green?'#633f40':'#ff7f64'}/><circle cy="-93" r="9" fill={frame.green?'#8cdbab':'#35594c'}/></g></g>{/if}
  {#each [...frame.traffic].sort((a,b)=>b.at-a.at) as car}{@const p=project(car.at,car.lane)}{#if car.at-frame.travel<58&&car.at-frame.travel>-12}<g transform={`translate(${p.x} ${p.y}) scale(${p.scale})`} style={`color:${car.color}`}><use href="#road-car" x="-62" y="-110" width="124" height="125"/></g>{/if}{/each}
  <g transform={`translate(${500+frame.lane*249} 507)`} class:impact={frame.phase==='crashed'}>
    {#if mode==='food'}<use href="#road-rider" x="-57" y="-150" width="114" height="165"/>{:else if mode==='parcel'}<use href="#road-van" x="-65" y="-145" width="130" height="155"/>{:else}<g style={`color:${night?'#dfb864':'#78b1ad'}`}><use href="#road-car" x="-62" y="-110" width="124" height="125"/>{#if night}<rect x="-21" y="-117" width="42" height="15" rx="4" fill="#ffe5a1"/><text y="-106" text-anchor="middle" font-size="11" fill="#5e5141">TAXI</text>{/if}</g>{/if}
    {#if frame.phase==='crashed'}<path d="M-72-61l-17-28 33 11 7-39 21 30 28-35 6 42 39-11-17 31 39 18-42 7" fill="#ffe5a1" stroke="#ee9166" stroke-width="5"/>{/if}
  </g>
  <path d="M0 555h1000v15H0z" fill="#203b49" opacity=".12"/>
</svg>
<style>.street-art{width:100%;height:100%;display:block;}.impact{animation:impact .16s linear 4;}@keyframes impact{50%{opacity:.3}}@media(prefers-reduced-motion:reduce){.impact{animation:none}}</style>

