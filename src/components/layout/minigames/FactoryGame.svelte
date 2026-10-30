<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import type { FactoryCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";
  import { miniGameRandom } from "../../../lib/minigameRandom";
  import { FactoryShift, factoryPoints, factoryTheme, factoryBoardGeometry, factoryShipThreshold } from "./factoryShift";
  import { drawFactoryScene } from "./factoryCanvas";
  import { INDUSTRIAL_WORKSHOPS, industrialFactoryInfo } from "./factoryWorkshops";

  let { cfg, onFinish, paused = false, sceneKey = "", seed, initialProgress, onProgress }: {
    cfg: FactoryCfg;
    onFinish: (ratio: number) => void;
    paused?: boolean;
    sceneKey?: string;
    seed?: number;
    initialProgress?: unknown;
    onProgress?: (snapshot: unknown) => void;
  } = $props();
  const fallbackRandom = miniGameRandom();
  const model = untrack(() => new FactoryShift(cfg, seed ?? Math.floor(fallbackRandom() * 0xffffffff), initialProgress));
  let viewState = $state(model.snapshot());
  let localPaused = $state(false);
  const effectivePaused = $derived(paused || localPaused);
  const theme = $derived(factoryTheme(sceneKey, cfg.workshop));
  const industrial = $derived(theme === 'steel' || theme === 'aluminum' || theme === 'glass' ? INDUSTRIAL_WORKSHOPS[theme] : null);
  const points = $derived(factoryPoints(theme));
  const logistics = $derived(theme === "sorting");
  const step = $derived(viewState.stage === "ready" || viewState.stage === "docking" ? 0 : viewState.stage === "solder" || viewState.stage === "welding" ? 1 : 2);
  const pointNames = $derived(industrial?.points ?? (logistics ? ["收件", "片区", "件数", "封签"] : ["焊点 1", "焊点 2", "焊点 3", "焊点 4"]));
  const info = $derived.by(() => {
    if (industrial) return industrialFactoryInfo(industrial, viewState);
    const object = logistics ? "包裹" : "电路板";
    switch (viewState.stage) {
      case "ready": return [`点击${object}，开始自动${logistics ? "扫码" : "对接"}`, logistics ? "扫码后，依次核对亮起的四项标签。" : "接好后，点击亮起的焊点。", logistics ? "等待扫码" : "等待对接"];
      case "docking": return [logistics ? "正在扫描运单…" : "正在自动对接…", "稍等一下，机器正在处理。", logistics ? "扫码中" : "自动对接中"];
      case "solder": return [logistics ? `核对亮起的${pointNames[viewState.activePoint]}标签 · ${viewState.activePoint + 1}/4` : `点击亮起的焊点 · ${viewState.activePoint + 1}/4`, logistics ? "点一下，确认当前标签后再核对下一项。" : "只要点一下，就会自动焊好这一处。", logistics ? "等待核对" : "等待焊接"];
      case "welding": return [logistics ? "正在核对标签…" : "正在焊接…", "完成后，下一处会亮起。", logistics ? "核对中" : "焊接中"];
      case "ship": return [logistics ? "核对完成！按住包裹，往右拖" : "焊好了！按住电路板，往右拖", logistics ? `送往 ${viewState.destination}，松开即可归库。` : "拖向右边，松开即可出货。", logistics ? "等待归库" : "等待出货"];
      case "shipping": return ["这件完成了，下一件马上到", "下一件会自动进入工位。", logistics ? "正在归库" : "正在出货"];
    }
  });
  let retryHint = $state(false);
  let compactLayout = $state(false);
  let tightLayout = $state(false);
  let shell: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let boardHit: HTMLButtonElement;
  let geometry = $state({ ...factoryBoardGeometry(700, 360), dx: 0 });
  let width = 700, height = 360, inputScale = 1;
  const drag = { active: false, start: 0, x: 0, pointerId: -1 };
  let ctx: CanvasRenderingContext2D | null = null;
  let raf = 0, lastFrame = 0, visualTime = 0, arrival = 0.3, lastSavedSecond = -1;
  let observer: ResizeObserver | undefined;
  let delivered = false, destroyed = false, reducedMotion = false;
  let previousBoard = untrack(() => viewState.boardId);

  function publish() { if (!destroyed) onProgress?.(model.progress()); }
  function sync() {
    viewState = model.snapshot();
    if (viewState.boardId !== previousBoard) { previousBoard = viewState.boardId; arrival = .3; drag.x = 0; }
    if (viewState.finished && !delivered && !destroyed) {
      delivered = true;
      publish();
      onFinish(viewState.ratio);
    }
  }
  function action(run: () => boolean) {
    if (effectivePaused || viewState.finished) return;
    if (run()) { retryHint = false; playSound("game"); sync(); publish(); }
  }
  function cancelDrag(reset = true) {
    const id = drag.pointerId;
    drag.active = false; drag.pointerId = -1;
    if (id >= 0 && boardHit?.hasPointerCapture?.(id)) boardHit.releasePointerCapture(id);
    if (reset) { drag.x = 0; model.dragRatio = 0; }
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0 || effectivePaused || viewState.finished || viewState.stage !== "ship") return;
    event.preventDefault();
    drag.active = true; drag.start = event.clientX * inputScale - drag.x; drag.pointerId = event.pointerId;
    boardHit.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    if (!drag.active || effectivePaused || event.pointerId !== drag.pointerId) return;
    drag.x = Math.max(-18, Math.min(width, event.clientX * inputScale - drag.start));
    model.dragRatio = drag.x / geometry.w;
  }
  function pointerUp(event: PointerEvent) {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const distance = drag.x;
    cancelDrag(false);
    if (!effectivePaused && distance >= factoryShipThreshold(geometry.w)) action(() => model.ship());
    else { retryHint = true; cancelDrag(); publish(); }
  }
  function keyboard(event: KeyboardEvent) {
    if (effectivePaused || viewState.finished) return;
    if (event.key === "ArrowRight" && viewState.stage === "ship") { event.preventDefault(); action(() => model.ship()); }
  }
  function pauseToggle() { if (!paused) localPaused = !localPaused; }
  function hidden() { if (document.hidden) { cancelDrag(false); publish(); } }
  function measureLayout() {
    const rect = shell.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const layoutWidth = shell.clientWidth || rect.width, layoutHeight = shell.clientHeight || rect.height;
    // The Arcade/Modal header and app zoom change the available height independently of the viewport.
    compactLayout = layoutWidth >= 560 && layoutHeight <= 500;
    tightLayout = layoutHeight < 330 || (layoutWidth < 560 && layoutHeight < 650);
  }
  function resize() {
    measureLayout();
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    // Canvas artwork and absolute button positions both use local layout px. clientX uses visual px.
    width = wrap.clientWidth || rect.width; height = wrap.clientHeight || rect.height;
    inputScale = width / rect.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    cancelDrag(false);
    drag.x = model.dragRatio * factoryBoardGeometry(width, height, theme).w;
    draw();
  }
  function draw() {
    if (!ctx) { geometry = { ...factoryBoardGeometry(width, height, theme), dx: drag.x }; return; }
    geometry = drawFactoryScene(ctx, viewState, { width, height, visualTime, reducedMotion, arrival, dragX: drag.x }, theme);
  }
  function frame(time: number) {
    if (destroyed || viewState.finished) return;
    const dt = lastFrame ? Math.min(Math.max(0, (time - lastFrame) / 1000), .1) : 0;
    lastFrame = time;
    if (!effectivePaused && !document.hidden) {
      visualTime += dt;
      model.tick(dt);
      sync();
      arrival = Math.max(0, arrival - dt);
      const second = Math.floor(viewState.elapsed);
      if (second !== lastSavedSecond) { lastSavedSecond = second; publish(); }
    }
    draw();
    if (!viewState.finished) raf = requestAnimationFrame(frame);
  }
  $effect(() => {
    const value = effectivePaused;
    untrack(() => {
      model.setPaused(value);
      lastFrame = 0;
      if (value) cancelDrag(false);
      sync();
      publish();
    });
  });
  onMount(() => {
    ctx = canvas.getContext("2d");
    reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(resize); observer.observe(shell); observer.observe(wrap); }
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", hidden);
    resize(); draw(); publish();
    if (!viewState.finished) raf = requestAnimationFrame(frame);
  });
  onDestroy(() => {
    destroyed = true;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", hidden);
    cancelDrag(false);
  });
  function time(value: number) { const n = Math.max(0, Math.ceil(value)); return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`; }
</script>

<div class="factory-shift" bind:this={shell} class:compact={compactLayout} class:tight={tightLayout} data-factory-layout={compactLayout ? "compact" : tightLayout ? "tight" : "regular"} data-factory-theme={theme} data-factory-stage={viewState.stage} data-completed={viewState.completed} data-paused={effectivePaused}>
  <header class="shift-header"><div class="brand"><span class="brandmark" aria-hidden="true">{industrial?.brand ?? (logistics ? "L." : "F.")}</span><div><strong>{cfg.title}</strong><small>{industrial?.subtitle ?? (logistics ? "LOGISTICS / SHIFT" : "FACTORY / SHIFT")}</small></div></div><button class="pause-btn" onclick={pauseToggle} disabled={paused} aria-label={effectivePaused ? "继续工作" : "暂停工作"}>{effectivePaused ? "▶" : "Ⅱ"}</button></header>
  <div class="heading"><div><span class="eyebrow">{industrial?.eyebrow ?? (logistics ? "扫码 · 核对 · 归库" : "点击 · 焊接 · 出货")}</span><h2>{industrial?.title ?? (logistics ? "分拣的一天" : "流水线的一天")}</h2></div><span class="station-tag">{industrial?.station ?? (logistics ? "集货 B2" : "工位 A3")}</span></div>
  <div class="shift-layout">
    <section class="workstation" aria-label={industrial ? `${industrial.object}加工工位` : logistics ? "物流分拣工位" : "电子装配工位"}>
      <div class="step-strip">{#each (industrial?.steps ?? (logistics ? ["扫码入位", "核对标签", "右滑归库"] : ["点击对接", "点击焊点", "右滑出货"])) as label, i}<div class="step" class:active={step === i} class:done={step > i}><span>{String(i + 1).padStart(2, "0")}</span>{label}</div>{/each}</div>
      <div class="floor">
        <div class="floor-top"><span class="floor-status">{effectivePaused ? "已暂停" : info[2]}</span><span>{industrial?.code ?? (logistics ? "PARCEL" : "PCB")} / {String(viewState.boardId).padStart(4, "0")}</span></div>
        <div class="canvas-wrap" bind:this={wrap}>
          <canvas bind:this={canvas} aria-hidden="true" aria-label={industrial ? `${industrial.object}加工画面` : logistics ? "物流包裹分拣画面" : "电路板装配画面"}></canvas>
          <button bind:this={boardHit} class="board-hit" class:dockable={viewState.stage === "ready"} class:draggable={viewState.stage === "ship"} style:left="{geometry.x + geometry.dx}px" style:top="{geometry.y}px" style:width="{geometry.w}px" style:height="{geometry.h}px" disabled={effectivePaused || viewState.finished || (viewState.stage !== "ready" && viewState.stage !== "ship")} aria-label={viewState.stage === "ship" ? `按住${industrial?.object ?? (logistics ? "包裹" : "电路板")}向右拖动，或按右方向键出货` : (industrial?.dockAria ?? `点击${logistics ? "包裹自动扫码" : "电路板自动对接"}`)} onclick={() => { if (viewState.stage === "ready") action(() => model.dock()); }} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={() => { cancelDrag(); publish(); }} onlostpointercapture={() => { if (drag.active) { cancelDrag(); publish(); } }} onkeydown={keyboard}></button>
          {#each points as point, i}<button class="spot" class:active={viewState.activePoint === i && !viewState.welded[i]} class:welding={viewState.stage === "welding" && viewState.activePoint === i} class:done={viewState.welded[i]} hidden={viewState.stage === "ready" || viewState.stage === "docking" || viewState.stage === "shipping"} disabled={effectivePaused || viewState.finished || viewState.stage !== "solder" || viewState.activePoint !== i} style:left="{geometry.x + geometry.dx + point.x * geometry.scale}px" style:top="{geometry.y + point.y * geometry.scale}px" aria-label={industrial?.pointAria[i] ?? (logistics ? `核对${pointNames[i]}标签` : `焊接第 ${i + 1} 个焊点`)} onclick={() => action(() => model.solder(i))}><span>{viewState.welded[i] ? "✓" : i + 1}</span></button>{/each}
          <div class="scene-note"><span>{logistics ? viewState.destination : viewState.material.name}</span><b>{industrial?.safe ?? (logistics ? "SCAN SAFE / B2" : "ESD SAFE / A3")}</b></div>
        </div>
        {#if effectivePaused}<div class="pause-layer"><div class="pause-card"><h3>休息一下。</h3><p>工位进度已保留，继续后再计时。</p>{#if !paused}<button onclick={pauseToggle}>继续工作</button>{:else}<p>返回游戏后继续。</p>{/if}</div></div>{/if}
      </div>
      <div class="instruction-bar" aria-live="polite"><span class="instruction-icon" aria-hidden="true">{step === 0 ? "↙" : step === 1 ? "✦" : "→"}</span><div><h3>{retryHint ? "再往右拖一点，就可以出货" : info[0]}</h3><p>{retryHint ? "按住整件，向右拖过绿色出货区域后松开。" : info[1]}</p></div><div class="progress-dots" aria-label="四处处理进度">{#each viewState.welded as done, i}<i class:done class:active={!done && viewState.activePoint === i}></i>{/each}</div></div>
    </section>
    <aside class="sidebar" aria-label="本次产量和玩法"><section class="panel"><div class="panel-title">本次产量 <small>OUTPUT</small></div><div class="count-row"><b>{String(viewState.completed).padStart(2, "0")}</b><span>/ {viewState.target} 件</span></div><p class="output-label">{industrial?.output ?? (logistics ? "核对好一件，就向右归库。" : "焊好一块，就向右送走。")}</p><div class="time-row"><span>{cfg.timeLimit ? "剩余时间" : "工作用时"}</span><b class:urgent={cfg.timeLimit && viewState.timeLeft <= 5}>{time(cfg.timeLimit ? viewState.timeLeft : viewState.elapsed)}</b></div><div class="output-meter"><i style:width="{viewState.ratio * 100}%"></i></div></section><section class="panel howto"><div class="howto-title">鼠标或触屏操作</div>{#each (industrial?.howto ?? (logistics ? [["点一下包裹", "扫描运单，自动送入工位。"], ["依次核对标签", "点击黄色亮点，确认四项信息。"], ["按住包裹往右拖", "送往指定片区，下一件自动到达。"]] : [["点一下板子", "芯片自动对接到位。"], ["点亮起的焊点", "每点一次，自动焊好一处。"], ["按住板子往右拖", "松开出货，下一块自动到达。"]])) as tip, i}<div class="howto-item" class:current={step === i}><span class="step-num">{i + 1}</span><div><strong>{tip[0]}</strong><p>{tip[1]}</p></div></div>{/each}</section></aside>
  </div>
  <footer>完成出货才计入产量 · 按顺序完成三道工序</footer>
</div>

<style>
  .factory-shift[data-factory-theme="steel"]{--yellow:#efb75d;--green:#886145;}
  .factory-shift[data-factory-theme="aluminum"]{--yellow:#c7d99b;--green:#4a6c66;}
  .factory-shift[data-factory-theme="glass"]{--yellow:#a9dad0;--green:#286d75;}
  .factory-shift{width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;min-height:0;}
  .shift-header,.heading,footer{flex:none;}
  .shift-layout{flex:1;min-height:0;grid-template-rows:minmax(0,1fr);}
  .workstation{display:flex;flex-direction:column;min-height:0;}
  .step-strip,.instruction-bar{flex:none;}
  .floor{flex:1;min-height:0;}
  .floor > .canvas-wrap{position:absolute;inset:0;height:auto;min-height:0;}
  .sidebar{min-height:0;overflow:auto;}
  .factory-shift{--paper:#f2f3ed;--ink:#202c26;--muted:#6d776f;--line:#d9ddd4;--yellow:#f4cc4b;--green:#226648;box-sizing:border-box;background:var(--paper);color:var(--ink);padding:18px 22px;font:14px/1.6 "Microsoft YaHei","PingFang SC",sans-serif;border-radius:10px;max-width:1320px;margin:auto}.factory-shift *{box-sizing:border-box}.factory-shift button{font:inherit;cursor:pointer;touch-action:manipulation}.factory-shift button:disabled{cursor:default}.factory-shift button:focus-visible{outline:3px solid var(--yellow);outline-offset:4px}.factory-shift [hidden]{display:none!important}
  .shift-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line);padding-bottom:12px}.brand{display:flex;align-items:center;gap:12px}.brandmark{display:grid;place-items:center;background:var(--ink);color:var(--yellow);width:34px;height:34px;border-radius:4px;font:700 20px Consolas,monospace}.brand strong{font-size:14px}.brand small{display:block;color:var(--muted);font:11px Consolas,monospace;letter-spacing:1px}.pause-btn{width:34px;height:34px;border:1px solid var(--line);border-radius:5px;background:transparent;color:var(--ink);font-weight:700!important}.heading{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:14px 0}.eyebrow{font-size:11px;color:var(--muted)}.heading h2{font-size:27px;line-height:1.3;margin:2px 0 0}.station-tag{background:#e4e9df;padding:6px 10px;font:700 12px Consolas,monospace;border-radius:4px;white-space:nowrap}
  .shift-layout{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:16px;align-items:start}.workstation{min-width:0;border:1px solid var(--line);border-radius:8px;overflow:hidden}.step-strip{display:grid;grid-template-columns:repeat(3,1fr);background:white}.step{padding:11px 10px;border-right:1px solid var(--line);font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:7px}.step:last-child{border:0}.step>span,.step-num{border:1px solid #ccd3c5;border-radius:50%;width:24px;height:24px;display:grid;place-items:center;font:11px Consolas,monospace;color:var(--muted);flex:none}.step.active{background:var(--yellow)}.step.active>span{border-color:#6d632c;color:var(--ink)}.step.done{background:#e8f0e4;color:var(--green)}
  .floor{position:relative;background:#26322c;overflow:hidden}.floor-top{pointer-events:none;position:absolute;top:15px;left:18px;right:18px;z-index:6;display:flex;justify-content:space-between;align-items:center;color:#b8c8b8;font:11px Consolas,monospace}.floor-status{display:flex;align-items:center;gap:7px}.floor-status:before{content:"";display:block;width:6px;height:6px;border-radius:50%;background:var(--yellow)}.canvas-wrap{height:360px;position:relative;overflow:hidden}canvas{display:block;width:100%;height:100%;pointer-events:none}.board-hit{position:absolute;border:0;padding:0;background:transparent;border-radius:8px;z-index:3;touch-action:none!important;user-select:none;-webkit-tap-highlight-color:transparent}.board-hit.dockable:hover{box-shadow:0 0 0 3px #f4cc4b70,0 0 30px #f4cc4b1a}.board-hit.draggable{cursor:grab;box-shadow:0 0 0 2px #a0d89d99}.board-hit:active{cursor:grabbing}.board-hit:disabled{pointer-events:none}.spot{position:absolute;z-index:4;width:48px;height:48px;padding:0;display:grid;place-items:center;background:transparent;border:0;transform:translate(-50%,-50%);-webkit-tap-highlight-color:transparent}.spot span{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;border:2px solid #244930;background:#91ac86;color:#2b4732;font:700 12px Consolas,monospace;transition:background .16s,box-shadow .16s}.spot.active span{background:var(--yellow);border-color:#ffeb93;box-shadow:0 0 0 7px #f4cc4b25,0 0 23px #f4cc4b66;animation:pulse 1.2s infinite}.spot.welding span{background:#fff1a0;box-shadow:0 0 0 8px #f4cc4b2b,0 0 30px #f4cc4b99}.spot.done span{background:#d2e3c1;border-color:#83b379;color:#2e663b}.spot:disabled{pointer-events:none}.scene-note{pointer-events:none;position:absolute;bottom:15px;left:18px;right:18px;display:flex;justify-content:space-between;color:#a7b7a8;font-size:11px;z-index:5}.scene-note b{font-family:Consolas,monospace;font-weight:400}@keyframes pulse{50%{box-shadow:0 0 0 10px #f4cc4b13,0 0 28px #f4cc4b80}}
  .instruction-bar{display:flex;align-items:center;gap:12px;background:#fff;padding:14px 16px;min-height:85px}.instruction-icon{width:34px;height:38px;background:#f3f4ec;display:grid;place-items:center;border-radius:5px;flex:none;color:var(--green);font-size:26px}.instruction-bar h3{font-size:16px;margin:0;line-height:1.6}.instruction-bar p{font-size:13px;color:var(--muted);margin:2px 0 0}.progress-dots{display:flex;gap:5px;margin-left:auto;flex:none}.progress-dots i{width:7px;height:7px;border-radius:50%;background:#dfe4d8}.progress-dots i.active{background:var(--yellow)}.progress-dots i.done{background:#559a67}.pause-layer{position:absolute;inset:0;background:#17251cb3;backdrop-filter:blur(4px);z-index:9;display:grid;place-items:center;text-align:center}.pause-card{background:var(--paper);padding:22px 30px;border-radius:6px;max-width:90%}.pause-card h3{font-size:23px;margin:0 0 10px}.pause-card p{font-size:13px;color:var(--muted);margin:0 0 16px}.pause-card button{border:0;background:var(--yellow);color:var(--ink);border-radius:4px;font-weight:700;padding:10px 24px}
  .panel{background:white;border:1px solid var(--line);border-radius:7px;padding:17px;margin-bottom:14px}.panel-title{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700}.panel-title small{font:11px Consolas,monospace;color:var(--muted);font-weight:400}.count-row{display:flex;align-items:baseline;gap:8px;margin:8px 0 3px}.count-row b{font:700 47px Consolas,monospace;letter-spacing:-2px}.count-row span{font-size:13px;color:var(--muted)}.output-label{color:var(--green);font-size:12px;margin:0 0 14px}.time-row{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e6ebe1;padding-top:10px;font-size:12px;color:var(--muted)}.time-row b{font:14px Consolas,monospace;color:var(--ink)}.time-row b.urgent{color:#b84235}.output-meter{height:5px;background:#e6ebe1;border-radius:4px;margin-top:12px;overflow:hidden}.output-meter i{display:block;height:100%;background:#559a67}.howto-title{font-size:13px;font-weight:700;margin-bottom:14px}.howto-item{display:flex;gap:9px;margin-bottom:14px}.howto-item:last-child{margin-bottom:0}.howto-item strong{font-size:13px;font-weight:600}.howto-item p{font-size:12px;line-height:1.7;color:var(--muted);margin:3px 0 0}.howto-item.current strong{color:var(--green)}.howto-item.current .step-num{background:var(--yellow);border-color:#dbbd59;color:var(--ink)}footer{font-size:11px;color:var(--muted);margin-top:12px}
  @media(max-width:760px){.factory-shift{padding:14px}.shift-layout{grid-template-columns:1fr;gap:12px}.sidebar{display:grid;grid-template-columns:1fr 1fr;gap:12px}.panel{margin:0}.canvas-wrap{height:340px}}@media(max-width:480px){.factory-shift{padding:10px}.brand small{display:none}.brand strong{font-size:12px}.brandmark{width:30px;height:30px}.brand{gap:8px}.heading{margin:10px 0}.heading h2{font-size:23px}.step{padding:10px 4px;font-size:12px;gap:5px}.step>span{width:20px;height:20px;font-size:10px}.canvas-wrap{height:300px}.floor-top,.scene-note{left:12px;right:12px;font-size:10px}.instruction-bar{padding:12px 10px;gap:8px}.instruction-bar h3{font-size:14px}.instruction-bar p{font-size:12px}.instruction-icon{width:28px;height:32px}.progress-dots{gap:3px}.progress-dots i{width:5px;height:5px}.panel{padding:12px}.count-row b{font-size:40px}.count-row span{font-size:11px}.howto-item{gap:6px;margin-bottom:10px}.howto-item strong{font-size:12px}.howto-item p{font-size:11px}.howto-title{font-size:12px}.output-label{font-size:11px}.sidebar{gap:8px}}@media(max-height:520px) and (min-width:600px){.factory-shift{padding:10px 14px}.heading{margin:7px 0}.heading h2{font-size:21px}.shift-layout{grid-template-columns:minmax(0,1fr) 180px;gap:10px}.canvas-wrap{height:245px}.step{padding:7px 6px}.instruction-bar{padding:9px 12px;min-height:66px}.instruction-bar h3{font-size:14px}.instruction-bar p{font-size:11px}.panel{padding:12px}.howto-item{margin-bottom:9px}.count-row b{font-size:35px}footer{margin-top:7px}}@media(prefers-reduced-motion:reduce){.spot span{animation:none!important;transition:none!important}}
  /* Grid rows and the measured floor own the available height. Canvas never requests 100% plus siblings. */
  .factory-shift .shift-layout{align-items:stretch;}
  @media(max-width:760px){.factory-shift .shift-layout{grid-template-rows:minmax(0,1fr) auto;}}
  .factory-shift.compact{padding:8px 10px;}
  .compact .shift-header{padding-bottom:5px;min-height:32px;}
  .compact .brandmark,.compact .pause-btn{width:28px;height:28px;min-height:28px!important;}
  .compact .brand small,.compact .heading,.compact footer{display:none;}
  .factory-shift.compact .shift-layout{margin-top:6px;grid-template-columns:minmax(0,1fr) 164px;grid-template-rows:minmax(0,1fr);gap:10px;}
  .compact .step{padding:5px 7px;font-size:12px;}
  .compact .step>span{width:21px;height:21px;}
  .compact .instruction-bar{min-height:42px;padding:7px 10px;gap:8px;}
  .compact .instruction-icon{width:24px;height:26px;font-size:21px;}
  .compact .instruction-bar h3{font-size:13px;line-height:1.4;}
  .compact .instruction-bar p{display:none;}
  .compact .floor-top{top:6px;left:10px;right:10px;font-size:10px;}
  .compact .scene-note{bottom:6px;left:10px;right:10px;font-size:10px;}
  .compact .sidebar{display:flex;flex-direction:column;gap:7px;}
  .compact .panel{padding:9px 10px;margin:0;flex:none;}
  .compact .panel-title{font-size:11px;}
  .compact .count-row{margin:4px 0;gap:7px;}
  .compact .count-row b{font-size:31px;}
  .compact .count-row span{font-size:11px;}
  .compact .output-label{display:none;}
  .compact .time-row{padding-top:6px;font-size:11px;}
  .compact .output-meter{margin-top:7px;}
  .compact .howto-title{font-size:11px;margin-bottom:7px;}
  .compact .howto-item{gap:6px;margin-bottom:7px;}
  .compact .howto-item strong{font-size:11px;}
  .compact .howto-item p{display:none;}
  .compact .step-num{width:20px;height:20px;}
  .factory-shift.tight{padding:6px 8px;}
  .tight .heading,.tight footer,.tight .brand small,.tight .howto{display:none;}
  .tight .shift-header{padding-bottom:4px;min-height:30px;}
  .tight .brandmark,.tight .pause-btn{width:26px;height:26px;min-height:26px!important;}
  .tight .instruction-bar{min-height:38px;padding:5px 8px;}
  .tight .instruction-bar h3{font-size:12px;line-height:1.35;}
  .tight .instruction-bar p{display:none;}
  .tight .instruction-icon{width:23px;height:24px;font-size:20px;}
  .tight .step{padding:4px 5px;font-size:11px;}
  .tight .step>span{width:20px;height:20px;}
  .tight .panel{padding:7px 9px;}
  .tight .floor-top{top:5px;left:9px;right:9px;font-size:10px;}
  .tight .scene-note{bottom:5px;left:9px;right:9px;font-size:10px;}
  @media(max-width:559px){.tight .shift-layout{gap:6px;}.tight .sidebar{grid-template-columns:1fr;}.tight .sidebar>.panel:first-child{display:flex;flex-wrap:wrap;align-items:center;gap:5px 10px;}.tight .count-row{margin:0;}.tight .count-row b{font-size:25px;}.tight .output-label,.tight .output-meter,.tight .panel-title small{display:none;}.tight .time-row{margin-left:auto;border:0;padding:0;gap:6px;}.tight .panel-title{font-size:11px;}}
</style>
