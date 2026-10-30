<script lang="ts">
  import type {CatPortraitAsset} from '../lib/catArt';
  let {art,alt,zoom=1}:{art:CatPortraitAsset;alt:string;zoom?:number}=$props();
</script>
{#if art.frame}
  <svg class="portrait action-portrait" style:transform={`scale(${zoom})`} viewBox={`${art.frame.x} ${art.frame.y} ${art.frame.width} ${art.frame.height}`} preserveAspectRatio="xMidYMax meet" role="img" aria-label={alt}>
    <image href={art.src} width={art.frame.sheetWidth} height={art.frame.sheetHeight}/>
  </svg>
{:else}<img class="portrait" style:transform={`scale(${zoom})`} src={art.src} {alt} draggable="false"/>{/if}
<style>
.portrait{display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom;transform-origin:center bottom;filter:drop-shadow(0 12px 7px #06101580)}.action-portrait{overflow:hidden}
</style>
