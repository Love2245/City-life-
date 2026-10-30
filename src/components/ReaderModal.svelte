<script lang="ts">
  import { onMount, tick } from "svelte";
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, presentJobResult, showResult, restorePreviousModal } from "../stores/uiStore.svelte";
  import { getReadableDocument, loadReadableDocument, migrateReadableDocumentProgress, readableDocumentChapterLinks, type ReadableDocument } from "../game/data/readableDocuments";
  import { applyEffects } from "../game/engine";
  import type { ActionResult } from "../game/types";
  import {playInteractionSound} from '../lib/audio';

  type FlipSnapshot = { from: number; to: number; direction: "forward" | "backward" } | null;
  const FLIP_DURATION_MS = 620;
  const FLIP_SETTLE_MS = FLIP_DURATION_MS + 40;

  let document = $state<ReadableDocument | undefined>();
  const chapterLinks = $derived(document ? readableDocumentChapterLinks(document) : []);
  const single = $derived(document?.kind !== "book");
  let page = $state(0); // 0 是封面；窄屏时保存单页页码，宽屏时保存跨页起始页
  let jump = $state("");
  let chapterJump = $state("");
  let stageWidth = $state(760);
  let stageHeight = $state(535);
  let compactViewport = $state(false);
  let peFullscreen = $derived(uiState.gameMode === "pe");
  let singlePage = $derived(!peFullscreen && (compactViewport || stageWidth < 560));
  let flipping = $state(false);
  let flipSnapshot = $state<FlipSnapshot>(null);
  let bookStage = $state<HTMLDivElement>();
  let flipTimer = 0;

  function maxStart(): number {
    const count = document?.pages.length ?? 0;
    if (singlePage) return count;
    return Math.max(1, Math.ceil(count / 2) * 2 - 1);
  }

  function alignSpread(requested: number): number {
    if (requested <= 0) return 0;
    const start = requested % 2 === 0 ? requested - 1 : requested;
    return Math.max(1, Math.min(maxStart(), start));
  }

  function normalizePage(requested: number): number {
    if (requested <= 0) return 0;
    if (!document) return 0;
    if (singlePage) return Math.max(1, Math.min(document.pages.length, Math.floor(requested)));
    return alignSpread(requested);
  }

  function resizeStage(): void {
    const wasSinglePage = singlePage;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    compactViewport = viewportHeight < 560 || viewportWidth < 620;
    const heightLimit = Math.min(viewportHeight * (viewportHeight < 560 ? 0.6 : 0.64), 660);
    // PE 阅读器使用全屏布局，双页书按可用高度缩放；PC/平板继续使用卡片式自适应布局。
    const peHeight = Math.max(180, viewportHeight - 116);
    const width = peFullscreen
      ? Math.min(viewportWidth - 16, peHeight * 1.42)
      : Math.min(viewportWidth * 0.9, 1020, compactViewport ? 1020 : heightLimit * 1.42);
    const nextWidth = Math.max(peFullscreen ? 180 : 280, width);
    stageWidth = nextWidth;
    stageHeight = peFullscreen ? stageWidth / 1.42 : compactViewport ? heightLimit : stageWidth / 1.42;
    if (flipping && wasSinglePage !== singlePage) clearFlip();
    if (wasSinglePage && !singlePage && page > 0) {
      page = alignSpread(page);
      if (document) gameState.flags[`reader_${document.id}_page`] = page;
    }
  }

  onMount(() => {
    resizeStage();
    window.addEventListener("resize", resizeStage);
    let alive = true;
    void (async () => {
      const id = uiState.readerId;
      document = id === "bible_old_testament" || id === "bible_new_testament"
        ? await loadReadableDocument(id)
        : id ? getReadableDocument(id) : undefined;
      if (!alive) return;
      const savedKey = id ? `reader_${id}_page` : "";
      const migrationKey = id ? `reader_${id}_editorial_v1` : "";
      const savedValue = id ? gameState.flags[savedKey] : undefined;
      let saved = typeof savedValue === "number" && Number.isFinite(savedValue)
        ? Math.floor(savedValue)
        : undefined;
      if (id && document?.kind === "book" && !gameState.flags[migrationKey]) {
        if (typeof saved === "number" && saved > 0) {
          saved = alignSpread(saved + Math.max(0, (document.bodyStartPage ?? 1) - 1));
          gameState.flags[savedKey] = saved;
        }
        gameState.flags[migrationKey] = true;
      }
      if (id && document?.kind === "book") saved = migrateReadableDocumentProgress(gameState.flags, id, saved);
      page = document && !single && typeof saved === "number" ? normalizePage(saved) : 0;
    })();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.target instanceof HTMLInputElement || single) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        turn(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        turn(1);
      }
    };
    window.addEventListener("keydown", onKey);
    const onBack = () => close();
    window.addEventListener("urban-life-reader-back", onBack);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("urban-life-reader-back", onBack);
      window.removeEventListener("resize", resizeStage);
      clearFlip();
    };
  });

  function clearFlip(): void {
    window.clearTimeout(flipTimer);
    flipTimer = 0;
    flipping = false;
    flipSnapshot = null;
  }

  function setPage(next: number, animate = true): void {
    const target = normalizePage(next);
    if (!document || target === page || flipping) return;
    playInteractionSound('page');
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (animate && !reducedMotion) {
      clearFlip();
      flipSnapshot = { from: page, to: target, direction: target > page ? "forward" : "backward" };
      flipping = true;
      flipTimer = window.setTimeout(() => {
        clearFlip();
      }, FLIP_SETTLE_MS);
    } else {
      clearFlip();
    }
    page = target;
    if (!single) gameState.flags[`reader_${document.id}_page`] = target;
    void tick().then(() => bookStage?.scrollTo({ top: 0, left: 0 }));
  }

  function turn(direction: -1 | 1): void {
    if (!document || single) return;
    if (direction < 0) {
      if (page === 1) setPage(0);
      else setPage(Math.max(1, page - (singlePage ? 1 : 2)));
    } else {
      if (page === 0) setPage(1);
      else setPage(Math.min(maxStart(), page + (singlePage ? 1 : 2)));
    }
  }

  function go(): void {
    if (!document || single) return;
    const requested = Number(jump);
    if (Number.isInteger(requested) && requested >= 1 && requested <= document.pages.length) {
      setPage(requested);
    }
    jump = "";
  }

  function goToChapter(): void {
    const target = chapterLinks.find((entry) => String(entry.page) === chapterJump);
    if (target) setPage(target.page);
  }

  function close(): void {
    const pending = uiState.pendingBookResult;
    const guideRewardDue = document?.id === "doc_city_guide"
      && page > 0
      && page >= maxStart()
      && gameState.flags["doc_city_guide_last_page_reward"] !== true;
    clearFlip();
    uiState.pendingBookResult = null;
    uiState.readerId = null;
    restorePreviousModal();
    if (pending) presentJobResult(pending.payload, undefined, pending.action);
    if (guideRewardDue) {
      gameState.flags["doc_city_guide_last_page_reward"] = true;
      applyEffects(gameState, { money: 500, log: "读完《都市便民指南》最后一页，兑换了新居民代金券 500 元" }, "🎟️");
      const reward: ActionResult = {
        actionId: "doc_city_guide_last_page_reward",
        icon: "🎟️",
        name: "新居民代金券已兑换",
        duration: 0,
        deltas: [{ key: "money", label: "资金", value: 500 }],
        verdict: "你读完了《都市便民指南》的最后一页。市政府赠送的 500 元代金券已兑换，资金已直接入账。",
      };
      showResult(reward);
    }
  }
