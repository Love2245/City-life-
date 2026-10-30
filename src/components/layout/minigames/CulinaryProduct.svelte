<script lang="ts">
 import {artDefs,foodGlyph,drinkGlyph,plateGlyph,streetFoodGlyph} from '../../../lib/culinaryIllustration';
 import type {FoodPlacement} from '../../../lib/restaurantCraft';
 import {cocktailGlassArt} from '../../../lib/restaurantPresentation';
 let {mode,ids,title='',placed=[],thumbnail=false,plating=false}:{mode:string;ids:string[];title?:string;placed?:FoodPlacement[];thumbnail?:boolean;plating?:boolean}=$props();
 const artworkId=$props.id(); const p=artworkId.replace(/[^a-zA-Z0-9]/g,'')+'product';
 const foodIds=$derived(ids.filter(id=>!['plate','wine'].includes(id)));
 const foods=$derived(plating||placed.length?placed:foodIds.map((id,i)=>({id,x:foodIds.length===1?50:35+i%2*30,y:foodIds.length<=2?50:36+Math.floor(i/2)*34})));
</script>
<svg class="culinary-product" class:thumbnail data-art-style="kitchen-ink" data-product-mode={mode} viewBox="0 0 180 120" preserveAspectRatio="xMidYMid meet" role="img" aria-label={title}>
 {@html artDefs(p)}
 {#if mode==='cocktail'}<g transform="translate(16 1) scale(1.05)">{@html cocktailGlassArt(ids)}</g>
 {:else if mode==='cup'}<g transform="translate(20 3) scale(1.15)">{@html drinkGlyph(p,ids,1,ids.includes('cup'),ids.includes('espresso')&&!ids.includes('ice'),1)}</g>
 {:else if mode==='grill'}<g transform="translate(22 4) scale(1.18)">{@html streetFoodGlyph(p,ids)}</g>
 {:else}<g transform="translate(5 1) scale(1.42 1.3)">{@html plateGlyph(p)}</g>{#each foods as food,i (food.id+':'+i)}<g transform={`translate(${food.x*1.6-24} ${food.y*.85-20}) scale(.62)`}>{@html foodGlyph(food.id,p,1,false)}</g>{/each}{/if}
</svg>
<style>.culinary-product{display:block;width:240px;height:160px;max-width:100%;}.thumbnail{width:85px;height:55px;}</style>


