import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import {
  TICKET_ITEMS,
  daysUntilMatchday,
  expireTicketIfMissed,
  isMatchday,
  matchdayStarted,
  prizeAmount,
  remainingOpponents,
  rankFor,
  startTournament,
  startNextTournamentBattle,
  signupTournament,
  ticketStatusText,
  settleTournamentMatch,
  currentOpponentId,
} from "../src/game/core/tournament";
import {
  getBossDef,
  getTournamentDef,
  startBattle,
  settleBattle,
  tournamentCleared,
} from "../src/game/core/catBattle";
import type { GameState } from "../src/game/types";

/** 收养猫并设为携带，把等级抬到可报名 */
function setupCat(seed = 7, level = 15): GameState {
  const s = createInitialState(seed);
  const pet = adoptCat(s, "orange");
  expect(pet).not.toBeNull();
  setActivePet(s, s.pets[0].uid);
  s.pets[0].level = level;
  return s;
}

/** 把时间推进到指定的 2026-08-xx（0 起：day 1 = 2026-08-01 周六） */
function setDay(s: GameState, day: number, hour: number): void {
  s.time = { day, month: 8, year: 2026, hour, minute: 0, stayedUp: false };
}

/** 强制打完一场胜仗 */
function winBattle(s: GameState, oppId: string, tierId?: string): void {
  startBattle(s, oppId, tierId);
  const b = s.catBattle!;
  b.opponent.hp = 0;
  b.finished = true;
  b.won = true;
  b.phase = "over";
  settleBattle(s);
}

/** 强制打完一场败仗 */
function loseBattle(s: GameState, oppId: string, tierId?: string): void {
  startBattle(s, oppId, tierId);
  const b = s.catBattle!;
  b.player.hp = 0;
  b.finished = true;
  b.won = false;
  b.phase = "over";
  settleBattle(s);
}

describe("v1.33 P4c 赛事报名与门票", () => {
  it("报名扣费并发门票 + 生成按池对手队列", () => {
    const s = setupCat(1, 15);
    const moneyBefore = s.player.money;
    const t = getTournamentDef("tournament_primary")!;
    const r = signupTournament(s, t.id);
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(moneyBefore - t.fee);
    expect(s.inventory[TICKET_ITEMS[t.id]]).toBe(1);
    const entry = s.catTournament!.entry!;
    expect(entry.tierId).toBe(t.id);
    expect(entry.queue.length).toBe((t.pools.normal ?? 0) + (t.pools.intermediate ?? 0) + (t.pools.boss ?? 0));
    // 同场不重复
    expect(new Set(entry.queue).size).toBe(entry.queue.length);
  });

  it("资金不足无法报名", () => {
    const s = setupCat(1, 15);
    s.player.money = 5;
    const r = signupTournament(s, "tournament_advanced");
    expect(r.ok).toBe(false);
    expect(s.catTournament?.entry).toBeUndefined();
  });

  it("已报名未完赛时不可再报其它赛事", () => {
    const s = setupCat(1, 15);
    signupTournament(s, "tournament_primary");
    const r = signupTournament(s, "tournament_mid");
    expect(r.ok).toBe(false);
  });

  it("终极耄耋对决需大师杯冠军解锁", () => {
    const s = setupCat(1, 20);
    const r = signupTournament(s, "ultimate");
    expect(r.ok).toBe(false);
    s.catTournament = { ultimateUnlocked: true, elderKing: false };
    expect(signupTournament(s, "ultimate").ok).toBe(true);
  });
});

describe("v1.33 P4c 赛程时间", () => {
  it("daysUntilMatchday / isMatchday / matchdayStarted", () => {
    const s = setupCat(1, 15);
    setDay(s, 1, 9); // 周六
    expect(daysUntilMatchday(s)).toBe(1);
    expect(isMatchday(s)).toBe(false);
    setDay(s, 2, 9); // 周日 9 点
    expect(daysUntilMatchday(s)).toBe(0);
    expect(isMatchday(s)).toBe(true);
    expect(matchdayStarted(s)).toBe(false);
    setDay(s, 2, 15); // 周日 15 点
    expect(matchdayStarted(s)).toBe(true);
  });

  it("ticketStatusText 展示倒计时", () => {
    const s = setupCat(1, 15);
    setDay(s, 1, 9); // 周六
    signupTournament(s, "tournament_primary");
    expect(ticketStatusText(s)).toBe("距开赛还有 1 天");
    setDay(s, 2, 9); // 周日 9 点
    expect(ticketStatusText(s)).toBe("今天 14:00 开赛");
    setDay(s, 2, 15); // 周日 15 点（已过开赛时刻）
    startTournament(s);
    expect(ticketStatusText(s)).toBe("进行中");
  });
});

