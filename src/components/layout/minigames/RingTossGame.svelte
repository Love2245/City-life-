<script lang="ts">
  import { onMount } from "svelte";
  import { miniGameRandom } from "../../../lib/minigameRandom";
  import type { RingTossCfg } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";
  import SpriteIcon from "../SpriteIcon.svelte";
  import { ringTossScoreRatio, ringTossTargets, type RingTargetPoint } from "../../../game/core/minigameGeometry";

  let { cfg, onFinish, paused = false }: { cfg: RingTossCfg; onFinish: (ratio: number) => void; paused?: boolean } = $props();
  const random = miniGameRandom();

  const rings = $derived(cfg.rings ?? 10);
  const targets = $derived<RingTargetPoint[]>(ringTossTargets(cfg.targetCount ?? 6));

  let ringsLeft = $state(0);
  let points = $state(0);
  let throwing = $state(false);
  let done = $state(false);
  let lastTarget = $state<number | null>(null);
  let lastResult = $state<string | null>(null);
  let throwTimer: ReturnType<typeof setTimeout> | undefined;

  /** 奖品使用独立的 CSS 小插画，避免把餐盘误当成所有奖品。 */
  function prizeKind(label: string): string {
    if (label.includes("布偶") || label.includes("玩偶")) return "plush";
    if (label.includes("茶具")) return "tea-set";
    if (label.includes("收音机")) return "radio";
    if (label.includes("模型")) return "model";
    return "trinket";
  }

  function toss(index: number): void {
    if (done || throwing || ringsLeft <= 0) return;
    throwing = true;
    lastTarget = index;
    lastResult = "圈圈飞出去了……";
    playSound("game");
    resolveToss(index);
  }

  /** 结算延迟到暂停结束后：恢复时原投掷继续，避免玩家看不见的时候世界继续跑。 */
  function resolveToss(index: number): void {
    throwTimer = setTimeout(() => {
      if (paused) { resolveToss(index); return; }
      const target = targets[index];
      if (!target) { throwing = false; return; }
      const hit = random() < target.hitRate;
      ringsLeft -= 1;
      throwing = false;
      if (hit) {
        points += target.value;
        lastResult = `套中了「${target.label}」！+${target.value} 分`;
        playSound("success");
      } else {
        lastResult = `差一点，圈从「${target.label}」旁边滑开了`;
        playSound("error");
      }
      if (ringsLeft <= 0) finish();
    }, 420);
  }

  function finish(): void {
    if (done) return;
    done = true;
    onFinish(ringTossScoreRatio(points, rings, targets));
  }

  onMount(() => {
    ringsLeft = rings;
    return () => {
    if (throwTimer) clearTimeout(throwTimer);
    };
  });
</script>

