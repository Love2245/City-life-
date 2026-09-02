<script lang="ts">
  /**
   * v1.36 卡牌对决战场（喵喵对决）：杀戮尖塔风格全屏战斗界面。
   * - 透明底：游戏场景透出，暗角渐变仅用于保证可读性
   * - 敌我水平对位 + 椭圆光晕立绘 + 顶部血条 + 敌方意图气泡
   * - 底部手牌（实体卡：费用球/类型色条/图标/描述），抽牌堆 & 弃牌堆可点击查看
   * - 抽卡 / 回收 动画；能量球；明确的「结束回合」按钮（永不卡死）
   * 所有文本（猫咪名、攻击方式、样貌描述）均取自 data，不自行编造。
   */
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast } from "../stores/uiStore.svelte";
  import { playSound } from "../lib/audio";
  import { opponentArt, playerArt, poseOfAnim } from "../lib/catArt";
  import { battleBgArt, battleBgKeyFor, battleBgPeriod } from "../lib/battleBg";
  import type { SoundId } from "../game/types";
  import {
    playCard,
    endPlayerTurn,
    settleBattle,
    abandonBattle,
    startFunMatch,
    getCardDef,
    getTournamentDef,
    ELEMENT_LABEL,
    STATUS_LABEL,
    CARD_TYPE_LABEL,
    type BattleReward,
  } from "../game/core/catBattle";
  import { startNextTournamentBattle } from "../game/core/tournament";
  import type { CatBattleUnit, EnemyIntent } from "../game/types";
  import { fly, fade, scale } from "svelte/transition";

  const battle = $derived(gameState.catBattle);
  let reward = $state<BattleReward | null>(null);
  /** v1.37 结算时记录本场是否为休闲对决（settleBattle 会清空战斗状态，需提前记录） */
  let lastRewardCasual = $state(false);
  let viewingPile = $state<"draw" | "discard" | null>(null);

  /* ---------------- 动画状态 ---------------- */
  type CatAnim = "idle" | "attack" | "hurt" | "defend" | "heal" | "dodge" | "enter";
  let playerAnim = $state<CatAnim>("idle");
  let enemyAnim = $state<CatAnim>("idle");
  interface FloatText {
    id: number;
    text: string;
    side: "enemy" | "player";
    cls: "dmg" | "heal" | "block";
  }
  let floats = $state<FloatText[]>([]);
  let floatSeq = $state(0);
  let lastLogLen = $state(0);
  let logEl = $state<HTMLDivElement | undefined>();

  function setAnim(side: "player" | "enemy", anim: CatAnim): void {
    if (side === "player") {
      playerAnim = anim;
      setTimeout(() => (playerAnim = "idle"), 420);
    } else {
      enemyAnim = anim;
      setTimeout(() => (enemyAnim = "idle"), 420);
    }
  }

  function playEnter(): void {
    playerAnim = "enter";
    enemyAnim = "enter";
    setTimeout(() => {
      if (playerAnim === "enter") playerAnim = "idle";
      if (enemyAnim === "enter") enemyAnim = "idle";
    }, 750);
  }

  function pushFloat(f: Omit<FloatText, "id">): void {
    const id = ++floatSeq;
    floats = [...floats, { ...f, id }];
    setTimeout(() => {
      floats = floats.filter((x) => x.id !== id);
    }, 900);
  }

  /** 由日志行判断动画 / 飘字 / 音效 */
  function classifyLine(line: string): { anim?: CatAnim; side?: "player" | "enemy"; float?: Omit<FloatText, "id">; sound?: SoundId } | null {
    if (!battle) return null;
    const pName = battle.player.name;
    const eName = battle.opponent.name;

    const dmg = line.match(/造成 (\d+) 点伤害/);
    if (dmg) {
      const text = `-${dmg[1]}`;
      if (line.includes(`对 ${eName}`)) {
        return { anim: "attack", side: "player", float: { text, side: "enemy", cls: "dmg" }, sound: "battle_attack" };
      }
      if (line.includes(`对 ${pName}`)) {
        return { anim: "hurt", side: "player", float: { text, side: "player", cls: "dmg" }, sound: "battle_hurt" };
      }
    }
    const heal = line.match(/恢复 (\d+) 点 HP/);
    if (heal) {
      const text = `+${heal[1]}`;
      if (line.includes(pName)) {
        return { anim: "heal", side: "player", float: { text, side: "player", cls: "heal" }, sound: "battle_heal" };
      }
      if (line.includes(eName)) {
        return { anim: "heal", side: "enemy", float: { text, side: "enemy", cls: "heal" }, sound: "battle_heal" };
      }
    }
    const block = line.match(/获得 (\d+) 点格挡/);
    if (block) {
      if (line.includes(pName)) return { anim: "defend", side: "player", sound: "battle_defend" };
      if (line.includes(eName)) return { anim: "defend", side: "enemy", sound: "battle_defend" };
    }
    if (line.includes("力量 +")) {
      return { anim: "heal", side: "player", float: { text: "💪", side: "player", cls: "block" }, sound: "battle_draw" };
    }
    if (line.includes("灵巧地躲开")) {
      return { anim: "dodge", side: "player", sound: "battle_draw" };
    }
    if (line.includes("使出了") || line.includes("陷入")) {
      const byEnemy = line.includes(`${eName} 使出了`);
      return { anim: byEnemy ? "attack" : "heal", side: byEnemy ? "enemy" : "player", sound: "battle_intent" };
    }
    if (line.includes("中毒伤害") || line.includes("灼伤伤害")) {
      const hasP = line.includes(pName);
      return { anim: "hurt", side: hasP ? "player" : "enemy", float: { text: "· · ·", side: hasP ? "player" : "enemy", cls: "dmg" }, sound: "battle_hurt" };
    }
    return null;
  }

  /** 监听日志增量：驱动动画 / 飘字 / 音效 */
  $effect(() => {
    if (!battle) {
      lastLogLen = 0;
      return;
    }
    const len = battle.log.length;
    if (len > lastLogLen) {
      const line = battle.log[len - 1];
      const info = classifyLine(line);
      if (info) {
        if (info.sound) playSound(info.sound);
        if (info.float) pushFloat(info.float);
        if (info.anim && info.side) setAnim(info.side, info.anim);
      }
    }
    lastLogLen = len;
  });

  /** 新一场战斗开始 → 播放入场立绘（并重置上一场结算状态） */
  let lastBattleKey = $state("");
  $effect(() => {
    if (!battle) {
      lastBattleKey = "";
      return;
    }
    const key = `${battle.opponentId}|${battle.playerUid}`;
    if (key !== lastBattleKey) {
      lastBattleKey = key;
      reward = null;
      lastRewardCasual = false;
      playEnter();
    }
  });

  /** 日志自动滚动到底部 */
  $effect(() => {
    if (battle && logEl) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  });

  /** 战斗结束音效 */
  $effect(() => {
    if (battle?.finished) {
      playSound(battle.won ? "battle_win" : "battle_lose");
    }
  });

  /* ---------------- 操作 ---------------- */
  function useCard(cardId: string): void {
    if (!battle || battle.finished) return;
    // v1.39 敌方回合点击卡片给出明确反馈，避免沉默无反应
    if (battle.phase !== "player") {
      showToast("⏳ 敌方回合，请等待对手行动");
      return;
    }
    const card = getCardDef(cardId);
    if (!card) return;
    if (battle.playerEnergy < card.cost) {
      showToast("⚡ 能量不足");
      return;
    }
    const before = battle.log.length;
    const r = playCard(gameState, cardId);
    if (!r.ok) return;
    if (battle.log.length === before) playSound("battle_draw");
  }

  function endTurn(): void {
    if (!battle || battle.finished) return;
    // 仅玩家阶段可结束；敌方阶段按钮置灰，不会出现「点了没反应」的卡死
    if (battle.phase !== "player") return;
    endPlayerTurn(gameState);
  }

  function claim(): void {
    const wasCasual = battle?.casual ?? false;
    const wasTournament = battle?.tournamentId != null;
    const r = settleBattle(gameState);
    if (r) {
      reward = r;
      lastRewardCasual = wasCasual;
      // v1.37 卡包刷新：结算后把新卡送入卡包抉择弹窗（如触发）
      if (r.cardOffer && gameState.activePet) {
        uiState.cardOfferPayload = {
          defId: r.cardOffer.defId,
          source: r.cardOffer.source,
          petUid: gameState.activePet,
        };
      }
      playSound(r.money > 0 ? "coin" : "success");
    }
    // v1.39 赛事连胜自动续战：非最后一胜时直接开打下一场（生命值延续，全胜才结束）
    if (wasTournament && r?.won) {
      const next = startNextTournamentBattle(gameState);
      if (next.ok) {
        showToast("🏆 赛事连胜！继续挑战下一只猫咪");
        reward = null;
        lastRewardCasual = false;
        lastLogLen = 0;
        floats = [];
        viewingPile = null;
        playSound("battle_intent");
        return;
      }
    }
  }

  /** v1.37 继续匹配：休闲对决胜利后不退出，直接匹配下一只猫咪继续战斗 */
  function rematch(): void {
    const r = startFunMatch(gameState);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "暂时匹配不到对手"}`);
      close();
      return;
    }
    reward = null;
    lastRewardCasual = false;
    lastLogLen = 0;
    floats = [];
    viewingPile = null;
    playSound("battle_intent");
    // modal 保持 "battle"：startFunMatch 已重建 catBattle，$effect 会自动播放入场
  }

  function close(): void {
    viewingPile = null;
    // 有卡牌刷新待抉择时，先弹入包抉择框（而不是直接退回游戏）
    if (uiState.cardOfferPayload) {
      uiState.modal = "card_offer";
      return;
    }
    // v1.395 关闭未结束的战斗时落盘已受的伤；否则关窗＝免费重置血量
    if (gameState.catBattle && !gameState.catBattle.finished) {
      const r = abandonBattle(gameState);
      if (r.downed) showToast(`⚠️ 「${gameState.pets.find((p) => p.uid === gameState.catBattle?.playerUid)?.name ?? "猫咪"}」生命归零，需去宠物医院治疗`);
    }
    uiState.modal = null;
  }

  function openPile(p: "draw" | "discard"): void {
    viewingPile = p;
  }

  /* ---------------- 派生 ---------------- */
  const handCards = $derived(
    (battle?.playerHand ?? [])
      .map((id, i) => ({ def: getCardDef(id), key: `${id}#${i}` }))
      .filter((x): x is { def: NonNullable<ReturnType<typeof getCardDef>>; key: string } => !!x.def)
      .map((x) => ({ ...x.def, key: x.key })),
  );

  const drawPileCards = $derived(
    (battle?.playerDrawPile ?? []).map((id) => getCardDef(id)).filter((c): c is NonNullable<typeof c> => !!c),
  );
  const discardPileCards = $derived(
    (battle?.playerDiscardPile ?? []).map((id) => getCardDef(id)).filter((c): c is NonNullable<typeof c> => !!c),
  );

  const playerCatId = $derived(
    battle ? gameState.pets.find((p) => p.uid === battle.playerUid)?.catId : undefined,
  );
  const playerArtUrl = $derived(playerCatId ? playerArt(playerCatId, poseOfAnim(playerAnim)) : undefined);
  const enemyArtUrl = $derived(battle ? opponentArt(battle.opponentId, poseOfAnim(enemyAnim)) : undefined);
  const isBoss = $derived(battle?.opponentId === "roundhead");
  /** v1.37 对决背景：按场地 × 时间段选图（Boss 战用王座图） */
  const battleBgUrl = $derived(
    battle ? battleBgArt(battleBgKeyFor(gameState.locationId, isBoss), gameState.time.hour) : undefined,
  );

  /** 动态背景粒子所需的「场景类型」：公园/擂台/街角/夜晚/BOSS。
   *  由场地 key（battleBgKeyFor）决定，街角在夜晚切到 night 萤火风格。 */
  const scene = $derived(
    ((): "park" | "arena" | "alley" | "night" | "boss" => {
      if (isBoss) return "boss";
      const loc = gameState.locationId;
      if (loc === "park" || loc === "lake_park") return "park";
      if (loc === "amusement_park" || loc === "market_fair") return "arena";
      // 街角 / 未知场地：夜晚用萤火，白天用街灯
      return battleBgPeriod(gameState.time.hour) === "night" ? "night" : "alley";
    })(),
  );

  /** 浮动光点预设（纯 CSS 动画，无 JS 计时器）。位置/大小/时长/drift 各异，避免整齐感。 */
  const PARTICLES = [
    { left: 6, size: 4, delay: 0.0, dur: 16, drift: -20 },
    { left: 14, size: 6, delay: 2.4, dur: 19, drift: 12 },
    { left: 22, size: 3, delay: 4.1, dur: 14, drift: -8 },
    { left: 31, size: 5, delay: 1.2, dur: 22, drift: 24 },
    { left: 39, size: 4, delay: 6.7, dur: 17, drift: -16 },
    { left: 47, size: 7, delay: 3.3, dur: 21, drift: 18 },
    { left: 55, size: 3, delay: 8.0, dur: 15, drift: -28 },
    { left: 63, size: 5, delay: 0.8, dur: 20, drift: 10 },
    { left: 71, size: 4, delay: 5.5, dur: 18, drift: -12 },
    { left: 79, size: 6, delay: 2.0, dur: 23, drift: 26 },
    { left: 86, size: 3, delay: 7.2, dur: 14, drift: -6 },
    { left: 92, size: 5, delay: 4.6, dur: 19, drift: 14 },
    { left: 3, size: 4, delay: 9.1, dur: 16, drift: -22 },
    { left: 18, size: 6, delay: 5.0, dur: 21, drift: 16 },
    { left: 67, size: 4, delay: 10.4, dur: 17, drift: -10 },
    { left: 97, size: 5, delay: 3.8, dur: 20, drift: 20 },
    { left: 10, size: 5, delay: 11.5, dur: 18, drift: -14 },
    { left: 27, size: 7, delay: 12.8, dur: 22, drift: 22 },
    { left: 35, size: 4, delay: 13.6, dur: 16, drift: -18 },
    { left: 44, size: 6, delay: 14.9, dur: 21, drift: 12 },
    { left: 52, size: 4, delay: 15.7, dur: 15, drift: -24 },
    { left: 60, size: 8, delay: 16.3, dur: 23, drift: 28 },
    { left: 68, size: 4, delay: 17.0, dur: 17, drift: -10 },
    { left: 76, size: 6, delay: 18.2, dur: 20, drift: 18 },
    { left: 84, size: 5, delay: 19.1, dur: 19, drift: -22 },
    { left: 90, size: 7, delay: 20.0, dur: 22, drift: 16 },
  ];

  function hpPct(u: CatBattleUnit): number {
    return Math.max(0, Math.min(100, (u.hp / u.attrs.hp) * 100));
  }

  /** v1.39 对手血条颜色：高血量绿、中血量黄、低血量红 */
  function hpBarColor(pct: number): string {
    if (pct > 60) return "linear-gradient(90deg, #47d16c, #7ce89b 55%, #b8f0c8)";
    if (pct > 30) return "linear-gradient(90deg, #ffd166, #ffb347 55%, #ff8c35)";
    return "linear-gradient(90deg, #ff4d4d, #ff7878 55%, #ffb347)";
  }

  function statusText(u: CatBattleUnit): string {
    if (!u.status) return "";
    const extra = u.status === "sleep" ? `（${u.sleepTurns ?? 1}回合）` : u.statusTurns != null ? `（${u.statusTurns}回合）` : "";
    return `${STATUS_LABEL[u.status]}${extra}`;
  }

  function opponentTitle(): string {
    if (!battle) return "";
    if (battle.tournamentId) {
      const t = getTournamentDef(battle.tournamentId);
      return t ? `${t.name} · ${battle.opponent.name}` : battle.opponent.name;
    }
    if (battle.opponentId === "roundhead") return "最终对决 · 圆头猫咪";
    return battle.opponent.name;
  }

  function intentText(intent: EnemyIntent): string {
    if (intent.kind === "attack") return `${intent.name} · ${intent.value}${intent.hits && intent.hits > 1 ? ` ×${intent.hits}` : ""}`;
    if (intent.kind === "defend") return `${intent.name} · 格挡 ${intent.value}`;
    if (intent.status) return `${intent.name} · ${STATUS_LABEL[intent.status]}`;
    return `${intent.name} · 恢复 ${intent.value}`;
  }

  function intentKind(intent: EnemyIntent): "atk" | "def" | "skill" {
    if (intent.kind === "attack") return "atk";
    if (intent.kind === "defend") return "def";
    return "skill";
  }

  function elementClass(elm: string): string {
    return ELEMENT_LABEL[elm as keyof typeof ELEMENT_LABEL] ? elm : "normal";
  }

  function logCls(line: string): string {
    if (!battle) return "";
    if (line.includes(battle.player.name)) return "me";
    if (line.includes(battle.opponent.name)) return "them";
    return "sys";
  }
