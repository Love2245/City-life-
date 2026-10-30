<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { miniGameRandom } from '../../../lib/minigameRandom';
  import type { CheckoutCfg } from '../../../game/core/minigame';
  import { playSound } from '../../../lib/audio';
  import { checkoutProductSvg, checkoutCustomerSvg, checkoutStoreSvg } from '../../../lib/checkoutArt';
  import './checkoutWorkshop.css';
  const random = miniGameRandom();
  let { cfg, onFinish, sceneKey, paused = false }: {
    cfg: CheckoutCfg; onFinish: (ratio: number) => void; sceneKey?: string; paused?: boolean;
  } = $props();
  const lives0 = $derived(cfg.lives ?? 3), customers0 = $derived(cfg.customers ?? 5);
  const timeLimit = $derived(cfg.timeLimit ?? 0), patienceMs = $derived(cfg.patienceMs ?? 1.2);
  const notes = $derived(cfg.notes ?? [1, 5, 10, 20, 50, 100]);
  const minBasket = $derived(cfg.minBasket ?? 3), maxBasket = $derived(cfg.maxBasket ?? 6);
  const warm = $derived(sceneKey === 'job_convenience_clerk' || cfg.title.includes('便利店'));
  interface CartItem { inst: number; itemId: string; name: string; icon: string; price: number; }
  interface ScanBurst { inst: number; itemId: string; x: number; y: number; dx: number; dy: number; }
  let customerIndex = $state(0), basket = $state<CartItem[]>([]), scanned = $state<CartItem[]>([]);
  let totalPrice = $state(0), stage = $state<'scan' | 'pay' | 'done'>('scan');
  let customerPay = $state(0), payBills = $state<number[]>([]), changeInput = $state('');
  let patience = $state(100), lives = $state(0), success = $state(0), finished = $state(false);
  let shake = $state(false), timeLeft = $state(0), scanBursts = $state<ScanBurst[]>([]);
  let lastScanned = $state<CartItem | null>(null), feedback = $state(''), feedbackKind = $state<'ok' | 'error'>('ok');
  let lastSale = $state<{ seq: number; total: number; change: number } | null>(null);
  let beltElement: HTMLDivElement;
  let instSeq = 0, saleSeq = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const effects = new Set<ReturnType<typeof setTimeout>>();
  const allGoods = $derived([...basket, ...scanned].sort((a, b) => a.inst - b.inst));
  const blocked = $derived(finished || paused);
  function later(fn: () => void, ms: number) {
    const handle = setTimeout(() => { effects.delete(handle); fn(); }, ms); effects.add(handle);
  }
  function press(k: string): void {
    if (blocked || stage !== 'pay') return;
    playSound('computer');
    if (k === '⌫') { changeInput = changeInput.slice(0, -1); return; }
    if (k === '.') { if (!changeInput.includes('.')) changeInput = (changeInput || '0') + '.'; return; }
    if (changeInput.includes('.')) { if ((changeInput.split('.')[1] ?? '').length >= 2) return; }
    else if (changeInput.replace('-', '').length >= 4) return;
    changeInput = changeInput === '0' ? k : changeInput + k;
  }
  function clearInput(): void { if (!blocked && stage === 'pay') { changeInput = ''; playSound('computer'); } }
  function initCustomer(): void {
    const count = minBasket + Math.floor(random() * (maxBasket - minBasket + 1));
    basket = Array.from({ length: count }, () => {
      const it = cfg.items[Math.floor(random() * cfg.items.length)];
      return { inst: ++instSeq, itemId: it.id, name: it.name, icon: it.icon, price: it.price };
    });
    scanned = []; totalPrice = 0; stage = 'scan'; patience = 100; changeInput = ''; customerPay = 0; payBills = []; lastScanned = null;
  }
  function scanItem(inst: number, event: MouseEvent): void {
    if (blocked || stage !== 'scan') return;
    const it = basket.find(x => x.inst === inst); if (!it) return;
    // Independent flights allow rapid scans without delaying the next item or payment.
    const source = (event.currentTarget as HTMLButtonElement).getBoundingClientRect(), belt = beltElement.getBoundingClientRect();
    const x = source.x - belt.x + source.width / 2, y = source.y - belt.y + 35;
    scanBursts = [...scanBursts, { inst, itemId: it.itemId, x, y, dx: belt.width * .5 - x, dy: belt.height - 31 - y }];
    later(() => { scanBursts = scanBursts.filter(x => x.inst !== inst); }, 580);
    scanned = [...scanned, it]; totalPrice = Math.round((totalPrice + it.price) * 100) / 100;
    basket = basket.filter(x => x.inst !== inst); lastScanned = it; playSound('cashier');
    if (basket.length === 0) { stage = 'pay'; customerPay = calculatePay(totalPrice); payBills = breakBills(customerPay); }
  }
  function calculatePay(total: number): number {
    let minNote = notes.find(n => n >= total); if (minNote == null) minNote = 100;
    const rand = random(); if (rand < .75) return minNote;
    const i = notes.indexOf(minNote); if (rand < .95 && i < notes.length - 1) return notes[i + 1]; return 100;
  }
  function breakBills(amount: number): number[] {
    const out: number[] = []; let rem = amount;
    for (const n of [...notes].sort((a, b) => b - a)) while (rem >= n) { out.push(n); rem -= n; }
    return out.sort(() => random() - .5);
  }
  function notify(text: string, kind: 'ok' | 'error') { feedback = text; feedbackKind = kind; }
  function submitChange(): void {
    if (blocked || stage !== 'pay') return;
    const input = parseFloat(changeInput), correct = customerPay - totalPrice;
    if (!isNaN(input) && Math.abs(input - correct) < .01) {
      lastSale = { seq: ++saleSeq, total: totalPrice, change: Math.round(correct * 100) / 100 };
      notify(`找零正确 · 已完成第 ${customerIndex + 1} 位顾客`, 'ok'); success++; playSound('success'); nextCustomer();
    } else { notify('找零有误，顾客提出投诉', 'error'); playSound('error'); loseHp(); if (lives > 0) nextCustomer(); }
  }
  function loseHp(): void { lives--; shake = true; later(() => shake = false, 350); if (lives <= 0) finishGame(); }
  function nextCustomer(): void { customerIndex++; if (customerIndex >= customers0) finishGame(); else initCustomer(); }
  function tick(): void {
    if (blocked || stage === 'done' || document.hidden) return;
    if (timeLimit > 0 && --timeLeft <= 0) { finishGame(); return; }
    patience -= patienceMs;
    if (patience <= 0) { notify('顾客等待太久，提出投诉', 'error'); playSound('error'); loseHp(); if (lives > 0) nextCustomer(); }
  }
  function finishGame(): void {
    if (finished) return; finished = true; stage = 'done'; if (timer) clearInterval(timer);
    // Early exit does not turn one successful customer into a full shift.
    const denom = Math.max(1, customers0); onFinish(Math.min(1, success / denom));
  }
  onMount(() => { lives = lives0; timeLeft = timeLimit; initCustomer(); timer = setInterval(tick, 1000); });
  onDestroy(() => { if (timer) clearInterval(timer); for (const handle of effects) clearTimeout(handle); });
