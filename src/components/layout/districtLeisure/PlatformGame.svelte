<script lang="ts">
  import { onDestroy } from "svelte";
  import { PLATFORM_LEVEL, platformEnemyPositions, type PlatformSession, type LeisureInput } from "../../../game/core/districtLeisure";
  let { session, oninput, onpause, enabled }: { session: PlatformSession; oninput: (input: LeisureInput) => void; onpause: () => void; enabled: boolean } = $props();
  let running = $state(false), left = $state(false), right = $state(false);
  let jumpPending = false, frame = 0, last = 0;
  const camera = $derived(Math.max(0, Math.min(1800, session.x - 160)));
  const enemies = $derived(platformEnemyPositions(session));
  function pause() { if (running) { running = false; onpause(); } left = false; right = false; jumpPending = false; cancelAnimationFrame(frame); last = 0; }
  function loop(now: number) {
    if (!running || !enabled || document.hidden || session.phase !== "playing") { pause(); return; }
    if (last) { oninput({ type: "platform_tick", dtMs: Math.min(50, now - last), move: left === right ? 0 : left ? -1 : 1, jump: jumpPending }); jumpPending = false; }
    last = now; frame = requestAnimationFrame(loop);
  }
  function toggle() { if (running) pause(); else if (enabled && session.phase === "playing") { running = true; last = 0; frame = requestAnimationFrame(loop); } }
  function press(event: KeyboardEvent) {
    if (!enabled || !running || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "a", "A", "d", "D", "w", "W"].includes(event.key)) event.preventDefault();
    if (["ArrowLeft", "a", "A"].includes(event.key)) left = true;
    if (["ArrowRight", "d", "D"].includes(event.key)) right = true;
    if (!event.repeat && ["ArrowUp", " ", "w", "W"].includes(event.key)) jumpPending = true;
  }
  function release(event: KeyboardEvent) { if (["ArrowLeft", "a", "A"].includes(event.key)) left = false; if (["ArrowRight", "d", "D"].includes(event.key)) right = false; }
  function move(event: PointerEvent, direction: -1 | 1) { if (!running) return; event.preventDefault(); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); if (direction < 0) left = true; else right = true; }
  $effect(() => { if (!enabled || session.phase !== "playing") pause(); });
  onDestroy(() => { cancelAnimationFrame(frame); });
</script>