describe("v1.33 P4c 开赛与战斗入口", () => {
  it("非开赛时刻无法开赛", () => {
    const s = setupCat(1, 15);
    setDay(s, 2, 9); // 周日 9 点
    signupTournament(s, "tournament_primary");
    const r = startTournament(s);
    expect(r.ok).toBe(false);
    expect(s.catTournament!.entry!.started).toBe(false);
  });

  it("开赛消耗门票并开始第一场对决", () => {
    const s = setupCat(1, 15);
    setDay(s, 2, 15); // 周日 15 点
    signupTournament(s, "tournament_primary");
    const entry = s.catTournament!.entry!;
    expect(s.inventory[TICKET_ITEMS[entry.tierId]]).toBe(1);
    expect(startTournament(s).ok).toBe(true);
    expect(entry.started).toBe(true);
    expect(s.inventory[TICKET_ITEMS[entry.tierId]]).toBeUndefined(); // 门票已消耗

    const first = currentOpponentId(s);
    expect(first).toBe(entry.queue[0]);
    const r = startNextTournamentBattle(s);
    expect(r.ok).toBe(true);
    expect(s.catBattle!.opponentId).toBe(first);
    expect(s.catBattle!.tournamentId).toBe(entry.tierId);
  });

  it("周日 14:00 未到场 → 门票作废不退款", () => {
    const s = setupCat(1, 15);
    setDay(s, 1, 9); // 周六报名
    signupTournament(s, "tournament_primary");
    const moneyBefore = s.player.money;
    setDay(s, 2, 16); // 周日 16 点仍未开赛
    expireTicketIfMissed(s);
    const entry = s.catTournament!.entry!;
    expect(entry.settled).toBe(true);
    expect(s.inventory[TICKET_ITEMS[entry.tierId]]).toBeUndefined();
    expect(s.player.money).toBe(moneyBefore); // 不退款
  });
});

describe("v1.33 P4c 名次与奖金", () => {
  it("连胜 3 场 = 冠军：10× 门票 + 通关标记", () => {
    const s = setupCat(3, 20);
    setDay(s, 2, 15);
    const t = getTournamentDef("tournament_primary")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    startTournament(s);
    const moneyBefore = s.player.money;
    for (const oppId of [...entry.queue]) winBattle(s, oppId, t.id);
    expect(entry.rank).toBe(1);
    expect(entry.settled).toBe(true);
    expect(entry.prizeMoney).toBe(t.fee * 10);
    // 奖金 10× 门票已入账（总金额还含 3 场胜仗的战斗奖励）
    expect(s.player.money).toBeGreaterThanOrEqual(moneyBefore + t.fee * 10);
    expect(tournamentCleared(s, t.id)).toBe(true);
  });

  it("胜 2 场后输 → 亚军：2× 门票", () => {
    const s = setupCat(3, 20);
    setDay(s, 2, 15);
    const t = getTournamentDef("tournament_primary")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    startTournament(s);
    winBattle(s, entry.queue[0], t.id);
    winBattle(s, entry.queue[1], t.id);
    loseBattle(s, entry.queue[2], t.id);
    expect(entry.rank).toBe(2);
    expect(entry.prizeMoney).toBe(t.fee * 2);
    expect(tournamentCleared(s, t.id)).toBe(false);
  });

  it("首场即输 → 第 4 名无奖金", () => {
    const s = setupCat(3, 20);
    setDay(s, 2, 15);
    const t = getTournamentDef("tournament_primary")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    startTournament(s);
    const moneyBefore = s.player.money;
    loseBattle(s, entry.queue[0], t.id);
    expect(entry.rank).toBe(4);
    expect(entry.prizeMoney).toBe(0);
    expect(s.player.money).toBe(moneyBefore);
  });
});

