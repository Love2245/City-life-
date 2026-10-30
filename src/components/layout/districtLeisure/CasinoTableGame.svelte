<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import PlayingCard from "./PlayingCard.svelte";
  import type { CasinoSession, LeisureInput } from "../../../game/core/districtLeisure";

  let { session, oninput, onbusy = () => {} }: {
    session: CasinoSession; oninput: (input: LeisureInput) => void; onbusy?: (busy: boolean) => void;
  } = $props();
  const wheelNumbers = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const symbols = ["🍒", "🍋", "🔔", "🍀", "💎", "7"];
  let revealing = $state(false), stoppedReels = $state(0);
  let wheelTurn = $state(0);
  const roulette = $derived(session.kind.startsWith("roulette"));
  const ready = $derived(session.phase === "ready");
  const resultVisible = $derived(ready && !revealing);
  const choiceLabel = $derived(typeof session.choice === "number" ? `号码 ${session.choice}` : session.choice === "red" ? "红色" : session.choice === "black" ? "黑色" : session.choice === "high" ? "大" : "小");
  const timers: ReturnType<typeof setTimeout>[] = [];
  function landingAngle(number: number) { return 1800 - (wheelNumbers.indexOf(number) + .5) * 360 / 37; }
  function point(radius: number, angle: number) {
    const radians = (angle - 90) * Math.PI / 180;
    return [160 + Math.cos(radians) * radius, 160 + Math.sin(radians) * radius];
  }
  function wedge(index: number) {
    const a = point(143, index * 360 / 37), b = point(143, (index + 1) * 360 / 37);
    return `M160,160 L${a[0]},${a[1]} A143,143 0 0,1 ${b[0]},${b[1]} Z`;
  }
  function reveal() {
    if (revealing || ready) return;
    revealing = true; stoppedReels = 0; onbusy(true);
    // The stored result is revealed once; presentation never draws a new outcome.
    oninput({ type: "reveal" });
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced ? 160 : session.kind === "slots" ? 2600 : roulette ? 3200 : 1500;
    if (roulette) wheelTurn = landingAngle(session.outcome[0]);
    if (session.kind === "slots") [1250,1700,2150].forEach((time, index) => {
      timers.push(setTimeout(() => stoppedReels = index + 1, reduced ? 0 : time));
    });
    if (session.kind === "high_low") timers.push(setTimeout(() => revealing = false, reduced ? 0 : 700));
    timers.push(setTimeout(() => { revealing = false; onbusy(false); }, duration));
  }
  onMount(() => { if (session.phase === "ready") wheelTurn = landingAngle(session.outcome[0]); });
  onDestroy(() => { timers.forEach(clearTimeout); onbusy(false); });
</script>