<svelte:window onkeydown={press} onkeyup={release} onblur={pause}/>
<svelte:document onvisibilitychange={() => { if (document.hidden) pause(); }}/>
<div class="hud"><span>♥ {session.lives} / 3</span><span>★ {session.collected.length} / {PLATFORM_LEVEL.coins.length}</span><span>{Math.max(0, Math.ceil((PLATFORM_LEVEL.limitMs - session.elapsedMs) / 1000))} 秒</span></div>
<div class="viewport">
  <svg viewBox={`${camera} 0 600 420`} role="img" aria-label={`泊月街平台关卡，剩余${session.lives}条生命，已收集${session.collected.length}枚星币`}>
    <defs><linearGradient id="platform-sky" x2="0" y2="1"><stop stop-color="#173e4f"/><stop offset="1" stop-color="#668780"/></linearGradient><pattern id="platform-brick" width="36" height="20" patternUnits="userSpaceOnUse"><rect width="36" height="20" fill="#aa775b"/><path d="M0 20h36M18 0v20" stroke="#d2aa78" stroke-width="2"/></pattern></defs>
    <rect x={camera} width="600" height="420" fill="url(#platform-sky)"/><circle cx={camera + 450} cy="72" r="32" fill="#ffe2ae" opacity=".9"/>
    {#each [0,1,2,3,4,5,6,7,8,9,10,11,12] as i}<g transform={`translate(${i * 210}, 105)`} opacity=".4"><rect x="0" y="50" width="85" height="180" fill="#1d3c42"/><rect x="92" y="0" width="98" height="230" fill="#29494d"/>{#each [0,1,2,3] as j}<rect x="18" y={70 + j * 33} width="15" height="10" fill="#f3cd8d"/><rect x="121" y={20+j*44} width="25" height="12" fill="#f3cd8d"/>{/each}</g>{/each}
    <path d={`M${camera} 389q70-20 140 0t140 0t140 0t180 0v31h-600Z`} fill="#263f42"/>
    {#each PLATFORM_LEVEL.platforms as p}<rect x={p.x} y={p.y} width={p.width} height={420 - p.y} fill="url(#platform-brick)"/><rect x={p.x} y={p.y} width={p.width} height="10" rx="3" fill="#94bd82"/>{/each}
    {#each PLATFORM_LEVEL.coins as coin, index}{#if !session.collected.includes(index)}<g transform={`translate(${coin.x},${coin.y})`}><ellipse rx="10" ry="13" fill="#f3c864" stroke="#ffe6a2" stroke-width="2"/><path d="M0-7v14" stroke="#b07e33" stroke-width="2"/></g>{/if}{/each}
    {#each enemies as enemy}{#if !enemy.defeated}<g transform={`translate(${enemy.x},${enemy.y})`}><path d="M0 15q0-16 12-16t12 16v9H0Z" fill="#ba6671"/><circle cx="7" cy="10" r="3" fill="#fff0cd"/><circle cx="17" cy="10" r="3" fill="#fff0cd"/><circle cx="8" cy="10" r="1.5" fill="#25383a"/><circle cx="16" cy="10" r="1.5" fill="#25383a"/><path d="M-2 24h11m6 0h11" stroke="#33403c" stroke-width="4"/></g>{/if}{/each}
    <path d="M2343 155v175" stroke="#f5dfbb" stroke-width="4"/><path d="m2345 157 42 15-42 17" fill="#ebad69"/><text x="2343" y="142" text-anchor="middle" fill="#fff0c9" font-size="15">终点</text>
    <g transform={`translate(${session.x},${session.y})`} opacity={session.invulnerableMs > 0 && Math.floor(session.elapsedMs / 120) % 2 === 0 ? .35 : 1}><path d="M3 10h23v17H3Z" fill="#e5ae5f"/><rect x="4" y="0" width="23" height="12" rx="5" fill="#edcab0"/><path d="M1 5h29L25-2H8Z" fill="#58ab96"/><rect x="7" y="19" width="15" height="9" fill="#3d7380"/><path d="M5 29h9m5 0h9" stroke="#263e3e" stroke-width="4"/><circle cx={session.vx < 0 ? 9 : 22} cy="8" r="2" fill="#263b37"/><path d="M6 14h18" stroke="#d08258" stroke-width="2"/></g>
  </svg>
  {#if !running && session.phase === "playing"}<div class="pause-card"><strong>跃过泊月街</strong><span>{session.elapsedMs > 0 ? "进度已保存，按继续回到这一刻" : "躲过路障，跳上街台，抵达月光下的终点"}</span><button onclick={toggle}>▶ {session.elapsedMs > 0 ? "继续游戏" : "开始跑跳"}</button></div>{/if}
</div>
<div class="controls"><button class="move" aria-label="按住向左移动" disabled={!running} onpointerdown={event => move(event,-1)} onpointerup={() => left = false} onpointercancel={() => left = false} onlostpointercapture={() => left = false}>◀ 左</button><button class="move" aria-label="按住向右移动" disabled={!running} onpointerdown={event => move(event,1)} onpointerup={() => right = false} onpointercancel={() => right = false} onlostpointercapture={() => right = false}>右 ▶</button><button class="jump" disabled={!running} onpointerdown={(event) => { event.preventDefault(); jumpPending = true; }} onclick={event => { if (event.detail === 0) jumpPending = true; }}>↑ 跳跃</button><button disabled={session.phase !== "playing"} onclick={toggle}>{running ? "Ⅱ 暂停" : "▶ 继续"}</button></div>
{#if session.phase === "ready"}<p class="finished">{session.complete ? "抵达终点！" : session.lives === 0 ? "三次机会用完，本轮结束。" : "本轮时间到。"} </p>{/if}
<p class="note">按住左右按钮移动，点击跳跃；键盘 ← → / A D 移动，空格 / ↑ 跳跃。</p>

<style>
 .hud{display:flex;justify-content:space-between;color:#f4d59c;font-size:13px;font-weight:700;padding:0 3px 10px}.viewport{position:relative;border:2px solid #bda07577;border-radius:15px;overflow:hidden;background:#173e4f}.viewport svg{display:block;width:100%;height:auto}.pause-card{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;background:#10272ab8;padding:20px;text-align:center;color:#f5e6c7}.pause-card strong{font-size:23px;letter-spacing:2px}.pause-card span{font-size:12px;line-height:1.6}.pause-card button,.controls button{min-height:46px;border:1px solid #aac3b466;border-radius:9px;padding:8px 16px;background:#244a42;color:#f4e9d4;font:inherit;font-weight:700;cursor:pointer}.pause-card button{background:#d6b879;color:#24392f;min-width:160px}.controls{display:flex;gap:8px;margin-top:12px;touch-action:none}.controls button{flex:1;padding:8px 5px;font-size:13px;user-select:none}.controls .jump{background:#c7aa72;color:#263c33}.controls button:disabled{opacity:.45;cursor:default}.note{font-size:12px;line-height:1.8;color:#b7c4bf;margin-bottom:0}.finished{background:#d4b47722;color:#f3d698;border-radius:9px;padding:12px;font-size:14px}@media(max-width:440px){.pause-card{gap:10px;padding:12px}.pause-card strong{font-size:18px}.controls{gap:6px}.controls button{font-size:12px;min-height:48px}}
</style>
