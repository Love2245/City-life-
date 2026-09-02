<script lang="ts">
  import { onMount } from "svelte";
  import type { QuizCfg } from "../../../game/core/minigame";
  import { scaleTimeLimit } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 快速判断引擎：收银找零 / 质检 / 分拣 / 话术 / 配餐 */
  let { cfg, onFinish }: { cfg: QuizCfg; onFinish: (ratio: number) => void } = $props();

  /**
   * v0.97 题目随机化：每题选项打乱顺序（answer 索引同步重映射），
   * 题目顺序也乱序，避免玩家靠位置记忆形成肌肉记忆。
   */
  function shuffledQuestions(): Array<{ q: string; options: string[]; answer: number }> {
    return cfg.questions.map((question) => {
      const idxs = question.options.map((_, i) => i);
      for (let i = idxs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
      }
      return {
        q: question.q,
        options: idxs.map((i) => question.options[i]),
        answer: idxs.indexOf(question.answer),
      };
    });
  }

  // 题目顺序 + 每题选项均随机化
  const questions = $state(shuffle(shuffledQuestions()));
  const timeLimit = cfg.timeLimit ? scaleTimeLimit(cfg.timeLimit) : null;

  let qIdx = $state(0);
  let correct = $state(0);
  let wrongTotal = $state(0);
  let timeLeft = $state(timeLimit ?? 0);
  let done = $state(false);
  let feedback = $state<"ok" | "bad" | null>(null);
  // v0.965 连击反馈
  let streak = $state(0);
  let maxStreak = $state(0);

  const cur = $derived(questions[qIdx]);

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function answer(i: number): void {
    if (done || !cur) return;
    if (i === cur.answer) {
      correct++;
      streak++;
      maxStreak = Math.max(maxStreak, streak);
      feedback = "ok";
      playSound("game");
    } else {
      wrongTotal++;
      streak = 0;
      feedback = "bad";
      playSound("error");
    }
    setTimeout(() => {
      feedback = null;
      qIdx++;
      if (qIdx >= questions.length) finish();
    }, 420);
  }

  function finish(): void {
    if (done) return;
    done = true;
    onFinish(questions.length > 0 ? correct / questions.length : 0);
  }

  onMount(() => {
    if (timeLimit != null) {
      const timer = setInterval(() => {
        if (done) return;
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
          timeLeft = 0;
          finish();
        }
      }, 100);
      return () => clearInterval(timer);
    }
  });
</script>

<div class="quiz">
  <div class="quiz-head">
    <span class="quiz-title">{cfg.icon} {cfg.title}</span>
    {#if timeLimit != null}
      <span class="quiz-timer" class:danger={timeLeft <= 3}>⏱ {timeLeft.toFixed(1)}s</span>
    {/if}
  </div>
  <p class="quiz-desc">{cfg.desc}</p>

  {#if cur}
    <div class="quiz-q">
      <span class="quiz-qi">第 {qIdx + 1}/{questions.length} 题</span>
      <p class="quiz-text">{cur.q}</p>
      <div class="quiz-options">
        {#each cur.options as opt, i}
          <button
            class="quiz-opt"
            class:ok-fb={feedback === "ok" && i === cur.answer}
            class:bad-fb={feedback === "bad" && i === cur.answer}
            disabled={done || feedback !== null}
            onclick={() => answer(i)}
          >
            {opt}
          </button>
        {/each}
      </div>
      {#if feedback === "ok"}<p class="quiz-fb ok">✅ 回答正确</p>{:else if feedback === "bad"}<p class="quiz-fb bad">❌ 答错了（计一次失误）</p>{/if}
      <p class="quiz-score dim">
        答对 {correct}/{Math.max(1, qIdx)} · 失误 {wrongTotal}
        {#if streak >= 3}<span class="streak">🔥 连对 {streak}</span>{/if}
      </p>
    </div>
  {:else}
    <p class="quiz-done">🎉 全部答完</p>
  {/if}

  <p class="quiz-foot dim">💡 答对越多，本次加成越高；答错会拉低评价，失败无额外惩罚。</p>
</div>

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .quiz-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .quiz-title {
    font-size: 15px;
    font-weight: 800;
  }
  .quiz-timer {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent, #ffd166);
    font-variant-numeric: tabular-nums;
  }
  .quiz-timer.danger {
    color: #ff8a7a;
  }
  .quiz-desc {
    font-size: 12px;
    color: var(--text-dim, #9aa3c7);
    margin: 0;
  }
  .quiz-qi {
    font-size: 11px;
    color: var(--text-dim, #9aa3c7);
  }
  .quiz-text {
    font-size: 14.5px;
    font-weight: 700;
    margin: 4px 0 10px;
  }
  .quiz-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .quiz-opt {
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-main);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 13.5px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .quiz-opt:hover {
    transform: translateX(3px);
    border-color: rgba(255, 209, 102, 0.4);
  }
  .quiz-opt.ok-fb {
    border-color: #7bd88f;
    background: rgba(123, 216, 143, 0.15);
  }
  .quiz-opt.bad-fb {
    border-color: #ff8a7a;
    background: rgba(255, 122, 122, 0.15);
  }
  .quiz-fb {
    font-size: 13px;
    font-weight: 700;
    margin: 6px 0 0;
  }
  .quiz-fb.ok {
    color: #7bd88f;
  }
  .quiz-fb.bad {
    color: #ff8a7a;
  }
  .quiz-score {
    font-size: 11px;
    margin: 8px 0 0;
  }
  .streak {
    color: var(--accent, #ffd166);
    font-weight: 800;
  }
  .quiz-done {
    text-align: center;
    font-size: 16px;
    font-weight: 800;
    padding: 20px 0;
  }
  .quiz-foot {
    font-size: 11px;
    text-align: center;
    margin: 0;
  }
  .dim {
    color: var(--text-dim, #9aa3c7);
  }
</style>
