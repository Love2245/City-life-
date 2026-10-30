<script lang="ts">
  import { gameState } from '../../stores/gameStore.svelte';
  import { showToast } from '../../stores/uiStore.svelte';
  import { FRIDGE_TIERS, canonicalCookingItemId, fridgeCapacity, fridgeList, fridgeUsedSlots } from '../../game/core/fridge';
  import { getItem } from '../../game/core/items';
  import { eatStoredMeal, getRecipe, recipeIdFromCookedMeal, storedMealBatches, storedMealEffects, type CookingQuality } from '../../game/core/cooking';
  import { mealEffectText } from '../../lib/cookingView';
  import {playSound} from '../../lib/audio';

  const stock = $derived(fridgeList(gameState));
  const meals = $derived.by(() => stock.flatMap(row => {
    const recipe = getRecipe(recipeIdFromCookedMeal(row.id) ?? '');
    return recipe ? storedMealBatches(gameState, row.id).map(batch => ({ id: row.id, recipe, ...batch })) : [];
  }));
  const ingredients = $derived.by(() => {
    const grouped = new Map<string, { id: string; qty: number; slots: number; item: ReturnType<typeof getItem> }>();
    for (const row of stock) {
      if (getRecipe(recipeIdFromCookedMeal(row.id) ?? '')) continue;
      const id = canonicalCookingItemId(row.id);
      const entry = grouped.get(id) ?? { id, qty: 0, slots: 0, item: getItem(id) ?? row.item };
      entry.qty += row.qty;
      entry.slots += row.slots;
      grouped.set(id, entry);
    }
    return [...grouped.values()];
  });
  const capacity = $derived(fridgeCapacity(gameState));
  const used = $derived(fridgeUsedSlots(gameState));
  const tierName = $derived(gameState.fridge?.tier ? FRIDGE_TIERS[gameState.fridge.tier].name : '未安装冰箱');

  function eat(id: string, quality: CookingQuality) {
    const result = eatStoredMeal(gameState, id, quality);
    if(result.ok)playSound('eat');
    showToast(result.ok && result.recipe ? `🍽️ 吃掉${quality}品质的${result.recipe.name}` : `🚫 ${result.reason ?? '无法食用'}`);
  }
</script>

<section class="fridge-contents" aria-label="冰箱库存">
  <div class="capacity"><strong>🧊 {tierName}</strong><span>{used} / {capacity} 格 · 剩余 {Math.max(0, capacity - used)} 格</span></div>
  <div class="capacity-track" aria-hidden="true"><i style:width={`${capacity ? Math.min(100, used / capacity * 100) : 0}%`}></i></div>
  <section aria-label="冷藏成品">
    <div class="section-title"><h3>做好的菜</h3><span>每份占 2 格</span></div>
    <div class="meal-list">
      {#each meals as row (`${row.id}:${row.quality}`)}
        <article class="meal-card" data-meal-id={row.id} data-quality={row.quality}>
          <div class="meal-heading"><span class="meal-icon" aria-hidden="true">{row.recipe.icon}</span><div><strong>{row.recipe.name}</strong><small>{row.quality}品质 · {row.quantity} 份</small></div></div>
          <p>{row.recipe.desc}</p>
          <div class="meal-effects">{mealEffectText(storedMealEffects(row.recipe, row.quality))}</div>
          <button aria-label={`食用一份${row.quality}${row.recipe.name}`} onclick={() => eat(row.id, row.quality)}>食用一份</button>
        </article>
      {:else}<p class="empty">冰箱里还没有做好的菜。在厨房做好后选择“放入冰箱”，就能在这里查看和食用。</p>{/each}
    </div>
    {#if meals.length}<p class="hint">以上为每份菜的效果，属性达到上限时按上限结算。厨艺在做菜结算时获得，食用冷藏成品不会再次增加。</p>{/if}
  </section>
  <section aria-label="冷藏食材与调料">
    <div class="section-title"><h3>食材与调料</h3><span>{ingredients.reduce((sum, row) => sum + row.qty, 0)} 份</span></div>
    <div class="ingredient-list">
      {#each ingredients as row (row.id)}<div class="ingredient"><span>{row.item?.icon ?? '📦'} {row.item?.name ?? row.id}</span><small>×{row.qty} · {row.slots} 格</small></div>
      {:else}<p class="empty">没有冷藏食材或调料。背包里的材料仍可在厨房使用。</p>{/each}
    </div>
  </section>
</section>

<style>
  .fridge-contents{color:#eef2ff;min-width:0}.capacity,.section-title,.meal-heading,.ingredient{display:flex;align-items:center;gap:10px;justify-content:space-between}.capacity{flex-wrap:wrap;font-size:14px}.capacity span,.section-title span,.ingredient small{font-size:12px;color:#acbad6}.capacity-track{height:5px;margin:12px 0 20px;border-radius:8px;background:#ffffff15;overflow:hidden}.capacity-track i{display:block;height:100%;background:#86d5d0}.section-title{margin:18px 0 10px}.section-title h3{font-size:16px;margin:0}.meal-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:10px}.meal-card{padding:15px;border:1px solid #ffffff1c;border-radius:14px;background:#ffffff08;min-width:0}.meal-heading{justify-content:flex-start}.meal-icon{font-size:30px}.meal-heading strong{font-size:16px}.meal-heading small{display:block;color:#ffd889;font-size:12px;margin-top:4px}.meal-card p{font-size:12px;color:#aebbd4;line-height:1.6;margin:10px 0}.meal-effects{color:#b7ead9;font-size:13px;line-height:1.8;overflow-wrap:anywhere}.meal-card button{margin-top:12px;min-height:40px;padding:8px 16px;border-radius:9px;border:1px solid #ffe1a555;background:#ffd16620;color:#ffe1a5;cursor:pointer}.meal-card button:hover{background:#ffd16635}.hint,.empty{color:#9eacc7;font-size:12px;line-height:1.7}.empty{grid-column:1/-1;margin:0;padding:15px;border:1px dashed #ffffff24;border-radius:12px}.ingredient-list{display:grid;gap:7px}.ingredient{padding:10px 12px;background:#ffffff08;border-radius:9px;flex-wrap:wrap;font-size:13px}.hint{margin:10px 0 0}
</style>
