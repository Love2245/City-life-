<script lang="ts">
  import type { DialoguePortrait } from "../../game/core/npcPortraits";
  import { fade } from "svelte/transition";
  import { motionDurationMs } from "../../lib/motion";

  interface Props {
    portrait: DialoguePortrait | null | undefined;
    className?: string;
    alt?: string;
    zoomable?: boolean;
  }

  let { portrait, className = "", alt = "", zoomable = false }: Props = $props();
  let zoom = $state(1);
  const instanceId=$props.id();

  function bindZoomHandlers(node: HTMLElement) {
    const onWheel = (event: WheelEvent) => zoomPortrait(event);
    const onDoubleClick = () => resetZoom();
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("dblclick", onDoubleClick);
    return {
      destroy() {
        node.removeEventListener("wheel", onWheel);
        node.removeEventListener("dblclick", onDoubleClick);
      },
    };
  }

  function zoomPortrait(event: WheelEvent): void {
    if (!zoomable) return;
    event.preventDefault();
    const next = zoom + (event.deltaY < 0 ? 0.15 : -0.15);
    zoom = Math.max(1, Math.min(2.5, Math.round(next * 100) / 100));
  }

  function resetZoom(): void {
    if (zoomable) zoom = 1;
  }
</script>

<div
  class="portrait-stack"
  class:zoomable
  class:zoomed={zoom > 1}
  class:portrait-flipped={portrait?.flipX}
  data-portrait-layered={portrait?.layers?.length ? "true" : "false"}
  data-portrait-calibrated={portrait?.atlas?"true":"false"}
  data-portrait-class={className || undefined}
  data-portrait-kind={portrait?.kind}
  aria-label={alt || undefined}
  role="img"
  title={zoomable ? "滚轮缩放立绘，双击还原" : undefined}
  use:bindZoomHandlers
  style={`--portrait-zoom:${zoom};${zoomable ? "pointer-events:auto" : ""}`}
