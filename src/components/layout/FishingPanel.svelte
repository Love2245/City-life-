<script lang="ts">
  import {overlayPortal} from '../../lib/overlayPortal';
  import { onDestroy, tick } from "svelte";
  import { fishingZoneWidth } from '../../game/core/fishing';
  import { beginMinigameMusic } from "../../lib/audio";
  import { gameState, markSessionDirty, checkpointAutoSave } from "../../stores/gameStore.svelte";
  import { uiState, uiConfirm, showToast } from "../../stores/uiStore.svelte";
  import FishingScene from "./FishingScene.svelte";
  import { fishImage } from "../../lib/fishVisuals";
  import { fishingVisualUrl } from "../../lib/fishingVisuals";
  import { canStartFishing, canContinueFishing, continueFishing, acknowledgeFishingCatch, startFishing, fishingInput, settleFishing, sellFish, releaseFish, mountFish, fishSpecies, fishValue, fishingSpotOf, FISHING_SPOTS, type FishCatch } from "../../game/core/fishing";

  const currentSpotId = $derived(fishingSpotOf(gameState.locationId));
  const atLake = $derived(!!currentSpotId);
  const active = $derived(gameState.fishing?.active);
  const bucket = $derived(gameState.fishing?.bucket ?? []);
  const pendingCatch = $derived(gameState.fishing?.pendingCatch ?? null);
  const displaySpotId = $derived(active
    ? active.locationId ?? "treasure_lake"
    : pendingCatch
      ? pendingCatch.locationId ?? "treasure_lake"
      : currentSpotId ?? "treasure_lake");
  const displaySpot = $derived(FISHING_SPOTS[displaySpotId]);
  const displayBackground = $derived(fishingVisualUrl(displaySpotId, gameState.time.hour, gameState.weather?.id ?? "sunny"));
  // Avoid walking the full game state on every fishing-frame mutation.
  const check = $derived(active ? { ok: false, reason: "请先收好当前这一竿" } : canStartFishing(gameState));
  const continueCheck = $derived(pendingCatch ? canContinueFishing(gameState) : { ok: false, reason: "当前没有待处理鱼获" });
  let opened = $state(false);
  const playingMusic = $derived(opened && !!active);
  $effect(() => {
    if (playingMusic) return beginMinigameMusic("scene");
  });
  let paused = $state(false);
  let bucketOpen = $state(false);
  let endMenu = $state(false);
  let catchDismissed = $state(false);
  let held = false;
  let frame = 0;
  let last = 0;
  let keptIds = $state<number[]>([]);
  let finishReason = $state("");
  let lastCatch = $state("");
  const remainingFish = $derived(bucket.filter(fish => !keptIds.includes(fish.id)));
  const remainingValue = $derived(remainingFish.reduce((sum, fish) => sum + fishValue(fish), 0));

  // A settled catch is an explicit checkpoint. Restore its full-screen result after reload.
  $effect(() => {
    if (atLake && pendingCatch && !opened && !catchDismissed) {
      opened = true;
      paused = true;
      endMenu = false;
      bucketOpen = false;
      last = 0;
    }
  });

  function save(): void {
    markSessionDirty();
    void checkpointAutoSave();
  }
  function openGame(): void {
    const result = startFishing(gameState);
    if (!result.ok) { showToast(result.reason); return; }
    opened = true;
    paused = false;
    endMenu = false;
    catchDismissed = false;
    bucketOpen = false;
    lastCatch = "";
    last = 0;
    save();
  }
  function resumeGame(): void {
    if (active?.locationId && active.locationId !== currentSpotId) { showToast(`请回到${FISHING_SPOTS[active.locationId].name}继续这一竿`); return; }
    if (!active && !pendingCatch) { openGame(); return; }
    opened = true;
    paused = !!pendingCatch;
    endMenu = false;
    catchDismissed = false;
    bucketOpen = false;
    last = 0;
  }
  function loop(now: number): void {
    if (!opened || paused || !active || active.phase === "ready" || document.hidden) return;
    if (last) fishingInput(gameState, active.id, { type: "tick", dtMs: now - last, held });
    last = now;
    // The app coalesces frame mutations; catches, pause and exit still save immediately.
    frame = requestAnimationFrame(loop);
  }
  $effect(() => {
    if (opened && !paused && active && active.phase !== "ready" && !endMenu) {
      last = 0;
      frame = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(frame);
  });

  function settleCurrent(endOuting: boolean): void {
    const session = gameState.fishing?.active;
    if (!session) return;
    if (endOuting && session.phase !== "ready") fishingInput(gameState, session.id, { type: "cancel" });
    const result = settleFishing(gameState, session.id);
    if (!result.ok) { showToast(result.reason); return; }
    held = false;
    last = 0;
    if (result.fish) {
      lastCatch = `钓到${fishSpecies(result.fish.speciesId)?.name ?? result.fish.speciesId} · ${(result.fish.grams / 1000).toFixed(3)} 千克`;
      paused = true;
      catchDismissed = false;
      bucketOpen = false;
      save();
      return;
    } else if (!endOuting) lastCatch = "鱼儿游走了，再试试下一竿";

    if (!endOuting) {
      const next = startFishing(gameState);
      if (next.ok) { save(); return; }
      finishReason = next.reason;
    } else finishReason = "你收起鱼竿，整理这一趟的收获。";
    paused = true;
    endMenu = true;
    catchDismissed = false;
    bucketOpen = false;
    keptIds = [];
    save();
  }

  function continueAfterCatch(): void {
    const result = continueFishing(gameState);
    if (!result.ok) { showToast(result.reason); return; }
    lastCatch = "";
    paused = false;
    endMenu = false;
    bucketOpen = false;
    last = 0;
    save();
  }

  function finishAfterCatch(): void {
    endOutingAndReturn();
  }

  // 已保存的 ready 会话只结算一次；成功后停在鱼获页，失败后沿用原有续钓逻辑。
  $effect(() => {
    // Pausing stops the simulation, but must not block an already finished cast.
    const readyId = opened && !endMenu && active?.phase === "ready" ? active.id : null;
    if (readyId !== null) queueMicrotask(() => {
      const session = gameState.fishing?.active;
      if (opened && !endMenu && session?.id === readyId && session.phase === "ready") settleCurrent(false);
    });
  });

  function pause(): void {
    if (!opened || endMenu || pendingCatch) return;
    held = false;
    paused = true;
    save();
  }
  async function close(): Promise<void> {
    held = false;
    paused = true;
    catchDismissed = !!pendingCatch;
    opened = false;
    endMenu = false;
    bucketOpen = false;
    await tick();
    save();
  }
  function openHarvestMenu(): void {
    finishReason = "你收起鱼竿，整理这一趟的收获。";
    paused = true;
    opened = true;
    endMenu = true;
    bucketOpen = false;
    keptIds = [];
  }
  function hook(): void {
    if (active) { fishingInput(gameState, active.id, { type: "hook" }); save(); }
  }
  function keydown(event: KeyboardEvent): void {
    if (!opened || uiState.modal) return;
    if (pendingCatch) {
      if (event.key === "Escape") { event.preventDefault(); void close(); }
      else if (event.code === "Space") event.preventDefault();
      return;
    }
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      if (active?.phase === "bite") hook();
      else if (!paused && active?.phase === "fighting") held = true;
    }
    if (event.key === "Escape") { event.preventDefault(); if (endMenu) void close(); else pause(); }
  }
  function pointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!opened || paused || active?.phase !== "fighting" || !(target instanceof Element)) return;
    if (target.closest("button, header, .bucket-drawer, .end-menu")) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    held = true;
  }
  function portal(node: HTMLElement) {
    const handle=overlayPortal(node);
    queueMicrotask(() => node.querySelector<HTMLButtonElement>("button")?.focus());
    return handle;
  }

  function toggleKeep(fish: FishCatch): void {
    const current = gameState.fishing?.specimens[fish.speciesId];
    if (current && current.grams >= fish.grams) return;
    keptIds = keptIds.includes(fish.id) ? keptIds.filter(id => id !== fish.id) : [...keptIds, fish.id];
  }
  /** 放生是不可逆的一键清空鱼护（含稀有渔获），操作前必须二次确认。 */
  async function confirmReleaseBasket(): Promise<void> {
    if (!(await uiConfirm("放生鱼护中其余全部渔获？此操作不可撤销。", { confirmLabel: "放生", danger: true }))) return;
    settleBasket("release");
  }
  function settleBasket(mode: "sell" | "release"): void {
    const snapshot = [...bucket];
    const selected = new Set(keptIds);
    const successfullyKept = new Set<number>();
    for (const fish of snapshot) {
      if (!selected.has(fish.id)) continue;
      const result = mountFish(gameState, fish.id);
      if (result.ok) successfullyKept.add(fish.id);
    }
    let total = 0;
    let released = 0;
    for (const fish of snapshot) {
      if (successfullyKept.has(fish.id)) continue;
      if (mode === "sell") {
        const result = sellFish(gameState, fish.id);
        if (result.ok) total += result.price ?? 0;
      } else {
        const result = releaseFish(gameState, fish.id);
        if (result.ok) released++;
      }
    }
    opened = false;
    endMenu = false;
    save();
    const keeps = successfullyKept.size ? `，留下${successfullyKept.size}件标本` : "";
    if (mode === "sell") showToast(`鱼商收购完成，收入 ¥${total.toFixed(2)}${keeps}`);
    else showToast(`已放生${released}条鱼${keeps}`);
  }

  function endOutingAndReturn(): void {
    const session = gameState.fishing?.active;
    if (session) {
      if (session.phase !== "ready") {
        const cancelled = fishingInput(gameState, session.id, { type: "cancel" });
        if (!cancelled.ok) { showToast(cancelled.reason); return; }
      }
      const settled = settleFishing(gameState, session.id);
      if (!settled.ok) { showToast(settled.reason); return; }
    }
    if (gameState.fishing?.pendingCatch) {
      const acknowledged = acknowledgeFishingCatch(gameState);
      if (!acknowledged.ok) { showToast(acknowledged.reason); return; }
    }
    held = false;
    last = 0;
    paused = true;
    opened = false;
    endMenu = false;
    bucketOpen = false;
    catchDismissed = false;
    keptIds = [];
    save();
    const count = gameState.fishing?.bucket.length ?? 0;
    showToast(count ? `垂钓已结束，鱼获留在鱼桶中（${count}条）` : "垂钓已结束，已返回场景");
  }

  onDestroy(() => {
    cancelAnimationFrame(frame);
    if (active) save();
  });
