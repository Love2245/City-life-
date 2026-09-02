<script lang="ts">
  /**
   * v1.3-beta2 独立小游戏模式。
   * 脱离剧情直接游玩：全部 34 份工作/行动小游戏 + 手机 4 款，按玩法分组。
   * 纯游玩：back() 只清空 picked，不调 applyMiniGameReward、不写 gameState、不结算。
   * 配置取 getMiniGameConfig（非技能减时层 ...For），独立模式统一按数据层 30s 基准。
   */
  import { goto } from "../stores/gameStore.svelte";
  import { getMiniGameConfig, configuredMiniGameKeys, type MiniGameConfig } from "../game/core/minigame";
  import MiniGameHost from "../components/layout/MiniGameHost.svelte";
  import Phone2048 from "../components/layout/minigames/Phone2048.svelte";
  import PhoneMinesweeper from "../components/layout/minigames/PhoneMinesweeper.svelte";
  import PhoneSnake from "../components/layout/minigames/PhoneSnake.svelte";
  import PhoneSokoban from "../components/layout/minigames/PhoneSokoban.svelte";
  interface GroupDef {
    id: string;
    name: string;
    icon: string;
    types: string[];
  }
  /** 分组规则：按 cfg.type 自动归并（memory 数据层暂未使用，保留兼容） */
  const GROUPS: GroupDef[] = [
    { id: "restaurant", name: "餐饮制作", icon: "🍔", types: ["restaurant"] },
    { id: "delivery", name: "配送出行", icon: "🛵", types: ["delivery"] },
    { id: "checkout", name: "收银零售", icon: "🏪", types: ["checkout"] },
    { id: "factory", name: "工厂分拣", icon: "🏭", types: ["factory"] },
    { id: "dispatch", name: "调度接待", icon: "🚦", types: ["dispatch"] },
    { id: "reflex", name: "记忆反应", icon: "🎯", types: ["sequence", "memory", "whack"] },
    { id: "brain", name: "知识棋类", icon: "♟️", types: ["quiz", "sort", "chess"] },
    { id: "rhythm", name: "节奏律动", icon: "🎵", types: ["rhythm"] },
  ];

  interface PhoneGameDef {
    id: string;
    name: string;
    icon: string;
  }
  /** 手机 4 款：硬编码（禁止写入 minigames.json，configConsistency 要求 key 是真实 jobId/actionId） */
  const PHONE_GAMES: PhoneGameDef[] = [
    { id: "2048", name: "2048", icon: "🔢" },
    { id: "minesweeper", name: "扫雷", icon: "💣" },
    { id: "snake", name: "贪吃蛇", icon: "🐍" },
    { id: "sokoban", name: "推箱子", icon: "📦" },
  ];

  type Picked =
    | { kind: "job"; key: string; title: string; icon: string; cfg: MiniGameConfig }
    | { kind: "phone"; id: string; title: string; icon: string };
  let picked = $state<Picked | null>(null);

  /** 全量配置（含 key，供分组与点击） */
  const entries = configuredMiniGameKeys()
    .map((key) => ({ key, cfg: getMiniGameConfig(key) }))
    .filter((x): x is { key: string; cfg: MiniGameConfig } => Boolean(x.cfg));

  function gamesOf(types: string[]): { key: string; cfg: MiniGameConfig }[] {
    return entries.filter((e) => types.includes(e.cfg.type));
  }

  function pickJob(key: string, cfg: MiniGameConfig): void {
    picked = { kind: "job", key, title: cfg.title, icon: cfg.icon ?? "🎮", cfg };
  }
  function pickPhone(p: PhoneGameDef): void {
    picked = { kind: "phone", id: p.id, title: p.name, icon: p.icon };
  }
  /** 返回列表：纯游玩，不结算不写存档 */
  function back(): void {
    picked = null;
  }
</script>

<div class="arcade-root">
  {#if picked}
    <div class="arcade-play">
      <div class="arcade-play-head">
        <button class="btn" onclick={back}>← 返回列表</button>
        <span class="arcade-play-title"><span class="gi-emoji" style="font-size:22px;line-height:1">{picked.icon}</span> {picked.title}</span>
        <span class="dim small">独立小游戏 · 纯游玩不结算</span>
      </div>
      <div class="arcade-stage">
        {#if picked.kind === "job"}
          <MiniGameHost cfg={picked.cfg} onFinish={back} onSkip={back} />
        {:else if picked.id === "2048"}
          <Phone2048 />
        {:else if picked.id === "minesweeper"}
          <PhoneMinesweeper />
        {:else if picked.id === "snake"}
          <PhoneSnake />
        {:else}
          <PhoneSokoban />
        {/if}
      </div>
    </div>
  {:else}
    <div class="arcade-list">
      <div class="arcade-head">
        <button class="btn" onclick={() => goto("menu")}>← 主菜单</button>
        <span class="arcade-title">🎮 小游戏合集</span>
        <span class="dim small">共 {entries.length + PHONE_GAMES.length} 款 · 按玩法分组</span>
      </div>

      <div class="arcade-groups">
        {#each GROUPS as g (g.id)}
          {@const items = gamesOf(g.types)}
          {#if items.length > 0}
            <section class="arcade-group">
              <div class="arcade-group-head">
                <span class="gi-emoji" style="font-size:18px;line-height:1">{g.icon}</span>
                {g.name}
                <span class="dim small">（{items.length}）</span>
              </div>
              <div class="arcade-cards">
                {#each items as it (it.key)}
                  <button class="arcade-card" onclick={() => pickJob(it.key, it.cfg)}>
                    <span class="gi-emoji" style="font-size:34px;line-height:1">{it.cfg.icon ?? "🎮"}</span>
                    <span class="arcade-card-name">{it.cfg.title}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        {/each}

        <section class="arcade-group">
          <div class="arcade-group-head">
            📱 手机休闲
            <span class="dim small">（{PHONE_GAMES.length}）</span>
          </div>
          <div class="arcade-cards">
            {#each PHONE_GAMES as p (p.id)}
              <button class="arcade-card" onclick={() => pickPhone(p)}>
                <span class="gi-emoji" style="font-size:34px;line-height:1">{p.icon}</span>
                <span class="arcade-card-name">{p.name}</span>
              </button>
            {/each}
          </div>
        </section>
      </div>
    </div>
  {/if}
</div>

<style>
  .arcade-root {
    height: 100%;
    overflow-y: auto;
    background:
      linear-gradient(rgba(10, 14, 26, 0.6), rgba(10, 14, 26, 0.78)),
      var(--grad-sky);
    padding: 24px;
  }
  .arcade-head,
  .arcade-play-head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .arcade-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .arcade-play-title {
    font-size: 17px;
    font-weight: 800;
    flex: 1;
    text-align: center;
  }
  .arcade-groups {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    max-width: 1080px;
  }
  .arcade-group-head {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-main, #eef1ff);
    margin-bottom: 10px;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .arcade-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .arcade-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 10px;
    border-radius: 14px;
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    color: var(--text-main, #eef1ff);
    cursor: pointer;
    min-height: 44px;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .arcade-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent, #ffd166);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }
  .arcade-card-icon {
    font-size: 24px;
  }
  .arcade-card-name {
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    line-height: 1.3;
  }
  .arcade-stage {
    margin-top: 16px;
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
  }
  .arcade-play {
    display: flex;
    flex-direction: column;
  }
  .small {
    font-size: 11px;
  }
</style>
