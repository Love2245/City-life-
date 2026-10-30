<script lang="ts">
  import CulinaryProduct from './CulinaryProduct.svelte';
  import BurgerStack from './BurgerStack.svelte';
  let { mode, ids, names, title }: { mode:string; ids:string[]; names:Record<string,string>; title:string } = $props();
</script>
{#if mode === 'burger'}
  <BurgerStack {ids} {names} thumbnail/>
{:else}
  <CulinaryProduct {mode} {ids} {title} thumbnail/>
{/if}
