<script lang="ts">
  import {untrack} from "svelte";
  import { applyMiniGameDifficulty, scaledDifficulty, type MiniGameConfig } from "../../game/core/minigame";
  import { gameState } from "../../stores/gameStore.svelte";
  import type { TrafficIncident } from "../../game/core/deliveryShift";
  import { provideMiniGameRandom } from "../../lib/minigameRandom";
  import { loadMiniGameSceneUrl } from "../../lib/minigameVisuals";
  import { beginMinigameMusic } from "../../lib/audio";
  import { minigameMusicMode } from "../../lib/minigameMusic";
  import WorkSequence from "./minigames/WorkSequence.svelte";

  import RhythmGame from "./minigames/RhythmGame.svelte";
  import QuizGame from "./minigames/QuizGame.svelte";
  import ReactionShift from "./minigames/ReactionShift.svelte";
  import ChessGame from "./minigames/ChessGame.svelte";
  import MemoryGame from "./minigames/MemoryGame.svelte";
  import PatrolShift from "./minigames/PatrolShift.svelte";
  import RestaurantGame from "./minigames/RestaurantGame.svelte";
  import FactoryGame from "./minigames/FactoryGame.svelte";
  import CheckoutGame from "./minigames/CheckoutGame.svelte";
  import DispatchGame from "./minigames/DispatchGame.svelte";
  import DeliveryGame from "./minigames/DeliveryGame.svelte";
  import BowlingLane from "./minigames/BowlingLane.svelte";
  import DartsGame from "./minigames/DartsGame.svelte";
  import RingTossGame from "./minigames/RingTossGame.svelte";

  /**
   * v1.3 beta2：小游戏引擎分派中心。
   * 由 MiniGameModal（正式上班链路）与 ArcadeView（独立小游戏模式）共用，避免两处维护分支。
   */
  let {
    cfg,
    onFinish,
    onIncident,
    onSkip,
    onOvertime,
    onStallResult,
    stallStamina,
    stallHour,
    stallStartMinute,
    sceneKey,
    practice = false,
    seed,
    paused = false,
    initialProgress,
    onProgress,
    onPause,
  }: {
    cfg: MiniGameConfig | undefined;
    onFinish: (ratio: number, completedOrders?: number, final?: boolean, reason?: string, earnedFare?: number) => void;
    onIncident?: (incident: TrafficIncident) => void;
    onSkip?: () => void;
    /** v1.3b2 餐饮类加班日信号（额外 +50% 工资，由结算层处理） */
    onOvertime?: (overtime: boolean) => void;
    /** 摆摊：每次出餐同步累计人数，结束时再次确认（供结算层多劳多得）。 */
    onStallResult?: (served: number) => void;
    /** v1.3b2 摆摊：本次可用体力（体力不支强制收摊） */
    stallStamina?: number;
    /** v1.3b2 摆摊：本次开始小时（太晚强制收摊） */
    stallHour?: number;
    stallStartMinute?: number;
    /** v1.42 场景贴图 key；非 eager 加载，缺失时自动使用 CSS 背景。 */
    sceneKey?: string;
    practice?: boolean;
    seed?: number;
    paused?: boolean;
    initialProgress?: unknown;
    onProgress?: (snapshot: unknown) => void;
    onPause?: () => void;
  } = $props();

  provideMiniGameRandom(() => seed);
  const musicMode = $derived(cfg ? minigameMusicMode(cfg) : null);
  const gameCfg = $derived(cfg ? applyMiniGameDifficulty(cfg, gameState) : undefined);
  const difficultyScale = $derived(scaledDifficulty(gameState));
  $effect(() => {
    if (musicMode) return beginMinigameMusic(musicMode);
  });
  let deliveryGame = $state<{flushProgress:()=>Promise<void>} | undefined>();
  let restaurantGame = $state<{flushProgress:()=>Promise<void>} | undefined>();
  let rhythmGame = $state<{flushProgress:()=>Promise<void>} | undefined>();
  export async function flushProgress():Promise<void>{await deliveryGame?.flushProgress();await restaurantGame?.flushProgress();await rhythmGame?.flushProgress();}

  let sceneUrl = $state<string | undefined>(undefined);
  /**
   * 配置由玩家技能等级参与生成，同一 sceneKey 也可能拿到不同目标/时限。
   * 把配置指纹纳入 key，确保切换后不会把上一次小游戏的初始参数带过来。
   */
  const gameKey = $derived(`${sceneKey ?? ""}|${gameCfg ? JSON.stringify(gameCfg) : "none"}|${difficultyScale}|${practice ? "practice" : "normal"}|${seed ?? "random"}`);
  /**
   * 场景 key 可能在独立小游戏列表中切换而不销毁 Host。用 effect 监听
   * key，避免第二次打开仍沿用上一款小游戏的背景；加载失败会自然回退
   * 到 CSS 渐变。
   */
  $effect(() => {
    const key = sceneKey;
    let active = true;
    sceneUrl = undefined;
    if (cfg?.type === "restaurant" || cfg?.type === "delivery" || cfg?.type === "checkout" || cfg?.type === "factory" || cfg?.type === "rhythm") return;
    void loadMiniGameSceneUrl(key).then((url) => {
      if (active) sceneUrl = url;
    });
    return () => { active = false; };
  });