</script>

{#if battle}
  <!-- v1.39 对决入场：全屏覆盖层带淡入动画 -->
  <div class="overlay hud-scope" data-scene={scene} in:fade={{ duration: 300 }} out:fade={{ duration: 200 }}>
    <!-- 透明底：游戏场景透出，暗角渐变只为可读性（非白底、非全黑遮罩） -->
    <div class="combat-bg"></div>
    {#if battleBgUrl}
      <!-- v1.37 场地×时段背景图：铺在底色之上、暗角渐变之下 -->
      <img class="combat-bg-img" src={battleBgUrl} alt="" draggable="false" />
    {/if}
    <!-- 动态背景粒子层：在背景图之上、战斗内容之下，pointer-events:none 不挡点击 -->
    <div class="bg-particles" aria-hidden="true">
      {#each PARTICLES as p}
        <span
          class="pt"
          style="left:{p.left}%; width:{p.size}px; height:{p.size}px; --drift:{p.drift}px; animation-delay:{p.delay}s; animation-duration:{p.dur}s;"
        ></span>
      {/each}
    </div>
    <div class="battle" class:shake={playerAnim === "hurt"}>
      <!-- 顶部 HUD -->
      <header class="hud">
        <div class="hud-title-block">
          <span class="hud-icon">🐱</span>
          <div>
            <div class="hud-title">喵喵对决</div>
            <div class="hud-sub">{opponentTitle()}</div>
          </div>
        </div>
        <div class="hud-turn">
          回合 <b>{battle.turn}</b>
          <span class="turn-tag" class:enemy={battle.phase !== "player"}>
            {battle.phase === "player" ? "你的回合" : "敌方行动中"}
          </span>
        </div>
        <button class="hud-close" onclick={close} title="关闭">✕</button>
      </header>

      <!-- 中部战场 -->
      <div class="arena">
        <div class="combatants">
          <!-- 敌方 -->
          <div class="combatant enemy" class:boss={isBoss}>
            <div class="nameplate">
              <span class="cat-name">{battle.opponent.name}</span>
              <span class="cat-lv">Lv.{battle.opponent.level}</span>
              <span class="cat-elm {battle.opponent.element}">{ELEMENT_LABEL[battle.opponent.element]}</span>
            </div>

            <div class="hp-bar">
              <div class="hp-track">
                <div class="hp-fill" style="width:{hpPct(battle.opponent)}%; background:{hpBarColor(hpPct(battle.opponent))}"></div>
                <div class="hp-gloss"></div>
              </div>
              <div class="hp-text">{battle.opponent.hp} / {battle.opponent.attrs.hp}</div>
            </div>

            {#if battle.enemyIntent && !battle.finished}
              {@const ik = intentKind(battle.enemyIntent)}
              <div class="intent intent-{ik} pulse" transition:fly={{ y: -12, duration: 240 }}>
                <span class="intent-label">敌方意图</span>
                <span class="intent-icon">{battle.enemyIntent.icon}</span>
                <span class="intent-name">{intentText(battle.enemyIntent)}</span>
              </div>
            {/if}

            <div class="portrait-oval glow-enemy">
              <div class="oval-shadow"></div>
              {#each floats.filter((f) => f.side === "enemy") as f (f.id)}
                <div class="float {f.cls}">{f.text}</div>
              {/each}
              <!-- v1.37 战斗动作特效 -->
              {#if enemyAnim === "hurt"}<div class="fx fx-burst"></div>{/if}
              {#if enemyAnim === "defend"}<div class="fx fx-shield"></div>{/if}
              {#if enemyAnim === "heal"}<div class="fx fx-heal"></div>{/if}
              {#if enemyAnim === "dodge"}<div class="fx fx-ghost"></div>{/if}
              {#if enemyAnim === "attack"}<div class="fx fx-lunge"></div>{/if}
              {#if enemyArtUrl}
                <img class="portrait {enemyAnim}" class:boss={isBoss} src={enemyArtUrl} alt={battle.opponent.name} />
              {:else}
                <div class="portrait fallback {enemyAnim}" class:boss={isBoss}>{battle.opponent.icon}</div>
              {/if}
            </div>

            {#if battle.opponent.desc}
              <div class="cat-desc">{battle.opponent.desc}</div>
            {/if}

            <div class="stat-row">
              <span class="stat atk" title="攻击">⚔️ {battle.opponent.attrs.atk}</span>
              <span class="stat def" title="防御">🛡️ {battle.opponent.attrs.def}</span>
              <span class="stat spd" title="速度">⚡ {battle.opponent.attrs.spd}</span>
            </div>

            <div class="buff-row">
              {#if battle.opponent.status}
                <span class="buff status">{statusText(battle.opponent)}</span>
              {/if}
              {#if battle.opponentBlock > 0}
                <span class="buff block">🛡️ {battle.opponentBlock}</span>
              {/if}
              {#if battle.opponentStrength > 0}
                <span class="buff strength">💪 {battle.opponentStrength}</span>
              {/if}
            </div>
          </div>

          <div class="vs">VS</div>

          <!-- 我方 -->
          <div class="combatant player">
            <div class="nameplate">
              <span class="cat-name">{battle.player.name}</span>
              <span class="cat-lv">Lv.{battle.player.level}</span>
              <span class="cat-elm {battle.player.element}">{ELEMENT_LABEL[battle.player.element]}</span>
            </div>

            <div class="hp-bar">
              <div class="hp-track">
                <div class="hp-fill player" style="width:{hpPct(battle.player)}%"></div>
                <div class="hp-gloss"></div>
              </div>
              <div class="hp-text">{battle.player.hp} / {battle.player.attrs.hp}</div>
            </div>

            <div class="portrait-oval glow-player">
              <div class="oval-shadow"></div>
              {#each floats.filter((f) => f.side === "player") as f (f.id)}
                <div class="float {f.cls}">{f.text}</div>
              {/each}
              {#if playerAnim === "hurt"}<div class="fx fx-burst"></div>{/if}
              {#if playerAnim === "defend"}<div class="fx fx-shield"></div>{/if}
              {#if playerAnim === "heal"}<div class="fx fx-heal"></div>{/if}
              {#if playerAnim === "dodge"}<div class="fx fx-ghost"></div>{/if}
              {#if playerAnim === "attack"}<div class="fx fx-lunge"></div>{/if}
              {#if playerArtUrl}
                <img class="portrait {playerAnim}" src={playerArtUrl} alt={battle.player.name} />
              {:else}
                <div class="portrait fallback {playerAnim}">{battle.player.icon}</div>
              {/if}
            </div>

            {#if battle.player.desc}
              <div class="cat-desc">{battle.player.desc}</div>
            {/if}

            <div class="stat-row">
              <span class="stat atk" title="攻击">⚔️ {battle.player.attrs.atk}</span>
              <span class="stat def" title="防御">🛡️ {battle.player.attrs.def}</span>
              <span class="stat spd" title="速度">⚡ {battle.player.attrs.spd}</span>
            </div>

            <div class="buff-row">
              {#if battle.player.status}
                <span class="buff status">{statusText(battle.player)}</span>
              {/if}
              {#if battle.playerBlock > 0}
                <span class="buff block">🛡️ {battle.playerBlock}</span>
              {/if}
              {#if battle.playerStrength > 0}
                <span class="buff strength">💪 {battle.playerStrength}</span>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- 战斗日志横幅 -->
      <div class="log-bar" bind:this={logEl}>
        {#each battle.log as line, i (i)}
          <span class="log-line {logCls(line)}" class:new={i === battle.log.length - 1}>{line}</span>
        {/each}
      </div>

      <!-- 手牌区 -->
      {#if !battle.finished}
        <div class="hand-zone">
          <button class="pile draw-pile" title="查看抽牌堆（{battle.playerDrawPile.length} 张）" onclick={() => openPile("draw")}>
            <div class="pile-back"></div>
            <div class="pile-icon">🃏</div>
            <div class="pile-count">{battle.playerDrawPile.length}</div>
            <div class="pile-label">抽牌堆</div>
          </button>

          {#key battle.turn}
            <div class="hand">
              {#each handCards as c (c.key)}
                {@const canUse = battle.phase === "player" && !battle.finished && battle.playerEnergy >= c.cost}
                <button
                  class="card {c.type} elm-{elementClass(c.element)}"
                  class:disabled={!canUse}
                  class:enemy-turn={battle.phase !== "player"}
                  title={c.desc}
                  in:fly={{ y: 70, duration: 360, delay: 90 }}
                  out:fly={{ y: -110, duration: 260 }}
                  onclick={() => useCard(c.id)}
                >
                  <div class="card-frame"></div>
                  <div class="card-cost">{c.cost}</div>
                  <div class="card-art">{c.icon}</div>
                  <div class="card-name">{c.name}</div>
                  <div class="card-desc">{c.desc}</div>
                  <div class="card-type">{CARD_TYPE_LABEL[c.type]}</div>
                  {#if c.effect?.exhaust}
                    <div class="card-exhaust">消耗</div>
                  {/if}
                </button>
              {/each}
            </div>
          {/key}

          <button class="pile discard-pile" title="查看弃牌堆（{battle.playerDiscardPile.length} 张）" onclick={() => openPile("discard")}>
            <div class="pile-back"></div>
            <div class="pile-icon">🗑️</div>
            <div class="pile-count">{battle.playerDiscardPile.length}</div>
            <div class="pile-label">弃牌堆</div>
          </button>
        </div>

        <!-- 底部控制栏 -->
        <div class="control-bar">
          <div class="energy">
            <div class="energy-orbs">
              {#each Array.from({ length: battle.playerMaxEnergy }) as _, i}
                <div class="orb" class:lit={i < battle.playerEnergy}></div>
              {/each}
            </div>
            <span class="energy-text">{battle.playerEnergy}/{battle.playerMaxEnergy}</span>
          </div>
          <button class="end-turn" disabled={battle.phase !== "player"} onclick={endTurn}>
            {battle.phase === "player" ? "结束回合 ⏭" : "敌方行动中…"}
          </button>
        </div>
      {/if}

      <!-- 结算 -->
      {#if battle.finished}
        <div class="result" transition:fade={{ duration: 200 }}>
          <div class="result-card">
            <div class="result-title" class:win={battle.won} class:lose={!battle.won}>
              {battle.won ? "🏆 对决胜利！" : "💀 对决失败……"}
            </div>
            <div class="result-stats dim">
              共 {battle.turn} 回合 · {battle.player.name} 剩余 {battle.player.hp}/{battle.player.attrs.hp} HP
            </div>
            {#if reward}
              <div class="reward-list">
                <div class="reward-item">✨ 经验 +{reward.exp}</div>
                {#if reward.money > 0}
                  <div class="reward-item">💰 金钱 +{reward.money}</div>
                {/if}
                {#if reward.fame > 0}
                  <div class="reward-item">🌟 声望 +{reward.fame}</div>
                {/if}
                {#if reward.attr && reward.gain}
                  <div class="reward-item attr">
                    💪 {reward.attr === "atk" ? "攻击" : reward.attr === "def" ? "防御" : reward.attr === "spd" ? "速度" : "体质"} +{reward.gain}
                  </div>
                {/if}
                {#if reward.itemId}
                  <div class="reward-item">🎁 获得物品 ×1</div>
                {/if}
                {#if reward.leveled}
                  <div class="reward-item lvup">⬆️ 升级到 Lv.{reward.newLevel}！</div>
                {/if}
              </div>
              <button class="claim-btn" onclick={close}>继续 →</button>
            {:else}
              <button class="claim-btn" onclick={claim}>领取奖励 →</button>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- 牌堆查看器 -->
    {#if viewingPile}
      <div class="pile-viewer" transition:fade={{ duration: 160 }} onclick={() => (viewingPile = null)}>
        <div class="pile-viewer-inner" onclick={(e) => e.stopPropagation()}>
          <div class="pile-viewer-head">
            <span>{viewingPile === "draw" ? "🃏 抽牌堆" : "🗑️ 弃牌堆"} · 共 {viewingPile === "draw" ? drawPileCards.length : discardPileCards.length} 张</span>
            <button class="pile-viewer-close" onclick={() => (viewingPile = null)}>✕</button>
          </div>
          <div class="pile-grid">
            {#each (viewingPile === "draw" ? drawPileCards : discardPileCards) as c, i (c.id + i)}
              <div class="mini-card {c.type} elm-{elementClass(c.element)}" in:scale={{ start: 0.9, duration: 160 }}>
                <div class="mini-cost">{c.cost}</div>
                <div class="mini-art">{c.icon}</div>
                <div class="mini-name">{c.name}</div>
                <div class="mini-type">{CARD_TYPE_LABEL[c.type]}</div>
                <div class="mini-desc">{c.desc}</div>
                {#if c.effect?.exhaust}
                  <div class="mini-exhaust">🔥 消耗</div>
                {/if}
              </div>
            {/each}
            {#if (viewingPile === "draw" ? drawPileCards.length : discardPileCards.length) === 0}
              <div class="pile-empty">（空）</div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="overlay hud-scope" data-scene={scene}>
    <div class="combat-bg"></div>
    {#if reward}
      <!-- v1.37 结算面板：战斗已结算（battle 清空后在此展示奖励，支持继续匹配） -->
      <div class="result">
        <div class="result-card">
          <div class="result-title" class:win={reward.money > 0 || lastRewardCasual} class:lose={false}>
            {lastRewardCasual ? "🎉 对决胜利！" : "🏆 对决结束"}
          </div>
          <div class="result-stats dim">
            {reward.exp} 经验{reward.money > 0 ? ` · 💰 ${reward.money} 元` : ""}{reward.fame > 0 ? ` · 🌟 ${reward.fame} 声望` : ""}
            {#if reward.leveled} · ⬆️ 升到 Lv.{reward.newLevel}{/if}
          </div>
          <div class="reward-list">
            {#if reward.attr && reward.gain}
              <div class="reward-item attr">
                💪 {reward.attr === "atk" ? "攻击" : reward.attr === "def" ? "防御" : reward.attr === "spd" ? "速度" : "体质"} +{reward.gain}
              </div>
            {/if}
            {#if reward.itemId}
              <div class="reward-item">🎁 获得物品 ×1</div>
            {/if}
            {#if uiState.cardOfferPayload}
              <div class="reward-item">📦 获得一张新卡牌！（收入卡包由下一步确认）</div>
            {/if}
          </div>
          <div class="btn-col">
            {#if lastRewardCasual}
              <button class="rematch-btn" onclick={rematch}>🔗 继续匹配下一只猫咪</button>
            {/if}
            <button class="claim-btn" onclick={close}>{uiState.cardOfferPayload ? "查看新卡牌 →" : "继续 →"}</button>
          </div>
        </div>
      </div>
    {:else}
      <div class="panel empty-panel">
        <div class="empty-text">当前没有进行中的对决</div>
        <button class="claim-btn" onclick={close}>关闭</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* ===== 透明战斗舞台（游戏场景透出） ===== */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 130;
    /* v1.36 修复：对决层本身即为不透明竞技场底色，彻底覆盖底层游戏场景，
       不再透出"游戏外画面"。.combat-bg 在其上叠加聚光/擂台环等装饰。 */
    background: linear-gradient(180deg, #0a0720 0%, #130f2c 42%, #1a1538 72%, #221a3e 100%);
    animation: fadeIn 0.22s ease;
  }
  /* v1.36 修复：决斗场背景。原先仅有半透明暗角，叠在游戏场景上看几乎等于
     "没有背景"；改为不透明的竞技场舞台：顶光 + 场地光 + 圆形擂台环，
     猫立绘的椭圆光晕与场地光自然融合。 */
  .combat-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      /* 顶部聚光（暖色） */
      radial-gradient(ellipse 58% 42% at 50% 4%, rgba(255, 220, 150, 0.30) 0%, transparent 62%),
      /* 中央舞台聚光（紫白，落在两只猫之间） */
      radial-gradient(circle 36% at 50% 60%, rgba(190, 160, 255, 0.20) 0%, transparent 72%),
      /* 场地后景辉光（紫色） */
      radial-gradient(ellipse 75% 38% at 50% 98%, rgba(120, 80, 220, 0.32) 0%, transparent 65%),
      /* v1.37 底色改为半透明暗角：让「场地×时段」背景图透出，同时保证可读性 */
      linear-gradient(180deg, rgba(10, 7, 32, 0.62) 0%, rgba(19, 15, 44, 0.50) 42%, rgba(26, 21, 56, 0.46) 72%, rgba(34, 26, 62, 0.55) 100%);
    pointer-events: none;
  }
  /* v1.37 场地×时段背景图：铺在 opaque 底色之上、暗角渐变之下 */
  .combat-bg-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    user-select: none;
    z-index: 0;
    /* 缓慢视差平移：缩放 1.05→1.12 并轻微平移，30s 无限循环 alternate */
    animation: bgPan 30s ease-in-out infinite alternate;
    will-change: transform;
  }
  @keyframes bgPan {
    from { transform: scale(1.05) translate(0, 0); }
    to { transform: scale(1.12) translate(-2%, -1.5%); }
  }
  /* 圆形擂台环：地面上两道发光的同心圆，强化"决斗场"语义 */
  .combat-bg::before {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -12%;
    transform: translateX(-50%);
    width: min(960px, 105%);
    aspect-ratio: 2.4 / 1;
    border-radius: 50%;
    background:
      radial-gradient(ellipse 50% 58% at 50% 0%, transparent 56%, rgba(255, 209, 102, 0.20) 59%, transparent 63%),
      radial-gradient(ellipse 44% 52% at 50% 0%, transparent 62%, rgba(255, 255, 255, 0.12) 65%, transparent 69%);
    filter: blur(1.5px);
    pointer-events: none;
  }
  .battle {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #f3f0ff;
  }

  /* ===== 动态背景粒子层（背景图之上、内容之下，绝不挡点击） ===== */
  .bg-particles {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
  }
  .bg-particles .pt {
    position: absolute;
    bottom: -12px;
    border-radius: 50%;
    opacity: 0;
    /* 默认：柔和白光点（v1.38 加强亮度与辉光） */
    background: radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 70%);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.85);
    animation-name: ptFloat;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform, opacity;
  }
  @keyframes ptFloat {
    0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
    12% { opacity: 0.85; }
    50% { opacity: 0.7; }
    85% { opacity: 0.5; }
    100% { transform: translate(var(--drift, 0px), -118vh) scale(1.1); opacity: 0; }
  }
  /* 场景化配色：由根容器 data-scene 决定 */
  .overlay[data-scene="park"] .bg-particles .pt {
    background: radial-gradient(circle, rgba(255, 205, 228, 0.95) 0%, rgba(255, 255, 255, 0.25) 45%, transparent 72%);
    box-shadow: 0 0 6px rgba(255, 190, 215, 0.6);
  }
  .overlay[data-scene="arena"] .bg-particles .pt {
    background: radial-gradient(circle, rgba(255, 224, 150, 0.95) 0%, rgba(255, 150, 220, 0.5) 45%, transparent 72%);
    box-shadow: 0 0 7px rgba(255, 190, 120, 0.55);
  }
  .overlay[data-scene="alley"] .bg-particles .pt {
    background: radial-gradient(circle, rgba(200, 255, 150, 0.95) 0%, rgba(170, 230, 120, 0.4) 45%, transparent 72%);
    box-shadow: 0 0 7px rgba(180, 240, 120, 0.55);
  }
  .overlay[data-scene="night"] .bg-particles .pt {
    background: radial-gradient(circle, rgba(215, 255, 170, 0.95) 0%, rgba(160, 225, 110, 0.45) 45%, transparent 72%);
    box-shadow: 0 0 9px rgba(170, 240, 120, 0.7);
  }
  .overlay[data-scene="boss"] .bg-particles .pt {
    background: radial-gradient(circle, rgba(222, 184, 255, 0.95) 0%, rgba(255, 205, 120, 0.5) 45%, transparent 72%);
    box-shadow: 0 0 8px rgba(200, 150, 255, 0.6);
  }

  /* ===== HUD 顶栏 ===== */
  .hud {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 22px;
    background: linear-gradient(180deg, rgba(8, 6, 18, 0.78), rgba(8, 6, 18, 0.10));
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(3px);
  }
  .hud-title-block {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .hud-icon {
    font-size: 22px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
  }
  .hud-title {
    font-size: 18px;
    font-weight: 900;
    letter-spacing: 1px;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
  }
  .hud-sub {
    font-size: 11.5px;
    color: #c9c3e6;
    margin-top: 1px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }
  .hud-turn {
    font-size: 13px;
    font-weight: 800;
    padding: 6px 14px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.16);
    color: #ffd166;
    border: 1px solid rgba(255, 209, 102, 0.32);
    text-align: center;
  }
  .hud-turn b { margin-left: 2px; font-size: 15px; }
  .turn-tag {
    display: block;
    font-size: 9.5px;
    font-weight: 700;
    margin-top: 2px;
    color: #9be8ac;
  }
  .turn-tag.enemy { color: #ff9a9a; }
  .hud-close {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: inherit;
    font-size: 15px;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .hud-close:hover { background: rgba(255, 90, 90, 0.28); }
  .hud-close:active { transform: scale(0.9); }

  /* ===== 战场 ===== */
  .arena {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 6px 24px;
    /* v1.38 P10：整体画面比例放大一点点（仅缩放中央战场，不裁切顶栏/手牌） */
    transform: scale(1.04);
    transform-origin: center 52%;
  }
  .combatants {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: clamp(20px, 5vw, 70px);
    width: 100%;
    max-width: 1000px;
  }
  .combatant {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  /* 名字板 */
  .nameplate {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
    flex-wrap: wrap;
    justify-content: center;
    /* 半透明深色底纹提升任意背景图上的可读性 */
    background: rgba(0, 0, 0, 0.45);
    padding: 5px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.10);
  }
  .cat-name {
    font-size: 16px;
    color: #f5f5ff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .cat-lv {
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.16);
    color: #ffd166;
    border: 1px solid rgba(255, 209, 102, 0.25);
  }
  .cat-elm {
    font-size: 10.5px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }
  .cat-elm.nature { background: rgba(120, 214, 120, 0.18); color: #a6f0a6; }
  .cat-elm.tech { background: rgba(100, 180, 255, 0.18); color: #9ed0ff; }
  .cat-elm.mystic { background: rgba(180, 130, 255, 0.18); color: #d4b8ff; }
  .cat-elm.cosmic { background: rgba(255, 180, 100, 0.18); color: #ffd8a8; }
  .cat-elm.normal { background: rgba(200, 200, 210, 0.12); color: #dcdae8; }

  .cat-desc {
    font-size: 10.5px;
    color: #c4bee2;
    text-align: center;
    max-width: 240px;
    line-height: 1.4;
    opacity: 0.85;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
  }

  /* 血条 */
  .hp-bar {
    width: min(100%, 260px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .hp-track {
    position: relative;
    width: 100%;
    height: 16px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .hp-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #ff4d4d, #ff7878 55%, #ffb347);
    box-shadow: 0 0 12px rgba(255, 80, 80, 0.5);
    transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .hp-fill.player {
    background: linear-gradient(90deg, #47d16c, #7ce89b 55%, #b8f0c8);
    box-shadow: 0 0 12px rgba(80, 220, 120, 0.45);
  }
  .hp-gloss {
    position: absolute;
    inset: 0 0 50% 0;
    border-radius: 999px 999px 0 0;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.25), transparent);
    pointer-events: none;
  }
  .hp-text {
    font-size: 11.5px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #ffe2e2;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  }

  /* 立绘椭圆光晕 */
  .portrait-oval {
    position: relative;
    width: clamp(150px, 22vh, 230px);
    height: clamp(150px, 22vh, 230px);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 4px 0;
  }
  .portrait-oval::before {
    content: "";
    position: absolute;
    inset: -12%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--glow-color, rgba(255, 255, 255, 0.15)) 0%, transparent 70%);
    filter: blur(10px);
    opacity: 0.9;
    pointer-events: none;
  }
  .glow-enemy { --glow-color: rgba(255, 90, 90, 0.4); }
  .glow-player { --glow-color: rgba(90, 160, 255, 0.4); }
  .combatant.boss .glow-enemy { --glow-color: rgba(255, 60, 60, 0.6); }
  .oval-shadow {
    position: absolute;
    bottom: -8%;
    width: 70%;
    height: 14%;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    filter: blur(8px);
    pointer-events: none;
  }
  .portrait {
    position: relative;
    width: 92%;
    height: 92%;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid rgba(255, 255, 255, 0.25);
    box-shadow:
      0 12px 40px rgba(0, 0, 0, 0.6),
      inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    background: rgba(20, 16, 36, 0.4);
    transition: transform 0.18s ease;
  }
  .portrait.boss {
    width: 108%;
    height: 108%;
    border-color: rgba(255, 90, 90, 0.6);
    box-shadow:
      0 0 50px rgba(255, 60, 60, 0.5),
      0 12px 40px rgba(0, 0, 0, 0.6);
  }
  .portrait.fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 70px;
  }
  .portrait.attack { animation: lunge 0.42s ease; }
  .portrait.hurt { animation: shake 0.42s ease; }
  .portrait.enter { animation: enter 0.75s cubic-bezier(0.22, 1, 0.36, 1); }
  @keyframes lunge {
    0% { transform: translateX(0) scale(1); }
    35% { transform: translateX(var(--lunge, 28px)) scale(1.07); }
    100% { transform: translateX(0) scale(1); }
  }
  .combatant.enemy .portrait.attack { --lunge: -28px; }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-9px); }
    50% { transform: translateX(8px); }
    75% { transform: translateX(-5px); }
  }
  @keyframes enter {
    from { opacity: 0; transform: translateY(30px) scale(0.84); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* ===== v1.37 战斗动作特效 ===== */
  /* 全屏震动：玩家受击时屏幕抖动 */
  .battle.shake { animation: screenShake 0.42s ease; }
  @keyframes screenShake {
    0%, 100% { transform: translate(0, 0); }
    15% { transform: translate(-7px, 3px); }
    35% { transform: translate(6px, -4px); }
    55% { transform: translate(-4px, 2px); }
    75% { transform: translate(3px, -2px); }
  }
  .fx {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
    z-index: 3;
  }
  /* 受击爆闪：白闪 + 放射状星芒 */
  .fx-burst { animation: fxBurst 0.42s ease-out forwards; }
  .fx-burst::before {
    content: "";
    position: absolute;
    inset: 6%;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 180, 90, 0.55) 38%, transparent 68%);
    animation: fxFlash 0.42s ease-out;
  }
  .fx-burst::after {
    content: "";
    position: absolute;
    inset: -16%;
    background:
      conic-gradient(from 0deg, transparent 0deg, rgba(255, 255, 255, 0.9) 6deg, transparent 14deg,
        transparent 90deg, rgba(255, 255, 255, 0.7) 96deg, transparent 104deg,
        transparent 180deg, rgba(255, 255, 255, 0.9) 186deg, transparent 194deg,
        transparent 270deg, rgba(255, 255, 255, 0.7) 276deg, transparent 284deg);
    -webkit-mask-image: radial-gradient(circle, transparent 42%, black 46%);
    mask-image: radial-gradient(circle, transparent 42%, black 46%);
    animation: fxStarburst 0.42s ease-out forwards;
  }
  @keyframes fxFlash {
    0% { opacity: 1; transform: scale(0.5); }
    100% { opacity: 0; transform: scale(1.15); }
  }
  @keyframes fxStarburst {
    0% { opacity: 1; transform: scale(0.6) rotate(0deg); }
    100% { opacity: 0; transform: scale(1.5) rotate(40deg); }
  }
  /* 格挡护盾：内缩 + 六边形光弧 */
  .fx-shield { animation: fxShield 0.5s ease-out; }
  .fx-shield::before {
    content: "";
    position: absolute;
    inset: 8%;
    border-radius: 22%;
    transform: rotate(45deg);
    border: 4px solid rgba(120, 200, 255, 0.9);
    box-shadow: 0 0 18px rgba(120, 200, 255, 0.7), inset 0 0 18px rgba(120, 200, 255, 0.35);
    animation: fxShieldRing 0.5s ease-out;
  }
  @keyframes fxShieldRing {
    0% { opacity: 1; transform: rotate(45deg) scale(0.9); }
    100% { opacity: 0; transform: rotate(45deg) scale(1.4); }
  }
  /* 治疗光点：上升的绿点 */
  .fx-heal { animation: fxHeal 0.9s ease-out forwards; }
  .fx-heal::before {
    content: "";
    position: absolute;
    left: 50%;
    bottom: 20%;
    width: 60%;
    height: 60%;
    background:
      radial-gradient(circle at 20% 60%, rgba(140, 240, 170, 0.95) 0 4%, transparent 6%),
      radial-gradient(circle at 45% 30%, rgba(140, 240, 170, 0.95) 0 4%, transparent 6%),
      radial-gradient(circle at 70% 50%, rgba(140, 240, 170, 0.95) 0 4%, transparent 6%),
      radial-gradient(circle at 30% 80%, rgba(140, 240, 170, 0.8) 0 3%, transparent 5%),
      radial-gradient(circle at 80% 20%, rgba(140, 240, 170, 0.8) 0 3%, transparent 5%);
    animation: fxHealRise 0.9s ease-out forwards;
  }
  @keyframes fxHealRise {
    0% { opacity: 0; transform: translateY(16px); }
    30% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-30px); }
  }
  /* 闪避残影：高速虚影 */
  .fx-ghost { animation: fxGhost 0.42s ease; }
  .fx-ghost::before {
    content: "";
    position: absolute;
    inset: 4%;
    border-radius: 50%;
    background: rgba(180, 220, 255, 0.35);
    filter: blur(3px);
    animation: fxGhostOut 0.42s ease;
  }
  @keyframes fxGhostOut {
    0% { opacity: 0.9; transform: translateX(-18px) scale(1.06); }
    100% { opacity: 0; transform: translateX(14px) scale(0.96); }
  }
  /* 攻击冲刺残影（配合立绘 lunge） */
  .fx-lunge { animation: fxLunge 0.42s ease; }
  .fx-lunge::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: linear-gradient(100deg, transparent 40%, rgba(255, 210, 130, 0.45) 55%, transparent 75%);
    transform: scaleX(0.6);
    filter: blur(2px);
    animation: fxLungeSweep 0.42s ease;
  }
  @keyframes fxLungeSweep {
    0% { opacity: 0; transform: translateX(-30px) scaleX(0.4); }
    40% { opacity: 1; }
    100% { opacity: 0; transform: translateX(26px) scaleX(0.7); }
  }

  /* 伤害飘字 */
  .float {
    position: absolute;
    left: 50%;
    top: 6%;
    transform: translateX(-50%);
    font-size: 30px;
    font-weight: 900;
    pointer-events: none;
    z-index: 5;
    text-shadow: 0 3px 10px rgba(0, 0, 0, 0.85);
    animation: floatUp 0.9s ease-out forwards;
  }
  .float.dmg { color: #ff6b6b; }
  .float.heal { color: #7bd88f; }
  .float.block { color: #9ccdff; }
  @keyframes floatUp {
    0% { opacity: 0; transform: translate(-50%, 12px) scale(0.8); }
    25% { opacity: 1; transform: translate(-50%, -8px) scale(1.12); }
    100% { opacity: 0; transform: translate(-50%, -52px) scale(1); }
  }

  /* 意图气泡 */
  .intent {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 800;
    border: 1.5px solid;
    /* 内层深色底纹（inset 阴影置于背景之上、文字之下）+ 原有投影，保证对比度 */
    box-shadow: inset 0 0 0 200px rgba(0, 0, 0, 0.42), 0 4px 16px rgba(0, 0, 0, 0.5);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    animation: intentPulse 1.6s ease-in-out infinite;
  }
  @keyframes intentPulse {
    0%, 100% { transform: scale(1); filter: brightness(1); }
    50% { transform: scale(1.06); filter: brightness(1.18); }
  }
  .intent-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    opacity: 0.9;
  }
  .intent-atk { background: rgba(255, 80, 80, 0.22); border-color: rgba(255, 110, 110, 0.7); color: #ffb0b0; }
  .intent-def { background: rgba(90, 160, 255, 0.22); border-color: rgba(120, 180, 255, 0.7); color: #b4dcff; }
  .intent-skill { background: rgba(180, 130, 255, 0.22); border-color: rgba(200, 160, 255, 0.7); color: #e0c8ff; }
  .intent-icon { font-size: 17px; }

  .vs {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 3px;
    opacity: 0.4;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
    flex-shrink: 0;
  }

  /* 属性 + Buff */
  .stat-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .stat {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .buff-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    justify-content: center;
    min-height: 22px;
  }
  .buff {
    font-size: 10.5px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .buff.block { background: rgba(90, 160, 255, 0.2); color: #a8d4ff; border: 1px solid rgba(90, 160, 255, 0.3); }
  .buff.strength { background: rgba(255, 160, 70, 0.2); color: #ffd0a0; border: 1px solid rgba(255, 160, 70, 0.3); }
  .buff.status { background: rgba(255, 100, 160, 0.2); color: #ffb8d4; border: 1px solid rgba(255, 100, 160, 0.3); }

  /* ===== 战斗日志横幅 ===== */
  .log-bar {
    position: relative;
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    justify-content: center;
    align-items: center;
    max-height: 56px;
    overflow-y: auto;
    padding: 6px 16px;
    margin: 0 24px 8px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 11px;
    line-height: 1.5;
  }
  .log-line {
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .log-line.me { color: #a8d4ff; background: rgba(90, 160, 255, 0.12); }
  .log-line.them { color: #ff9a9a; background: rgba(255, 90, 90, 0.12); }
  .log-line.sys { color: #c4bee2; }
  .log-line.new { animation: logIn 0.25s ease; }
  @keyframes logIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ===== 手牌区 ===== */
  .hand-zone {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: end;
    gap: 14px;
    padding: 0 20px 10px;
  }
  .pile {
    position: relative;
    width: 64px;
    height: 88px;
    border-radius: 8px;
    border: none;
    color: inherit;
    font: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
    background: transparent;
  }
  .pile-back {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    background: linear-gradient(160deg, rgba(70, 60, 120, 0.92), rgba(35, 30, 65, 0.96));
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35), 0 6px 14px rgba(0, 0, 0, 0.5);
    transition: transform 0.14s ease;
  }
  .pile:hover .pile-back { transform: translateY(-3px); border-color: rgba(255, 209, 102, 0.5); }
  .pile:active .pile-back { transform: translateY(0); }
  .pile-icon { position: relative; font-size: 20px; }
  .pile-count {
    position: relative;
    font-size: 16px;
    font-weight: 900;
    color: #ffd166;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  }
  .pile-label { position: relative; font-size: 9px; opacity: 0.8; }

  .hand {
    display: flex;
    justify-content: center;
    gap: 10px;
    overflow-x: auto;
    padding: 10px 4px 2px;
    scrollbar-width: thin;
  }
  .hand::-webkit-scrollbar { height: 5px; }
  .hand::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 999px; }

  /* 实体卡 */
  .card {
    position: relative;
    flex: 0 0 auto;
    width: 120px;
    min-height: 156px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 8px 8px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: linear-gradient(180deg, #2a2348 0%, #16122a 100%);
    box-shadow: 0 5px 0 rgba(0, 0, 0, 0.5), 0 8px 22px rgba(0, 0, 0, 0.6);
    color: inherit;
    font: inherit;
    text-align: center;
    cursor: pointer;
    transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
    overflow: hidden;
  }
  .card::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 12px;
    border-top: 4px solid var(--type-color, #888);
    pointer-events: none;
  }
  .card.attack { --type-color: #ff5a5a; }
  .card.defend { --type-color: #5aa8ff; }
  .card.skill { --type-color: #b67cff; }
  .card-frame {
    position: absolute;
    inset: 5px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    pointer-events: none;
  }
  .card:hover:not(.disabled) {
    transform: translateY(-16px);
    box-shadow: 0 18px 0 rgba(0, 0, 0, 0.35), 0 22px 40px rgba(0, 0, 0, 0.65), 0 0 26px var(--type-glow, rgba(255, 255, 255, 0.14));
    border-color: var(--type-color, #fff);
  }
  .card:active:not(.disabled) { transform: translateY(-8px) scale(0.96); }
  .card.attack { --type-glow: rgba(255, 90, 90, 0.3); }
  .card.defend { --type-glow: rgba(90, 160, 255, 0.3); }
  .card.skill { --type-glow: rgba(180, 120, 255, 0.3); }
  .card.disabled { opacity: 0.42; cursor: not-allowed; filter: grayscale(0.6); }
  .card.enemy-turn { opacity: 0.55; cursor: not-allowed; }

  .card-cost {
    position: absolute;
    top: -7px;
    left: -7px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff5c2, #ffb020);
    color: #2a1f08;
    font-size: 14px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.55);
    z-index: 2;
  }
  .card-art {
    width: 64px;
    height: 64px;
    margin-top: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 38px;
    background: rgba(0, 0, 0, 0.28);
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .card-name {
    margin-top: 7px;
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.3px;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7);
  }
  .card-desc {
    margin-top: 4px;
    font-size: 10px;
    line-height: 1.35;
    color: #cbc5e2;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2px;
  }
  .card-type {
    margin-top: 6px;
    font-size: 9px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.4);
    color: var(--type-color, #aaa);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  /* v1.39 消耗卡牌标识：火焰色角标，提示玩家该卡使用后永久消失 */
  .card-exhaust {
    position: absolute;
    top: -2px;
    right: -2px;
    font-size: 8px;
    font-weight: 900;
    padding: 1px 6px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ff6b35, #d42a1e);
    color: #fff;
    box-shadow: 0 1px 6px rgba(255, 80, 30, 0.5);
    z-index: 3;
    letter-spacing: 0.5px;
  }
  .card.elm-nature .card-art { background: rgba(100, 200, 100, 0.14); }
  .card.elm-tech .card-art { background: rgba(80, 160, 255, 0.14); }
  .card.elm-mystic .card-art { background: rgba(170, 100, 255, 0.14); }
  .card.elm-cosmic .card-art { background: rgba(255, 180, 80, 0.14); }

  /* ===== 底部控制栏 ===== */
  .control-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 0 24px 16px;
  }
  .energy {
    display: flex;
    align-items: center;
    gap: 10px;
    /* 半透明深色底纹，提升能量数字在背景图上的可读性 */
    background: rgba(0, 0, 0, 0.45);
    padding: 7px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.10);
  }
  .energy-orbs { display: flex; gap: 5px; }
  .orb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #4a4a5a, #222230);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
    transition: all 0.18s ease;
  }
  .orb.lit {
    background: radial-gradient(circle at 35% 30%, #a6f0ff, #2a9df4 60%, #1c6fd1);
    border-color: rgba(166, 240, 255, 0.5);
    box-shadow: 0 0 12px rgba(42, 157, 244, 0.7), inset 0 0 8px rgba(166, 240, 255, 0.4);
  }
  .energy-text {
    font-size: 14px;
    font-weight: 900;
    color: #a6f0ff;
    text-shadow: 0 0 8px rgba(42, 157, 244, 0.5);
  }
  .end-turn {
    font: inherit;
    font-size: 15px;
    font-weight: 900;
    padding: 12px 32px;
    border-radius: 999px;
    border: none;
    color: #1a1206;
    background: linear-gradient(135deg, #ffd166, #ff9f3d);
    box-shadow: 0 5px 0 #b46a20, 0 8px 22px rgba(255, 180, 80, 0.4);
    cursor: pointer;
    transition: transform 0.1s ease, box-shadow 0.1s ease;
  }
  .end-turn:hover:not(:disabled) { box-shadow: 0 6px 0 #b46a20, 0 12px 28px rgba(255, 180, 80, 0.5); }
  .end-turn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 #b46a20, 0 5px 14px rgba(255, 180, 80, 0.3); }
  .end-turn:disabled {
    background: rgba(255, 255, 255, 0.12);
    color: #8a84a0;
    box-shadow: none;
    cursor: not-allowed;
  }

  /* ===== 结算 ===== */
  .result {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 4, 10, 0.72);
    backdrop-filter: blur(4px);
    z-index: 10;
  }
  .result-card {
    width: min(90vw, 420px);
    padding: 26px;
    border-radius: 18px;
    background: linear-gradient(180deg, #1f1a3a, #15102b);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7);
    text-align: center;
    animation: popIn 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .result-title { font-size: 24px; font-weight: 900; margin-bottom: 8px; }
  .result-title.win { color: #ffd166; }
  .result-title.lose { color: #ff8a8a; }
  .result-stats { font-size: 12px; color: #c4bee2; margin-bottom: 16px; }
  .reward-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
  .reward-item {
    font-size: 13px;
    font-weight: 700;
    padding: 7px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
  }
  .reward-item.attr { background: rgba(255, 209, 102, 0.16); color: #ffd166; }
  .reward-item.lvup { background: rgba(123, 216, 143, 0.18); color: #9be8ac; }
  .claim-btn {
    width: 100%;
    font: inherit;
    font-size: 14px;
    font-weight: 900;
    padding: 12px;
    border-radius: 999px;
    border: none;
    color: #1a1206;
    background: linear-gradient(135deg, #ffd166, #ff9f3d);
    cursor: pointer;
    box-shadow: 0 5px 16px rgba(255, 160, 60, 0.3);
    transition: all 0.15s ease;
  }
  .claim-btn:hover { box-shadow: 0 7px 22px rgba(255, 160, 60, 0.45); transform: translateY(-1px); }
  .claim-btn:active { transform: translateY(1px); box-shadow: 0 3px 10px rgba(255, 160, 60, 0.25); }
  /* v1.37 结算面板：继续匹配按钮 + 纵向按钮组 */
  .btn-col { display: flex; flex-direction: column; gap: 10px; }
  .rematch-btn {
    width: 100%;
    font: inherit;
    font-size: 14px;
    font-weight: 900;
    padding: 12px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    color: #dff0ff;
    background: linear-gradient(135deg, #3f6fd1, #2a4fa8);
    box-shadow: 0 5px 16px rgba(63, 111, 209, 0.35);
    transition: all 0.15s ease;
  }
  .rematch-btn:hover { box-shadow: 0 8px 22px rgba(63, 111, 209, 0.5); }
  .rematch-btn:active { transform: translateY(2px); }

  /* ===== 牌堆查看器 ===== */
  .pile-viewer {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(5, 4, 10, 0.7);
    backdrop-filter: blur(4px);
    padding: 24px;
  }
  .pile-viewer-inner {
    width: min(92vw, 760px);
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    background: linear-gradient(180deg, #201b3c, #15102b);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.7);
    overflow: hidden;
  }
  .pile-viewer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    font-size: 14px;
    font-weight: 800;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .pile-viewer-close {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .pile-viewer-close:hover { background: rgba(255, 90, 90, 0.28); }
  .pile-viewer-close:active { transform: scale(0.9); }
  .pile-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
    padding: 16px;
    overflow-y: auto;
  }
  .mini-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 8px 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-top: 3px solid var(--type-color, #888);
    background: linear-gradient(180deg, #2a2348, #16122a);
  }
  .mini-card.attack { --type-color: #ff5a5a; }
  .mini-card.defend { --type-color: #5aa8ff; }
  .mini-card.skill { --type-color: #b67cff; }
  .mini-cost {
    position: absolute;
    top: -8px;
    left: -8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff5c2, #ffb020);
    color: #2a1f08;
    font-size: 12px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .mini-art { font-size: 30px; margin: 2px 0; }
  .mini-name { font-size: 12px; font-weight: 800; }
  .mini-type { font-size: 9px; color: var(--type-color, #aaa); margin: 2px 0; }
  .mini-desc { font-size: 9.5px; color: #cbc5e2; text-align: center; line-height: 1.3; }
  /* v1.39 消耗标识：牌堆查看器中的迷你消耗角标 */
  .mini-exhaust {
    position: absolute;
    bottom: 4px;
    right: 4px;
    font-size: 8px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ff6b35, #d42a1e);
    color: #fff;
    box-shadow: 0 1px 4px rgba(255, 80, 30, 0.4);
  }
  .pile-empty { grid-column: 1 / -1; text-align: center; color: #8a84a0; padding: 24px; }

  /* 空态 */
  .panel {
    padding: 24px;
    border-radius: 16px;
    background: rgba(24, 18, 43, 0.92);
    border: 1px solid #2a2448;
    text-align: center;
  }
  .empty-text { font-size: 14px; margin-bottom: 14px; color: #cbc5e2; }
  .empty-panel .claim-btn { width: auto; padding: 8px 24px; }
  .dim { color: #c4bee2; }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes popIn {
    from { opacity: 0; transform: scale(0.92) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ===== 窄屏适配 ===== */
  @media (max-width: 860px), (max-height: 560px) {
    .combatants { gap: 16px; }
    .portrait-oval { width: clamp(110px, 17vh, 160px); height: clamp(110px, 17vh, 160px); }
    .portrait.fallback { font-size: 52px; }
    .hp-bar { max-width: 180px; }
    .cat-desc { max-width: 160px; font-size: 9px; }
    .card { width: 98px; min-height: 132px; }
    .card-art { width: 52px; height: 52px; font-size: 30px; }
    .card-name { font-size: 11.5px; }
    .card-desc { font-size: 9px; }
    .pile { width: 54px; height: 74px; }
    .pile-count { font-size: 14px; }
    .log-bar { margin: 0 12px 6px; max-height: 48px; }
    .hand-zone { padding: 0 12px 8px; gap: 10px; }
    .control-bar { padding: 0 16px 12px; }
  }
</style>