<div class="ring-toss">
  <div class="game-head">
    <div>
      <div class="game-title">{cfg.icon} {cfg.title}</div>
      <div class="game-desc">{cfg.desc}</div>
    </div>
    <div class="score">{ringsLeft}<small>个圈</small></div>
  </div>

  <div class="toss-yard" aria-label="套圈目标区">
    {#each targets as target, i (i)}
      <button
        type="button"
        class="target"
        class:active={lastTarget === i}
        style={`left:${target.x}%;top:${target.y}%`}
        disabled={done || throwing || ringsLeft <= 0}
        aria-label={`投掷到${target.label}，${target.value}分`}
        onclick={() => toss(i)}
      >
        <span class={`prize-art ${prizeKind(target.label)}${target.value >= 3 ? " high" : ""}`} aria-hidden="true">
          <span class="prize-value">+{target.value}</span>
        </span>
        <SpriteIcon game="ringtoss" item="peg" fallback="" class="peg" />
        <span class="target-label">{target.label}</span>
      </button>
    {/each}
    <div class="ring-source" class:busy={throwing}><SpriteIcon game="ringtoss" item="ring" fallback="○" class="ring-source-sprite" /></div>
    {#if lastTarget !== null && throwing}
      <div class="flying-ring" style={`left:${targets[lastTarget].x}%;top:${targets[lastTarget].y}%`}><SpriteIcon game="ringtoss" item="ring" fallback="○" class="flying-ring-sprite" /></div>
    {/if}
  </div>

  <div class="toss-status"><span class="points">得分 {points}</span><span class="dim">每个圈最多 3 分</span></div>
  <p class="toss-message">{lastResult ?? "点击一个奖品目标投掷套圈；远处奖品分高但更难命中"}</p>
  <p class="game-foot">近处目标命中率更高，远处目标奖励更好；每个圈只能投一次。</p>
</div>

<style>
  .ring-toss { display: flex; flex-direction: column; gap: 12px; min-height: 440px; }
  .game-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .game-title { font-size: 18px; font-weight: 850; color: var(--text, #eef1ff); }
  .game-desc, .game-foot, .toss-message, .dim { color: var(--text-dim, #9aa3c7); font-size: 12px; line-height: 1.55; }
  .game-desc { margin-top: 4px; }
  .score { color: var(--accent, #ffd166); font-size: 24px; font-weight: 850; text-align: right; font-variant-numeric: tabular-nums; }
  .score small { display: block; color: var(--text-dim, #9aa3c7); font-size: 10px; font-weight: 650; }
  .toss-yard { position: relative; flex: 1; min-height: 320px; overflow: hidden; border: 1px solid rgba(255,255,255,.14); border-radius: 20px; background-image: linear-gradient(180deg, rgba(16,22,42,.18), rgba(18,12,25,.62)), var(--mgh-scene, linear-gradient(155deg, #35435a, #533b52 55%, #76513f)); background-size: cover; background-position: center; background-repeat: no-repeat; box-shadow: inset 0 -40px 50px rgba(10,10,20,.22), inset 0 0 34px rgba(0,0,0,.3); touch-action: manipulation; }
  .toss-yard::after { content: "套圈摊位 · 点选目标"; position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; color: rgba(255,255,255,.42); font-size: 11px; letter-spacing: 2px; pointer-events: none; }
  .target { position: absolute; width: 72px; height: 86px; padding: 0; transform: translate(-50%, -50%); background: transparent; border: 0; cursor: pointer; z-index: 3; transition: transform .16s ease, filter .16s ease; }
  .target:hover:not(:disabled), .target.active { transform: translate(-50%, -50%) scale(1.1); filter: brightness(1.18); }
  .target:disabled { cursor: default; }
  .prize-art { position: absolute; left: 50%; top: 0; transform: translateX(-50%); width: 48px; height: 38px; display: block; color: #fff4d0; border: 1px solid rgba(255,220,147,.75); border-radius: 10px; box-sizing: border-box; box-shadow: 0 0 0 5px rgba(255,209,102,.08), 0 4px 10px rgba(0,0,0,.25); }
  .prize-art::before, .prize-art::after { content: ""; position: absolute; display: block; }
  .prize-art.plush { background: radial-gradient(circle at 50% 58%, #e9a36d 0 43%, #bc674b 44% 70%, transparent 71%); border: 0; box-shadow: none; }
  .prize-art.plush::before { left: 6px; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: #d98258; box-shadow: 24px 0 #d98258; }
  .prize-art.plush::after { left: 20px; top: 19px; width: 7px; height: 4px; border-radius: 50%; background: #5b3030; box-shadow: -8px -4px 0 -2px #5b3030, 8px -4px 0 -2px #5b3030; }
  .prize-art.tea-set { background: linear-gradient(180deg, #fff3d0 0 22%, #e8a55d 23% 76%, #af5e34 77%); border-radius: 8px 8px 13px 13px; }
  .prize-art.tea-set::before { left: 4px; right: 4px; top: 7px; height: 3px; background: rgba(115, 57, 29, .45); border-radius: 3px; }
  .prize-art.tea-set::after { right: -8px; top: 12px; width: 9px; height: 12px; border: 3px solid #e8b274; border-left: 0; border-radius: 0 10px 10px 0; }
  .prize-art.radio { background: linear-gradient(180deg, #536278, #263448); border-radius: 5px; }
  .prize-art.radio::before { left: 8px; top: 8px; width: 28px; height: 13px; border-radius: 2px; background: repeating-linear-gradient(90deg, #b6d4c6 0 3px, #52756e 3px 6px); }
  .prize-art.radio::after { right: 5px; bottom: 5px; width: 5px; height: 5px; border-radius: 50%; background: #f6c463; box-shadow: -10px 0 #e17a59; }
  .prize-art.model { background: linear-gradient(145deg, #78a9d8, #33588c); clip-path: polygon(50% 0, 92% 35%, 78% 100%, 22% 100%, 8% 35%); border-radius: 5px; }
  .prize-art.trinket { background: radial-gradient(circle at 35% 35%, #f0c46c 0 22%, #b66a3f 23% 65%, #6f3e37 66%); border-radius: 50%; }
  .prize-art.high { filter: saturate(1.3) brightness(1.08); box-shadow: 0 0 0 5px rgba(255,165,90,.12), 0 4px 10px rgba(0,0,0,.28); }
  .prize-value { position: absolute; right: -8px; top: -8px; min-width: 19px; height: 19px; padding: 0 4px; box-sizing: border-box; display: grid; place-items: center; border-radius: 999px; background: #f6c463; color: #4b2b1d; font-size: 10px; font-weight: 900; box-shadow: 0 2px 5px rgba(0,0,0,.3); }
  .peg { position: absolute; left: 50%; top: 26px; transform: translateX(-50%); width: 28px; height: 42px; display: block; object-fit: contain; filter: drop-shadow(3px 4px 0 rgba(30,20,25,.24)); }
  .peg :global(img), .peg :global(span) { width: 100%; height: 100%; object-fit: contain; }
  .target-label { position: absolute; left: 50%; top: 70px; transform: translateX(-50%); color: #f7f2e9; font-size: 10px; font-weight: 700; text-shadow: 0 1px 3px rgba(0,0,0,.75); white-space: nowrap; }
  .ring-source { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%); width: 76px; height: 58px; opacity: .82; transition: transform .3s ease, opacity .3s ease; z-index: 4; }
  .ring-source-sprite { width: 100%; height: 100%; display: block; object-fit: contain; }
  .ring-source.busy { opacity: .25; transform: translateX(-50%) translateY(16px) scale(.7); }
  .flying-ring { position: absolute; z-index: 5; transform: translate(-50%, -50%); color: #ffe1a1; width: 58px; height: 58px; animation: ring-flight .42s ease-in; pointer-events: none; filter: drop-shadow(0 2px 8px rgba(0,0,0,.42)); }
  .flying-ring-sprite { width: 100%; height: 100%; display: block; object-fit: contain; }
  @keyframes ring-flight { from { left: 50%; top: 90%; transform: translate(-50%, -50%) scale(.5) rotate(0); } to { transform: translate(-50%, -50%) scale(1) rotate(240deg); } }
  .toss-status { display: flex; justify-content: center; gap: 18px; font-size: 13px; font-weight: 750; }
  .points { color: #7bd88f; }
  .toss-message { min-height: 18px; margin: 0; text-align: center; }
  .game-foot { margin: 0; text-align: center; font-size: 11px; }
  @media (max-width: 560px) { .ring-toss { min-height: 390px; } .toss-yard { min-height: 275px; } .target { transform: translate(-50%, -50%) scale(.86); } .target:hover:not(:disabled), .target.active { transform: translate(-50%, -50%) scale(.96); } }
</style>
