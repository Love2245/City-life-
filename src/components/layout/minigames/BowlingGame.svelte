<script lang="ts">
  import { onMount } from "svelte";
  import type { BowlingCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";
  import SpriteIcon from "../SpriteIcon.svelte";
  import { bowlingHitCount, bowlingPinPositions, normalizedPoint, bowlingScoreRatio } from "../../../game/core/minigameGeometry";

  let { cfg, onFinish, paused = false }: { cfg: BowlingCfg; onFinish: (ratio: number) => void; paused?: boolean } = $props();

  const attempts = $derived(cfg.attempts ?? 2);
  const pinCount = $derived(cfg.pinCount ?? 10);
  interface Pin {
    x: number;
    y: number;
    standing: boolean;
  }

  let pins = $state<Pin[]>([]);
  let aimX = $state(50);
  let power = $state(0.72);
  let ballX = $state(50);
  let ballY = $state(90);
  let ballImpact = $state(false);
  let rolls = $state(0);
  let knocked = $state(0);
  let rolling = $state(false);
  let done = $state(false);
  let message = $state("拖动球道调整方向，向上滑动或点击投球");
  let board: HTMLDivElement;
  let lane: HTMLDivElement;
  let pointerStart: { x: number; y: number } | null = null;
  let throwTimers: ReturnType<typeof setTimeout>[] = [];

  function clearThrowTimers(): void {
    throwTimers.forEach((timer) => clearTimeout(timer));
    throwTimers = [];
  }

  function scheduleThrow(callback: () => void, delay: number): void {
    // 暂停期间动画阶段不推进（到点续等），恢复后从当前阶段继续，不会丢帧或跳过结算。
    const step = (): void => {
      if (paused) { throwTimers.push(setTimeout(step, delay)); return; }
      callback();
    };
    throwTimers.push(setTimeout(step, delay));
  }

  function updateAim(clientX: number): void {
    if (!board) return;
    const rect = lane?.getBoundingClientRect();
    if (!rect) return;
    aimX = Math.max(18, Math.min(82, normalizedPoint(clientX, rect.top, rect).x));
  }

  function pointerDown(e: PointerEvent): void {
    if (done || rolling) return;
    pointerStart = { x: e.clientX, y: e.clientY };
    updateAim(e.clientX);
    lane?.setPointerCapture?.(e.pointerId);
  }

  function pointerMove(e: PointerEvent): void {
    if (!pointerStart || done || rolling) return;
    updateAim(e.clientX);
    const rect = lane?.getBoundingClientRect();
    if (!rect) return;
    power = Math.max(0.35, Math.min(1, (pointerStart.y - e.clientY) / rect.height + 0.55));
  }

  function pointerUp(e: PointerEvent): void {
    if (!pointerStart || done || rolling) return;
    const distance = pointerStart.y - e.clientY;
    if (distance > 18) power = Math.max(0.35, Math.min(1, distance / Math.max(1, lane?.clientHeight ?? 1) + 0.45));
    pointerStart = null;
    lane?.releasePointerCapture?.(e.pointerId);
    throwBall();
  }

  function throwBall(): void {
    if (done || rolling || rolls >= attempts) return;
    clearThrowTimers();
    rolling = true;
    ballImpact = false;
    message = "球瓶正在倒下……";
    ballX = aimX;
    ballY = 90;
    playSound("game");

    // 分段推进球的位置：从出手线减速滑向瓶区，避免旧实现先跳到瓶区、再瞬移回底线。
    // 轻微向中线收束，表现球在球道上滚动而不是横向乱飞。
    const drift = (50 - aimX) * 0.18;
    scheduleThrow(() => {
      ballY = 70;
      ballX = Math.max(12, Math.min(88, aimX + drift * 0.35));
    }, 35);
    scheduleThrow(() => {
      ballY = 48;
      ballX = Math.max(12, Math.min(88, aimX + drift * 0.7));
    }, 180);
    scheduleThrow(() => {
      ballY = 30;
      ballX = Math.max(12, Math.min(88, aimX + drift));
    }, 360);
    scheduleThrow(() => {
      ballY = 25;
      ballImpact = true;
      const standing = pins.filter((p) => p.standing);
      if (standing.length === 0) {
        ballImpact = false;
        ballY = 90;
        rolling = false;
        finish();
        return;
      }

      // 轻量物理：瞄准决定撞击列，力量决定冲击范围；倒下的球瓶继续影响下一杆。
      const hit = bowlingHitCount(standing.map((p) => p.x), aimX, power);
      const ordered = [...standing].sort((a, b) => Math.abs(a.x - aimX) - Math.abs(b.x - aimX));
      const fallen = ordered.slice(0, hit);
      // 逐个倒下，给球瓶碰撞留出可见的时间差，避免所有球瓶同帧消失。
      fallen.forEach((pin, index) => {
        scheduleThrow(() => {
          pins = pins.map((p) => (p === pin ? { ...p, standing: false } : p));
        }, index * 55);
      });
      knocked += hit;
      rolls += 1;
      message = `撞倒 ${hit} 个球瓶，余下球瓶正在晃动……`;
      scheduleThrow(() => {
        ballImpact = false;
        rolling = false;
        ballY = 90;
        if (knocked >= pinCount) {
          message = "全倒！漂亮的一球！";
          finish();
        } else if (rolls >= attempts) {
          message = `本局结束，击倒 ${knocked}/${pinCount} 个球瓶`;
          finish();
        } else {
          message = `第 ${rolls} 杆击倒 ${knocked} 个，瞄准剩下的球瓶再来一杆`;
        }
      }, 260 + hit * 55);
    }, 620);
  }

  function finish(): void {
    if (done) return;
    done = true;
    onFinish(bowlingScoreRatio(knocked, pinCount));
  }

  onMount(() => {
    pins = bowlingPinPositions(pinCount).map((p) => ({ ...p, standing: true }));
    return () => {
      clearThrowTimers();
    };
  });
</script>

<div class="bowling">
  <div class="game-head">
    <div>
      <div class="game-title">{cfg.icon} {cfg.title}</div>
      <div class="game-desc">{cfg.desc}</div>
    </div>
    <div class="score">{knocked}/{pinCount}<small>球瓶</small></div>
  </div>

  <div
    class="lane-wrap"
    bind:this={board}
    role="application"
    aria-label="保龄球球道，拖动调整方向并向上滑动投球"
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={() => (pointerStart = null)}
  >
    <div class="lane" bind:this={lane}>
      <div class="lane-arrows" style={`left:${aimX}%`} aria-hidden="true"><span></span></div>
      <div class="aim-line" style={`left:${aimX}%`}></div>
      {#each pins as pin}
        <div class="pin" class:fallen={!pin.standing} style={`left:${pin.x}%;top:${pin.y}%`} aria-label={pin.standing ? "立起的球瓶" : "倒下的球瓶"}>
          <SpriteIcon game="bowling" item="bowling-pin" fallback="●" class="pin-sprite" />
        </div>
      {/each}
      <div class="ball" class:rolling class:impact={ballImpact} style={`left:${ballX}%;top:${ballY}%`} aria-label="保龄球">
        <SpriteIcon game="bowling" item="bowling-ball" fallback="●" class="ball-sprite" />
      </div>
    </div>
    <div class="lane-guide">方向 {Math.round(aimX)} · 力量 {Math.round(power * 100)}%</div>
  </div>

  <div class="bowling-actions">
    <button type="button" class="throw-btn" disabled={done || rolling || rolls >= attempts} onclick={throwBall}>
      {rolling ? "出球中…" : `投球（${rolls}/${attempts}）`}
    </button>
    <span class="hint">{message}</span>
  </div>

  <p class="game-foot">鼠标拖动、触摸滑动均可操作；球会沿瞄准线滚向瓶区，准头和力度决定冲击范围。</p>
</div>

<style>
  .bowling { display: flex; flex-direction: column; gap: 12px; min-height: 440px; }
  .game-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .game-title { font-size: 18px; font-weight: 850; color: var(--text, #eef1ff); }
  .game-desc, .game-foot, .hint { color: var(--text-dim, #9aa3c7); font-size: 12px; line-height: 1.55; }
  .game-desc { margin-top: 4px; }
  .score { color: var(--accent, #ffd166); font-size: 24px; font-weight: 850; text-align: right; font-variant-numeric: tabular-nums; }
  .score small { display: block; color: var(--text-dim, #9aa3c7); font-size: 10px; font-weight: 650; }
  .lane-wrap { position: relative; flex: 1; min-height: 315px; touch-action: none; user-select: none; }
  .lane { position: absolute; inset: 0 11%; overflow: hidden; border: 1px solid rgba(255,255,255,.16); border-radius: 20px; background: linear-gradient(90deg, rgba(88,57,48,.75), rgba(182,128,82,.9) 49%, rgba(88,57,48,.75)); box-shadow: inset 0 0 32px rgba(0,0,0,.32), 0 10px 28px rgba(0,0,0,.25); perspective: 720px; }
  .lane::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 15%, rgba(255,255,255,.07) 15.2% 15.7%); opacity: .5; }
  .lane::after { content: ""; position: absolute; left: 13%; right: 13%; top: 16%; height: 1px; background: rgba(255,255,255,.36); box-shadow: 0 16px rgba(255,255,255,.12), 0 32px rgba(255,255,255,.1); }
  .aim-line { position: absolute; top: 8%; bottom: 13%; width: 2px; transform: translateX(-50%); background: linear-gradient(180deg, rgba(255,209,102,.9), transparent); opacity: .7; z-index: 2; }
  .lane-arrows { position: absolute; top: 5%; transform: translateX(-50%); width: 24px; height: 20px; z-index: 3; filter: drop-shadow(0 2px 4px #000); }
  .lane-arrows span, .lane-arrows span::after { position: absolute; content: ""; display: block; width: 13px; height: 3px; top: 8px; background: var(--accent, #ffd166); border-radius: 2px; }
  .lane-arrows span { left: 2px; transform: rotate(-45deg); transform-origin: right center; }
  .lane-arrows span::after { left: 9px; top: -5px; transform: rotate(90deg); transform-origin: left center; }
  .pin { position: absolute; transform: translate(-50%, -50%); z-index: 4; width: clamp(26px, 4.5vw, 44px); height: clamp(34px, 6vw, 58px); transition: transform .25s ease, opacity .25s ease; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
  .pin :global(img), .pin :global(span) { width: 100%; height: 100%; display: block; object-fit: contain; }
  .pin.fallen { transform: translate(-50%, -50%) rotate(70deg) scale(.7); opacity: .25; }
  .ball { position: absolute; z-index: 5; transform: translate(-50%, -50%); width: clamp(34px, 5vw, 54px); height: clamp(34px, 5vw, 54px); filter: drop-shadow(0 4px 3px rgba(0,0,0,.5)); transition: top .3s cubic-bezier(.22,.75,.28,1), left .3s cubic-bezier(.22,.75,.28,1), filter .16s ease; }
  .ball :global(img), .ball :global(span) { width: 100%; height: 100%; display: block; object-fit: contain; }
  .ball.rolling { animation: bowl-roll .78s linear infinite; }
  .ball.impact { filter: drop-shadow(0 0 10px rgba(255,209,102,.9)) drop-shadow(0 4px 3px rgba(0,0,0,.5)); }
  @keyframes bowl-roll { from { transform: translate(-50%, -50%) scale(.82) rotate(0deg); } 50% { transform: translate(-50%, -50%) scale(1) rotate(360deg); } to { transform: translate(-50%, -50%) scale(.9) rotate(720deg); } }
  .lane-guide { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,.75); font-size: 11px; z-index: 6; white-space: nowrap; }
  .bowling-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .throw-btn { border: 1px solid color-mix(in srgb, var(--accent, #ffd166) 65%, transparent); background: color-mix(in srgb, var(--accent, #ffd166) 18%, transparent); color: var(--accent, #ffd166); border-radius: 10px; padding: 10px 16px; font-weight: 800; cursor: pointer; }
  .throw-btn:disabled { opacity: .45; cursor: not-allowed; }
  .game-foot { margin: 0; text-align: center; font-size: 11px; }
  @media (max-width: 560px) { .bowling { min-height: 380px; } .lane-wrap { min-height: 270px; } .lane { inset: 0 5%; } }
</style>
