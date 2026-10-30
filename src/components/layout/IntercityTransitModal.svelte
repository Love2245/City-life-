<script lang="ts">
  import {sceneLoading} from '../../stores/sceneLoading.svelte';
  import {beginTravelLoading} from '../../stores/sceneLoadingRoute.svelte';
  import { gameState } from "../../stores/gameStore.svelte";
  import { closeModal, showToast } from "../../stores/uiStore.svelte";
  import { playInteractionSound } from "../../lib/audio";
  import {journeySound} from '../../lib/interactionSoundRouting';
  import {transitionRegion} from '../../stores/regionTransition.svelte';
  import { formatMoney } from "../../lib/format";
  import { gameDay } from "../../game/core/calendar";
  import { getLocation, networkTransitPlan, rideNetworkTransit, rideIntercityTicket } from "../../game/core/actions";
  import {
    departureMinutesOf,
    expireMissedTicket,
    formatDeparture,
    networkDestinationsFrom,
    stationModeOf,
    ticketStatus,
    type Departure,
    type IntercityMode,
  } from "../../game/core/transit";

  const station = $derived(getLocation(gameState.locationId));
  const mode = $derived(stationModeOf(gameState.locationId));
  const destinations = $derived(mode ? networkDestinationsFrom(gameState.locationId) : []);
  const ticket = $derived(gameState.intercityTicket);
  const status = $derived(ticketStatus(gameState));
  const destination = $derived(ticket ? getLocation(ticket.destinationStationId) : undefined);
  const isOrigin = $derived(!!ticket && ticket.originStationId === gameState.locationId);
  const canBoard = $derived(!!ticket && isOrigin && status === "due");
  let selectedDestination = $state("");
  $effect(() => {
    if (!destinations.includes(selectedDestination)) selectedDestination = destinations[0] ?? "";
  });
  const plan = $derived(selectedDestination ? networkTransitPlan(gameState, selectedDestination) : undefined);

  function dateTime(value: Departure): string {
    const day = value.day - gameDay(gameState.time);
    return `${day === 0 ? "今天" : day === 1 ? "明天" : `+${day}天`} ${formatDeparture(value)}`;
  }
  function duration(minutes: number): string {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return `${h ? `${h} 小时` : ""}${m ? `${h ? " " : ""}${m} 分钟` : ""}` || "即刻";
  }
  function ticketDepartureText(value: NonNullable<typeof ticket>): string {
    return dateTime({ day: value.departureDay, minute: value.departureMinute });
  }
  function ticketArrivalText(value: NonNullable<typeof ticket>): string {
    const minute = value.departureMinute + Math.round(value.durationHours * 60);
    return dateTime({ day: value.departureDay + Math.floor(minute / 1440), minute: minute % 1440 });
  }
  function scheduleText(m: IntercityMode, allDayHourly = false): string {
    if (m === "bus") return allDayHourly ? "全天每小时一班，整点发车" : "每日 06:00—18:00，每小时一班";
    return `全天每三小时一班：${departureMinutesOf(m).map((minute) => formatDeparture({ day: 0, minute })).join("、")}`;
  }
  function buy():void{transitionRegion(buyNow);}
  function buyNow(): void {
    if(sceneLoading.current)return;
    if (!selectedDestination) return;
    const r = rideNetworkTransit(gameState, selectedDestination);
    if (!r.ok || !r.plan) { showToast(`🚫 ${r.reason ?? "购票失败"}`); return; }
    playInteractionSound(journeySound(r.plan.mode));
    closeModal();
    beginTravelLoading();
    showToast(`${r.plan.routeLabel} · 已支付 ${r.plan.fare} 元，${duration(r.plan.totalMinutes)}后抵达`);
  }
  function board():void{transitionRegion(boardNow);}
  function boardNow(): void {
    if(sceneLoading.current)return;
    const r = rideIntercityTicket(gameState);
    if (!r.ok || !r.ticket) { showToast(`🚫 ${r.reason ?? "现在还不能上车"}`); return; }
    const dest = getLocation(r.ticket.destinationStationId);
    closeModal();
    playInteractionSound(journeySound(r.ticket.mode));
    beginTravelLoading();
    showToast(`已抵达${dest?.name ?? "目标城市边缘"}`);
  }
  function clearMissedTicket(): void {
    if (expireMissedTicket(gameState)) showToast("已清除错过的旧车票，费用不退");
  }