<section class="casino-machine" class:roulette class:slots={session.kind === "slots"} aria-label="游戏台">
  <div class="round-strip"><span>本局筹码 <b>{session.bet}</b></span>{#if session.kind !== "slots"}<span>你的选择 <b>{choiceLabel}</b></span>{/if}<span class="live-status"><i class:running={revealing}></i>{revealing ? "正在揭晓" : resultVisible ? "已揭晓" : "准备就绪"}</span></div>
  {#if roulette}
    <div class="roulette-stage">
      <div class="wheel-pointer" aria-hidden="true"></div>
      <svg class="wheel" class:turning={revealing} viewBox="0 0 320 320" style:--turn={`${wheelTurn}deg`} aria-label={resultVisible ? `轮盘结果 ${session.outcome[0]}` : "轮盘"}>
        <circle cx="160" cy="160" r="158" fill="#261f19" stroke="#c0a066" stroke-width="3"/>
        <g class="wheel-rotor">
          {#each wheelNumbers as number, index}
            <path d={wedge(index)} fill={number === 0 ? "#267556" : reds.has(number) ? "#8e3540" : "#17272b"} stroke="#c6b58a66" stroke-width=".6"/>
            {@const label = point(128, (index + .5) * 360 / 37)}
            <text x={label[0]} y={label[1]} transform={`rotate(${(index+.5)*360/37},${label[0]},${label[1]})`} text-anchor="middle" dominant-baseline="middle">{number}</text>
          {/each}
          <circle cx="160" cy="160" r="105" fill="#172f2b" stroke="#b69960" stroke-width="3"/>
          <circle cx="160" cy="160" r="95" fill="none" stroke="#e4d5a822"/>
          <path d="M160 77 V243 M77 160 H243" stroke="#aa8c55" stroke-width="6"/>
          <circle cx="160" cy="160" r="23" fill="#cfb57a" stroke="#f1dfac" stroke-width="2"/>
        </g>
        <circle class="wheel-ball" class:moving={revealing} cx="160" cy="41" r="4" fill="#fff7db"/>
      </svg>
      <div class="wheel-result" class:visible={resultVisible} class:red={reds.has(session.outcome[0])} class:black={session.outcome[0] > 0 && !reds.has(session.outcome[0])}>{resultVisible ? session.outcome[0] : "·"}</div>
    </div>
  {:else if session.kind === "slots"}
    <div class="slot-cabinet" class:spinning={revealing}>
      <div class="slot-marquee"><span>✦</span> LUCKY MOON <span>✦</span></div>
      <div class="slot-reels">
        {#each [0,1,2] as index}
          <div class="reel" class:stopped={resultVisible || stoppedReels > index}>
            {#if revealing && stoppedReels <= index}<div class="reel-strip" style:--speed={`${180 + index*40}ms`}>{#each [...symbols,...symbols] as symbol}<span>{symbol}</span>{/each}</div>
            {:else}<span class="reel-face">{resultVisible || revealing ? symbols[session.outcome[index]] : ["🍒","🔔","7"][index]}</span>{/if}
          </div>
        {/each}
      </div>
      <div class="slot-payline" aria-hidden="true"><span>›</span><span>‹</span></div>
      <div class="slot-base"><span>泊月 · 幸运转轴</span><i></i><i></i><i></i></div>
    </div>
  {:else}
    <div class="comparison-table">
      <div class="comparison-hand"><small>第一张</small><PlayingCard value={resultVisible ? (session.outcome[0] === 14 ? 12 : session.outcome[0] - 2) : undefined}/></div>
      <div class="versus">VS</div>
      <div class="comparison-hand"><small>第二张</small><PlayingCard value={resultVisible ? (session.outcome[1] === 14 ? 25 : session.outcome[1] + 11) : undefined} index={1}/></div>
    </div>
  {/if}
  <div class="machine-action" aria-live="polite">
    {#if resultVisible}<strong class="result-caption">{session.forfeited ? "本局已结束" : roulette ? `落在 ${session.outcome[0]} 号` : session.kind === "slots" ? "转轴已停下" : `${session.outcome[0]} 与 ${session.outcome[1]}`}</strong><span>确认结算后返回牌桌菜单</span>
    {:else}<button class="machine-trigger" disabled={revealing} onclick={reveal}>{revealing ? (roulette ? "等待轮盘停下…" : session.kind === "slots" ? "转轴滚动中…" : "正在翻牌…") : roulette ? "转动轮盘" : session.kind === "slots" ? "拉下旋杆" : "翻开牌面"}<span>{revealing ? "· · ·" : "→"}</span></button>{/if}
  </div>
</section>

<style>
 .casino-machine{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(12px,3vh,26px);width:100%;color:#ebe6d7}.round-strip{display:flex;justify-content:center;align-items:center;gap:28px;font-size:11px;color:#aabeb1}.round-strip b{color:#f0d89a;font-size:15px;margin-left:7px}.live-status{display:flex;align-items:center;gap:7px}.live-status i{width:6px;height:6px;border-radius:50%;background:#9bd2a2}.live-status i.running{background:#e5c680;animation:blink .65s infinite alternate}.roulette-stage{position:relative;width:min(40vh,340px,70vw);aspect-ratio:1;filter:drop-shadow(0 20px 20px #00170d88)}.wheel{width:100%;height:100%;overflow:visible}.wheel-rotor{transform-origin:160px 160px;transform:rotate(var(--turn))}.wheel.turning .wheel-rotor{transition:transform 3.1s cubic-bezier(.15,.6,.12,1)}.wheel-result.black.visible{background:#15242c}.wheel text{font:600 9px Georgia;fill:#fff3d8}.wheel-pointer{position:absolute;top:-7px;left:calc(50% - 8px);border-left:8px solid transparent;border-right:8px solid transparent;border-top:18px solid #efcc85;z-index:2;filter:drop-shadow(0 2px 2px #000)}.wheel-ball.moving{transform-origin:160px 160px;animation:ball-spin 1.1s cubic-bezier(.3,.1,.6,.8) 2}.wheel-result{position:absolute;inset:38%;display:grid;place-items:center;background:#153d31;border:2px solid #d4bb80;border-radius:50%;color:#d9c99b;font:700 clamp(20px,4vh,36px) Georgia;box-shadow:0 4px 10px #0006;transition:background .4s,transform .4s}.wheel-result.visible{background:#28744c;animation:result-pop .4s ease-out}.wheel-result.red.visible{background:#8e3540}.slot-cabinet{position:relative;width:min(600px,85vw);padding:20px 22px 12px;box-sizing:border-box;border:2px solid #bfa16b;border-radius:25px 25px 12px 12px;background:linear-gradient(130deg,#30282a,#192521 50%,#29231b);box-shadow:0 25px 50px #0005,inset 0 0 0 5px #e0c88a12}.slot-marquee{display:flex;justify-content:space-between;align-items:center;color:#f4d995;letter-spacing:5px;font:600 clamp(17px,3vw,24px) Georgia;margin:0 8px 19px;text-shadow:0 0 15px #ddb86844}.slot-marquee span{font-size:17px}.slot-reels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:10px;background:#0c1416;border-radius:12px;border:1px solid #958254}.reel{position:relative;height:clamp(85px,18vh,165px);overflow:hidden;border-radius:7px;background:linear-gradient(#c9c2ac,#faf6e9 30%,#f0ead7 70%,#b2ad9d);box-shadow:inset 0 4px 12px #0005}.reel:after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(#171c2544,transparent 30%,transparent 70%,#171c2555)}.reel span{height:clamp(85px,18vh,165px);display:grid;place-items:center;font:800 clamp(42px,9vh,76px) Georgia;color:#a02e36;text-shadow:0 3px #ffffff88}.reel-strip{animation:reel-roll var(--speed) linear infinite}.reel.stopped .reel-face{animation:reel-stop .3s ease-out}.slot-payline{position:absolute;top:57%;left:7px;right:7px;display:flex;justify-content:space-between;color:#f5d280;font:700 25px Georgia;pointer-events:none}.slot-base{display:flex;align-items:center;gap:7px;padding:12px 9px 0;color:#b9b399;font-size:10px;letter-spacing:2px}.slot-base span{margin-right:auto}.slot-base i{height:5px;width:5px;border-radius:50%;background:#caac71}.spinning .slot-base i{animation:blink .35s infinite alternate}.slot-base i:nth-child(3){animation-delay:.15s}.slot-base i:nth-child(4){animation-delay:.3s}.comparison-table{display:flex;align-items:center;justify-content:center;gap:clamp(25px,7vw,80px);padding:25px 20px;--card-width:clamp(85px,17vh,150px)}.comparison-hand{display:flex;flex-direction:column;align-items:center;gap:13px}.comparison-hand small{color:#b8c6b5;font-size:12px}.versus{color:#d3bc7e;font:600 24px Georgia;letter-spacing:3px}.machine-action{min-height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;width:min(360px,85vw)}.machine-trigger{display:flex;justify-content:space-between;align-items:center;gap:20px;width:100%;min-height:48px;padding:12px 22px;border:1px solid #e5d2a0;border-radius:9px;background:linear-gradient(110deg,#ebd39a,#bea06a);color:#26332a;font:inherit;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 0 #82653b,0 8px 25px #0003;transition:transform .15s,filter .2s}.machine-trigger:hover:not(:disabled){filter:brightness(1.08);transform:translateY(-2px)}.machine-trigger:active:not(:disabled){transform:translateY(2px)}.machine-trigger:disabled{opacity:.7;cursor:wait;box-shadow:0 2px 0 #82653b}.machine-action>span{color:#a9bdaf;font-size:11px}.result-caption{font:600 21px Georgia;color:#f3d597;animation:result-pop .4s ease-out}.machine-trigger:focus-visible{outline:2px solid #f9deb0;outline-offset:4px}@keyframes reel-roll{to{transform:translateY(-50%)}}@keyframes reel-stop{0%{transform:translateY(-15px)}65%{transform:translateY(7px)}100%{transform:none}}@keyframes ball-spin{to{transform:rotate(-720deg)}}@keyframes blink{to{opacity:.3}}@keyframes result-pop{from{opacity:0;transform:translateY(8px) scale(.9)}to{opacity:1;transform:none}}
 @media(max-height:500px) and (min-width:600px){.casino-machine{display:grid;grid-template-columns:1fr minmax(230px,35%);grid-template-rows:auto 1fr;gap:8px 25px;width:min(950px,100%);margin:auto}.round-strip{grid-column:1/-1;gap:22px}.roulette-stage{width:min(54vh,250px);justify-self:center}.slot-cabinet{width:min(500px,100%);padding:14px 18px 8px;justify-self:center}.slot-marquee{margin-bottom:10px;font-size:17px}.reel,.reel span{height:clamp(70px,23vh,105px)}.reel span{font-size:48px}.comparison-table{--card-width:70px;padding:5px;gap:45px}.machine-action{width:100%;max-width:300px}.result-caption{font-size:19px}}
 @media(max-width:440px){.round-strip{gap:13px;font-size:10px}.round-strip b{font-size:13px}.slot-cabinet{padding:17px 13px 9px;width:95%}.slot-marquee{letter-spacing:3px;font-size:17px}.slot-reels{gap:7px;padding:7px}.reel,.reel span{height:110px}.reel span{font-size:48px}.roulette-stage{width:min(43vh,78vw)}.comparison-table{--card-width:90px;gap:24px}.versus{font-size:17px}}
 @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
</style>