</script>

<div class="mgh-game" class:rhythm={gameCfg?.type === "rhythm"} class:restaurant={gameCfg?.type === "restaurant"} class:delivery={gameCfg?.type === "delivery"} class:checkout={gameCfg?.type === "checkout"} class:factory={gameCfg?.type === "factory"} aria-label="小游戏区域" style={sceneUrl ? `--mgh-scene:url("${sceneUrl}")` : undefined}>
{#key gameKey}
{@const mountedConfig=untrack(()=>gameCfg)}
{#if mountedConfig?.type === "sequence"}
  <WorkSequence cfg={mountedConfig} onFinish={onFinish} paused={paused} />
{:else if mountedConfig?.type === "quiz"}
  <QuizGame cfg={mountedConfig} onFinish={onFinish} {paused} />
{:else if mountedConfig?.type === "whack"}
  <ReactionShift cfg={mountedConfig} onFinish={onFinish} {paused} />
{:else if mountedConfig?.type === "rhythm"}
  <RhythmGame bind:this={rhythmGame} cfg={mountedConfig} onFinish={onFinish} {paused} {initialProgress} {onProgress} {difficultyScale} />
{:else if mountedConfig?.type === "chess"}
  <ChessGame cfg={mountedConfig} onFinish={onFinish} practice={practice} {paused} />
{:else if mountedConfig?.type === "memory"}
  <MemoryGame cfg={mountedConfig} onFinish={onFinish} {paused} />
{:else if mountedConfig?.type === "sort"}
  <PatrolShift cfg={mountedConfig} onFinish={onFinish} {paused} />
{:else if mountedConfig?.type === "restaurant"}
  <RestaurantGame bind:this={restaurantGame} cfg={mountedConfig} onFinish={onFinish} onOvertime={onOvertime} onStallResult={onStallResult} stallStamina={stallStamina} stallHour={stallHour} {stallStartMinute} workSession={seed !== undefined} {paused} {initialProgress} {onProgress} />
{:else if mountedConfig?.type === "factory"}
  <FactoryGame cfg={mountedConfig} onFinish={onFinish} {paused} {sceneKey} {seed} {initialProgress} {onProgress} />
{:else if mountedConfig?.type === "checkout"}
  <CheckoutGame cfg={mountedConfig} onFinish={onFinish} {sceneKey} {paused} />
{:else if mountedConfig?.type === "dispatch"}
  <DispatchGame cfg={mountedConfig} onFinish={onFinish} {paused} />
{:else if mountedConfig?.type === "delivery"}
  <DeliveryGame bind:this={deliveryGame} cfg={mountedConfig} onFinish={onFinish} sceneKey={sceneKey} {paused} {onIncident} {seed} {initialProgress} {onProgress} {onPause}/>
{:else if mountedConfig?.type === "bowling"}
  <BowlingLane cfg={mountedConfig} onFinish={onFinish} {paused} />
{:else if mountedConfig?.type === "darts"}
  <!-- 飞镖为纯回合制（按支数计、无计时器），不参与 paused 语义 -->
  <DartsGame cfg={mountedConfig} onFinish={onFinish} />
{:else if mountedConfig?.type === "ringtoss"}
  <RingTossGame cfg={mountedConfig} onFinish={onFinish} {paused} />
{:else}
  <p class="mgh-dim">这个小游戏还在打磨中…</p>
  <button class="mgh-skip" onclick={() => (onSkip ? onSkip() : onFinish(0))}>跳过</button>
{/if}
{/key}
</div>

<style>
  .mgh-dim {
    color: var(--text-dim, #9aa3c7);
    margin: 0;
  }
  .mgh-game {
    --text:#f4eddf;
    --text-main:#f4eddf;
    --text-dim:#bed0d3;
    --bg-card:#233441;
    --border:#59717b;
    color:#f4eddf;
    position: relative;
    isolation: isolate;
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    padding: clamp(8px, 1.4vw, 18px);
    border-radius: 18px;
    background-image: linear-gradient(rgba(9, 14, 27, .54), rgba(9, 14, 27, .72)), var(--mgh-scene, none), linear-gradient(145deg, rgba(96, 139, 210, .16), rgba(18, 24, 44, .92));
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
  @media (prefers-reduced-motion: reduce) {
    .mgh-game :global(*) { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
  .mgh-game.rhythm, .mgh-game.restaurant, .mgh-game.delivery, .mgh-game.checkout, .mgh-game.factory { padding:0; background:none; }
  .mgh-skip {
    align-self: flex-start;
    min-height: 44px;
    padding: 10px 22px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-dim, #9aa3c7);
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 13px;
    cursor: pointer;
  }
</style>