</script>

<div class="transit-overlay" role="dialog" aria-modal="true" aria-label="城际交通">
  <div class="transit-modal">
    <button class="close" aria-label="关闭" onclick={closeModal}>✕</button>
    <div class="eyebrow">城际出行 · 车站售票处</div>
    <div class="title">{station?.icon ?? "🚉"} {station?.name ?? "车站"}</div>
    <div class="subtitle">选择目的地，确认班次、费用与预计抵达时间后出发。</div>

    {#if mode}
      <section class="destinations" aria-label="选择目的地车站">
        <div class="section-label">可直达车站</div>
        {#each destinations as id}
          {@const item = getLocation(id)}
          <button class="destination" class:selected={selectedDestination === id} onclick={() => selectedDestination = id} aria-pressed={selectedDestination === id}>
            <span class="destination-icon">{mode === "train" ? "🚆" : "🚌"}</span>
            <span class="destination-name"><strong>{item?.name ?? id}</strong><small>{item?.regions?.[0] ? "直达 · 无需换乘" : "车站数据待完善"}</small></span>
            <span class="chevron">›</span>
          </button>
        {/each}
      </section>

      {#if plan}
        <section class="route-card" aria-live="polite">
          <div class="route-head"><span>{plan.routeLabel}</span><strong class="fare">{formatMoney(plan.fare)} 元</strong></div>
          <div class="route-stats">
            <div><small>发车时间</small><strong>{dateTime(plan.departure)}</strong></div>
            <div><small>候车时间</small><strong>{duration(plan.waitMinutes)}</strong></div>
            <div><small>车程</small><strong>{duration(plan.travelMinutes)}</strong></div>
            <div><small>预计抵达</small><strong>{dateTime(plan.arrival)}</strong></div>
          </div>
          <div class="schedule">{scheduleText(mode, plan.allDayHourly)}</div>
          <div class="private-route">同路线私家车参考：汽车约 {duration(plan.privateCarMinutes)}；电动车或三轮车约 {duration(plan.privateBikeMinutes)}。自行车不能跨城。</div>
          {#if !plan.ok}<div class="reason">{plan.reason}</div>{/if}
        </section>
      {/if}
    {/if}

    {#if ticket}
      <div class="ticket-card" class:ticket-due={status === "due"} class:ticket-missed={status === "missed"}>
        <div class="ticket-head">🎫 旧存档车票 · {ticket.mode === "train" ? "火车" : "巴士"}</div>
        <div class="ticket-route">{ticketDepartureText(ticket)} 发车 · {destination?.name ?? "目标车站"}</div>
        <div class="ticket-arrival">预计到达：{ticketArrivalText(ticket)}</div>
        {#if status === "pending"}<div class="ticket-status">请在发车时间回到「{getLocation(ticket.originStationId)?.name ?? "购票车站"}」候车。</div>
        {:else if status === "due" && isOrigin}<div class="ticket-status ready">现在可以检票上车</div>
        {:else if status === "due"}<div class="ticket-status">请回到购票车站检票：{getLocation(ticket.originStationId)?.name ?? ticket.originStationId}</div>
        {:else}<div class="ticket-status missed">已错过的车票费用不退，可清除后重新购票。</div>{/if}
      </div>
    {/if}

    <div class="actions">
      {#if canBoard}<button class="primary board-button" onclick={board}>检票上车</button>
      {:else if ticket && status === "missed"}<button class="primary" onclick={clearMissedTicket}>清除错过的旧票</button>
      {:else}<button class="primary" disabled={!mode || !plan?.ok} onclick={buy}>确认购票并出发 · {formatMoney(plan?.fare ?? 0)} 元</button>{/if}
      <button class="secondary" onclick={closeModal}>暂不出发</button>
    </div>
  </div>
</div>

<style>
  .private-route{margin-top:7px;color:#bfd8f2;font-size:10px;line-height:1.55}.transit-overlay{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,5,15,.86);backdrop-filter:blur(10px) brightness(.7)}
  .transit-modal{position:relative;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:24px;border:1px solid rgba(116,171,255,.34);border-radius:18px;background:linear-gradient(145deg,rgba(17,29,56,.98),rgba(7,14,30,.99));color:#f3f6ff;box-shadow:0 24px 70px rgba(0,0,0,.78),inset 0 1px 0 rgba(255,255,255,.08)}
  .close{position:absolute;top:12px;right:12px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:rgba(238,243,255,.78);cursor:pointer}.eyebrow{color:#a9c9ef;font-size:10px;letter-spacing:1.5px}.title{font-size:21px;font-weight:800;margin-top:4px}.subtitle{margin-top:5px;color:rgba(221,230,255,.72);font-size:12px;line-height:1.5}.destinations{display:grid;gap:8px;margin-top:18px}.section-label{font-size:12px;font-weight:800;color:#e2c986}.destination{display:flex;align-items:center;gap:12px;min-height:64px;text-align:left;padding:10px 13px;border:1px solid rgba(194,211,255,.2);border-radius:12px;background:rgba(255,255,255,.055);color:inherit;cursor:pointer}.destination.selected{border-color:#7ec8ff;background:rgba(45,123,185,.22);box-shadow:inset 0 0 0 1px #7ec8ff33}.destination-icon{font-size:21px}.destination-name{display:grid;gap:4px;flex:1}.destination-name strong{font-size:14px}.destination-name small{font-size:10px;color:#a9b8cd}.chevron{font-size:25px;color:#ffd166}.route-card,.ticket-card{margin-top:14px;padding:13px 14px;border-radius:13px;background:rgba(23,51,89,.84);border:1px solid rgba(108,198,255,.34)}.ticket-card{background:rgba(70,55,25,.7);border-color:rgba(255,209,102,.42)}.ticket-card.ticket-due{background:rgba(20,78,62,.78);border-color:rgba(95,210,145,.56)}.ticket-card.ticket-missed{background:rgba(91,31,43,.72);border-color:rgba(255,107,107,.48)}.route-head,.ticket-head{display:flex;justify-content:space-between;gap:10px;font-weight:800}.fare{color:#ffd166;white-space:nowrap}.route-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}.route-stats div{display:grid;gap:4px;padding:9px;border-radius:9px;background:#08162d70}.route-stats small{font-size:10px;color:#aabbd0}.route-stats strong{font-size:12px}.schedule,.ticket-route,.ticket-status,.ticket-arrival{margin-top:8px;font-size:11px;line-height:1.55;color:rgba(238,243,255,.78)}.reason{margin-top:9px;color:#ffaaaa;font-size:12px}.ticket-arrival,.ticket-status.ready{color:#b8ffd4}.ticket-status.missed{color:#ff9d9d}.actions{display:flex;gap:8px;margin-top:16px}.actions button{flex:1;min-height:44px;border-radius:11px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.primary{border:1px solid rgba(255,209,102,.66);background:rgba(255,186,54,.2);color:#fff0b6}.primary:disabled{opacity:.5;cursor:not-allowed}.board-button{border-color:rgba(95,210,145,.72);background:rgba(54,174,113,.24);color:#b8ffd4}.secondary{border:1px solid rgba(194,211,255,.24);background:rgba(255,255,255,.08);color:rgba(231,238,255,.78)}
  @media(max-width:480px){.transit-modal{padding:20px 15px}.route-stats{gap:7px}.route-stats div{padding:8px}.actions{flex-direction:column}.actions button{flex:none}}
</style>
