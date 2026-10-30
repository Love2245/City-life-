<script lang="ts">
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { pushLog } from "../../game/engine";
  import { advanceHours } from "../../game/core/time";
  import { getItem } from "../../game/core/items";
  import {
    canUseCookingWorkbench,
    cookFreeform,
    getRecipe,
    isRecipeUnlocked,
    matchFreeformRecipe,
    pendingCookOf,
    recipeList,
    selectKnownRecipeIngredients,
    settlePendingCook,
    type RecipeDef,
  } from "../../game/core/cooking";
  import {
    canStoreInFridge,
    fridgeCapacity,
    canonicalCookingItemId,
    fridgeRemainingSlots,
    cookingCategoryOf,
    cookingStock,
  } from "../../game/core/fridge";
  import FridgeContents from './FridgeContents.svelte';
  import { mealEffectText } from '../../lib/cookingView';
  import {playInteractionSound,playSound} from '../../lib/audio';

  let selectedIngredients = $state<string[]>([]);
  let selectedSeasonings = $state<string[]>([]);
  let selectedRecipeId = $state<string | null>(null);
  let codexOpen = $state(false);

  const stock = $derived(cookingStock(gameState));
  const availableIngredients = $derived(stock.filter((row) => !["seasoning", "prepared"].includes(cookingCategoryOf(row.id) ?? "")).map((row) => ({ ...row, item: getItem(row.id) })));
  const availableSeasonings = $derived(stock.filter((row) => cookingCategoryOf(row.id) === "seasoning").map((row) => ({ ...row, item: getItem(row.id) })));
  const knownRecipes = $derived(recipeList().filter((recipe) => recipe.freeForm && isRecipeUnlocked(gameState, recipe.id)).map((recipe) => ({ recipe, selection: selectKnownRecipeIngredients(gameState, recipe.id) })));
  const hasLegacyStock = $derived(stock.some((row) => row.sources.some((source) => ["vegetable", "farm_vegetable", "meat"].includes(source.id))));
  const previewRecipe = $derived(selectedRecipeId ? getRecipe(selectedRecipeId) : matchFreeformRecipe(selectedIngredients, selectedSeasonings));
  const pendingCook = $derived(pendingCookOf(gameState) ?? null);
  const environment = $derived(canUseCookingWorkbench(gameState));

  function close(): void {
    // v1.43：ESC 与「✕ / 返回」走同一条关闭路径，绝不丢已完成的成品。
    // 能放进冰箱就先存起来（尊重玩家「留着以后吃」的意图），冰箱放不下才立即食用。
    if (gameState.cooking?.pendingCook) {
      const pending = pendingCookOf(gameState);
      if (pending) settle(canStoreInFridge(gameState, `cooked:${pending.recipe.id}`, 1) ? "store" : "eat");
      // 存冰箱意外失败时兜底立即食用：宁可吃掉，也不能让投入白费。
      if (gameState.cooking?.pendingCook) settle("eat");
    }
    uiState.modal = null;
    selectedIngredients = [];
    selectedSeasonings = [];
    selectedRecipeId = null;
  }

  // 本组件自己处理 Escape（全局 ESC 已对 cooking 让位），保证关闭时走上面的兜底结算。
  $effect(() => {
    if (uiState.modal !== "cooking") return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  function addIngredient(id: string): void {
    const row = availableIngredients.find((value) => value.id === id);
    const source = row?.sources.find((value) => selectedIngredients.filter((selected) => selected === value.id).length < value.qty);
    if (selectedIngredients.length >= 3 || !source) return;
    selectedIngredients = [...selectedIngredients, source.id];
    selectedRecipeId = null;
    playInteractionSound('chop');
  }
  function removeIngredient(index: number): void {
    selectedIngredients = selectedIngredients.filter((_, i) => i !== index);
    selectedRecipeId = null;
  }
  function toggleSeasoning(id: string): void {
    if (selectedSeasonings.includes(id)) selectedSeasonings = selectedSeasonings.filter((v) => v !== id);
    else if (selectedSeasonings.length < 2) selectedSeasonings = [...selectedSeasonings, id];
    selectedRecipeId = null;
  }
  function chooseRecipe(id: string): void {
    const selection = selectKnownRecipeIngredients(gameState, id);
    if (!selection.ok) return;
    selectedIngredients = selection.ingredients;
    selectedSeasonings = selection.seasonings;
    selectedRecipeId = id;
  }

  function cook(): void {
    const result = cookFreeform(gameState, selectedIngredients, selectedSeasonings, selectedRecipeId ?? undefined);
    if (!result.ok) {
      showToast(`🚫 ${result.reason ?? "现在还不能开火"}`);
      return;
    }
    playInteractionSound('cook');
    // 失败作品同样占用一段操作时间；投入已在 core 中一次性扣除。
    if (result.failed || !result.recipe || !result.quality) {
      advanceHours(gameState, 1);
      showToast(`💨 ${result.reason ?? "这锅组合没有形成菜肴，失败作品已自动销毁"}`);
      selectedIngredients = [];
      selectedSeasonings = [];
      selectedRecipeId = null;
      return;
    }
    advanceHours(gameState, result.recipe.duration);
    // L9：多放 / 配方用不到的食材与调料不会被扣掉，这里明确告诉玩家退回了什么。
    const returned = result.returned ?? [];
    if (returned.length > 0) {
      const names = returned.map((id) => getItem(id)?.name ?? id).join("、");
      pushLog(gameState, "↩️", `多出来的材料没用上，先留着了：${names}`);
      showToast(`↩️ 多出的材料已退回：${names}`);
    }
    selectedIngredients = [];
    selectedSeasonings = [];
    selectedRecipeId = null;
  }

  function settle(disposition: "eat" | "store"): void {
    const result = settlePendingCook(gameState, disposition);
    if (!result.ok) {
      showToast(`🧊 ${result.reason}`);
      return;
    }
    if (disposition === "store") {
      playInteractionSound('fridge_close');
      pushLog(gameState, result.recipe.icon, `${result.recipe.name}已放入冰箱（${result.quality}品质，占 2 格）`);
      showToast(`🧊 ${result.recipe.name}已放入冰箱`);
    } else {
      playSound('eat');
      showToast(`🍽️ 立即吃掉${result.quality}品质的${result.recipe.name}，饱腹和心情都提升了`);
    }
  }

  function recipeName(recipe: RecipeDef): string {
    return isRecipeUnlocked(gameState, recipe.id) ? recipe.name : "未解锁菜品";
  }

  const CATEGORY_NAMES: Record<string, string> = {
    vegetable: "蔬菜",
    tomato: "番茄",
    cabbage: "卷心菜",
    potato: "土豆",
    carrot: "胡萝卜",
    onion: "洋葱",
    mushroom: "蘑菇",
    meat: "肉类",
    pork: "猪肉",
    chicken: "鸡肉",
    beef: "牛肉",
    egg: "鸡蛋",
    milk: "牛奶",
    rice: "大米",
  };

  function ingredientLabel(id: string): string {
    return CATEGORY_NAMES[id] ?? getItem(id)?.name ?? id;
  }

  function formulaText(recipe: RecipeDef): string {
    const ingredients = recipe.freeForm
      ? Object.entries(recipe.ingredientCategories ?? {}).map(([id, qty]) => `${ingredientLabel(id)} ×${qty}`)
      : Object.entries(recipe.needs).map(([id, qty]) => `${ingredientLabel(id)} ×${qty}`);
    const seasonings = recipe.seasonings?.map((id) => ingredientLabel(id)) ?? [];
    return [...ingredients, ...seasonings].join(" + ") || "基础配方";
  }

  function effectText(recipe: RecipeDef): string {
    return mealEffectText(recipe.effects);
  }

  function lockedHint(recipe: RecipeDef): string {
    const categories = recipe.freeForm
      ? Object.keys(recipe.ingredientCategories ?? {}).map(ingredientLabel).join("、")
      : "基础食材";
    return `组合分类：${categories} · 线索：${recipe.clue ?? "尝试不同食材与调料组合"}`;
  }
</script>

<div class="cook-overlay" role="dialog" aria-modal="true" aria-label="自由烹饪工作台">
  <div class="cook-modal">
    <button class="close" aria-label="关闭烹饪工作台" onclick={close}>✕</button>
    <header>
      <div class="eyebrow">v1.42 · COOKING WORKBENCH</div>
      <h2>🍳 自由烹饪工作台</h2>
      <p>从背包和冰箱共同取料，食材 1–3 份，调料 0–2 种；顺序不影响菜谱。</p>
    </header>

    {#if pendingCook}
      <section class="result-card">
        <div class="result-icon">{pendingCook.recipe.icon}</div>
        <div><strong>{pendingCook.recipe.name}</strong><span>{pendingCook.quality}品质 · 已耗时 {pendingCook.recipe.duration} 小时</span><span class="result-effects">{mealEffectText(pendingCook.effects)}</span></div>
        <div class="result-actions">
          <button class="primary" onclick={() => settle("eat")}>🍽️ 立即食用</button>
          {#if gameState.fridge?.tier}
            <button onclick={() => settle("store")} disabled={!canStoreInFridge(gameState, `cooked:${pendingCook.recipe.id}`, 1)}>🧊 放入冰箱（2格）</button>
          {/if}
        </div>
        {#if fridgeCapacity(gameState) > 0 && !canStoreInFridge(gameState, `cooked:${pendingCook.recipe.id}`, 1)}<small>冰箱当前剩余 {fridgeRemainingSlots(gameState)} 格，无法存放成品。</small>{/if}
      </section>
    {:else if !environment.ok}
      <div class="blocked">🚫 {environment.reason}</div>
    {:else}
      <div class="cooking-layout">
      <div class="cooking-main">
      <section class="workbench-grid">
        <div class="ingredients panel">
          <div class="panel-head"><strong>食材</strong><span>{selectedIngredients.length}/3</span></div>
          <div class="item-grid">
            {#each availableIngredients as row (row.id)}
              <button class:selected={selectedIngredients.some((id) => canonicalCookingItemId(id) === row.id)} onclick={() => addIngredient(row.id)} disabled={selectedIngredients.length >= 3 || selectedIngredients.filter(id => canonicalCookingItemId(id) === row.id).length >= row.qty}>
                <span class="item-icon">{row.item?.icon}</span><span>{row.item?.name}</span><small>×{row.qty}</small>
              </button>
            {:else}<div class="empty">还没有可用食材。去菜市场、农场采购吧。</div>{/each}
          </div>
          <div class="selected-row" aria-label="已选食材">
            {#each selectedIngredients as id, index}<button class="chip" onclick={() => removeIngredient(index)} title="移除">{getItem(canonicalCookingItemId(id))?.icon} {getItem(canonicalCookingItemId(id))?.name} ×1 ✕</button>{/each}
          </div>
          {#if hasLegacyStock}<p class="legacy-note">旧蔬菜库存按卷心菜、旧肉类库存按猪肉合并计算，原有库存不会丢失。</p>{/if}
        </div>
        <div class="seasonings panel">
          <div class="panel-head"><strong>调料</strong><span>{selectedSeasonings.length}/2</span></div>
          <div class="item-grid seasoning-grid">
            {#each availableSeasonings as row (row.id)}
              <button class:selected={selectedSeasonings.includes(row.id)} onclick={() => toggleSeasoning(row.id)}>{row.item?.icon} {row.item?.name}<small>×{row.qty}</small></button>
            {:else}<div class="empty">便利店可以买到盐、糖、酱油、辣椒粉和沙拉酱。</div>{/each}
          </div>
        </div>
      </section>
      <section class="fire-row">
        <div class="preview">{#if previewRecipe}<span>{previewRecipe.icon}</span> 可做：<strong>{previewRecipe.name}</strong>{:else}<span>🫕</span> 自由组合，开火后揭晓结果{/if}</div>
        <button class="fire" disabled={selectedIngredients.length < 1} onclick={cook}>🔥 开火</button>
      </section>
      </div>
      <aside class="known-recipes panel" aria-label="已知菜谱">
        <div class="panel-head"><strong>📖 已知菜谱</strong><span>{knownRecipes.length} 道</span></div>
        <p class="known-intro">选择菜谱会自动选料；开火时才消耗。</p>
        <div class="known-list">
          {#each knownRecipes as row (row.recipe.id)}
            <button class:chosen={selectedRecipeId === row.recipe.id} data-recipe-id={row.recipe.id} disabled={!row.selection.ok} title={row.selection.reason ?? `选入${row.recipe.name}的材料`} onclick={() => chooseRecipe(row.recipe.id)}>
              <span><strong>{row.recipe.icon} {row.recipe.name}</strong><small>{row.selection.ok ? formulaText(row.recipe) : row.selection.reason}</small></span>
              <span aria-hidden="true">{row.selection.ok ? "选料" : row.selection.missing.length ? "缺料" : "未满足"}</span>
            </button>
          {:else}
            <p class="empty">还没有已知菜谱。尝试组合食材，或读烹饪书学习。</p>
          {/each}
        </div>
      </aside>
      </div>
    {/if}

    <section class="fridge-status">
      <button class="codex-toggle" onclick={() => (codexOpen = !codexOpen)}>{codexOpen ? "收起" : "打开"}菜谱图鉴</button>
    </section>
    <FridgeContents />

    {#if codexOpen}
      <section class="codex panel">
        <div class="codex-head"><strong>菜谱图鉴 · {gameState.cooking?.unlockedRecipeIds?.length ?? 0}/{recipeList().length}</strong><span>成功一次永久解锁</span></div>
        <div class="recipe-grid">
          {#each recipeList() as recipe (recipe.id)}
            {@const unlocked = isRecipeUnlocked(gameState, recipe.id)}
            <article class:locked={!unlocked}>
              <span class="recipe-icon">{unlocked ? recipe.icon : "❔"}</span>
              <div>
                <strong>{recipeName(recipe)}</strong>
                {#if unlocked}
                  <p>{recipe.desc}</p>
                  <p class="recipe-meta">配方：{formulaText(recipe)}<br />效果：{effectText(recipe) || "暂无额外属性"} · 品质：普通 / 美味（厨艺 3 级） / 完美（厨艺 6 级）</p>
                {:else}
                  <p>{lockedHint(recipe)}</p>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      </section>
    {/if}

    <button class="cancel" onclick={close}>返回场景</button>
  </div>
</div>

<style>
  .cook-overlay{position:fixed;inset:0;z-index:80;background:rgba(7,10,20,.78);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px)}
  .cook-modal{width:min(960px,100%);max-height:min(92vh,900px);overflow:auto;background:linear-gradient(145deg,#1c243d,#121829);border:1px solid rgba(255,209,102,.35);border-radius:22px;padding:24px;color:#f1f4ff;box-shadow:0 24px 80px rgba(0,0,0,.4)}
  .close{float:right;border:0;background:transparent;color:#d6ddff;font-size:22px;cursor:pointer}.eyebrow{font-size:11px;letter-spacing:.16em;color:#8bd7ff}h2{margin:4px 0 4px;font-size:27px}header p{margin:0 0 18px;color:#adb8d6;font-size:14px}.blocked{padding:18px;border-radius:14px;background:rgba(220,80,80,.16);color:#ffd1d1}
  .workbench-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:14px}.panel{background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.09);border-radius:15px;padding:14px}.panel-head,.codex-head,.fridge-status{display:flex;align-items:center;gap:10px}.panel-head{justify-content:space-between;margin-bottom:10px;color:#dce6ff}.panel-head span,.codex-head span{font-size:12px;color:#9ba8c6}.item-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}.item-grid button{min-height:76px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(17,24,45,.72);color:#eef2ff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;transition:.16s}.item-grid button:hover,.item-grid button.selected{border-color:#ffd166;background:rgba(255,209,102,.15);transform:translateY(-1px)}.item-grid button:disabled{opacity:.45;cursor:not-allowed;transform:none}.item-icon{font-size:27px}.item-grid small{color:#aeb9d4}.selected-row{display:flex;flex-wrap:wrap;gap:6px;min-height:28px;margin-top:12px}.chip{border:1px solid #76c9ff;background:rgba(79,168,221,.13);border-radius:999px;color:#dff4ff;padding:6px 9px;cursor:pointer}.seasoning-grid button{min-height:58px;flex-direction:row;font-size:13px}.empty{grid-column:1/-1;color:#9daaca;font-size:13px;padding:14px 4px}.fire-row{display:flex;align-items:center;gap:12px;margin:14px 0}.preview{flex:1;min-height:50px;display:flex;align-items:center;gap:8px;color:#b7c4e2;background:rgba(255,255,255,.04);border-radius:12px;padding:10px}.preview span{font-size:25px}.fire,.primary{border:0;border-radius:12px;background:linear-gradient(135deg,#ffb347,#ff7854);color:#24150a;padding:12px 18px;font-weight:700;cursor:pointer}.fire:disabled,.result-actions button:disabled{opacity:.4;cursor:not-allowed}.result-card{display:flex;align-items:center;gap:14px;padding:18px;border-radius:15px;background:linear-gradient(135deg,rgba(255,209,102,.19),rgba(120,209,255,.12));border:1px solid rgba(255,209,102,.4)}.result-icon{font-size:48px}.result-card strong{font-size:20px}.result-card span{display:block;color:#b9c5e1;margin-top:5px}.result-actions{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}.result-actions button{border:1px solid rgba(255,255,255,.22);border-radius:10px;background:rgba(255,255,255,.08);color:#eef2ff;padding:10px 12px;cursor:pointer}.result-card small{flex-basis:100%;color:#ffcf8a}.fridge-status{padding:10px 2px;color:#b8c7e8;font-size:13px}.codex-toggle{margin-left:auto;border:0;background:none;color:#8bd7ff;cursor:pointer}.codex-head{justify-content:space-between;margin-bottom:12px}.recipe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}.recipe-grid article{display:flex;gap:9px;padding:10px;border-radius:10px;background:rgba(255,255,255,.04)}.recipe-grid article.locked{opacity:.62}.recipe-icon{font-size:24px}.recipe-grid p{margin:4px 0 0;font-size:12px;color:#aeb9d4;line-height:1.4}.cancel{display:block;margin:16px auto 0;border:0;background:transparent;color:#9fb1d7;cursor:pointer;padding:7px 18px}@media(max-width:680px){.cook-overlay{padding:8px}.cook-modal{padding:16px;border-radius:16px}.workbench-grid{grid-template-columns:1fr}.result-card{flex-wrap:wrap}.result-actions{margin-left:0;width:100%}.result-actions button{flex:1}.recipe-grid{grid-template-columns:1fr}}
  .recipe-meta{color:#c8d5f2!important;font-size:11px!important}
  .cooking-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,280px);gap:14px;align-items:start}.cooking-main{min-width:0}.known-recipes{min-width:0}.known-intro,.legacy-note{font-size:12px;line-height:1.5;color:#aeb9d4;margin:0 0 10px}.legacy-note{margin:8px 0 0;color:#e4cd9b}.known-list{display:grid;gap:7px;max-height:360px;overflow:auto}.known-list button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;border:1px solid rgba(255,255,255,.13);border-radius:10px;background:rgba(17,24,45,.72);color:#eef2ff;padding:10px;cursor:pointer}.known-list button.chosen{border-color:#ffd166;background:rgba(255,209,102,.15)}.known-list button:disabled{opacity:.6;cursor:not-allowed}.known-list button span:first-child{min-width:0}.known-list button span:last-child{font-size:12px;white-space:nowrap;color:#ffcf8a}.known-list button small{display:block;margin-top:4px;color:#bdc9e2;line-height:1.4;overflow-wrap:anywhere}.known-list .empty{margin:0}.known-list button:disabled span:last-child{color:#aeb9d4}@media(max-width:760px){.cooking-layout{grid-template-columns:1fr}.known-list{max-height:240px}}
</style>
