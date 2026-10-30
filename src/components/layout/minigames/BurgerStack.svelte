<script lang="ts">
  import layers from '../../../assets/ui/v1.475/burger-layers-v1.png';
  let { ids, names, thumbnail = false }: { ids: string[]; names: Record<string, string>; thumbnail?: boolean } = $props();
  const sprites: Record<string, { column: number; row: number; height: number }> = {
    bun_bottom: { column: 0, row: 0, height: .18 }, patty: { column: 1, row: 0, height: .15 },
    cheese: { column: 2, row: 0, height: .10 }, lettuce: { column: 3, row: 0, height: .12 },
    tomato: { column: 0, row: 1, height: .08 }, bacon: { column: 1, row: 1, height: .10 },
    egg: { column: 2, row: 1, height: .11 }, bun_top: { column: 3, row: 1, height: .23 },
  };
</script>

<div class="burger-stack" class:thumbnail aria-label={ids.map(id => names[id] || id).join('、') || '待制作汉堡'}>
  {#each ids as id, i (id + ':' + i)}
    {@const sprite = sprites[id]}
    {#if sprite}
      <div class="burger-layer" data-layer-id={id} style={`z-index:${i};height:calc(var(--burger-size) * ${sprite.height})`}>
        <span class="burger-art" role="img" aria-label={names[id] || id} style={`background-image:url('${layers}');background-position:${sprite.column / 3 * 100}% ${sprite.row * 100}%;bottom:calc(var(--burger-size) * ${sprite.row ? -.32 : -.22})`}></span>
      </div>
    {/if}
  {/each}
</div>

<style>
  .burger-stack { --burger-size: 210px; width:var(--burger-size); display:flex; flex-direction:column-reverse; align-items:center; position:relative; filter:drop-shadow(0 5px 3px #56341a30); }
  .burger-layer { position:relative; width:100%; flex:none; animation:ingredient-drop .22s ease-out; }
  .burger-art { position:absolute; width:100%; aspect-ratio:1; background-size:400% 200%; background-repeat:no-repeat; pointer-events:none; }
  .thumbnail { --burger-size:64px; filter:none; }
  .thumbnail .burger-layer { animation:none; }
  @keyframes ingredient-drop { from { translate:0 -15px; opacity:0; } to { translate:0 0; opacity:1; } }
  @media (prefers-reduced-motion:reduce) { .burger-layer { animation:none; } }
</style>
