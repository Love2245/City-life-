<script lang="ts">
  import { onMount } from "svelte";
  import type { DartsCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";
  import SpriteIcon from "../SpriteIcon.svelte";
  import { dartBalloonPositions, dartsScoreRatio } from "../../../game/core/minigameGeometry";

  // 飞镖是纯回合制（按支数计），没有任何计时器，无需 paused 语义。
  let { cfg, onFinish }: { cfg: DartsCfg; onFinish: (ratio: number) => void } = $props();

  const darts = $derived(cfg.darts ?? 10);
  const balloonCount = $derived(cfg.balloons ?? 10);
  const heartCount = $derived(Math.min(Math.max(0, cfg.heartBalloons ?? 2), Math.max(0, balloonCount - 1)));

  interface Balloon {
    id: number;
    x: number;
    y: number;
    heart: boolean;
    popped: boolean;
  }

  let balloons = $state<Balloon[]>([]);
  let dartsLeft = $state(0);
  let goodHits = $state(0);
  let heartHits = $state(0);
  let done = $state(false);
  let lastHit = $state<string | null>(null);

  onMount(() => {
    const positions = dartBalloonPositions(balloonCount);
    balloons = positions.map(({ x, y }, id) => ({
      id, x, y, heart: id >= balloonCount - heartCount, popped: false,
    }));
    dartsLeft = darts;
  });

  function pop(id: number): void {
    if (done || dartsLeft <= 0) return;
    const balloon = balloons.find((b) => b.id === id);
    if (!balloon || balloon.popped) return;
    dartsLeft -= 1;
    balloons = balloons.map((b) => (b.id === id ? { ...b, popped: true } : b));
    if (balloon.heart) {
      heartHits += 1;
      lastHit = "扎到红心气球了！摊主心疼地看了你一眼";
      playSound("error");
    } else {
      goodHits += 1;
      lastHit = "命中！";
      playSound("game");
    }
    if (dartsLeft <= 0 || balloons.filter((b) => !b.heart && !b.popped).length === 0) finish();
  }

  function finish(): void {
    if (done) return;
    done = true;
    const goodTotal = balloons.filter((b) => !b.heart).length;
    const ratio = dartsScoreRatio(goodHits, heartHits, goodTotal);
    onFinish(ratio);
  }
</script>

<div class="darts">
  <div class="game-head">
    <div>
      <div class="game-title">{cfg.icon} {cfg.title}</div>
      <div class="game-desc">{cfg.desc}</div>
    </div>
    <div class="score">{dartsLeft}<small>支飞镖</small></div>
  </div>

  <div class="balloon-wall" aria-label="气球墙">
    <div class="wall-string"></div>
    {#each balloons as balloon (balloon.id)}
      <button
        class="balloon"
        class:heart={balloon.heart}
        class:popped={balloon.popped}
        style={`left:${balloon.x}%;top:${balloon.y}%`}
        disabled={done || balloon.popped || dartsLeft <= 0}
        aria-label={balloon.heart ? "红心气球" : "普通气球"}
        onclick={() => pop(balloon.id)}
      >
        <SpriteIcon game="darts" item={balloon.heart ? "heart-balloon" : "balloon"} fallback="●" class="balloon-sprite" />
        <span class="balloon-string"></span>
      </button>
    {/each}
    <div class="stall-table"><SpriteIcon game="darts" item="dart" fallback="➶" class="dart-prop" /><span>气球摊</span><i></i><i></i></div>
  </div>

  <div class="darts-status">
    <span class="good">命中 {goodHits}</span>
    <span class="bad">红心 {heartHits}</span>
    <span class="dim">剩余 {dartsLeft} 支</span>
  </div>
  <p class="hit-message" class:warning={heartHits > 0}>{lastHit ?? "点击气球投掷；空白处不会消耗飞镖"}</p>
  <p class="game-foot">普通气球越多越好，红心气球不要碰；手机上直接点击即可。</p>
</div>

<style>
  .darts { display: flex; flex-direction: column; gap: 12px; min-height: 440px; }
  .game-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .game-title { font-size: 18px; font-weight: 850; color: var(--text, #eef1ff); }
  .game-desc, .game-foot, .hit-message, .dim { color: var(--text-dim, #9aa3c7); font-size: 12px; line-height: 1.55; }
  .game-desc { margin-top: 4px; }
  .score { color: var(--accent, #ffd166); font-size: 24px; font-weight: 850; text-align: right; font-variant-numeric: tabular-nums; }
  .score small { display: block; color: var(--text-dim, #9aa3c7); font-size: 10px; font-weight: 650; }
  .balloon-wall { position: relative; flex: 1; min-height: 320px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); border-radius: 20px; background: radial-gradient(circle at 50% 30%, rgba(84,109,148,.32), transparent 55%), linear-gradient(160deg, #1d2c46, #291e39); box-shadow: inset 0 0 32px rgba(0,0,0,.35); touch-action: manipulation; }
  .wall-string { position: absolute; left: 5%; right: 5%; bottom: 22%; height: 1px; background: rgba(255,255,255,.18); box-shadow: 0 10px rgba(255,255,255,.08); }
  .balloon { position: absolute; width: 48px; height: 64px; padding: 0; transform: translate(-50%, -50%); background: transparent; border: 0; cursor: crosshair; z-index: 2; transition: transform .16s ease, opacity .2s ease; }
  .balloon:hover:not(:disabled) { transform: translate(-50%, -50%) scale(1.12); }
  .balloon:disabled { cursor: default; }
  .balloon-sprite { position: absolute; inset: 0 3px auto; width: 42px; height: 48px; display: block; object-fit: contain; filter: drop-shadow(0 5px 8px rgba(0,0,0,.28)); }
  .balloon-string { position: absolute; left: 24px; top: 46px; height: 20px; border-left: 1px solid rgba(255,255,255,.45); }
  .balloon.popped { opacity: 0; transform: translate(-50%, -70%) scale(.2); pointer-events: none; }
  .stall-table { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%); width: 48%; height: 16%; border-radius: 10px 10px 3px 3px; background: linear-gradient(180deg, #b98262, #604154); border: 1px solid rgba(255,220,160,.35); color: rgba(255,255,255,.68); display: flex; align-items: center; justify-content: center; font-size: 12px; letter-spacing: 2px; box-shadow: inset 0 5px rgba(255,230,180,.12), 0 12px 20px rgba(0,0,0,.3); }
  .dart-prop { position: absolute; width: 42px; height: 42px; left: 12%; top: -24px; transform: rotate(-18deg); }
  .stall-table i { position: absolute; bottom: -22px; width: 3px; height: 24px; background: #55405a; }
  .stall-table i:nth-of-type(1) { left: 18%; } .stall-table i:nth-of-type(2) { right: 18%; } .stall-table i:nth-of-type(3) { display: none; }
  .darts-status { display: flex; justify-content: center; gap: 18px; font-size: 13px; font-weight: 750; }
  .good { color: #7bd88f; } .bad { color: #ff8a7a; }
  .hit-message { margin: 0; text-align: center; min-height: 18px; }
  .hit-message.warning { color: #ff9c86; }
  .game-foot { margin: 0; text-align: center; font-size: 11px; }
  @media (max-width: 560px) { .darts { min-height: 390px; } .balloon-wall { min-height: 275px; } .balloon { transform: translate(-50%, -50%) scale(.88); } .balloon:hover:not(:disabled) { transform: translate(-50%, -50%) scale(1); } }
</style>