</script>

{#snippet coverSurface()}
  <div class="book-cover" class:generated={!!document?.cover}>
    {#if document?.cover}
      <img class="cover-image" src={document.cover} alt={`《${document.title}》封面`} />
    {:else}
      <span class="cover-emblem">✦</span>
      <span class="cover-kicker">{document?.subtitle ?? "都市图书馆馆藏"}</span>
      <h2>{document?.title ?? "文书"}</h2>
      <span class="cover-footer">都市生活 · 阅读文书</span>
    {/if}
  </div>
{/snippet}

{#snippet paperSurface(index: number)}
  <article class="book-page" class:blank={!document || index < 1 || index > document.pages.length}>
    {#if document && index >= 1 && index <= document.pages.length}
      {@const text = document.pages[index - 1]}
      {@const headingEnd = text.indexOf("\n")}
      <div class="page-running-head"><span>都市生活</span><span>{document.title}</span></div>
      <div
        class="page-copy"
        class:dense={text.length > 170}
        class:compact={text.length > 420}
      >
        {#if headingEnd > 0}
          <h3>{text.slice(0, headingEnd)}</h3>
          <div class="page-body">{text.slice(headingEnd + 1).trim()}</div>
        {:else}
          <div class="page-body">{text}</div>
        {/if}
      </div>
      <footer class="page-footer">
        {#if singlePage || index % 2 === 1}
          <button class="page-corner" aria-label={singlePage ? "翻到上一页" : "翻到上一跨页"} disabled={flipping || page === 0} onclick={() => turn(-1)}>‹</button>
        {:else}
          <span></span>
        {/if}
        <span>{index}</span>
        {#if singlePage || index % 2 === 0 || index === document.pages.length}
          <button class="page-corner" aria-label={singlePage ? "翻到下一页" : "翻到下一跨页"} disabled={flipping || page >= maxStart()} onclick={() => turn(1)}>›</button>
        {:else}
          <span></span>
        {/if}
      </footer>
    {/if}
  </article>
{/snippet}

<div class="reader-overlay hud-scope" class:pe-fullscreen={peFullscreen} role="presentation" onclick={close} onkeydown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
  <div class="reader-shell" class:pe-fullscreen={peFullscreen} role="dialog" tabindex="-1" aria-modal="true" aria-label={document?.title ?? "阅读器"} onclick={(event) => event.stopPropagation()} onkeydown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <header class="reader-header">
      <div><strong>{document?.title ?? "文书"}</strong><small>{document?.subtitle ?? ""}</small></div>
      <button class="close" aria-label="关闭阅读器" onclick={close}>✕</button>
    </header>

    {#if document}
      <div class="book-stage" class:single-page={singlePage} bind:this={bookStage} style={`--stage-width:${stageWidth}px;--stage-height:${stageHeight}px`}>
        {#if single}
          <article class="single-sheet" class:art={document.kind === "art"}>
            {#if document.image}<img src={document.image} alt={document.title} />{/if}
            {#if document.kind === "certificate"}
              <div class="certificate-text">{document.pages[0].replace("{name}", gameState.player.name)}</div>
            {/if}
          </article>
        {:else if page === 0}
          <div class="cover-holder">{@render coverSurface()}</div>
        {:else}
          <div class="book-spread" class:single-page={singlePage}>
            {@render paperSurface(page)}
            {#if singlePage}
              <div class="hidden-page">{@render paperSurface(page + 1)}</div>
            {:else}
              {@render paperSurface(page + 1)}
            {/if}
          </div>
        {/if}

        {#if !single && flipping && flipSnapshot}
          <div class="page-leaf" class:single-page={singlePage} class:forward={flipSnapshot.direction === "forward"} class:backward={flipSnapshot.direction === "backward"} aria-hidden="true" inert>
            <div class="leaf-front">
              {#if flipSnapshot.from === 0}
                {@render coverSurface()}
              {:else if !singlePage && flipSnapshot.direction === "forward"}
                {@render paperSurface(flipSnapshot.from + 1)}
              {:else}
                {@render paperSurface(flipSnapshot.from)}
              {/if}
            </div>
            <div class="leaf-back">
              {#if flipSnapshot.direction === "forward"}
                {@render paperSurface(flipSnapshot.to)}
              {:else if flipSnapshot.to === 0}
                {@render coverSurface()}
              {:else if singlePage}
                {@render paperSurface(flipSnapshot.to)}
              {:else}
                {@render paperSurface(flipSnapshot.to + 1)}
              {/if}
            </div>
          </div>
        {/if}
      </div>

      {#if !single}
        <nav class="reader-controls" aria-label="翻页、章节与页码跳转">
          <button class="nav-turn" disabled={flipping || page === 0} onclick={() => turn(-1)}>← 上一页</button>
          {#if chapterLinks.length > 0}
            <label class="chapter-jump">
              <span>章节</span>
              <select bind:value={chapterJump} disabled={flipping} aria-label="选择指南章节" onchange={goToChapter}>
                <option value="">选择章节</option>
                {#each chapterLinks as chapter (chapter.page)}
                  <option value={String(chapter.page)}>{chapter.title}</option>
                {/each}
              </select>
            </label>
          {/if}
          <div class="page-jump">
              <strong>{page === 0 ? "封面" : singlePage ? `第 ${page} / ${document.pages.length} 页` : `第 ${page}${page + 1 <= document.pages.length ? `–${page + 1}` : ""} / ${document.pages.length} 页`}</strong>
            <form onsubmit={(event) => { event.preventDefault(); go(); }}>
              <input type="number" min="1" max={document.pages.length} bind:value={jump} disabled={flipping} aria-label="跳转到指定页" placeholder="页码" />
              <button class="jump-button" type="submit" disabled={flipping}>跳转</button>
            </form>
          </div>
          <button class="nav-turn" disabled={flipping || page >= maxStart()} onclick={() => turn(1)}>下一页 →</button>
        </nav>
      {/if}
    {/if}
  </div>
</div>

<style>
  .reader-overlay { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; overflow-y: auto; box-sizing: border-box; padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); background: #080b15e8; }
  .reader-shell { width: min(1100px, 98vw); max-height: calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom))); box-sizing: border-box; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid #6e5e44; border-radius: 16px; background: #17202d; box-shadow: 0 22px 70px #0009; }
  .reader-overlay.pe-fullscreen { place-items: stretch; overflow: hidden; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
  .reader-shell.pe-fullscreen { width: 100%; height: 100%; max-height: none; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; justify-items: center; gap: 4px; padding: 6px 8px; overflow: hidden; border: 0; border-radius: 0; box-shadow: none; }
  .reader-header { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px; color: #f4ead7; }
  .reader-header div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .reader-header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .reader-header small { color: #b9ae96; }
  button { cursor: pointer; }
  .close { flex: none; color: #f4ead7; background: #ffffff20; border: 0; border-radius: 8px; padding: 8px 12px; }
  .book-stage { position: relative; flex: none; width: min(var(--stage-width), 94vw); height: min(var(--stage-height), 66dvh); display: grid; place-items: center; overflow: hidden; perspective: 1600px; perspective-origin: 50% 50%; }
  .reader-shell.pe-fullscreen .book-stage { width: min(var(--stage-width), 100%); height: min(var(--stage-height), 100%); min-width: 0; min-height: 0; }
  .cover-holder { width: 50%; height: 100%; justify-self: end; filter: drop-shadow(7px 11px 16px #0009); }
  .book-cover { position: relative; width: 100%; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: clamp(15px, 3.8vh, 30px); padding: clamp(18px, 3vw, 42px); overflow: hidden; text-align: center; color: #f8edd2; background: radial-gradient(80% 45% at 50% 4%, #ffffff13, transparent 80%), repeating-linear-gradient(165deg, #ffffff05 0 1px, transparent 1px 5px), linear-gradient(135deg, #344c60 0%, #23364a 44%, #142337 100%); border: 9px double #a58e61; border-radius: 4px 10px 10px 4px; box-shadow: inset 8px 0 12px #111d2bcc, inset -2px 0 2px #f4e1b81a, inset 0 0 28px #080e1870, 4px 0 0 #715e3f; }
  .book-cover:not(.generated)::after { content: ""; position: absolute; inset: 13px; border: 1px solid #d4bd8066; box-shadow: inset 0 0 18px #111b2a38; pointer-events: none; }
  .book-cover.generated { display: block; padding: 0; border: 0; overflow: hidden; background: transparent; }
  .cover-image { display: block; width: 100%; height: 100%; object-fit: contain; }
  .cover-emblem { font-size: clamp(24px, 3vw, 40px); color: #d8c38d; }
  .cover-kicker { color: #cbb781; letter-spacing: .13em; font-size: clamp(10px, 1.1vw, 13px); }
  .book-cover h2 { margin: 0; font: 700 clamp(23px, 3vw, 42px)/1.35 "Noto Serif SC", "Songti SC", serif; overflow-wrap: anywhere; }
  .cover-footer { color: #cbb781; font-size: 12px; }
  .book-spread { position: relative; width: 100%; height: 100%; display: grid; grid-template-columns: 1fr 1fr; filter: drop-shadow(7px 11px 16px #0008); }
  .book-spread.single-page { grid-template-columns: minmax(0, 1fr); }
  .book-spread.single-page::after { display: none; }
  .book-spread .hidden-page { display: none; }
  .book-spread.single-page > .book-page:first-child { border-radius: 7px; }
  .book-spread::after { content: ""; position: absolute; z-index: 2; top: 0; bottom: 0; left: 50%; width: 18px; transform: translateX(-50%); pointer-events: none; background: linear-gradient(90deg, #4d3e2d28, #fff5 45%, #5848312a); }
  .book-page { position: relative; z-index: 1; min-width: 0; min-height: 0; height: 100%; box-sizing: border-box; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; padding: clamp(18px, 2.7vw, 38px) clamp(18px, 3vw, 44px) clamp(13px, 2vw, 24px); color: #342d25; background-color: #f7efdf; background-image: radial-gradient(95% 45% at 50% 0%, #fffaf0b0, transparent 85%), radial-gradient(75% 55% at 100% 100%, #d8c7a436, transparent 78%), repeating-linear-gradient(27deg, #80664308 0 .6px, transparent .6px 4px), linear-gradient(90deg, #efe4ce 0%, #faf4e7 9%, #f7efdf 88%, #eee2cd 100%); border: 1px solid #d6c8aa; }
  .book-page:first-child { border-radius: 7px 0 0 7px; box-shadow: inset -12px 0 18px -18px #392b1d; }
  .book-page:nth-child(2) { border-radius: 0 7px 7px 0; box-shadow: inset 12px 0 18px -18px #392b1d; }
  .book-page.blank { background: #e8dcc4; }
  .page-running-head { position: relative; z-index: 1; display: flex; justify-content: space-between; gap: 8px; overflow: hidden; color: #9a8060; border-bottom: 1px solid #d6c5a5; padding-bottom: 9px; font-size: clamp(9px, .9vw, 11px); letter-spacing: .08em; white-space: nowrap; }
  .page-running-head span:last-child { overflow: hidden; text-overflow: ellipsis; }
  .page-copy { position: relative; z-index: 1; min-height: 0; overflow-y: auto; padding: 15px 0 12px; text-align: justify; text-align-last: left; font: 400 clamp(12px, 1.27vw, 16px)/1.75 "Noto Serif SC", "Songti SC", "SimSun", serif; }
  .page-copy h3 { margin: 0 0 11px; color: #624f37; text-align: center; font: 700 1.13em/1.4 "Noto Serif SC", "Songti SC", serif; }
  .page-body { white-space: pre-wrap; overflow-wrap: anywhere; }
  .page-copy.dense { font-size: clamp(11px, 1.08vw, 14px); line-height: 1.62; }
  .page-copy.compact { font-size: clamp(10px, .94vw, 12px); line-height: 1.5; }
  .page-footer { position: relative; z-index: 1; display: grid; grid-template-columns: 30px 1fr 30px; align-items: center; min-height: 28px; color: #8e7350; border-top: 1px solid #d6c5a5; padding-top: 8px; text-align: center; font: 12px/1 Georgia, serif; }
  .page-corner { width: 26px; height: 26px; border: 0; border-radius: 50%; color: #866d4b; background: #ddcfb3; font: 20px/1 Georgia, serif; }
  .page-corner:disabled { opacity: .28; cursor: default; }
  .single-sheet { position: relative; flex: none; width: 50%; height: 100%; box-sizing: border-box; overflow: hidden; background: #eee2c9; border: 1px solid #cdbd9e; box-shadow: 8px 10px 25px #0008; }
  .reader-shell.pe-fullscreen .single-sheet { width: min(100%, calc(var(--stage-height) * .707)); }
  .single-sheet.art { background: #e5d6b7; }
  .single-sheet img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .certificate-text { position: absolute; inset: 30% 10% 16%; display: grid; place-items: center; white-space: pre-line; text-align: center; font: 700 clamp(12px, 1.7vw, 20px)/1.8 "Noto Serif SC", "Songti SC", serif; color: #243448; text-shadow: 0 1px 2px #fff; }
  .page-leaf { position: absolute; z-index: 5; top: 0; bottom: 0; width: 50%; transform-style: preserve-3d; pointer-events: none; }
  .page-leaf.single-page { width: 100%; }
  .page-leaf.single-page.forward { left: 0; }
  .page-leaf.forward { left: 50%; transform-origin: left center; box-shadow: -8px 5px 14px -10px #21180eaa; animation: flip-forward .62s cubic-bezier(.43,.08,.18,1) both; }
  .page-leaf.backward { left: 0; transform-origin: right center; box-shadow: 8px 5px 14px -10px #21180eaa; animation: flip-backward .62s cubic-bezier(.43,.08,.18,1) both; }
  .leaf-front, .leaf-back { position: absolute; inset: 0; overflow: hidden; backface-visibility: hidden; }
  .leaf-front > .book-page, .leaf-back > .book-page { width: 100%; }
  .leaf-front > .book-cover, .leaf-back > .book-cover { border-radius: 3px; }
  .leaf-back { transform: rotateY(180deg); }
  .leaf-back .book-page { box-shadow: inset -8px 0 16px -18px #392b1d; }
  @keyframes flip-forward { 0% { transform: rotateY(0); } 55% { transform: rotateY(-102deg); } 100% { transform: rotateY(-180deg); } }
  @keyframes flip-backward { 0% { transform: rotateY(0); } 55% { transform: rotateY(102deg); } 100% { transform: rotateY(180deg); } }
  .reader-controls { width: 100%; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: clamp(8px, 2vw, 20px); color: #f3e7cd; }
  .reader-shell.pe-fullscreen .reader-header { min-height: 28px; gap: 6px; }
  .reader-shell.pe-fullscreen .reader-header strong { font-size: 13px; }
  .reader-shell.pe-fullscreen .reader-header small { display: none; }
  .reader-shell.pe-fullscreen .close { padding: 5px 9px; }
  .reader-shell.pe-fullscreen .reader-controls { min-height: 38px; gap: 6px; }
  .reader-shell.pe-fullscreen .reader-controls button { padding: 6px 8px; font-size: 11px; }
  .reader-shell.pe-fullscreen .page-jump { min-width: 108px; gap: 3px; }
  .reader-shell.pe-fullscreen .page-jump strong { font-size: 10px; }
  .reader-shell.pe-fullscreen .reader-controls input { width: 48px; padding: 5px; }
  .reader-shell.pe-fullscreen .reader-controls .jump-button { padding: 5px 8px; }
  .reader-shell.pe-fullscreen .book-page { padding: clamp(5px, 1.2vw, 12px) clamp(5px, 1.25vw, 12px) 4px; }
  .reader-shell.pe-fullscreen .page-running-head { padding-bottom: 4px; font-size: clamp(6px, .85vw, 9px); letter-spacing: 0; }
  .reader-shell.pe-fullscreen .page-copy { padding: 5px 1px; font-size: clamp(8px, 1.05vw, 12px); line-height: 1.38; }
  .reader-shell.pe-fullscreen .page-copy h3 { margin-bottom: 5px; }
  .reader-shell.pe-fullscreen .page-copy.dense { font-size: clamp(7px, .92vw, 10px); line-height: 1.32; }
  .reader-shell.pe-fullscreen .page-copy.compact { font-size: clamp(6.5px, .82vw, 9px); line-height: 1.28; }
  .reader-shell.pe-fullscreen .page-footer { min-height: 18px; grid-template-columns: 20px 1fr 20px; padding-top: 3px; font-size: 9px; }
  .reader-shell.pe-fullscreen .page-corner { width: 18px; height: 18px; font-size: 15px; }
  .reader-controls button { padding: 9px 13px; border: 0; border-radius: 8px; color: #f3e7cd; background: #725d3d; white-space: nowrap; }
  .reader-controls button:disabled { opacity: .4; cursor: default; }
  .page-jump { min-width: 160px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .chapter-jump { display: flex; align-items: center; gap: 6px; color: #d5c49d; font-size: 11px; white-space: nowrap; }
  .chapter-jump select { max-width: min(240px, 32vw); padding: 8px 9px; border: 1px solid #b9aa8d; border-radius: 7px; color: #29251d; background: #f8efdc; }
  .page-jump strong { font-size: 12px; font-weight: 500; }
  .page-jump form { display: flex; gap: 5px; }
  .reader-controls input { width: 64px; box-sizing: border-box; padding: 7px; border: 1px solid #b9aa8d; border-radius: 6px; text-align: center; background: #f8efdc; color: #242424; }
  .reader-controls .jump-button { padding: 7px 11px; color: #2b2418; background: #d4bd86; }
  @media (max-width: 620px) {
    .reader-shell { width: min(1100px, 98vw); gap: 8px; padding: 10px; }
    .book-stage { width: min(var(--stage-width), 94vw); height: min(var(--stage-height), 66dvh); }
    .book-page { padding: 8px 7px 5px; }
    .page-copy { padding: 7px 2px; font-size: 16px; line-height: 1.62; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
    .page-copy h3 { margin-bottom: 6px; }
    .page-copy.dense, .page-copy.compact { font-size: 16px; line-height: 1.62; }
    .page-running-head { padding-bottom: 4px; font-size: 9px; letter-spacing: 0; }
    .page-footer { min-height: 20px; grid-template-columns: 20px 1fr 20px; padding-top: 3px; }
    .page-corner { width: 20px; height: 20px; font-size: 17px; }
    .reader-controls { gap: 6px; }
    .reader-controls .nav-turn { padding: 8px; font-size: 11px; }
    .chapter-jump { font-size: 10px; }
    .chapter-jump select { max-width: 34vw; padding: 7px 5px; }
    .page-jump { min-width: 112px; }
    .page-jump strong { font-size: 10px; }
    .reader-controls input { width: 52px; }
  }
  .book-stage.single-page .cover-holder { width: 100%; justify-self: center; }
  @media (max-height: 560px) {
    .reader-shell { gap: 6px; padding: 8px; }
    .book-stage { height: min(var(--stage-height), 60dvh); }
    .book-page { padding: 6px 12px 4px; }
    .page-copy, .page-copy.dense, .page-copy.compact { padding-top: 4px; padding-bottom: 4px; font-size: 16px; line-height: 1.58; }
    .page-footer { min-height: 18px; padding-top: 2px; }
  }
  @media (prefers-reduced-motion: reduce) { .page-leaf { animation-duration: .01ms !important; } }
</style>
