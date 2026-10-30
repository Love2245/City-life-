<script lang="ts">
  import { onDestroy } from "svelte";
  import { PLUSH_IDS, type ClawSession, type LeisureInput } from "../../../game/core/districtLeisure";
  import PlushToy from "./PlushToy.svelte";
  let { session, oninput, enabled }: { session: ClawSession; oninput: (input: LeisureInput) => void; enabled: boolean } = $props();
  let grabbing = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const names = ["小熊", "兔兔", "橘猫", "熊猫", "恐龙"];
  function grab() {
    if (grabbing || session.phase !== "playing" || !enabled) return;
    grabbing = true;
    timer = setTimeout(() => { if (enabled) oninput({ type: "grab" }); grabbing = false; }, 1900);
  }
  onDestroy(() => { if (timer) clearTimeout(timer); });
</script>

<div class="machine">
  <div class="marquee"><span>★</span> 泊月玩偶屋 <span>★</span></div>
  <svg class="glass" viewBox="0 0 400 300" role="img" aria-label="抓娃娃机，移动爪子后按降爪">
    <defs><linearGradient id="claw-glass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#123d47"/><stop offset="1" stop-color="#32665f"/></linearGradient></defs>
    <rect width="400" height="300" rx="10" fill="url(#claw-glass)"/><path d="M15 45H385" stroke="#9dbdc0" stroke-width="5"/><path d="M20 12 120 12 20 115" fill="white" opacity=".06"/>
    <rect x="12" y="253" width="376" height="33" rx="8" fill="#c6a276"/>
    {#each PLUSH_IDS as kind, i}<g transform={`translate(${12 + i * 75}, 174)`}><foreignObject width="75" height="83"><PlushToy {kind} label={names[i]}/></foreignObject></g>{/each}
    <g transform={`translate(${45 + session.position * 310},45)`}><g class:grabbing>
      <path d="M0 0V42" stroke="#ded3b6" stroke-width="4"/><rect x="-13" y="37" width="26" height="14" rx="5" fill="#e6c778"/>
      <path d="m-8 49-21 26 10 14m27-40 21 26-10 14M0 49v33l-5 8" fill="none" stroke="#d6e6da" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      {#if session.phase === "ready" && !session.forfeited && session.success}<g transform="translate(-25,80)"><foreignObject width="50" height="55"><PlushToy kind={session.plushId}/></foreignObject></g>{/if}
    </g></g>
    <rect x="310" y="260" width="64" height="28" rx="6" fill="#15332f"/><text x="342" y="279" fill="#f3d092" font-size="12" text-anchor="middle">取物口</text>
  </svg>
  <div class="console"><span>本轮已付 ¥{session.paid} · 5 分钟</span><span>独立成功率 5%</span></div>
</div>
{#if session.phase === "playing"}
  <div class="controls"><button aria-label="向左移动爪子" disabled={grabbing || !enabled} onclick={() => oninput({type:"claw_move",delta:-.1})}>◀ 左移</button><button class="gold" disabled={grabbing || !enabled} onclick={grab}>{grabbing ? "抓取中…" : "↓ 降爪"}</button><button aria-label="向右移动爪子" disabled={grabbing || !enabled} onclick={() => oninput({type:"claw_move",delta:.1})}>右移 ▶</button></div>
{:else}<p class="outcome">{!session.forfeited && session.success ? `抓中了${names[PLUSH_IDS.indexOf(session.plushId)]}！可以带回家收藏。` : session.forfeited ? "本轮抓取已提前结束。" : "玩偶从爪尖滑下了，下次再试。"}</p>{/if}
<p class="note">左右按钮定位，再按降爪。每轮只有一次抓取，五款玩偶均可收集。</p>

<style>
 .machine{border:3px solid #b98367;border-radius:18px;overflow:hidden;background:#bc775e;box-shadow:0 8px 28px #0003}.marquee{padding:12px;color:#ffe6b0;font-size:20px;font-weight:800;text-align:center;letter-spacing:4px;background:linear-gradient(#cb8c71,#a96655);display:flex;justify-content:space-around;align-items:center}.marquee span{font-size:16px}.glass{width:100%;height:auto;display:block}.console{display:flex;justify-content:space-between;padding:12px 15px;background:#4d514a;color:#f4dfb5;font-size:12px}.grabbing{animation:drop-claw 1.9s ease-in-out both}@keyframes drop-claw{0%,100%{transform:translateY(0)}45%,60%{transform:translateY(125px)}}.controls{display:flex;gap:8px;margin-top:14px}.controls button{flex:1;min-height:48px;border:1px solid #9db5a955;border-radius:10px;background:#24473f;color:#f3e4c9;font:inherit;font-weight:700;cursor:pointer}.controls .gold{background:#d5b374;color:#25382e}.controls button:disabled{opacity:.55;cursor:default}.note{color:#b7c6bd;font-size:12px;line-height:1.7;margin-bottom:0}.outcome{text-align:center;padding:12px;background:#d4b47722;border-radius:10px;color:#f0d298;font-size:14px}@media(max-width:440px){.marquee{font-size:17px;letter-spacing:2px}.console{padding:10px;font-size:11px}}
</style>
