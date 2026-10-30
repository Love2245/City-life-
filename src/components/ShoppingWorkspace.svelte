<script lang="ts">
  import type { GameState, Order } from "../game/types";
  import { SHOP_CATALOG, getShopItemPrices, placeShopOrder, claimOrder, type ShopItem } from "../game/core/shop";
  import { gameDay, fromLinearDay, START_EPOCH } from "../game/core/calendar";
  import { formatMoney } from "../lib/format";

  /** 两端传入同一游戏状态；目录、扣款、配送和领取全部使用原订单系统。 */
  let { state: game, onMessage }: { state: GameState; onMessage?: (text: string) => void } = $props();
  type Category = "全部" | ShopItem["cat"];
  const categories: readonly Category[] = ["全部", "服装", "电子", "家具", "奢侈品"];
  let page = $state<"catalog" | "orders">("catalog");
  let category = $state<Category>("全部");
  let query = $state("");
  let feedback = $state("");
  const catalog = $derived(SHOP_CATALOG
    .filter((item) => category === "全部" || item.cat === category)
    .filter((item) => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .map((item) => ({ ...item, ...getShopItemPrices(game, item.id) })));
  // 外卖与网购共用 orders，网购页只展示自己的订单。
  const orders = $derived((game.orders ?? []).filter((order) => order.kind === "shop"));
  const readyCount = $derived(orders.filter((order) => order.arrived).length);

  function report(text: string): void {
    feedback = text;
    onMessage?.(text);
  }
  function buy(itemId: string): void {
    report(placeShopOrder(game, itemId).text);
  }
  function receive(orderId: string): void {
    report(claimOrder(game, orderId).text);
  }
  function arrivalText(order: Order): string {
    if (order.arrived) return "已送达 · 可领取入包";
    const remaining = Math.max(0, order.orderDay + order.etaDays - gameDay(game.time));
    const date = fromLinearDay(START_EPOCH + order.orderDay + order.etaDays);
    return `配送中 · ${date.month}月${date.day}日到货（${remaining > 0 ? `还需 ${remaining} 天` : "今天送达"}）`;
  }
</script>

<section class="shopping-workspace" aria-label="网购商城">
  <nav class="shop-tabs" aria-label="商城页面">
    <button type="button" class:active={page === "catalog"} aria-pressed={page === "catalog"} onclick={() => (page = "catalog")}>商品分类</button>
    <button type="button" class:active={page === "orders"} aria-pressed={page === "orders"} onclick={() => (page = "orders")}>
      我的订单{orders.length > 0 ? `（${orders.length}）` : ""}
      {#if readyCount > 0}<span class="ready-count">{readyCount} 待领</span>{/if}
    </button>
  </nav>

  {#if page === "catalog"}
    <p class="shop-hint">价格比当前实体店低约一成，下单后 3 天到货；在「我的订单」领取到背包。</p>
    <nav class="shop-categories" aria-label="商品分类">
      {#each categories as cat (cat)}
        <button type="button" class:active={category === cat} aria-pressed={category === cat} onclick={() => (category = cat)}>{cat}</button>
      {/each}
    </nav>
    <label class="shop-search">
      <span>名称搜索</span>
      <input type="search" placeholder="搜索商品名称" bind:value={query} />
    </label>
    <div class="shop-summary"><span>{catalog.length} 件商品</span><span>可用现金 ¥{formatMoney(game.player.money)}</span></div>
    <div class="shop-products">
      {#each catalog as item (item.id)}
        <article class="shop-row" data-item-id={item.id}>
          <span class="shop-icon" aria-hidden="true">{item.icon}</span>
          <div class="shop-info">
            <div class="shop-name">{item.name}<span class="shop-cat">{item.cat}</span></div>
            <p class="shop-description">{item.desc}</p>
            <div class="shop-price"><span>¥<strong class="shop-now">{formatMoney(item.price)}</strong></span><span class="shop-off">实体参考 ¥{formatMoney(item.offline)}</span></div>
            <span class="shop-shipping">3 天配送 · 到货后手动领取</span>
          </div>
          <button type="button" class="mini-btn" disabled={game.player.money < item.price} onclick={() => buy(item.id)} aria-label={`下单${item.name}`}>
            {game.player.money < item.price ? "余额不足" : "下单"}
          </button>
        </article>
      {:else}
        <div class="shop-empty"><p>没有符合条件的商品。</p><button type="button" class="mini-btn" onclick={() => { category = "全部"; query = ""; }}>重置筛选</button></div>
      {/each}
    </div>
  {:else}
    <p class="shop-hint">手机和电脑共用订单。到货后领取入包，衣物、手机和家具可在背包使用或装备。</p>
    <div class="shop-orders">
      {#each orders as order (order.id)}
        <article class="shop-row order-row" data-order-id={order.id}>
          <span class="shop-icon" aria-hidden="true">{order.icon}</span>
          <div class="shop-info">
            <div class="shop-name">{order.name}</div>
            <p class="order-status" class:ready={order.arrived}>{arrivalText(order)}</p>
            <span class="shop-shipping">实付 ¥{formatMoney(order.price)} · 订单 #{order.id.replace(/^ord_/, "")}</span>
          </div>
          {#if order.arrived}<button type="button" class="mini-btn" onclick={() => receive(order.id)}>领取入包</button>{/if}
        </article>
      {:else}
        <div class="shop-empty"><p>暂无待收货订单，已领取的商品可在背包查看。</p><button type="button" class="mini-btn" onclick={() => (page = "catalog")}>去选购</button></div>
      {/each}
    </div>
  {/if}
  {#if feedback}<p class="shop-feedback" role="status">{feedback}</p>{/if}
</section>

<style>
  .shopping-workspace { min-width: 0; color: var(--text-main, #edf0fb); font-size: 13px; }
  .shop-tabs, .shop-categories { display: flex; flex-wrap: wrap; gap: 6px; }
  .shop-tabs { padding-bottom: 10px; border-bottom: 1px solid var(--stroke, #ffffff24); }
  .shop-tabs button, .shop-categories button, .mini-btn {
    border: 1px solid var(--stroke, #ffffff24); border-radius: 9px; padding: 7px 10px;
    background: var(--glass, #ffffff0a); color: inherit; font: inherit; cursor: pointer; min-height: 34px;
  }
  .shop-tabs button { flex: 1; font-weight: 650; }
  button.active { border-color: var(--accent, #ffd166); background: color-mix(in srgb, var(--accent, #ffd166) 15%, transparent); }
  button:hover:not(:disabled) { background: color-mix(in srgb, var(--accent, #ffd166) 20%, transparent); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent, #ffd166); outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .shop-hint { margin: 10px 0; color: var(--text-dim, #b9c2d9); font-size: 12px; line-height: 1.55; }
  .ready-count { display: inline-block; margin-left: 4px; color: var(--accent, #ffd166); font-size: 11px; }
  .shop-search { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0 8px; font-size: 12px; }
  .shop-search input { flex: 1; min-width: 100px; padding: 9px 10px; border-radius: 8px; border: 1px solid var(--stroke, #ffffff24); background: var(--glass, #ffffff0a); color: inherit; font: inherit; }
  .shop-summary { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; color: var(--text-dim, #b9c2d9); font-size: 11px; margin: 8px 0; }
  .shop-row { display: flex; align-items: center; gap: 10px; padding: 12px; margin-bottom: 8px; border-radius: 12px; border: 1px solid var(--stroke, #ffffff24); background: var(--glass, #ffffff0a); }
  .shop-icon { flex: 0 0 28px; text-align: center; font-size: 24px; line-height: 1.25; }
  .shop-info { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .shop-name { font-weight: 650; line-height: 1.4; }
  .shop-cat { display: inline-block; font-weight: 400; font-size: 10px; margin-left: 8px; color: var(--text-dim, #b9c2d9); }
  .shop-description, .order-status { margin: 5px 0; font-size: 12px; line-height: 1.45; color: var(--text-dim, #b9c2d9); }
  .shop-price { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; color: var(--accent, #ffd166); }
  .shop-off { font-size: 10px; color: var(--text-dim, #b9c2d9); }
  .shop-shipping { display: block; margin-top: 4px; font-size: 10px; line-height: 1.45; color: var(--text-dim, #b9c2d9); }
  .mini-btn { flex-shrink: 0; max-width: 88px; }
  .shop-empty { padding: 18px 8px; text-align: center; color: var(--text-dim, #b9c2d9); }
  .shop-empty .mini-btn { max-width: none; }
  .ready { color: var(--ok, #7bd88f); }
  .shop-feedback { margin: 10px 0 0; padding: 9px; border-radius: 8px; background: var(--glass, #ffffff0a); font-size: 12px; line-height: 1.5; }
  @media (max-width: 480px) {
    .shop-row { gap: 7px; padding: 9px 8px; }
    .shop-icon { flex-basis: 22px; font-size: 21px; }
    .shop-row .mini-btn { max-width: 64px; padding: 7px; font-size: 12px; }
  }
</style>
