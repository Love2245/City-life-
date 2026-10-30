<script lang="ts">
  import { artDefs, foodGlyph } from '../../../lib/culinaryIllustration';
  let {id,label='',maturity=1}:{id:string;label?:string;maturity?:number}=$props();
  const artworkId=$props.id(); const prefix=artworkId.replace(/[^a-zA-Z0-9]/g,'')+'icon';
</script>
<svg class="food-art illustrated-food" data-art-style="kitchen-ink" data-food-id={id} viewBox="0 0 120 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label={label||id}>
  {@html artDefs(prefix)+foodGlyph(id,prefix,maturity)}
</svg>
<style>.illustrated-food{width:100%;height:100%;display:block;overflow:visible;}</style>

