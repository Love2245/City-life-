<script lang="ts">
  import type { MiniGameConfig } from "../../game/core/minigame";
  import SequenceGame from "./minigames/SequenceGame.svelte";
  import RhythmGame from "./minigames/RhythmGame.svelte";
  import QuizGame from "./minigames/QuizGame.svelte";
  import WhackGame from "./minigames/WhackGame.svelte";
  import ChessGame from "./minigames/ChessGame.svelte";
  import MemoryGame from "./minigames/MemoryGame.svelte";
  import SortGame from "./minigames/SortGame.svelte";
  import RestaurantGame from "./minigames/RestaurantGame.svelte";
  import FactoryGame from "./minigames/FactoryGame.svelte";
  import CheckoutGame from "./minigames/CheckoutGame.svelte";
  import DispatchGame from "./minigames/DispatchGame.svelte";
  import DeliveryGame from "./minigames/DeliveryGame.svelte";

  /**
   * v1.3 beta2：小游戏引擎分派中心。
   * 由 MiniGameModal（正式上班链路）与 ArcadeView（独立小游戏模式）共用，避免两处维护分支。
   */
  let {
    cfg,
    onFinish,
    onSkip,
    onOvertime,
    onStallResult,
    stallStamina,
    stallHour,
  }: {
    cfg: MiniGameConfig | undefined;
    onFinish: (ratio: number) => void;
    onSkip?: () => void;
    /** v1.3b2 餐饮类加班日信号（额外 +50% 工资，由结算层处理） */
    onOvertime?: (overtime: boolean) => void;
    /** v1.3b2 摆摊：结束时上报实际服务人数（供结算层多劳多得） */
    onStallResult?: (served: number) => void;
    /** v1.3b2 摆摊：本次可用体力（体力不支强制收摊） */
    stallStamina?: number;
    /** v1.3b2 摆摊：本次开始小时（太晚强制收摊） */
    stallHour?: number;
  } = $props();
</script>

<div class="mgh-game">
{#if cfg?.type === "sequence"}
  <SequenceGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "quiz"}
  <QuizGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "whack"}
  <WhackGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "rhythm"}
  <RhythmGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "chess"}
  <ChessGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "memory"}
  <MemoryGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "sort"}
  <SortGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "restaurant"}
  <RestaurantGame cfg={cfg} onFinish={onFinish} onOvertime={onOvertime} onStallResult={onStallResult} stallStamina={stallStamina} stallHour={stallHour} />
{:else if cfg?.type === "factory"}
  <FactoryGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "checkout"}
  <CheckoutGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "dispatch"}
  <DispatchGame cfg={cfg} onFinish={onFinish} />
{:else if cfg?.type === "delivery"}
  <DeliveryGame cfg={cfg} onFinish={onFinish} />
{:else}
  <p class="mgh-dim">这个小游戏还在打磨中…</p>
  <button class="mgh-skip" onclick={() => (onSkip ? onSkip() : onFinish(0))}>跳过</button>
{/if}
</div>

<style>
  .mgh-dim {
    color: var(--text-dim, #9aa3c7);
    margin: 0;
  }
  .mgh-game {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
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
