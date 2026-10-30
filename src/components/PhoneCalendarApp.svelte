<script lang="ts">
  import { untrack } from 'svelte';
  import { gameState } from '../stores/gameStore.svelte';
  import { START_EPOCH, fromLinearDay, gameDay, linearDay, WEEKDAY_LABEL } from '../game/core/calendar';
  import { calendarMonthCells, calendarEventsOf, calendarCountdown, CALENDAR_KIND_LABEL, type CalendarEvent } from '../game/core/phoneCalendar';

  let { onBack = () => {} }: { onBack?: () => void } = $props();
  let monthStart = $state(untrack(() => linearDay({ ...gameState.time, day: 1 })));
  let selected = $state(untrack(() => gameDay(gameState.time)));
  let showAll = $state(false);
  const today = $derived(gameDay(gameState.time));
  const now = $derived(today * 1440 + gameState.time.hour * 60 + gameState.time.minute);
  const month = $derived(fromLinearDay(monthStart));
  const cells = $derived(calendarMonthCells(month.year, month.month));
  const events = $derived(calendarEventsOf(gameState, cells[0].day, cells[cells.length - 1].day + 1));
  const byDay = $derived.by(() => {
    const result = new Map<number, CalendarEvent[]>();
    for (const event of events) { const day = Math.floor(event.at / 1440); result.set(day, [...(result.get(day) ?? []), event]); }
    return result;
  });
  const selectedDate = $derived(fromLinearDay(START_EPOCH + selected));
  const selectedEvents = $derived(byDay.get(selected) ?? []);
  const upcoming = $derived.by(() => {
    const upcomingEvents = calendarEventsOf(gameState, today - 30, today + 61)
      .filter(event => event.status !== 'done' && (event.at >= now || event.deadline || event.status === 'ongoing' || (event.endAt ?? 0) > now));
    const nextWork = upcomingEvents.find(event => event.kind === 'work');
    return upcomingEvents.filter(event => event.kind !== 'work' || event === nextWork);
  });
  function choose(day: number) { selected = day; const date = fromLinearDay(START_EPOCH + day); monthStart = linearDay({ ...date, day: 1 }); }
  function turn(delta: number) { monthStart += delta * 30; selected = monthStart - START_EPOCH; }
  function clock(at: number) { const value = ((at % 1440) + 1440) % 1440; return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
  function eventTime(event: CalendarEvent) { if (event.status === 'done') return '已结算'; return `${clock(event.at)}${event.endAt !== undefined ? `—${Math.floor(event.endAt / 1440) > Math.floor(event.at / 1440) ? '次日 ' : ''}${clock(event.endAt)}` : ''}`; }
  function dayLabel(at: number) { const date = fromLinearDay(START_EPOCH + Math.floor(at / 1440)); return `${date.month}月${date.day}日`; }
</script>

<section class="calendar-app" aria-label="日历">
  <header class="app-heading"><button class="back" onclick={onBack}>← 返回</button><strong>日历</strong><button onclick={()=>choose(today)}>今天</button></header>
  <div class="month-heading"><button aria-label="上个月" onclick={()=>turn(-1)}>‹</button><h2>{month.year}年 {month.month}月</h2><button aria-label="下个月" onclick={()=>turn(1)}>›</button></div>
  <div class="month-grid" role="group" aria-label={`${month.year}年${month.month}月月历`}>
    {#each WEEKDAY_LABEL as weekday}<span class="weekday">{weekday.slice(1)}</span>{/each}
    {#each cells as cell (cell.day)}
      {@const dayEvents = byDay.get(cell.day) ?? []}
      <button class="date-cell" class:outside={!cell.inMonth} class:today={cell.day===today} class:selected={cell.day===selected}
        aria-current={cell.day===today ? 'date' : undefined} aria-pressed={cell.day===selected}
        aria-label={`${cell.date.month}月${cell.date.day}日${cell.day===today ? '，今天' : ''}，${dayEvents.length}项安排`}
        onclick={()=>choose(cell.day)}>
        <span>{cell.date.day}</span><i class="date-dots" aria-hidden="true">{#each [...new Set(dayEvents.map(event=>event.kind))].slice(0,3) as kind}<b data-kind={kind}></b>{/each}</i>
      </button>
    {/each}
  </div>
  <div class="legend" aria-label="日历标记">{#each ['work','task','match','rent','pay','finance'] as kind}<span><b data-kind={kind}></b>{CALENDAR_KIND_LABEL[kind as keyof typeof CALENDAR_KIND_LABEL]}</span>{/each}</div>
  <section class="day-agenda" aria-label="当天安排">
    <h3>{selectedDate.month}月{selectedDate.day}日{selected===today ? ' · 今天' : ''}</h3>
    {#each selectedEvents as event (event.id)}
      <article class="event" data-kind={event.kind}><div><small>{CALENDAR_KIND_LABEL[event.kind]} · {eventTime(event)}</small><strong>{event.title}</strong><p>{event.detail}</p></div><span class="countdown">{calendarCountdown(event,now)}</span></article>
    {:else}<p class="empty">这天没有安排。</p>{/each}
  </section>
  <section class="upcoming" aria-label="近期提醒">
    <h3>近期提醒</h3>
    {#each (showAll ? upcoming : upcoming.slice(0,6)) as event (event.id)}
      <button class="reminder" onclick={()=>choose(Math.floor(event.at/1440))}><b data-kind={event.kind}></b><span><strong>{event.title}</strong><small>{dayLabel(event.at)} · {eventTime(event)}</small></span><em>{calendarCountdown(event,now)}</em></button>
    {:else}<p class="empty">最近没有待办安排。</p>{/each}
    {#if upcoming.length>6}<button class="more" onclick={()=>showAll=!showAll}>{showAll ? '收起' : `查看全部 ${upcoming.length} 项`}</button>{/if}
  </section>
</section>

<style>
  .calendar-app{padding:12px 14px 24px;color:var(--text-main,#edf2ff);font-size:12px;line-height:1.5;min-width:0}
  button{font:inherit;color:inherit;cursor:pointer;border:1px solid var(--border,#ffffff25);background:var(--bg-soft,#ffffff09);border-radius:8px;min-height:32px;padding:5px 9px}
  button:focus-visible{outline:2px solid var(--accent-2,#72c9e5);outline-offset:2px}
  .app-heading,.month-heading{display:flex;align-items:center;justify-content:space-between;gap:6px}.app-heading{margin-bottom:14px}.app-heading strong{font-size:17px}.month-heading h2{font-size:16px;margin:0}.month-heading button{font-size:22px;width:34px;padding:0}
  .month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;margin-top:9px}.weekday{text-align:center;color:var(--text-dim,#9eabc4);padding:5px 0;font-size:11px}.date-cell{padding:3px 0 1px;min-height:37px;border:1px solid transparent;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-variant-numeric:tabular-nums}.outside{opacity:.38}.date-cell.today{color:var(--accent-2,#7dd5e5);font-weight:800}.date-cell.selected{background:color-mix(in srgb,var(--accent-2,#7dd5e5) 20%,transparent);border-color:var(--accent-2,#7dd5e5);opacity:1}
  .date-dots{display:flex;gap:2px;height:4px}.date-dots b,.legend b,.reminder>b{display:inline-block;width:4px;height:4px;border-radius:50%;background:var(--event-color);flex:none}[data-kind="work"]{--event-color:#81b6ef}[data-kind="task"]{--event-color:#f5b85c}[data-kind="match"]{--event-color:#d9a1ed}[data-kind="rent"]{--event-color:#f595a3}[data-kind="pay"]{--event-color:#7fd7b7}
  [data-kind="finance"]{--event-color:#efb573}
  .legend{display:flex;justify-content:center;flex-wrap:wrap;gap:6px 10px;color:var(--text-dim,#a8b4c9);font-size:10px;margin:9px 0 16px}.legend span{display:flex;align-items:center;gap:4px}
  h3{font-size:13px;margin:14px 0 8px}.day-agenda,.upcoming{border-top:1px solid var(--border,#ffffff20)}.event{border-left:2px solid var(--event-color);padding:6px 0 6px 8px;margin:8px 0;display:flex;justify-content:space-between;gap:7px}.event strong{display:block;font-size:12px}.event small,.event p{color:var(--text-dim,#a8b4c9);font-size:11px}.event p{margin:2px 0 0}.countdown{font-size:10px;white-space:nowrap;color:var(--event-color)}.empty{color:var(--text-dim,#a8b4c9);font-size:11px;padding:5px 0}
  .reminder{display:flex;align-items:center;width:100%;gap:7px;border:0;border-bottom:1px solid var(--border,#ffffff12);border-radius:0;background:transparent;text-align:left;padding:9px 0}.reminder span{display:flex;flex-direction:column;flex:1;min-width:0}.reminder strong{font-size:11px;font-weight:600}.reminder small{font-size:10px;color:var(--text-dim,#a8b4c9)}.reminder em{font-style:normal;font-size:10px;color:var(--accent-2,#7dd5e5)}.more{width:100%;margin-top:9px;font-size:11px}
  :global(:root[data-game-mode="mobile"]) .date-cell{min-height:38px}:global(:root[data-game-mode="mobile"]) .app-heading button{min-height:40px}
</style>
