<script lang="ts">
  import { spriteUrl } from "../../../lib/minigameSprites";

  let { id, label = "" }: { id: string; label?: string } = $props();
  const art = $derived(spriteUrl("food", id));
  const drink = $derived(/^(hot_water|espresso|coffee|tea|water|juice|orange|soda|energy|beer|wine)(_|$)/.test(id));
  const color = $derived(/milk|foam/.test(id) ? '#fff3db' : /tea|caramel|sugar|honey/.test(id) ? '#b77929' : /water|ice/.test(id) ? '#a7deed' : /juice|orange/.test(id) ? '#fba529' : /wine/.test(id) ? '#802841' : '#58372b');
</script>

{#if art && id !== 'caramel'}
  <img class="food-art" src={art} alt={label || id} draggable="false" />
{:else}
<svg viewBox="0 0 100 90" role="img" aria-label={label || id}>
  <ellipse cx="50" cy="79" rx="34" ry="6" fill="#0a1018" opacity=".2" />
  <g stroke="#583d30" stroke-width="1.5" stroke-linejoin="round">
  {#if id === 'plate' || id === 'food-plate'}
    <ellipse cx="50" cy="50" rx="42" ry="26" fill="#e0d9c9"/><ellipse cx="50" cy="47" rx="39" ry="24" fill="#fffaf0"/><ellipse cx="50" cy="47" rx="29" ry="17" fill="none" stroke="#ccbea5"/>
  {:else if id === 'cup' || id === 'food-cup' || drink}
    {#if /juice|orange|soda|energy|beer/.test(id)}
      <path d="M27 19H73L68 75H32Z" fill={/soda|energy/.test(id)?'#598aa0':'#dca345'}/><ellipse cx="50" cy="19" rx="23" ry="6" fill="#e8d7b5"/><path d="M57 49L64 8L80 4" fill="none" stroke="#f0e8d1" stroke-width="5"/><path d="M36 32L39 64" stroke="#ffefbc" stroke-width="5" opacity=".6"/><circle cx="50" cy="52" r="12" fill="#f1d399"/>
    {:else if /wine/.test(id)}
      <path d="M31 10H69L66 34Q64 48 50 48Q36 48 34 34Z" fill="#d7edf2" fill-opacity=".6"/><path d="M35 25H65L63 35Q50 53 37 35Z" fill={color}/><path d="M50 48V73M34 76H66" fill="none" stroke="#b0cad0" stroke-width="4"/>
    {:else}
      <path d="M71 30Q96 27 88 51Q82 61 70 55" fill="none" stroke="#e3d2b2" stroke-width="7"/>
      <path d="M19 23H76L70 68Q48 85 26 68Z" fill="#f0e5ce"/><ellipse cx="47" cy="24" rx="28" ry="10" fill="#c9b392"/>
      {#if id !== 'cup' && id !== 'food-cup'}<ellipse cx="47" cy="25" rx="24" ry="7" fill={color} stroke="none"/>{/if}
      <path d="M30 39L33 64" stroke="#fff9e7" stroke-width="5" opacity=".7"/>
      {#if /coffee|espresso/.test(id)}<path d="M35 15Q27 9 35 2M50 14Q58 8 50 1" fill="none" stroke="#e8d2ac" opacity=".6"/>{/if}
    {/if}
  {:else if id === 'milk'}
    <path d="M28 27L38 12H64L75 27V77H28Z" fill="#f4eee2"/><path d="M28 27H75V42H28Z" fill="#5f96b0"/><path d="M38 12V26H75M64 12V27" fill="none"/><path d="M37 57Q51 44 66 57V69H37Z" fill="#b4d4dc" stroke="none"/><path d="M38 12H64L68 7H42Z" fill="#88b4c5"/>
  {:else if id === 'ice'}
    {#each [0,1,2] as i}<g transform={`translate(${i===1?34:i===2?18:8} ${i===1?12:i===2?43:23}) rotate(${i*12-10} 18 15)`}><path d="M0 5L26 0L37 11L12 17Z" fill="#e3fbff"/><path d="M0 5L12 17V38L0 26Z" fill="#86c9dd"/><path d="M12 17L37 11V32L12 38Z" fill="#bcebf2" stroke="#619cae"/><path d="M17 20L28 18" stroke="white" stroke-width="3"/></g>{/each}
  {:else if /foam|cream/.test(id)}
    <ellipse cx="50" cy="58" rx="36" ry="17" fill="#d8c6a8"/><path d="M18 53Q10 39 29 36Q27 24 43 26Q49 8 62 27Q83 24 81 42Q95 60 69 62H32Q14 62 18 53" fill="#fff9e7"/><path d="M31 42Q40 32 49 38M55 49Q64 35 76 45" fill="none" stroke="#e0d2b8"/>
  {:else if id === 'croissant'}
    <path d="M11 57Q9 27 31 24Q48 8 67 24Q88 29 90 57L78 71L65 50Q49 38 34 50L22 71Z" fill="#c98a47"/><path d="M25 30L37 48M40 22L45 44M58 22L55 44M73 32L64 49" stroke="#f3cf86" stroke-width="7"/><path d="M13 56L23 57M78 55L88 56" stroke="#a46735" stroke-width="5"/>
  {:else if id === 'cookie'}
    <path d="M18 33Q30 10 52 16Q84 17 84 47Q88 71 61 78Q33 84 17 63Q9 49 18 33" fill="#c58c50" stroke="#8a5c36" stroke-width="3"/>{#each [[28,38],[53,28],[68,47],[44,55],[58,68],[25,60]] as p}<path d={`M${p[0]} ${p[1]}l7 -2 3 7-8 3Z`} fill="#694330"/>{/each}
  {:else if /cake|dessert/.test(id)}
    <path d="M18 39L65 19L86 50L32 71Z" fill="#f8e0a8"/><path d="M18 39L32 71L86 50V70L32 85L18 59Z" fill="#c9a071"/><path d="M20 45L33 76L84 56V63L33 83L20 54Z" fill="#f2d7b3"/><path d="M48 29Q44 16 56 13Q67 20 62 28Z" fill="#b84e40"/>
  {:else if /bun|bread|toast/.test(id)}
    <path d={id==='bun_bottom'?'M12 45H88Q89 73 70 75H29Q10 74 12 45Z':'M12 54Q13 14 48 14Q85 13 88 54L82 70H19Z'} fill="#d9a15c"/><path d="M17 51Q49 41 83 51" fill="none" stroke="#f2cf87" stroke-width="7"/>
    {#each [28,40,55,68] as x}<path d={`M${x} 30l4 -3`} stroke="#ffdf9d" stroke-width="3"/>{/each}
  {:else if id === 'soup'}
    <path d="M14 43H86Q79 75 50 75Q21 75 14 43Z" fill="#f0dfbc"/><ellipse cx="50" cy="42" rx="36" ry="14" fill="#c8743d"/><path d="M30 41Q38 34 46 42T62 42T76 40" fill="none" stroke="#f5c878" stroke-width="4"/><circle cx="37" cy="37" r="3" fill="#78a453" stroke="none"/><circle cx="65" cy="38" r="3" fill="#78a453" stroke="none"/>
  {:else if id === 'salad'}
    <path d="M15 44H85Q78 76 50 76Q22 76 15 44Z" fill="#f1e6cf"/><ellipse cx="50" cy="44" rx="34" ry="12" fill="#6c9b45"/><path d="M30 43Q38 31 46 44Q54 27 62 43Q70 34 76 44" fill="none" stroke="#b6d66b" stroke-width="5"/><circle cx="36" cy="40" r="4" fill="#df7650" stroke="none"/><circle cx="67" cy="40" r="4" fill="#e6bd4b" stroke="none"/>
  {:else if id === 'steak'}
    <path d="M13 39Q24 15 57 23Q91 22 87 51Q83 74 49 72Q11 76 13 39Z" fill="#a94f3b"/><path d="M25 35L37 60M43 29L55 62M61 31L73 56" fill="none" stroke="#67362d" stroke-width="5"/><path d="M24 32Q49 20 73 31" fill="none" stroke="#f1b46c" stroke-width="3"/><circle cx="66" cy="48" r="5" fill="#e3a36c" stroke="none"/>
  {:else if id === 'pasta'}
    <ellipse cx="50" cy="57" rx="39" ry="19" fill="#f2e4c7"/><path d="M17 52Q50 72 83 52" fill="none" stroke="#d6c09a" stroke-width="4"/><path d="M25 43Q38 31 48 45T70 43M27 51Q41 39 53 52T76 49M35 58Q47 47 59 59T74 56" fill="none" stroke="#dfb35d" stroke-width="6" stroke-linecap="round"/><path d="M37 40Q50 33 62 40" fill="none" stroke="#bd583f" stroke-width="4"/>
  {:else if id === 'fish'}
    <path d="M12 46Q42 13 75 37L93 27V66L75 54Q42 78 12 46Z" fill="#d8b788"/><path d="M28 37L39 57M45 30L56 61M62 32L74 55" fill="none" stroke="#8b5f45" stroke-width="4"/><circle cx="72" cy="43" r="3" fill="#4d3d35" stroke="none"/>
  {:else if /patty|meat|sausage|bacon/.test(id)}
    <path d="M13 39Q24 15 57 23Q92 22 87 52Q83 75 48 72Q11 77 13 39Z" fill="#985132"/><path d="M26 36L36 61M43 29L55 63M61 31L73 57" fill="none" stroke="#59372d" stroke-width="5"/><path d="M24 33Q49 21 72 32" fill="none" stroke="#e3a36c" stroke-width="3"/>
  {:else if /lettuce|veg|cabbage/.test(id)}
    {#each [0,1,2,3,4] as i}<ellipse cx={30+i*10} cy={42+(i%2)*15} rx="17" ry="23" transform={`rotate(${i*35-70} ${30+i*10} ${42+(i%2)*15})`} fill={i%2?'#80a83d':'#4e803e'} stroke="#355c36"/>{/each}<path d="M23 64L78 32M43 54L39 31M62 44L72 61" stroke="#c2d778" stroke-width="2"/>
  {:else if id === 'tomato'}
    <ellipse cx="50" cy="48" rx="36" ry="25" fill="#b84030"/><ellipse cx="50" cy="44" rx="32" ry="22" fill="#e7754b"/>{#each [0,1,2,3,4] as i}<ellipse cx={50+20*Math.cos(i*1.26)} cy={44+13*Math.sin(i*1.26)} rx="5" ry="3" fill="#ffe29a" stroke="none"/>{/each}
  {:else if id === 'cheese'}
    <path d="M12 36L70 21L89 46L29 66Z" fill="#f5c64e"/><path d="M12 36L29 66V74L12 45M29 74L89 54V46" fill="#c9922e"/>
  {:else if id === 'egg'}
    <path d="M15 47Q10 28 36 31Q46 14 62 30Q90 25 87 47Q97 67 70 67Q49 85 33 68Q6 70 15 47" fill="#fff7d9"/><circle cx="50" cy="46" r="16" fill="#edac2a"/><path d="M41 41Q47 34 55 38" fill="none" stroke="#ffe290" stroke-width="4"/>
  {:else if id === 'caramel'}
    <g data-art="caramel-cube" stroke="#70451f" stroke-width="2.5" stroke-linejoin="round">
      <path d="M21 34L50 18L80 34L50 51Z" fill="#f1c267"/>
      <path d="M21 34L50 51V79L21 62Z" fill="#bf702c"/>
      <path d="M50 51L80 34V62L50 79Z" fill="#dc923d"/>
      <path d="M31 36L50 26L68 36L50 46Z" fill="#ffdf91" stroke="none" opacity=".78"/>
      <path d="M29 42L29 58M59 57L72 49" fill="none" stroke="#ffe2a0" stroke-width="3" stroke-linecap="round"/>
      <circle cx="41" cy="36" r="1.7" fill="#fff3cb" stroke="none"/>
    </g>
  {:else if /choco|cookie|cake|dessert/.test(id)}
    <path d="M17 27H80V68H17Z" fill="#5f352d"/><path d="M17 22H80V51H17Z" fill={/cake|dessert/.test(id)?'#f2dbc1':'#865543'}/><path d="M38 23V50M59 23V50M17 36H80" fill="none" stroke="#4a2a26" stroke-width="3"/>
  {:else if /skewer|gluten/.test(id)}
    <path d="M17 77L79 14" stroke="#c9a66e" stroke-width="5"/>{#each [0,1,2] as i}<rect x={23+i*16} y={46-i*16} width="22" height="19" rx="5" transform={`rotate(40 ${34+i*16} ${56-i*16})`} fill="#b66c37"/>{/each}
  {:else if /noodle|nuts|pearl/.test(id)}
    <path d="M13 38H87Q79 77 50 77Q21 77 13 38" fill="#ecdec1"/><ellipse cx="50" cy="38" rx="37" ry="15" fill={id==='pearl'?'#4b2c27':'#bd8245'}/>
    {#each [0,1,2,3,4] as i}{#if /pearl|nuts/.test(id)}<circle cx={26+i*11} cy={36+(i%2)*6} r="5" fill="#452d25"/>{:else}<path d={`M${24+i*10} 31q-9 10 2 16`} fill="none" stroke="#f6d38d" stroke-width="4"/>{/if}{/each}
  {:else if /sauce|chili|sugar|caramel/.test(id)}
    <path d="M38 12H62V27L74 36V76H26V36L38 27Z" fill={id==='chili'?'#bc4938':'#b78338'}/><path d="M38 8H62V19H38Z" fill="#313f48"/><path d="M28 45H72V65H28Z" fill="#f3deb1"/><path d="M40 51H60M40 58H55" stroke="#866141"/>
  {:else if id === 'box' || id === 'wrap'}
    <path d="M11 30L72 21L91 59L25 76Z" fill="#dcc59c"/><path d="M11 30L25 76L20 83L6 36M25 76L91 59V67L20 83" fill="#aa8155"/>
  {:else}
    <path d="M19 31L74 23L83 72L24 78Z" fill="#d6a758"/>{#each [0,1,2,3] as i}<path d={`M${30+i*11} 32l4 35`} stroke="#f6da90" stroke-width="6"/>{/each}
  {/if}
  </g>
</svg>
{/if}

<style>
  svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 2px 2px #0002)}
  .food-art{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;user-select:none;pointer-events:none}
</style>
