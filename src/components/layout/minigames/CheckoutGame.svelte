<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { CheckoutCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 便利店收银模板（C）：购物篮扫码 → 计算应收 → 顾客付款 → 输入找零，耐心耗尽则投诉扣血。
   *  适用于便利店(日班/夜班) —— 同一玩法，仅商品池不同。 */
  let { cfg, onFinish }: { cfg: CheckoutCfg; onFinish: (ratio: number) => void } = $props();

  const lives0 = cfg.lives ?? 3;
  const customers0 = cfg.customers ?? 5;
  const timeLimit = cfg.timeLimit ?? 0;
  const patienceMs = cfg.patienceMs ?? 1.2;
  const notes = cfg.notes ?? [1, 5, 10, 20, 50, 100];
  const minBasket = cfg.minBasket ?? 3;
  const maxBasket = cfg.maxBasket ?? 6;
  const labels = { guest: "顾客", resource: "商品" };

  interface CartItem {
    inst: number;
    itemId: string;
    name: string;
    icon: string;
    price: number;
  }

  let customerIndex = 0;
  let basket = $state<CartItem[]>([]);
  let scanned = $state<CartItem[]>([]);
  let totalPrice = $state(0);
  let stage = $state<"scan" | "pay" | "done">("scan");
  let customerPay = $state(0);
  let payBills = $state<number[]>([]); // 占位，下面真正赋值
  let changeInput = $state("");
  let patience = $state(100);
  let lives = $state(lives0);
  let success = $state(0);
  let finished = $state(false);
  let shake = $state(false);
  let timeLeft = $state(timeLimit);
  let instSeq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  /** v1.3b2 九宫格键盘：纯触控输入，不再依赖系统数字键盘 */
  function press(k: string): void {
    if (finished || stage !== "pay") return;
    playSound("game");
    if (k === "⌫") {
      changeInput = changeInput.slice(0, -1);
      return;
    }
    if (k === ".") {
      if (changeInput.includes(".")) return;
      changeInput = (changeInput || "0") + ".";
      return;
    }
    if (changeInput.includes(".")) {
      const dp = changeInput.split(".")[1] ?? "";
      if (dp.length >= 2) return;
    } else if (changeInput.replace("-", "").length >= 4) {
      return;
    }
    if (changeInput === "0") {
      changeInput = k;
      return;
    }
    changeInput += k;
  }

  function clearInput(): void {
    if (finished || stage !== "pay") return;
    changeInput = "";
    playSound("game");
  }

  function initCustomer(): void {
    const count = minBasket + Math.floor(Math.random() * (maxBasket - minBasket + 1));
    const b: CartItem[] = [];
    for (let i = 0; i < count; i++) {
      const it = cfg.items[Math.floor(Math.random() * cfg.items.length)];
      b.push({ inst: ++instSeq, itemId: it.id, name: it.name, icon: it.icon, price: it.price });
    }
    basket = b;
    scanned = [];
    totalPrice = 0;
    stage = "scan";
    patience = 100;
    changeInput = "";
  }

  function scanItem(inst: number): void {
    if (finished || stage !== "scan") return;
    const idx = basket.findIndex((x) => x.inst === inst);
    if (idx < 0) return;
    const it = basket[idx];
    scanned = [...scanned, it];
    totalPrice += it.price;
    basket = basket.filter((x) => x.inst !== inst);
    playSound("game");
    if (basket.length === 0) enterPay();
  }

  function enterPay(): void {
    stage = "pay";
    customerPay = calculatePay(totalPrice);
    payBills = breakBills(customerPay);
  }

  function calculatePay(total: number): number {
    let minNote = notes.find((n) => n >= total);
    if (minNote == null) minNote = 100;
    const rand = Math.random();
    if (rand < 0.75) return minNote;
    const i = notes.indexOf(minNote);
    if (rand < 0.95 && i < notes.length - 1) return notes[i + 1];
    return 100;
  }

  function breakBills(amount: number): number[] {
    const out: number[] = [];
    let rem = amount;
    const sorted = [...notes].sort((a, b) => b - a);
    for (const n of sorted) {
      while (rem >= n) {
        out.push(n);
        rem -= n;
      }
    }
    return out.sort(() => Math.random() - 0.5);
  }

  function submitChange(): void {
    if (finished || stage !== "pay") return;
    const input = parseFloat(changeInput);
    const correct = customerPay - totalPrice;
    if (!isNaN(input) && Math.abs(input - correct) < 0.01) {
      success++;
      playSound("success");
      nextCustomer();
    } else {
      playSound("error");
      loseHp();
      if (lives > 0) nextCustomer();
    }
  }

  function loseHp(): void {
    lives--;
    shake = true;
    setTimeout(() => (shake = false), 350);
    if (lives <= 0) finishGame();
  }

  function nextCustomer(): void {
    customerIndex++;
    if (customerIndex >= customers0) {
      finishGame();
      return;
    }
    initCustomer();
  }

  function tick(): void {
    if (finished || stage === "done") return;
    if (timeLimit > 0) {
      timeLeft--;
      if (timeLeft <= 0) {
        finishGame();
        return;
      }
    }
    patience -= patienceMs;
    if (patience <= 0) {
      // 顾客投诉
      lives--;
      shake = true;
      setTimeout(() => (shake = false), 350);
      playSound("error");
      if (lives <= 0) {
        finishGame();
        return;
      }
      nextCustomer();
    }
  }

  function finishGame(): void {
    if (finished) return;
    finished = true;
    if (timer) clearInterval(timer);
    /**
     * v1.3b2：分母取「实际接待到的顾客数」，避免限时到点时还没轮到的顾客把得分拖低。
     * 未限时时 customerIndex 必然走到 customers0，与旧口径一致。
     */
    const denom = Math.max(1, Math.min(customers0, customerIndex + 1));
    onFinish(Math.min(1, success / denom));
  }

  onMount(() => {
    initCustomer();
    timer = setInterval(tick, 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<div class="cg" class:shake={shake}>
  <div class="cg-top">
    <span class="cg-stat">🧍 第 {Math.min(customerIndex + 1, customers0)}/{customers0} 位</span>
    <span class="cg-stat">✅ {success}</span>
    {#if timeLimit > 0}
      <span class="cg-stat" class:urgent={timeLeft <= 8}>⏱ {Math.max(0, timeLeft)}s</span>
    {/if}
    <span class="cg-lives">
      {#each Array(lives0) as _, i}
        <span class:lost={i >= lives}>❤️</span>
      {/each}
    </span>
  </div>

  <div class="cg-patience">
    <div
      class="cg-patience-fill"
      style="width:{Math.max(0, patience)}%;background:{patience > 60 ? 'var(--ok,#7bd88f)' : patience > 30 ? 'var(--accent,#ffd166)' : '#ff8a7a'}"
    ></div>
    <span class="cg-patience-text">耐心 {Math.max(0, Math.round(patience))}%</span>
  </div>

  <div class="cg-hint">
    {#if stage === "scan"}把商品逐个点击扫码{/if}
    {#if stage === "pay"}计算应找给 {labels.guest} 的零钱{/if}
  </div>

  <div class="cg-main">
    <div class="cg-basket">
      <div class="cg-sub">🛒 购物篮</div>
      <div class="cg-items">
        {#each basket as it (it.inst)}
          <button class="cg-item" onclick={() => scanItem(it.inst)}>
            <span class="cg-item-icon">{it.icon}</span>
            <span class="cg-item-name">{it.name}</span>
          </button>
        {/each}
        {#if basket.length === 0}<div class="cg-dim">已扫完，去右侧付款</div>{/if}
      </div>
    </div>

    <div class="cg-scan">
      <div class="cg-sub">📠 已扫码</div>
      <div class="cg-scanned">
        {#each scanned as it (it.inst)}
          <div class="cg-scanned-row"><span>{it.icon} {it.name}</span><span>¥{it.price.toFixed(2)}</span></div>
        {/each}
        <div class="cg-total"><span>合计</span><span>¥{totalPrice.toFixed(2)}</span></div>
      </div>

    </div>
  </div>

  {#if stage === "pay"}
    <!-- v1.3b2：付款/找零区独立整行，屏幕九宫格直接算 -->
    <div class="cg-pay">
      <div class="cg-pay-info">
        <div class="cg-pay-label">💰 {labels.guest}付款</div>
        <div class="cg-notes">
          {#each payBills as n}<span class="cg-note">¥{n}</span>{/each}
        </div>
        <div class="cg-calc">
          <div class="cg-calc-row"><span>实收</span><b>¥{customerPay.toFixed(2)}</b></div>
          <div class="cg-calc-row"><span>应收</span><b>−¥{totalPrice.toFixed(2)}</b></div>
          <div class="cg-calc-row eq"><span>应找零</span><b>= ?</b></div>
        </div>
      </div>

      <div class="cg-pad">
        <div class="cg-screen">
          <span class="cg-screen-cur">¥</span>
          <span class="cg-screen-val" class:placeholder={!changeInput}>{changeInput || "0"}</span>
          <button class="cg-clear" onclick={clearInput} title="清空">C</button>
        </div>
        <div class="cg-keys">
          {#each ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as k (k)}
            <button class="cg-key" class:fn={k === "." || k === "⌫"} onclick={() => press(k)}>{k}</button>
          {/each}
        </div>
        <button class="cg-submit" onclick={submitChange} disabled={!changeInput}>
          确认找零{changeInput ? ` ¥${changeInput}` : ""}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .cg {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cg.shake {
    animation: cgshake 0.35s ease;
  }
  @keyframes cgshake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    75% { transform: translateX(6px); }
  }
  .cg-top {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 800;
    flex-wrap: wrap;
  }
  .cg-stat { color: var(--text-main, #e0e6ed); }
  .cg-lives { margin-left: auto; letter-spacing: 1px; }
  .cg-lives .lost { opacity: 0.25; }
  .cg-patience {
    position: relative;
    height: 18px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 9px;
    overflow: hidden;
  }
  .cg-patience-fill {
    height: 100%;
    transition: width 0.3s linear;
  }
  .cg-patience-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6rem;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.6);
  }
  .cg-hint {
    font-size: 0.66rem;
    color: var(--accent, #ffd166);
    font-weight: 700;
    text-align: center;
  }
  .cg-main {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .cg-sub {
    font-size: 0.62rem;
    color: var(--text-dim, #9aa3c7);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 5px;
  }
  .cg-basket, .cg-scan {
    background: rgba(0, 0, 0, 0.22);
    border-radius: 8px;
    padding: 8px;
  }
  .cg-items {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cg-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    background: var(--bg-card, #222842);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 4px 6px;
    min-width: 46px;
    cursor: pointer;
    color: var(--text-main);
  }
  .cg-item:hover { border-color: var(--accent, #ffd166); }
  .cg-item-icon { font-size: 1.1rem; }
  .cg-item-name { font-size: 0.55rem; color: var(--text-dim, #9aa3c7); }
  .cg-dim { font-size: 0.62rem; color: var(--text-dim, #9aa3c7); text-align: center; padding: 8px; }
  .cg-scanned { display: flex; flex-direction: column; gap: 2px; font-size: 0.66rem; }
  .cg-scanned-row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    color: var(--text-main, #e0e6ed);
  }
  .cg-total {
    display: flex;
    justify-content: space-between;
    padding: 4px 0 2px;
    font-weight: 800;
    color: var(--ok, #7bd88f);
    border-top: 1px dashed rgba(255, 255, 255, 0.2);
    margin-top: 3px;
  }
  .cg-stat.urgent { color: #ff8a7a; }
  /* v1.3b2 付款区：左侧账目 + 右侧九宫格 */
  .cg-pay {
    display: grid;
    grid-template-columns: 1fr 190px;
    gap: 10px;
    background: rgba(255, 209, 102, 0.1);
    border: 1px solid rgba(255, 209, 102, 0.35);
    border-radius: 10px;
    padding: 10px;
  }
  .cg-pay-info { min-width: 0; }
  .cg-pay-label { font-size: 0.7rem; font-weight: 700; color: var(--text-main, #e0e6ed); margin-bottom: 5px; }
  .cg-notes { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .cg-note {
    background: #85bb65;
    color: #fff;
    font-size: 0.64rem;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 4px;
  }
  .cg-calc {
    font-size: 0.74rem;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .cg-calc-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-dim, #9aa3c7);
  }
  .cg-calc-row b { color: var(--text-main, #e0e6ed); font-variant-numeric: tabular-nums; }
  .cg-calc-row.eq {
    border-top: 1px dashed rgba(255, 255, 255, 0.25);
    padding-top: 4px;
    margin-top: 2px;
  }
  .cg-calc-row.eq b { color: var(--accent, #ffd166); }
  .cg-pad { display: flex; flex-direction: column; gap: 6px; }
  .cg-screen {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 209, 102, 0.45);
    border-radius: 8px;
    padding: 6px 8px;
  }
  .cg-screen-cur { font-size: 0.8rem; color: var(--text-dim, #9aa3c7); }
  .cg-screen-val {
    flex: 1;
    text-align: right;
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--ok, #7bd88f);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
  }
  .cg-screen-val.placeholder { color: rgba(255, 255, 255, 0.28); }
  .cg-clear {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-dim, #9aa3c7);
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
  }
  .cg-clear:hover { background: rgba(255, 138, 122, 0.3); color: #fff; }
  .cg-keys {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
  }
  .cg-key {
    min-height: 44px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: var(--bg-card, #222842);
    color: var(--text-main, #e0e6ed);
    font-size: 1.05rem;
    font-weight: 800;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    transition: background 0.1s ease, transform 0.08s ease;
  }
  .cg-key:hover { background: rgba(255, 255, 255, 0.14); }
  .cg-key:active { transform: scale(0.94); background: var(--accent, #ffd166); color: #1a1300; }
  .cg-key.fn { color: var(--text-dim, #9aa3c7); font-size: 0.92rem; }
  .cg-submit {
    width: 100%;
    min-height: 44px;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--ok, #7bd88f), #3aa564);
    color: #06281c;
    font-weight: 800;
    cursor: pointer;
    font-size: 0.8rem;
  }
  .cg-submit:hover:not(:disabled) { filter: brightness(1.08); }
  .cg-submit:disabled { opacity: 0.4; cursor: not-allowed; }
  @media (max-width: 480px) {
    .cg-main { grid-template-columns: 1fr; }
    .cg-pay { grid-template-columns: 1fr; }
    .cg-pad { max-width: 240px; margin: 0 auto; width: 100%; }
  }
</style>
