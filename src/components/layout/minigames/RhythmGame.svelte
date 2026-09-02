<script lang="ts">
  import { onMount } from "svelte";
  import type { RhythmCfg } from "../../../game/core/minigame";
  import { judgeTiming, JUDGE_SCORE, JUDGE_LABEL, JUDGE_WINDOW, DIFFICULTY } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 音游引擎：下落音符 + 判定线。判定窗按全局难度系数缩放。 */
  let { cfg, onFinish }: { cfg: RhythmCfg; onFinish: (ratio: number) => void } = $props();

  const tracks = cfg.tracks;
  const notes = cfg.notes;
  // v0.965 节奏：基础间隔随机波动（±12%）+ 末尾 30% 加速段；下落更慢更易读
  const fallMs = Math.round(cfg.fallMs * DIFFICULTY * 1.15);
  const fullScore = notes * 100;

  /**
   * v0.975 关键修复：判定线的高度百分比（同时驱动 CSS 与音符位置换算）。
   * 旧版音符位置按 0→100% 线性下落，而判定线画在 ~75% 处，
   * 于是"音符压线"的瞬间距离理想命中时刻还差 25% × fallMs（约 560ms），
   * 远超最大判定窗（280ms），导致玩家照着画面点击永远 miss、恒定最低分。
   * 现在音符位置以判定线为终点换算：local = fallMs 时恰好落在线上。
   */
  const HIT_LINE_PCT = 78;
  /** 抓取窗：偏差超过该值的点击视为空挥（不消耗音符、不判 miss、无惩罚） */
  const GRAB_MS = JUDGE_WINDOW.ok + 60;

  interface Note {
    track: number;
    /** 理想命中时刻（相对 startTime，ms） */
    hitAt: number;
    /** 当前是否已判定 */
    judged: boolean;
    judge: "perfect" | "good" | "ok" | "miss" | null;
  }

  let notesArr = $state<Note[]>([]);
  let startTime = $state(0);
  let now = $state(0);
  let score = $state(0);
  let combo = $state(0);
  let maxCombo = $state(0);
  let lastJudge = $state<{ label: string; color: string; combo: number } | null>(null);
  let done = $state(false);
  let started = $state(false);
  /** 各轨道最近一次点击时刻（用于按下反馈动画） */
  let flash = $state<number[]>([]);

  const progressMs = $derived(now - startTime);

  function buildNotes(): void {
    const arr: Note[] = [];
    let t = 0;
    for (let i = 0; i < notes; i++) {
      // 每音符间隔随机波动 ±12%
      const jitter = 1 + (Math.random() * 0.24 - 0.12);
      // 末尾 30% 音符进入加速段（间隔 ×0.85），制造节奏变化
      const accel = i >= notes * 0.7 ? 0.85 : 1;
      const gap = Math.round(cfg.intervalMs * DIFFICULTY * jitter * accel);
      t += gap;
      arr.push({
        track: i % tracks,
        hitAt: t + fallMs,
        judged: false,
        judge: null,
      });
    }
    notesArr = arr;
  }

  function begin(): void {
    buildNotes();
    startTime = performance.now();
    started = true;
    playSound("game");
  }

  function hit(track: number): void {
    if (done || !started) return;
    if (track < 0 || track >= tracks) return;
    flash[track] = performance.now();
    const t = performance.now() - startTime;
    // 找该轨道上最近的未判定音符
    const candidates = notesArr.filter((n) => n.track === track && !n.judged);
    if (candidates.length === 0) return;
    const target = candidates.reduce((a, b) =>
      Math.abs(a.hitAt - t) < Math.abs(b.hitAt - t) ? a : b,
    );
    // v0.975：离最近音符太远的点击当作空挥，不吃掉后面的音符（旧版会误判并锁死后续音符）
    if (Math.abs(t - target.hitAt) > GRAB_MS) return;
    const judge = judgeTiming(t - target.hitAt);
    target.judged = true;
    target.judge = judge;
    if (judge === "miss") {
      combo = 0;
    } else {
      score += JUDGE_SCORE[judge];
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      playSound("game");
    }
    lastJudge = { label: JUDGE_LABEL[judge], color: judgeColor(judge), combo };
    if (notesArr.every((n) => n.judged)) finish();
  }

  function judgeColor(j: string): string {
    switch (j) {
      case "perfect":
        return "var(--accent, #ffd166)";
      case "good":
        return "#7bd88f";
      case "ok":
        return "#6cc6ff";
      default:
        return "#ff8a7a";
    }
  }

  function finish(): void {
    if (done) return;
    done = true;
    onFinish(Math.max(0, Math.min(1, score / fullScore)));
  }

  /** 总时长（最后一个音符判定窗口结束） */
  function totalDuration(): number {
    const last = notesArr[notesArr.length - 1];
    return last ? last.hitAt + JUDGE_WINDOW.ok + 300 : 0;
  }

  /** 连击提示（≥5 连） */
  const comboHot = $derived(combo >= 5 && combo % 5 === 0);

  /**
   * 音符位置（百分比高度）：0% = 顶部出现，HIT_LINE_PCT = 判定线（理想命中时刻）。
   * 超过判定线后继续下滑一小段，直到被判 miss 才消失。
   */
  function notePos(n: Note): number {
    if (!started) return 0;
    const local = progressMs - (n.hitAt - fallMs); // 进入屏幕的时长
    return Math.max(-6, Math.min(108, (local / fallMs) * HIT_LINE_PCT));
  }

  /** 轨道按下反馈（180ms 内高亮） */
  function laneActive(t: number): boolean {
    return now - (flash[t] ?? -9999) < 180;
  }

  onMount(() => {
    buildNotes();
    const tick = setInterval(() => {
      now = performance.now();
      // 自动判 miss：超过判定窗的音符
      for (const n of notesArr) {
        // v0.975：漏判阈值与最大判定窗保持一致（旧版 230×D 比 ok 窗更早，形成"看得见却已判 miss"）
        if (!n.judged && started && now - startTime > n.hitAt + JUDGE_WINDOW.ok) {
          n.judged = true;
          n.judge = "miss";
          combo = 0;
          lastJudge = { label: "失误", color: "#ff8a7a", combo };
        }
      }
      if (started && now - startTime > totalDuration() && !done) finish();
    }, 16);
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = Number(e.key);
      if (Number.isFinite(k) && k >= 1 && k <= tracks) {
        e.preventDefault();
        hit(k - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(tick);
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

<div class="rhythm">
  <div class="rh-head">
    <span class="rh-title">{cfg.icon} {cfg.title}</span>
    <span class="rh-score">得分 {score}<span class="dim">/{fullScore}</span></span>
  </div>
  <p class="rh-desc">{cfg.desc}</p>

  {#if !started}
    <div class="rh-intro">
      <p class="dim">轨道：{#each Array(tracks) as _, i}{i + 1}{#if i < tracks - 1} / {/if}{/each}（键盘 1-{tracks} 或点击轨道）</p>
      <button class="rh-start" onclick={begin}>▶ 开始</button>
    </div>
  {:else}
    <div class="rh-stage">
      {#each Array(tracks) as _, t}
        <div
          class="rh-lane"
          class:active={laneActive(t)}
          role="button"
          tabindex="-1"
          aria-label={`轨道 ${t + 1}`}
          onpointerdown={(e) => { e.preventDefault(); hit(t); }}
        >
          {#each notesArr as n}
            {#if n.track === t && !n.judged && notePos(n) >= -6 && notePos(n) <= 100}
              <div class="rh-note" style={`top: ${notePos(n)}%`}>
                <span class="note-dot"></span>
              </div>
            {/if}
          {/each}
          <div class="rh-line" style={`top: ${HIT_LINE_PCT}%`}></div>
          <span class="rh-key">{t + 1}</span>
        </div>
      {/each}
      <div class="rh-judge-box">
        {#if lastJudge}
          <span style={`color: ${lastJudge.color}`} class="rh-judge">{lastJudge.label}</span>
        {/if}
        <span class="rh-combo" class:hot={comboHot}>🔥 连击 {combo}</span>
      </div>
    </div>
  {/if}

  <p class="rh-foot dim">音符压到黄线时按下 → 完美 / 良好 / 普通；错过判定窗才算失误</p>
</div>

<style>
  .rhythm {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rh-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .rh-title {
    font-size: 15px;
    font-weight: 800;
  }
  .rh-score {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent, #ffd166);
    font-variant-numeric: tabular-nums;
  }
  .rh-desc {
    font-size: 12px;
    color: var(--text-dim, #9aa3c7);
    margin: 0;
  }
  .rh-intro {
    text-align: center;
    padding: 14px 0;
  }
  .rh-start {
    margin-top: 10px;
    padding: 10px 28px;
    border-radius: 999px;
    background: rgba(255, 209, 102, 0.15);
    color: var(--accent, #ffd166);
    border: 1px solid rgba(255, 209, 102, 0.4);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }
  .rh-stage {
    position: relative;
    display: flex;
    gap: 6px;
    height: 220px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 10px;
    overflow: hidden;
  }
  .rh-lane {
    flex: 1;
    position: relative;
    border-left: 1px dashed rgba(255, 255, 255, 0.1);
    border-right: 1px dashed rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s ease;
    touch-action: manipulation;
    user-select: none;
  }
  .rh-lane.active {
    background: rgba(255, 209, 102, 0.14);
  }
  .rh-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 3px;
    margin-top: -1.5px;
    background: var(--accent, #ffd166);
    opacity: 0.85;
    border-radius: 2px;
    box-shadow: 0 0 10px rgba(255, 209, 102, 0.5);
  }
  .rh-key {
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 11px;
    font-weight: 800;
    color: var(--text-dim, #9aa3c7);
  }
  .rh-note {
    position: absolute;
    left: 50%;
    /* 以音符中心对齐判定线中心（top 即判定进度百分比） */
    transform: translate(-50%, -50%);
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: top 0.03s linear;
  }
  .note-dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(255, 209, 102, 0.9);
    box-shadow: 0 0 12px rgba(255, 209, 102, 0.6);
  }
  .rh-judge-box {
    position: absolute;
    top: 8px;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    pointer-events: none;
  }
  .rh-judge {
    font-size: 20px;
    font-weight: 900;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
  }
  .rh-combo {
    font-size: 12px;
    color: var(--text-dim, #9aa3c7);
  }
  .rh-combo.hot {
    color: var(--accent, #ffd166);
    font-weight: 800;
    animation: pulse 0.3s ease;
  }
  .rh-foot {
    font-size: 11px;
    text-align: center;
    margin: 0;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
</style>
