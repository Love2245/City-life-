<script lang="ts">
 import FoodArt from './FoodArt.svelte';
 import IllustratedFood from './IllustratedFood.svelte';
 import {cocktailIngredientArt} from '../../../lib/restaurantPresentation';
 let {id,label='',legacy=false,cocktail=false}:{id:string;label?:string;legacy?:boolean;cocktail?:boolean}=$props();
</script>
{#if cocktail&&['cup','beer','gin','tonic','lime','syrup','wine','whisky','cognac','ice','water'].includes(id)}<svg class="food-art cocktail-ingredient" viewBox="0 0 150 120" role="img" aria-label={label} data-ingredient={id}>{@html cocktailIngredientArt(id)}</svg>{:else if legacy}<FoodArt {id} {label}/>{:else}<IllustratedFood {id} {label}/>{/if}
<style>.cocktail-ingredient{width:54px;height:44px;display:block;max-width:100%;}</style>