describe("v1.33 P4c 大师杯 → 终极耄耋对决 → 耄耋之王", () => {
  it("大师杯夺冠解锁终极耄耋对决", () => {
    const s = setupCat(3, 25);
    setDay(s, 2, 15);
    const t = getTournamentDef("tournament_advanced")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    startTournament(s);
    for (const oppId of [...entry.queue]) winBattle(s, oppId, t.id);
    expect(entry.rank).toBe(1);
    expect(s.catTournament!.ultimateUnlocked).toBe(true);
  });

  it("终极赛冠军（含圆头猫咪）获得耄耋之王称号", () => {
    const s = setupCat(3, 25);
    setDay(s, 2, 15);
    s.catTournament = { ultimateUnlocked: true, elderKing: false };
    const t = getTournamentDef("ultimate")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    // 终极赛队列末位必须是圆头猫咪
    expect(entry.queue[entry.queue.length - 1]).toBe(getBossDef().id);
    startTournament(s);
    for (const oppId of [...entry.queue]) winBattle(s, oppId, t.id);
    expect(entry.rank).toBe(1);
    expect(s.catTournament!.elderKing).toBe(true);
    expect(s.catFlags["elder_king"]).toBe(true);
  });
});

describe("v1.33 P4c 辅助计算", () => {
  it("prizeAmount / rankFor", () => {
    const t = getTournamentDef("tournament_primary")!;
    expect(prizeAmount(t, 1)).toBe(t.fee * 10);
    expect(prizeAmount(t, 2)).toBe(t.fee * 2);
    expect(prizeAmount(t, 3)).toBe(t.fee * 1);
    expect(prizeAmount(t, 4)).toBe(0);
    const entry = { beaten: [] as string[], queue: ["a", "b", "c"] };
    expect(rankFor(entry as never)).toBe(4);
    entry.beaten.push("a");
    expect(rankFor(entry as never)).toBe(3);
    entry.beaten.push("b");
    expect(rankFor(entry as never)).toBe(2);
    entry.beaten.push("c");
    expect(rankFor(entry as never)).toBe(1);
  });

  it("remainingOpponents 随胜利递减", () => {
    const s = setupCat(3, 20);
    setDay(s, 2, 15);
    const t = getTournamentDef("tournament_primary")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    expect(remainingOpponents(s)).toBe(3);
    entry.started = true;
    winBattle(s, entry.queue[0], t.id);
    expect(remainingOpponents(s)).toBe(2);
  });
});

describe("v1.39 赛事连胜生命值延续", () => {
  it("战胜第一场后保留剩余生命，第二场以当前生命开局", () => {
    const s = setupCat(3, 20);
    setDay(s, 2, 15);
    const t = getTournamentDef("tournament_primary")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    startTournament(s);
    // 第一场：把玩家打到残血再获胜
    startBattle(s, entry.queue[0], t.id);
    const b1 = s.catBattle!;
    b1.player.hp = Math.round(b1.player.attrs.hp * 0.4);
    b1.opponent.hp = 0;
    b1.finished = true;
    b1.won = true;
    b1.phase = "over";
    settleBattle(s);
    // 战后保留剩余生命（不恢复满）
    const pet = s.pets[0];
    expect(pet.curHp).toBe(Math.round(b1.player.attrs.hp * 0.4));
    // 第二场：以当前生命开局
    const r2 = startNextTournamentBattle(s);
    expect(r2.ok).toBe(true);
    expect(s.catBattle!.player.hp).toBe(pet.curHp);
    expect(s.catBattle!.player.hp).toBeLessThan(s.catBattle!.player.attrs.hp);
  });

  it("连胜 3 场才结束，中途不结算", () => {
    const s = setupCat(3, 20);
    setDay(s, 2, 15);
    const t = getTournamentDef("tournament_primary")!;
    signupTournament(s, t.id);
    const entry = s.catTournament!.entry!;
    startTournament(s);
    winBattle(s, entry.queue[0], t.id);
    // 只赢一场：赛事未结束，仍有下一场对手
    expect(entry.settled).toBe(false);
    expect(currentOpponentId(s)).toBe(entry.queue[1]);
    winBattle(s, entry.queue[1], t.id);
    expect(entry.settled).toBe(false);
    expect(currentOpponentId(s)).toBe(entry.queue[2]);
    winBattle(s, entry.queue[2], t.id);
    expect(entry.settled).toBe(true);
    expect(entry.rank).toBe(1);
  });
});
