<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { DispatchCfg, DispatchGuestType } from "../../../game/core/minigame";
  import { playSound } from "../../../lib/audio";

  /** 派单/资源匹配模板（D）：排队需求方(旅客/学员) + 资源(房间/训练项目)匹配，满意度与连击驱动结算。
   *  适用于酒店前台 / 驾校助教 —— 同一引擎，仅需求方与资源池不同(通过 labels 切换文案)。 */
  let { cfg, onFinish }: { cfg: DispatchCfg; onFinish: (ratio: number) => void } = $props();

  const guestsTotal = cfg.guestsTotal ?? 12;
  const spawnMs = cfg.spawnMs ?? 6000;
  /** v1.3b2：全局限时（秒）。0 = 不限时（旧行为，接完所有需求方才结束） */
  const timeLimit = cfg.timeLimit ?? 0;
  const patienceMax = cfg.patienceMax ?? 120;
  const L = cfg.labels ?? { guest: "旅客", resource: "房间" };

  interface GuestInst {
    id: number;
    typeKey: string;
    name: string;
    icon: string;
    people: number;
    budget: number;
    patience: number;
    maxPatience: number;
    prefType?: string;
    prefTip?: number;
    state: "waiting" | "served" | "gone";
  }

  interface RoomInst {
    id: number;
    type: string;
    name: string;
    icon: string;
    beds: number;
    price: number;
    occupied: boolean;
    remaining: number;
  }

  let guests = $state<GuestInst[]>([]);
  let rooms = $state<RoomInst[]>([]);
  let satisfaction = $state(100);
  let income = $state(0);
  let combo = $state(0);
  let maxCombo = $state(0);
  let served = $state(0);
  let spawned = $state(0);
  let selectedId = $state<number | null>(null);
  let finished = $state(false);
  let timeLeft = $state(timeLimit);
  let toast = $state("");
  let toastType = $state<"ok" | "bad" | "warn">("ok");
  let guestSeq = 0;
  let spawnAccum = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function showToast(msg: string, t: "ok" | "bad" | "warn" = "ok"): void {
    toast = msg;
    toastType = t;
    setTimeout(() => {
      if (toast === msg) toast = "";
    }, 1800);
  }

  function initRooms(): void {
    rooms = cfg.rooms.map((r, i) => ({
      id: i,
      type: r.type,
      name: r.name,
      icon: r.icon,
      beds: r.beds,
      price: r.price,
      occupied: false,
      remaining: 0,
    }));
  }

  function spawnGuest(): void {
    if (guests.filter((g) => g.state === "waiting").length >= 8) return;
    if (spawned >= guestsTotal) return;
    const t: DispatchGuestType = cfg.guests[Math.floor(Math.random() * cfg.guests.length)];
    const people = t.peopleRange[0] + Math.floor(Math.random() * (t.peopleRange[1] - t.peopleRange[0] + 1));
    const budget = t.budgetRange[0] + Math.floor(Math.random() * (t.budgetRange[1] - t.budgetRange[0] + 1));
    guests = [
      ...guests,
      {
        id: ++guestSeq,
        typeKey: t.typeKey,
        name: t.name,
        icon: t.icon,
        people,
        budget,
        patience: patienceMax,
        maxPatience: patienceMax,
        prefType: t.prefType,
        prefTip: t.prefTip,
        state: "waiting",
      },
    ];
    spawned++;
  }

  function selectGuest(id: number): void {
    selectedId = selectedId === id ? null : id;
  }

  function dismissGuest(id: number): void {
    guests = guests.map((g) => (g.id === id ? { ...g, state: "gone" } : g));
    satisfaction = Math.max(0, satisfaction - 8);
    combo = 0;
    if (selectedId === id) selectedId = null;
    showToast(`已请走该${L.guest}，满意度-8`, "warn");
    playSound("error");
    checkEnd();
  }

  function handleRoom(id: number): void {
    const room = rooms.find((r) => r.id === id);
    if (!room) return;
    if (room.occupied) {
      // 提前退房
      rooms = rooms.map((r) => (r.id === id ? { ...r, occupied: false, remaining: 0 } : r));
      satisfaction = Math.max(0, satisfaction - 5);
      combo = 0;
      showToast("提前退房，满意度-5", "warn");
      checkEnd();
      return;
    }
    if (selectedId == null) {
      showToast(`请先在左侧选择一位${L.guest}`, "warn");
      return;
    }
    assignRoom(id);
  }

  function assignRoom(roomId: number): void {
    const room = rooms.find((r) => r.id === roomId)!;
    const guest = guests.find((g) => g.id === selectedId);
    if (!guest) return;
    const rt = cfg.rooms.find((r) => r.type === room.type)!;
    let satChange = 0;
    let tip = 0;
    let bad = false;

    if (guest.people > rt.beds) {
      satChange -= 20;
      bad = true;
      showToast(`${guest.people}人住${rt.beds}床，床位不足！满意度大降`, "bad");
    } else if (guest.people === rt.beds) {
      satChange += 5;
      tip += 30;
    } else {
      satChange += 2;
    }

    const ratio = rt.price / guest.budget;
    if (ratio > 1.2) {
      satChange -= 10;
      if (!bad) showToast("超出预算，客人不太满意", "warn");
    } else if (ratio <= 1 && ratio >= 0.7) {
      satChange += 3;
      tip += Math.floor(guest.budget * 0.05);
    }

    if (guest.prefType && room.type === guest.prefType) {
      satChange += 5;
      tip += guest.prefTip ?? 0;
      showToast("🎉 完美匹配！额外小费", "ok");
    }

    if (satChange >= 0) {
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      tip += combo * 5;
      if (combo >= 3) showToast(`🔥 ${combo}连击！小费加成`, "ok");
    } else {
      combo = 0;
    }

    const earn = rt.price + tip;
    income += earn;
    served++;
    satisfaction = Math.max(0, Math.min(100, satisfaction + satChange));
    rooms = rooms.map((r) => (r.id === roomId ? { ...r, occupied: true, remaining: 10 + Math.floor(Math.random() * 8) } : r));
    guests = guests.map((g) => (g.id === guest.id ? { ...g, state: "served" } : g));
    selectedId = null;
    playSound("success");
    checkEnd();
  }

  function tick(): void {
    if (finished) return;
    // v1.3b2 全局倒计时（tick 固定 1 秒一次）
    if (timeLimit > 0) {
      timeLeft--;
      if (timeLeft <= 0) {
        finishGame();
        return;
      }
    }
    // 需求方耐心
    let left: GuestInst[] = [];
    guests = guests.map((g) => {
      if (g.state !== "waiting") return g;
      const p = g.patience - 1;
      if (p <= 0) {
        left.push(g);
        return { ...g, patience: 0, state: "gone" as const };
      }
      return { ...g, patience: p };
    });
    if (left.length > 0) {
      satisfaction = Math.max(0, satisfaction - 15 * left.length);
      combo = 0;
      left.forEach((g) => {
        if (selectedId === g.id) selectedId = null;
        showToast(`${g.name}等太久走了，满意度-15`, "bad");
      });
      playSound("error");
    }
    // 资源计时释放
    rooms = rooms.map((r) => {
      if (!r.occupied) return r;
      const rem = r.remaining - 1;
      if (rem <= 0) return { ...r, occupied: false, remaining: 0 };
      return { ...r, remaining: rem };
    });
    // 生成
    spawnAccum += 1000;
    if (spawnAccum >= spawnMs) {
      spawnAccum = 0;
      spawnGuest();
    }
    checkEnd();
  }

  function checkEnd(): void {
    if (finished) return;
    if (satisfaction <= 0) {
      finishGame();
      return;
    }
    if (spawned >= guestsTotal && guests.filter((g) => g.state === "waiting").length === 0) {
      finishGame();
    }
  }

  function finishGame(): void {
    if (finished) return;
    finished = true;
    if (timer) clearInterval(timer);
    /**
     * v1.3b2：分母取「实际上门需求方数」（上限 guestsTotal），
     * 避免限时到点时排队还没生成完就被判低分。未限时时 spawned == guestsTotal，与旧口径一致。
     */
    const denom = Math.max(1, Math.min(guestsTotal, spawned));
    onFinish(Math.min(1, served / denom));
  }

  onMount(() => {
    initRooms();
    spawnGuest();
    spawnGuest();
    spawnGuest();
    timer = setInterval(tick, 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<div class="dg">
  <div class="dg-top">
    {#if timeLimit > 0}
      <span class="dg-stat dg-time" class:urgent={timeLeft <= 5}>⏱ {timeLeft}s</span>
    {/if}
    <span class="dg-stat">📋 {spawned}/{guestsTotal}</span>
    <span class="dg-stat">💰 {income}</span>
    <span class="dg-stat">🔥 {combo}连击</span>
    <span class="dg-sat">
      <span class="dg-sat-bar" style="width:{satisfaction}%;background:{satisfaction > 60 ? 'var(--ok,#7bd88f)' : satisfaction > 30 ? 'var(--accent,#ffd166)' : '#ff8a7a'}"></span>
      <span class="dg-sat-text">😊{Math.round(satisfaction)}%</span>
    </span>
  </div>

  {#if toast}
    <div class="dg-toast" class:bad={toastType === "bad"} class:warn={toastType === "warn"}>{toast}</div>
  {/if}

  <div class="dg-grid">
    <div class="dg-queue">
      <div class="dg-sub">🧳 等待的{L.guest}<span class="dg-count">({guests.filter((g) => g.state === "waiting").length}人)</span></div>
      <div class="dg-guests">
        {#each guests.filter((g) => g.state === "waiting") as g (g.id)}
          {@const pct = (g.patience / g.maxPatience) * 100}
          <div
            class="dg-guest"
            class:sel={g.id === selectedId}
            role="button"
            tabindex="0"
            onclick={() => selectGuest(g.id)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectGuest(g.id);
              }
            }}
          >
            <div class="dg-guest-top">
              <span class="dg-avatar">{g.icon}</span>
              <span class="dg-guest-name">{g.name}</span>
              <span class="dg-people">{g.people}人</span>
            </div>
            <div class="dg-budget">预算 ¥{g.budget}</div>
            <div class="dg-pat">
              <div class="dg-pat-fill" style="width:{pct}%;background:{pct > 60 ? 'var(--ok,#7bd88f)' : pct > 30 ? 'var(--accent,#ffd166)' : '#ff8a7a'}"></div>
            </div>
            <button class="dg-dismiss" onclick={(e) => { e.stopPropagation(); dismissGuest(g.id); }}>请走</button>
          </div>
        {/each}
      </div>
    </div>

    <div class="dg-rooms">
      <div class="dg-sub">🚪 {L.resource}状态</div>
      <div class="dg-roomgrid">
        {#each rooms as r (r.id)}
          <button
            class="dg-room"
            class:occupied={r.occupied}
            onclick={() => handleRoom(r.id)}
          >
            <div class="dg-room-top">
              <span class="dg-room-no">{String(r.id + 1).padStart(2, "0")}</span>
              <span class="dg-room-status">{r.occupied ? "占用" : "空闲"}</span>
            </div>
            <div class="dg-room-icon">{r.icon}</div>
            <div class="dg-room-name">{r.name}</div>
            <div class="dg-room-foot"><span>{r.beds}位</span><span>¥{r.price}</span></div>
            {#if r.occupied}<div class="dg-room-time">剩 {r.remaining}s</div>{/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="dg-tip">先点左侧{L.guest}选中 → 再点右侧空闲{L.resource}分配 · 占用{L.resource}可点击提前退房(满意度-5)</div>
</div>

<style>
  .dg { display: flex; flex-direction: column; gap: 7px; }
  .dg-top {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 800;
    flex-wrap: wrap;
  }
  .dg-stat { color: var(--text-main, #e0e6ed); }
  .dg-time { color: var(--accent, #ffd166); }
  .dg-time.urgent {
    color: #ef5350;
    animation: dgpulse 0.7s ease-in-out infinite;
  }
  @keyframes dgpulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.45; }
  }
  .dg-sat {
    margin-left: auto;
    position: relative;
    flex: 1;
    max-width: 130px;
    height: 14px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 7px;
    overflow: hidden;
  }
  .dg-sat-bar { position: absolute; inset: 0; transition: width 0.3s; }
  .dg-sat-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.55rem;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.6);
  }
  .dg-toast {
    font-size: 0.66rem;
    font-weight: 700;
    padding: 5px 8px;
    border-radius: 6px;
    background: rgba(123, 216, 143, 0.18);
    color: var(--ok, #7bd88f);
    text-align: center;
  }
  .dg-toast.warn { background: rgba(255, 209, 102, 0.18); color: var(--accent, #ffd166); }
  .dg-toast.bad { background: rgba(255, 138, 122, 0.18); color: #ff8a7a; }
  .dg-grid { display: grid; grid-template-columns: 1fr 1.3fr; gap: 8px; }
  .dg-sub { font-size: 0.62rem; color: var(--text-dim, #9aa3c7); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
  .dg-count { text-transform: none; color: var(--text-dim, #9aa3c7); }
  .dg-queue { background: rgba(0, 0, 0, 0.22); border-radius: 8px; padding: 8px; }
  .dg-guests { display: flex; flex-direction: column; gap: 5px; max-height: 230px; overflow-y: auto; }
  .dg-guest {
    background: var(--bg-card, #222842);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 5px 7px;
    cursor: pointer;
    text-align: left;
    color: var(--text-main);
    position: relative;
  }
  .dg-guest.sel { border-color: var(--accent, #ff7676); box-shadow: 0 0 0 2px rgba(255, 118, 118, 0.3); }
  .dg-guest-top { display: flex; align-items: center; gap: 5px; margin-bottom: 3px; }
  .dg-avatar { font-size: 1.1rem; }
  .dg-guest-name { font-size: 0.66rem; font-weight: 700; }
  .dg-people { margin-left: auto; font-size: 0.6rem; color: var(--text-dim, #9aa3c7); }
  .dg-budget { font-size: 0.6rem; color: var(--ok, #7bd88f); font-weight: 700; margin-bottom: 3px; }
  .dg-pat { height: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden; }
  .dg-pat-fill { height: 100%; transition: width 0.3s; }
  .dg-dismiss {
    position: absolute;
    right: 6px;
    bottom: 6px;
    font-size: 0.55rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(255, 138, 122, 0.2);
    color: #ff8a7a;
    border: 1px solid rgba(255, 138, 122, 0.4);
    cursor: pointer;
  }
  .dg-rooms { background: rgba(0, 0, 0, 0.22); border-radius: 8px; padding: 8px; }
  .dg-roomgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .dg-room {
    background: var(--bg-card, #222842);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 5px;
    cursor: pointer;
    color: var(--text-main);
    text-align: left;
  }
  .dg-room.occupied { opacity: 0.55; }
  .dg-room:not(.occupied):hover { border-color: var(--accent, #ffd166); }
  .dg-room-top { display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--text-dim, #9aa3c7); }
  .dg-room-status { color: var(--ok, #7bd88f); }
  .dg-room.occupied .dg-room-status { color: #ff8a7a; }
  .dg-room-icon { font-size: 1.2rem; text-align: center; margin: 2px 0; }
  .dg-room-name { font-size: 0.6rem; text-align: center; font-weight: 700; }
  .dg-room-foot { display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--text-dim, #9aa3c7); margin-top: 2px; }
  .dg-room-time { font-size: 0.5rem; color: #ff8a7a; text-align: center; margin-top: 1px; }
  .dg-tip { font-size: 0.6rem; color: var(--text-dim, #9aa3c7); text-align: center; }
  @media (max-width: 480px) {
    .dg-grid { grid-template-columns: 1fr; }
    .dg-roomgrid { grid-template-columns: repeat(2, 1fr); }
  }
</style>