>
  {#if portrait?.layers?.length}
    <!-- 不用资源 URL 做 key：不同服装层可能复用同一张透明素材，Vite 也会将相同内容合并为同一 URL。 -->
    <div class="portrait-stack-art">
      {#each portrait.layers as layer, index (index)}
        {#if portrait.layerRecipes?.[index]}
          {@const recipe=portrait.layerRecipes[index]}
          {@const filterId=`${instanceId}-alpha-${index}`}
          <svg class={`portrait-stack-image ${className}`} viewBox="0 0 1024 1536" aria-hidden={index>0} style:transform={portrait.layerTransforms?.[index]||undefined} style:transform-origin={portrait.layerTransforms?.[index]?'49% 2%':undefined} style:mask-image={portrait.layerMasks?.[index]?`url("${portrait.layerMasks[index]}")`:undefined} style:mask-size="100% 100%" style:mask-mode="alpha">
            {#if recipe.alphaCutoff}<defs><filter id={filterId} x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncA type="linear" slope={1/(1-recipe.alphaCutoff)} intercept={-recipe.alphaCutoff/(1-recipe.alphaCutoff)} /></feComponentTransfer></filter></defs>{/if}
            <image href={layer} x="0" y="0" width="1024" height="1536" transform={recipe.matrix} filter={recipe.alphaCutoff?`url(#${filterId})`:undefined} />
          </svg>
        {:else}
        <img
          class={`portrait-stack-image ${className}`}
          src={layer}
          alt={index === 0 ? alt : ""}
          aria-hidden={index > 0}
          draggable="false"
          style:transform={portrait.layerTransforms?.[index] || undefined}
          style:transform-origin={portrait.layerTransforms?.[index] ? "49% 2%" : undefined}
          style:mask-image={portrait.layerMasks?.[index] ? `url("${portrait.layerMasks[index]}")` : undefined}
          style:mask-size={portrait.layerMasks?.[index] ? "100% 100%" : undefined}
          style:mask-mode={portrait.layerMasks?.[index] ? "alpha" : undefined}
          style:mask-repeat={portrait.layerMasks?.[index] ? "no-repeat" : undefined}
        />
        {/if}
      {/each}
    </div>
  {:else if portrait?.atlas && portrait.source}
    {@const atlasClipId=`${instanceId}-authored-${portrait.atlas.key.replace(/[^a-z0-9_-]/gi,'-')}`}
    <div class="portrait-stack-art">
      {#key portrait.atlas.key}
        <svg class={`portrait-stack-image ${className}`} viewBox={portrait.atlas.viewBox.join(' ')} preserveAspectRatio="xMidYMin meet" aria-hidden="true" data-face-rendering="authored-portrait" data-face-emotion={portrait.emotionCategory} in:fade={{duration:motionDurationMs('--dur-fast')}} out:fade={{duration:motionDurationMs('--dur-fast')/2}}>
          <defs>
            {#if portrait.atlas.clipPath}<clipPath id={atlasClipId} clipPathUnits="userSpaceOnUse"><path d={portrait.atlas.clipPath}/></clipPath>{/if}
            {#if portrait.atlas.rowClipPath}<clipPath id={`${atlasClipId}-row`} clipPathUnits="userSpaceOnUse"><path d={portrait.atlas.rowClipPath}/></clipPath>{/if}
          </defs>
          <g clip-path={portrait.atlas.rowClipPath?`url(#${atlasClipId}-row)`:undefined}><image href={portrait.source} width={portrait.atlas.width} height={portrait.atlas.height} clip-path={portrait.atlas.clipPath?`url(#${atlasClipId})`:undefined}/></g>
        </svg>
      {/key}
    </div>
  {:else if portrait?.source}
    <div class="portrait-stack-art">
      <img class={`portrait-stack-image ${className}`} src={portrait.source} {alt} draggable="false" />
    </div>
  {:else}
    <span class="portrait-stack-fallback" aria-label={alt || "人物"}>👤</span>
  {/if}
  {#if zoomable && zoom > 1}
    <span class="portrait-zoom-indicator" aria-live="polite">{Math.round(zoom * 100)}%</span>
  {/if}
</div>

<style>
  .portrait-stack {
    position: relative;
    display: block;
    overflow: visible;
    isolation: isolate;
  }

  .portrait-stack.zoomable {
    cursor: zoom-in;
    touch-action: none;
    user-select: none;
  }

  .portrait-stack.zoomed { z-index: 8; }

  .portrait-stack-art {
    position: absolute;
    inset: 0;
    overflow: visible;
    transform: scale(var(--portrait-zoom, 1));
    transform-origin: center top;
  }

  /* Player layers and their masks share a 1024×1536 canvas. Keep the image
     element at that ratio even when a preview/portrait slot is much taller:
     object-fit alone only fits the bitmap, while CSS masks fit the element. */
  .portrait-stack[data-portrait-layered="true"] .portrait-stack-art,
  .portrait-stack[data-portrait-calibrated="true"] .portrait-stack-art {
    bottom: auto;
    width: 100%;
    height: auto;
    aspect-ratio: 2 / 3;
  }

  .portrait-stack[data-portrait-layered="true"] .portrait-stack-image,
  .portrait-stack[data-portrait-calibrated="true"] .portrait-stack-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center top;
  }

  .portrait-stack-image {
    position: absolute;
    inset: 0;
    display: block;
    max-width: none;
    user-select: none;
    pointer-events: none;
  }

  .portrait-stack-fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 28px;
    opacity: 0.7;
  }

  .portrait-zoom-indicator {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 9;
    padding: 3px 7px;
    border: 1px solid rgba(255, 231, 173, .42);
    border-radius: 999px;
    background: rgba(10, 19, 31, .82);
    color: #fff0c8;
    font: 700 10px/1.2 system-ui, sans-serif;
    pointer-events: none;
  }
</style>