</script>

<div class="checkout-shop" class:warm class:shake class:paused data-stage={stage}>
  <div class="checkout-backdrop" aria-hidden="true">{@html checkoutStoreSvg(warm)}</div>
  <header class="checkout-header">
    <div class="shop-title"><span>WUTONG DAILY / CHECKOUT 01</span><h2>梧桐便利 <small>{warm ? '街角店' : '生活店'}</small></h2></div>
    <div class="checkout-stats"><span>本班接待<b>{Math.min(customerIndex + 1, customers0)}<small> / {customers0}</small></b></span><span>完成结账<b>{success}<small> 位</small></b></span>{#if timeLimit > 0}<span class:urgent={timeLeft <= 8}>剩余时间<b>{Math.max(0, timeLeft)}<small> 秒</small></b></span>{/if}<span class="service-hearts">服务机会<b>{#each Array(lives0) as _, i}<i class:lost={i >= lives}>♥</i>{/each}</b></span></div>
  </header>
  <div class="checkout-customer">
    {#key customerIndex}<div class="guest-portrait" aria-hidden="true">{@html checkoutCustomerSvg(customerIndex)}</div>{/key}
    <div class="guest-speech"><small>第 {Math.min(customerIndex + 1, customers0)} 位顾客</small><b>{stage === 'pay' ? `给您 ¥${customerPay.toFixed(2)}，麻烦帮我找零。` : stage === 'done' ? '辛苦了，谢谢！' : '这些一起结账，谢谢。'}</b></div>
    <div class="customer-patience"><div><span>顾客耐心</span><b>{Math.max(0, Math.round(patience))}%</b></div><div class="patience-track"><i class:low={patience <= 30} style:width={`${Math.max(0, patience)}%`}></i></div></div>
  </div>
  <div class="checkout-step"><span class:current={stage === 'scan'}><i>01</i> 商品扫码</span><b>›</b><span class:current={stage === 'pay'}><i>02</i> 收款找零</span><small>{stage === 'scan' ? `点击商品经过扫码口 · 还剩 ${basket.length} 件` : stage === 'pay' ? '根据实收和应收计算找零，输入后确认' : '本班收银结束'}</small></div>
  <div class="checkout-counter">
    <section class="checkout-worktop" aria-label="商品扫码台">
      <div class="belt-frame"><div class="panel-heading"><b>商品输送台</b><span>{scanned.length} / {allGoods.length} 件已扫码</span></div>
        <div class="checkout-belt" bind:this={beltElement}>
          {#key customerIndex}<div class="checkout-products">{#each allGoods as it (it.inst)}{@const done = scanned.some(x => x.inst === it.inst)}<button type="button" class="checkout-product" class:scanned={done} disabled={done || blocked || stage !== 'scan'} aria-label={`${done ? '已扫码' : '扫码'} ${it.name}`} onclick={event => scanItem(it.inst, event)}><span class="product-art">{@html checkoutProductSvg(it.itemId)}</span><span class="product-label">{it.name}</span>{#if done}<span class="product-check">✓ 已扫码</span>{:else}<span class="product-price">¥{it.price.toFixed(2)}</span>{/if}</button>{/each}</div>{/key}
          <div class="scanner-glass" class:active={scanBursts.length > 0} aria-hidden="true"><span></span><i></i><i></i><i></i><i></i><i></i></div>
          {#each scanBursts as burst (burst.inst)}<div class="scan-flight" aria-hidden="true" style={`--x:${burst.x}px;--y:${burst.y}px;--dx:${burst.dx}px;--dy:${burst.dy}px`}>{@html checkoutProductSvg(burst.itemId)}</div>{/each}
        </div>
        <div class="scanner-footer"><i class:active={stage === 'pay'}></i><b>{lastScanned ? `${lastScanned.name} · ¥${lastScanned.price.toFixed(2)}` : '扫描器已就绪'}</b><span>{stage === 'pay' ? 'SCAN COMPLETE' : 'BARCODE READER'}</span></div>
      </div>
      <div class="checkout-ledger"><div class="receipt-paper"><div class="receipt-heading"><b>梧桐便利 · 购物小票</b><span>NO. {String(Math.min(customerIndex + 1, customers0)).padStart(3, '0')}</span></div><div class="receipt-lines">{#each scanned as it (it.inst)}<div class="receipt-line"><span>{it.name}</span><b>¥{it.price.toFixed(2)}</b></div>{/each}{#if !scanned.length}<div class="receipt-empty">扫码后，商品会记录在这里<span>欢迎光临，祝您今天愉快</span></div>{/if}</div><div class="receipt-total"><span>合计 <small>{scanned.length} 件</small></span><b>¥{totalPrice.toFixed(2)}</b></div></div><div class="paper-clip" aria-hidden="true"></div></div>
    </section>
    <section class="checkout-register" aria-label="收银机">
      <div class="register-bezel"><div class="register-brand"><span>WUTONG POS</span><b><i></i> ONLINE</b></div><div class="register-display">
        <div class="lcd-status"><span>{stage === 'scan' ? '商品扫码中' : stage === 'pay' ? '现金付款 · 等待找零' : '本班已结束'}</span><b>NO.{String(Math.min(customerIndex + 1, customers0)).padStart(3,'0')}</b></div>
        <div class="lcd-amount"><span>应收金额<small>TOTAL DUE</small></span><b>¥{totalPrice.toFixed(2)}</b></div>
        <div class="lcd-paid"><span>顾客实收</span><b>{stage === 'pay' ? `¥${customerPay.toFixed(2)}` : '—'}</b><span>{stage === 'pay' ? '请输入应找零金额' : '全部扫码后收款'}</span></div>
      </div></div>
      <div class="register-body"><div class="register-payment">
        <div class="cash-tray" class:received={stage === 'pay'}><span>顾客付款盘</span><div>{#if stage === 'pay'}{#each payBills as n, i}<span class="cash-note" style={`--n:${i}`}><i>¥</i><b>{n}</b><small>现金</small></span>{/each}{:else}<div class="tray-pending"><i>¥</i><small>等待顾客付款</small></div>{/if}</div></div>
        <div class="receipt-printer"><span>热敏小票机</span><div class="printer-slot"></div>{#if lastSale}{#key lastSale.seq}<div class="printed-ticket" aria-hidden="true"><b>结账完成</b><span>应收 ¥{lastSale.total.toFixed(2)}</span><span>找零 ¥{lastSale.change.toFixed(2)}</span><div class="barcode"></div><small>THANK YOU</small></div>{/key}{:else}<div class="printer-ready"><i></i> READY</div>{/if}</div>
      </div>
      <div class="register-pad"><div class="change-label"><b>找零输入</b><span>CHANGE / CNY</span></div><div class="change-display"><span>¥</span><output aria-label="找零金额" class:placeholder={!changeInput}>{changeInput || '0'}</output><button type="button" class="clear-key" disabled={blocked || stage !== 'pay'} onclick={clearInput} aria-label="清空找零">C</button></div><div class="register-keys">{#each ['1','2','3','4','5','6','7','8','9','.','0','⌫'] as k}<button type="button" class="register-key" class:function-key={k === '.' || k === '⌫'} disabled={blocked || stage !== 'pay'} onclick={() => press(k)} aria-label={k === '⌫' ? '删除一位' : k}>{k}</button>{/each}</div><button type="button" class="change-submit" onclick={submitChange} disabled={blocked || stage !== 'pay' || !changeInput}><span>确认找零</span><b>{changeInput ? `¥${changeInput}` : 'ENTER'}</b></button></div></div>
      <div class="register-base"><div class="cash-drawer">{#if lastSale}{#key lastSale.seq}<div class="drawer-interior" aria-hidden="true"><i></i><i></i><i></i><i></i></div>{/key}{/if}<span></span><b>CASH DRAWER</b><i></i></div><div class="register-feet" aria-hidden="true"></div></div>
    </section>
  </div>
  <footer class="checkout-feedback" class:error={feedbackKind === 'error'} role="status"><i>{feedback ? feedbackKind === 'ok' ? '✓' : '!' : 'i'}</i><span>{feedback || '商品逐个扫码 → 收取现金 → 输入找零；找错或耐心耗尽会减少服务机会。'}</span><b>梧桐便利 · 用心服务</b></footer>
</div>
