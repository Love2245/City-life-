import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { calendarMonthCells, calendarEventsOf, calendarCountdown } from '../src/game/core/phoneCalendar';
import { gameDay, fromLinearDay, START_EPOCH, weekdayOf } from '../src/game/core/calendar';
import { applyForJob, getJobDef } from '../src/game/core/jobs';
import { scheduledWorkShift } from '../src/game/core/workSchedule';
import type { Quest } from '../src/game/types';

const task = (id = 'zhao_toy', at = 7 * 1440 + 16 * 60): Quest => ({
  id: `task:${id}`, type: 'story', title: '已接受的委托', icon: '📦', desc: '', day: 0, status: 'active',
  npcTask: { taskId: id as 'zhao_toy', stage: 'seeking', acceptedAt: 0, deadlineAt: at, revision: 1, data: {} },
});
function ready() {
  const state = createInitialState(792);
  state.time = { ...state.time, year: 2026, month: 8, day: 3, hour: 7, minute: 0 };
  state.player.stats.intelligence = 100;
  state.flags.item_laptop_pro = true;
  return state;
}

describe('手机日历与真实游戏时钟', () => {
  it('使用游戏的30天月份、连续星期和跨年日期', () => {
    const august = calendarMonthCells(2026, 8);
    expect(august.length % 7).toBe(0);
    expect(august.filter(cell => cell.inMonth)).toHaveLength(30);
    expect(august.findIndex(cell => cell.date.month === 8 && cell.date.day === 1)).toBe(weekdayOf({ year: 2026, month: 8, day: 1 }));
    const december = calendarMonthCells(2026, 12);
    const last = december.findIndex(cell => cell.inMonth && cell.date.day === 30);
    expect(fromLinearDay(START_EPOCH + december[last].day + 1)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(calendarMonthCells(2026, 9).find(cell => cell.inMonth && cell.date.day === 1)!.day).toBe(30);
  });
  it('办公室一周排班跳过周末，发薪沿用实际七日合同', () => {
    const state = ready(), office = getJobDef('job_office_assistant')!;
    expect(applyForJob(state, office).ok).toBe(true);
    const today = gameDay(state.time), events = calendarEventsOf(state, today, today + 8);
    const shifts = events.filter(event => event.kind === 'work');
    expect(shifts).toHaveLength(6);
    expect(shifts.every(event => weekdayOf(fromLinearDay(START_EPOCH + Math.floor(event.at / 1440))) < 5)).toBe(true);
    expect(shifts[0]).toMatchObject({ at: scheduledWorkShift(office, today).startMinute, endAt: scheduledWorkShift(office, today).endMinute });
    expect(events.find(event => event.kind === 'pay')?.at).toBe(state.career.nextPayDay! * 1440);
    state.career.nextShiftDay = today + 1;
    expect(calendarEventsOf(state, today, today + 1).some(event => event.kind === 'work')).toBe(false);
  });
  it('新接任务立即出现精确到分钟的最晚交付时间，完成与退役任务不显示', () => {
    const state = ready(); state.quests.push(task(), task('farmer_delivery'));
    const deadline = calendarEventsOf(state, 0, 30).find(event => event.id === 'task:task:zhao_toy');
    expect(deadline).toMatchObject({ at: 7 * 1440 + 16 * 60, deadline: true });
    expect(calendarEventsOf(state, 0, 30).some(event => event.id.includes('farmer_delivery'))).toBe(false);
    state.quests.find(quest => quest.npcTask?.taskId === 'zhao_toy')!.status = 'done';
    expect(calendarEventsOf(state, 0, 30).some(event => event.id === 'task:task:zhao_toy')).toBe(false);
  });
  it('按时报人后显示次日结果提醒，不再显示已经完成的交付倒计时', () => {
    const state = ready(), quest = task('zhao_staff');
    quest.npcTask!.stage = 'await_staff_result';
    quest.npcTask!.data.staff = { askedNpcIds: [], settlementReadyAt: 4 * 1440 };
    state.quests.push(quest);
    const event = calendarEventsOf(state, 0, 30).find(event => event.id === 'task-result:task:zhao_staff')!;
    expect(event.at).toBe(4 * 1440); expect(event.deadline).toBeUndefined();
    state.time.day = 6;
    const readyEvent = calendarEventsOf(state, 0, 30).find(event => event.id === 'task-result:task:zhao_staff')!;
    expect(readyEvent.status).toBe('ongoing'); expect(calendarCountdown(readyEvent, 5 * 1440 + 7 * 60)).toBe('可办理');
  });
  it('租金从实际续缴日滚动，跨月正确；产权房不产生房租事件', () => {
    const state = ready(); state.living.mode = 'lease';
    state.living.lease = { housingId: 'rental_apartment', rent: 800, rentGrowthCount: 0, nextRentDay: 31 };
    expect(calendarEventsOf(state, 25, 65).filter(event => event.kind === 'rent').map(event => event.at / 1440)).toEqual([31, 61]);
    expect(fromLinearDay(START_EPOCH + 31)).toMatchObject({ month: 9, day: 2 });
    state.living.mode = 'own';
    expect(calendarEventsOf(state, 25, 65).some(event => event.kind === 'rent')).toBe(false);
  });
  it('仅已报名且未结算的赛事出现在真正的比赛日14点', () => {
    const state = ready();
    expect(calendarEventsOf(state, 0, 30).some(event => event.kind === 'match')).toBe(false);
    state.catTournament = { ultimateUnlocked: false, elderKing: false, entry: { tierId: 'tournament_primary', signupDay: 2, fee: 20, started: false, settled: false, roundIndex: 0, beaten: [], queue: [] } };
    const event = calendarEventsOf(state, 0, 30).find(event => event.kind === 'match')!;
    expect(event.at).toBe(8 * 1440 + 14 * 60);
    state.catTournament!.entry.settled = true;
    expect(calendarEventsOf(state, 0, 30).some(event => event.kind === 'match')).toBe(false);
  });
  it('午夜到期、跨日班次和实时倒计时使用同一绝对分钟', () => {
    const deadline = { id: 'x', kind: 'task' as const, title: '', detail: '', at: 1440, deadline: true };
    expect(calendarCountdown(deadline, 1439)).toBe('1 分钟后');
    expect(calendarCountdown(deadline, 1440)).toBe('现在');
    expect(calendarCountdown(deadline, 1441)).toBe('已到期');
    expect(calendarCountdown({ ...deadline, kind: 'work', at: 20 * 60, endAt: 26 * 60 }, 25 * 60)).toBe('进行中');
  });
  it('查看任意月份和重复计算不修改存档、钱、时间或随机数', () => {
    const state = ready(); applyForJob(state, getJobDef('job_office_assistant')!); state.quests.push(task());
    const before = JSON.stringify(state);
    for (const start of [0, 30, 360, -30]) calendarEventsOf(state, start, start + 42);
    expect(JSON.stringify(state)).toBe(before);
  });
});