</script>

<svelte:window onkeydown={keydown} onkeyup={(event) => { if (event.code === "Space") held = false; }} onblur={pause} />
<svelte:document onvisibilitychange={() => { if (document.hidden) pause(); }} />

{#if atLake}
  <section class="fishing-panel" aria-label="{FISHING_SPOTS[currentSpotId!].name}垂钓">
    <div class="fishing-entry card">
      <strong>🎣 {FISHING_SPOTS[currentSpotId!].name}垂钓</strong>
      <p>{currentSpotId === "lake_park" ? "在紫羊区城市边缘的公园湖岸抛竿，鱼种与水库有所不同。" : "在自然保护区水库岸边抛下鱼饵，看看今天湖里藏着什么。"}</p>
      <small>每竿约30分钟 · 体力5 · 鱼饵1份</small>
      {#if active && (!active.locationId || active.locationId === currentSpotId)}<button class="btn" onclick={resumeGame}>继续这一趟</button>
      {:else if active}<p class="dim">这一竿在{FISHING_SPOTS[active.locationId ?? "treasure_lake"].name}进行，请回到原地点继续。</p>
      {:else if pendingCatch}<button class="btn" onclick={resumeGame}>查看本次鱼获</button>
      {:else if bucket.length > 0}<button class="btn" onclick={openHarvestMenu}>整理鱼获 · {bucket.length} 条</button>
      {:else}<button class="btn" onclick={openGame} disabled={!check.ok}>抛竿钓鱼</button>{#if !check.ok}<p class="dim">{check.reason}</p>{/if}{/if}
    </div>
  </section>
{/if}

{#if opened}
  <div class="fishing-overlay hud-scope" use:portal>
    <div class="fishing-dialog" class:bucket-open={bucketOpen} role="dialog" tabindex="-1" aria-modal="true" aria-label="{displaySpot.name}钓鱼" data-scene-location={displaySpotId} data-scene-background={displayBackground ?? ""} onpointerdown={pointerDown} onpointerup={() => { held = false; }} onpointercancel={() => { held = false; }} onlostpointercapture={() => { held = false; }}>
      <FishingScene phase={active?.phase ?? "ready"} hour={gameState.time.hour} weather={gameState.weather?.id ?? "sunny"} spotId={displaySpotId} backgroundUrl={displayBackground ?? ""} />
      <header>
        <div><small>{displaySpot.region}</small><strong>{displaySpot.name}垂钓</strong></div>
        <nav>
          <button class="btn bucket-toggle" aria-expanded={bucketOpen} disabled={!!pendingCatch} onclick={() => bucketOpen = !bucketOpen}>🪣 鱼桶 · {bucket.length}</button>
          <button class="btn finish-outing-button" aria-label="结束垂钓并返回场景，鱼获保留在鱼桶中" title="结束本次垂钓并返回场景，已钓到的鱼会保留在鱼桶中" onclick={endOutingAndReturn}>结束垂钓</button>
          <button class="btn close-button" aria-label={pendingCatch ? "收起鱼获，稍后查看" : endMenu ? "关闭整理界面，稍后继续" : "暂停并返回场景"} onclick={close}>✕</button>
        </nav>
      </header>

      {#if lastCatch && !endMenu && !pendingCatch}<div class="catch-notice" aria-live="polite">{lastCatch}</div>{/if}

      {#if bucketOpen && !pendingCatch}
        <aside class="bucket-drawer" aria-label="鱼桶查看">
          <div class="drawer-heading"><strong>鱼桶 · {bucket.length}条</strong><button class="btn" aria-label="关闭鱼桶" onclick={() => bucketOpen = false}>收起</button></div>
          {#if bucket.length === 0}<p>桶里暂时没有鱼。</p>{/if}
          {#each bucket as fish (fish.id)}
            <div class="drawer-fish"><img src={fishImage(fish.speciesId)} alt=""/><span><strong>{fishSpecies(fish.speciesId)?.name ?? fish.speciesId}</strong><small>{(fish.grams / 1000).toFixed(3)} 千克</small></span><small>¥{fishValue(fish).toFixed(2)}</small></div>
          {/each}
        </aside>
      {/if}

      {#if active && !endMenu}
        <main class="fishing-body" class:fighting={active.phase === "fighting"}>
          {#if active.phase === "waiting"}
            <div class="water"><small>湖面泛起微波</small><h2>静候鱼讯</h2></div>
          {:else if active.phase === "bite"}
            <div class="water bite"><small>浮标突然沉了下去</small><h2>咬钩了</h2><button class="btn primary" onclick={hook}>提竿</button></div>
          {:else if active.phase === "fighting"}
            <p class="fight-caption">按住上浮，松开下沉；跟随变向的鱼，离开浮标区会快速脱钩。</p>
            <div class="fight-layout" aria-label={`遛鱼进度 ${Math.round(active.progress * 100)}%`}>
              <div class="track"><div class="catch-zone" style:height={`${fishingZoneWidth(active) * 100}%`} style:bottom={`${active.bar * 100}%`}></div><svg class="fish-marker" style:bottom={`calc(${active.fishPos * 100}% - 14px)`} viewBox="0 0 90 42" aria-hidden="true" focusable="false"><path d="M12 21C22 8 44 6 62 15L78 8L75 21L78 34L62 27C44 36 22 34 12 21Z" fill="#e0e9d3" stroke="#527771" stroke-width="2"/><circle cx="25" cy="18" r="2" fill="#527771"/></svg></div>
              <div class="progress"><div style:height={`${active.progress * 100}%`}></div></div>
              <span>{Math.round(active.progress * 100)}%</span>
            </div>
          {:else if active.phase === "ready"}
            <div class="water"><small>这一竿已结束</small><h2>{active.won ? "鱼儿上钩了" : "鱼儿游走了"}</h2><button class="btn primary" onclick={() => settleCurrent(false)}>收竿查看结果</button></div>
          {/if}
          {#if paused && active.phase !== "ready"}<p class="pause-note">已暂停，继续时鱼讯会接着刚才的进度。</p>{/if}
        </main>
        {#if active.phase !== "ready"}
          <footer class="fishing-actions">
            <button class="btn" onclick={() => { if (paused) { paused = false; last = 0; } else pause(); }}>{paused ? "继续垂钓" : "暂停"}</button>
            <button class="btn end-button" onclick={() => settleCurrent(true)}>收竿结束</button>
          </footer>
        {/if}
      {:else if pendingCatch && !endMenu}
        {@const catchSpecies = fishSpecies(pendingCatch.fish.speciesId)}
        <main class="catch-reveal" aria-live="polite" aria-label="本次鱼获">
          <div class="catch-kicker">本竿收获 · {FISHING_SPOTS[pendingCatch.locationId ?? "treasure_lake"].name}垂钓{catchSpecies ? ` · ${catchSpecies.rarity}` : ""}</div>
          {#if pendingCatch.newRecord}<div class="record-badge">✦ 刷新纪录</div>{/if}
          <div class="catch-art"><img src={fishImage(pendingCatch.fish.speciesId)} alt={`${catchSpecies?.name ?? pendingCatch.fish.speciesId}像素鱼图`} /></div>
          <h2>{catchSpecies?.name ?? pendingCatch.fish.speciesId}</h2>
          <div class="catch-weight">{(pendingCatch.fish.grams / 1000).toFixed(3)} <small>千克</small></div>
          <section class="record-card" class:new-record={pendingCatch.newRecord} aria-label="同种历史最佳纪录（含本次）">
            <small>同种历史最佳（含本次）</small>
            <strong>{(pendingCatch.record.grams / 1000).toFixed(3)} 千克</strong>
            {#if pendingCatch.newRecord}
              <span>{pendingCatch.previousBest ? `此前纪录 ${(pendingCatch.previousBest.grams / 1000).toFixed(3)} 千克 · 已刷新` : "首次记录"}</span>
            {:else}
              <span>本次距离纪录 {(Math.max(0, pendingCatch.record.grams - pendingCatch.fish.grams) / 1000).toFixed(3)} 千克</span>
            {/if}
          </section>
          {#if continueCheck.ok}
            <div class="catch-actions"><button class="btn primary" onclick={continueAfterCatch}>继续钓鱼</button><button class="btn" onclick={finishAfterCatch}>收竿</button></div>
          {:else}
            <p class="catch-blocked">{continueCheck.reason}，可以收竿返回场景。</p>
            <div class="catch-actions"><button class="btn primary" onclick={finishAfterCatch}>收竿</button></div>
          {/if}
        </main>
      {:else if endMenu}
        <main class="end-menu">
          <small>这一趟垂钓结束</small><h2>{finishReason}</h2>
          <p>可以把鱼交给岸边鱼商，或放回湖里；选中的鱼会制成标本。</p>
          <div class="harvest-list" aria-label="选择留作标本的鱼">
            {#if bucket.length === 0}<div class="empty-bucket">这趟没有带回鱼。</div>{/if}
            {#each bucket as fish (fish.id)}
              {@const specimen = gameState.fishing?.specimens[fish.speciesId]}
              {@const unavailable = !!specimen && specimen.grams >= fish.grams}
              <div class="harvest-row" class:selected={keptIds.includes(fish.id)}>
                <img src={fishImage(fish.speciesId)} alt=""/>
                <span><strong>{fishSpecies(fish.speciesId)?.name ?? fish.speciesId}</strong><small>{(fish.grams / 1000).toFixed(3)} 千克 · ¥{fishValue(fish).toFixed(2)}</small></span>
                <button class="btn keep-button" disabled={unavailable} aria-pressed={keptIds.includes(fish.id)} onclick={() => toggleKeep(fish)}>{unavailable ? "已有更大标本" : keptIds.includes(fish.id) ? "将留作标本" : "留作标本"}</button>
              </div>
            {/each}
          </div>
          <div class="harvest-actions">
            <button class="btn primary" onclick={() => settleBasket("sell")}>卖掉其余鱼 · ¥{remainingValue.toFixed(2)}</button>
            <button class="btn" onclick={() => void confirmReleaseBasket()}>放生其余鱼</button>
          </div>
        </main>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fishing-panel{margin:12px 0}.fishing-entry{padding:12px 14px}.fishing-entry p{font-size:12px;line-height:1.7}.fishing-entry small{display:block;margin:8px 0;color:var(--text-dim)}.btn{font:inherit;min-height:44px;cursor:pointer}
  .fishing-overlay{position:fixed;inset:0;z-index:110;padding:0;background:#173b41;color:#f3ebd2;box-sizing:border-box}.fishing-dialog{position:relative;width:100%;height:100dvh;overflow:hidden;outline:none;isolation:isolate;touch-action:none}.fishing-dialog.bucket-open{touch-action:pan-y}.fishing-dialog header{position:absolute;inset:0 0 auto;display:flex;align-items:flex-start;justify-content:space-between;padding:max(16px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right));background:linear-gradient(#122e3d99,transparent);z-index:3;pointer-events:none}.fishing-dialog header>*{pointer-events:auto}.fishing-dialog header>div{display:grid;gap:7px}.fishing-dialog header strong{font:600 24px Georgia,serif;letter-spacing:3px}.fishing-dialog header small{font-size:11px;letter-spacing:2px;color:#e2e7d2}.fishing-dialog header nav{display:flex;gap:8px}.fishing-dialog .btn{border:1px solid #ede5bd55;border-radius:12px;background:#193c3ed9;color:#eee5c9;padding:10px 18px;box-shadow:0 4px 14px #071e2933}.fishing-dialog .btn:hover{background:#305853}.fishing-dialog .btn:focus-visible{outline:2px solid #ffe6ab;outline-offset:3px}.fishing-dialog .btn:disabled{opacity:.5;cursor:not-allowed}.fishing-dialog .primary{background:#d6bf80;color:#263d38;border-color:#f3e5b8;font-weight:700}.fishing-dialog .primary:hover{background:#e8d393}.close-button{width:48px;padding:8px!important}.bucket-toggle{white-space:nowrap}.finish-outing-button{white-space:nowrap;background:#5b4931!important;border-color:#e6ce8b88!important;font-weight:700}
  .fishing-body{position:absolute;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(520px,calc(100% - 32px));max-height:calc(100dvh - 150px);overflow:auto;display:grid;place-items:center;box-sizing:border-box;padding:10px;background:transparent;border:0;box-shadow:none;border-radius:0;backdrop-filter:none;text-align:center;z-index:1}.water{color:#f4ecd4;text-shadow:0 2px 12px #082932,0 1px 3px #061b23;text-align:center}.water h2{font:600 clamp(25px,4vw,38px) Georgia,serif;margin:10px 0;letter-spacing:3px}.water small{font-size:13px;line-height:1.7;color:#e4e6d5}.bite{animation:signal .7s ease-in-out infinite alternate}.water .primary{min-width:180px;margin-top:10px}.fight-caption{margin:0 0 15px;color:#f0ead1;font-size:14px;text-align:center;text-shadow:0 1px 8px #082932,0 2px 3px #061b23}.fight-layout{display:flex;justify-content:center;gap:16px;align-items:center;margin:0 auto}.track{height:clamp(200px,42vh,350px);width:104px;position:relative;overflow:hidden;border:0;border-radius:52px;background:linear-gradient(90deg,#0a283126,#e1f0dc0a 50%,#092d3a24);box-shadow:none}.track:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 34px,#dbe8ca28 35px,#dbe8ca00 36px)}.catch-zone{position:absolute;width:100%;height:29%;background:linear-gradient(90deg,#bad99a33,#cbeeb673,#bdd99c33);border-block:1px solid #e0efc1bd;box-sizing:border-box;box-shadow:0 0 25px #b2d89b42}.fish-marker{width:90px;height:42px;object-fit:contain;position:absolute;left:7px;image-rendering:pixelated;filter:drop-shadow(0 3px 3px #001b23b0)}.progress{position:relative;width:8px;height:clamp(200px,42vh,350px);background:linear-gradient(90deg,#0b293755,#eaf4de2b,#0b293755);border-radius:8px;overflow:hidden}.progress>div{position:absolute;bottom:0;width:100%;background:linear-gradient(#e5d998,#8dab75);box-shadow:0 0 14px #d4df9c;transition:height .12s linear}.fight-layout>span{font-size:13px;color:#fff0bb;min-width:34px;text-shadow:0 1px 8px #06212a}.pause-note{margin-top:15px;color:#f0ead1;text-align:center;text-shadow:0 1px 8px #082932}.catch-notice{position:absolute;z-index:2;top:clamp(90px,14vh,150px);left:50%;transform:translateX(-50%);padding:8px 14px;border-radius:99px;background:#102f35a6;color:#f5edcf;font-size:13px;text-shadow:0 1px 3px #001b23;white-space:nowrap;box-shadow:0 2px 12px #001b2350}
  .fishing-actions{position:absolute;z-index:3;left:50%;bottom:max(28px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:10px;align-items:center}.fishing-actions .btn{min-width:120px;background:#173a3ba8;backdrop-filter:blur(5px)}.fishing-actions .end-button{background:#463c2ca8}
  .bucket-drawer{position:absolute;z-index:4;right:max(18px,env(safe-area-inset-right));top:calc(max(16px,env(safe-area-inset-top)) + 56px);width:min(340px,calc(100% - 36px));max-height:min(58dvh,520px);overflow:auto;padding:12px 14px;border-radius:14px;background:#102b34d9;box-shadow:0 8px 30px #001a2280;backdrop-filter:blur(9px);touch-action:pan-y}.drawer-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}.drawer-heading strong{font-size:14px}.drawer-heading .btn{min-height:34px;padding:4px 9px;font-size:12px}.bucket-drawer>p{margin:12px 0;color:#e0dfce;font-size:12px}.drawer-fish{display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid #e9e1c822}.drawer-fish img{width:55px;height:38px;object-fit:contain;image-rendering:pixelated}.drawer-fish span{flex:1;display:grid;gap:3px}.drawer-fish strong{font-size:13px}.drawer-fish small{font-size:11px;color:#dddcca}
  .end-menu{position:absolute;z-index:2;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(620px,calc(100% - 30px));max-height:calc(100dvh - 130px);overflow:auto;padding:18px 20px 20px;border-radius:18px;background:linear-gradient(145deg,#143940dc,#102d35db);box-shadow:0 14px 50px #051c2775;backdrop-filter:blur(8px);touch-action:pan-y}.end-menu>small{color:#dfd4ac;font-size:12px;letter-spacing:1px}.end-menu h2{margin:5px 0 8px;font:600 23px Georgia,serif;color:#f4ecd4}.end-menu>p{margin:0 0 12px;font-size:12px;line-height:1.6;color:#e1e3d2}.harvest-list{max-height:min(40dvh,340px);overflow:auto;padding-right:3px;touch-action:pan-y}.empty-bucket{padding:20px 5px;color:#e1e3d2;font-size:13px}.harvest-row{display:flex;align-items:center;gap:10px;min-height:58px;border-top:1px solid #e9e1c82b}.harvest-row.selected{background:#b0d29112}.harvest-row img{width:62px;height:45px;object-fit:contain;image-rendering:pixelated}.harvest-row>span{display:grid;gap:4px;flex:1}.harvest-row strong{font-size:14px}.harvest-row small{color:#e0dfce;font-size:11px}.keep-button{min-height:38px!important;padding:5px 9px!important;font-size:11px!important}.harvest-actions{display:flex;gap:8px;margin-top:14px}.harvest-actions .btn{flex:1;min-height:46px;padding:7px 10px}.harvest-actions .primary{white-space:nowrap}
  @keyframes signal{to{text-shadow:0 0 22px #ffe6a6,0 2px 12px #082932}}@media(max-width:520px){.fishing-dialog header{padding:14px 14px}.fishing-dialog header strong{font-size:20px;letter-spacing:2px}.fishing-dialog header small{font-size:9px;letter-spacing:1px}.fishing-dialog header nav{gap:5px}.fishing-dialog .btn{padding:8px 10px}.bucket-toggle{font-size:12px}.close-button{width:42px}.fight-layout{gap:11px}.track,.progress{height:clamp(190px,38vh,280px)}.track{width:86px}.fish-marker{width:78px;left:4px}.fishing-actions{bottom:max(18px,env(safe-area-inset-bottom))}.fishing-actions .btn{min-width:108px}.end-menu{padding:15px 14px}.end-menu h2{font-size:20px}.harvest-row{gap:6px}.harvest-row img{width:48px}.keep-button{padding:5px 6px!important;font-size:10px!important}.harvest-actions{flex-direction:column}.harvest-actions .btn{flex:auto;width:100%}.catch-notice{top:76px;font-size:11px;max-width:calc(100% - 30px);white-space:normal;text-align:center}}
  @media(max-height:500px) and (min-width:500px){.fishing-dialog header{padding:9px 16px}.fishing-dialog header strong{font-size:19px}.fishing-body{max-height:calc(100dvh - 90px)}.fight-caption{margin-bottom:5px}.track,.progress{height:45vh}.fishing-actions{bottom:10px}.end-menu{max-height:calc(100dvh - 70px);padding:11px 16px}.harvest-list{max-height:22vh}.harvest-row{min-height:46px}.harvest-row img{height:34px}.end-menu h2{font-size:19px}.harvest-actions{margin-top:8px}}
  @media(prefers-reduced-motion:reduce){.bite{animation:none}.progress>div{transition:none}}
  .catch-reveal{position:absolute;z-index:2;left:50%;top:calc(50% + 14px);transform:translate(-50%,-50%);width:min(500px,calc(100% - 30px));max-height:calc(100dvh - 125px);overflow:auto;box-sizing:border-box;display:grid;justify-items:center;align-content:center;gap:8px;padding:clamp(17px,3vh,27px);border:1px solid #e6d39d75;border-radius:22px;background:radial-gradient(ellipse at 50% 0%,#588076e8,#153a3dea 58%,#102c34ed);box-shadow:0 18px 60px #031a2399,inset 0 1px #fff4;backdrop-filter:blur(10px);text-align:center;touch-action:pan-y}.catch-kicker{font-size:11px;letter-spacing:2px;color:#e0d6ad}.record-badge{position:absolute;right:19px;top:17px;padding:6px 10px;border:1px solid #f0d48c;border-radius:99px;background:#986e31c9;color:#fff0ba;font-size:12px;font-weight:800;letter-spacing:1px;box-shadow:0 0 22px #f0d48c45}.catch-art{width:min(230px,48vw);height:clamp(110px,19vh,170px);display:grid;place-items:center;border-radius:50%;background:radial-gradient(ellipse,#b7d4b622 0%,#b7d4b600 70%)}.catch-art img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 7px 9px #061d24ad)}.catch-reveal h2{margin:0;color:#fff2ce;font:600 clamp(24px,4vw,34px) Georgia,serif;letter-spacing:3px;text-shadow:0 2px 12px #06212a}.catch-weight{color:#ead79c;font:600 26px Georgia,serif;font-variant-numeric:tabular-nums}.catch-weight small{font:12px inherit;color:#e4dfc8}.record-card{width:min(320px,100%);box-sizing:border-box;display:grid;gap:5px;padding:11px 15px;border:1px solid #dce5c637;border-radius:13px;background:#0b293b8c;color:#eee9d0}.record-card small{font-size:11px;color:#d3d9c4}.record-card strong{font:600 20px Georgia,serif;color:#f8e8ba}.record-card span{font-size:11px;color:#c8d4c8}.record-card.new-record{border-color:#e8cd87a8;background:linear-gradient(135deg,#6049278a,#173d45d9);box-shadow:0 0 22px #edcf7e1e}.record-card.new-record strong{color:#ffe7a4}.catch-blocked{margin:0;color:#f2d8aa;font-size:12px;line-height:1.5}.catch-actions{width:min(360px,100%);display:grid;gap:8px;margin-top:4px}.catch-actions .btn{min-height:46px}.catch-actions .primary{background:#d6bf80;color:#263d38;border-color:#f3e5b8;font-weight:800}.catch-actions .btn:not(.primary){background:#173a3ba8}.catch-actions .btn:hover{filter:brightness(1.12)}@media(max-height:500px){.catch-reveal{top:50%;max-height:calc(100dvh - 72px);padding:10px 16px;gap:4px}.catch-art{height:82px}.catch-reveal h2{font-size:21px}.catch-weight{font-size:20px}.record-card{padding:7px 12px}.catch-actions{display:flex}.catch-actions .btn{flex:1;min-height:40px}}
.catch-weight small{font:inherit;font-size:12px;color:#e4dfc8}
  /* Keep the illustration within its reserved row on short, zoomed screens. */
  .catch-art{position:relative;display:block}
  .catch-art img{position:absolute;inset:0;width:100%;height:100%;min-height:0;max-height:100%}
</style>
