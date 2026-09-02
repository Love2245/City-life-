import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import {
  catMaxHp,
  catCurHp,
  catDowned,
  tickCatCareDaily,
} from "../src/game/core/catCare";
import {
  startBattle,
  fleeCasualBattle,
} from "../src/game/core/catBattle";
import { equipAccessory } from "../src/game/core/catAccessory";
import { signupCheck } from "../src/game/core/tournament";
import { replySms } from "../src/game/core/phone";
import { gameDay } from "../src/game/core/calendar";
import { advanceHours } from "../src/game/core/time";

function setupCat(catId = "orange", seed = 7) {
  const s = createInitialState(seed);
  const pet = adoptCat(s, catId);
  expect(pet).not.toBeNull();
  setActivePet(s, s.pets[0].uid);
  return s;
}

describe("v1.395 缺陷修复回归", () => {
  it("B1 佩戴 maxHpPct 饰品不把残血拉满（保留已损失血量）", () => {
    const s = setupCat();
    const pet = s.pets[0];
    s.ownedAccessories["ac_crown"] = 1; // 先拥有饰品，再佩戴
    const r0 = equipAccessory(s, pet.uid, "ac_crown"); // 王者之冠 maxHpPct = 0.1
    expect(r0.ok).toBe(true);
    const max = catMaxHp(pet);
    pet.curHp = Math.round(max * 0.5); // 残血 50%
    const r = startBattle(s, "wild_stray");
    expect(r.ok).toBe(true);
    const b = s.catBattle!;
    // 修复后：开局血 = 残血 + 上限增量，且严格小于（含增量后的）上限
    expect(b.player.hp).toBeLessThan(b.player.attrs.hp);
    expect(b.player.hp).toBe(Math.min(b.player.attrs.hp, pet.curHp + Math.round(b.player.attrs.hp - max)));
  });

  it("B2 倒地猫（0 HP）每日恢复不生效，仍须就医", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.curHp = 0;
    expect(catDowned(pet)).toBe(true);
    const logs = tickCatCareDaily(s);
    // 仍倒地，未自动站起
    expect(catDowned(pet)).toBe(true);
    expect(catCurHp(pet)).toBe(0);
    // 日志应提示需就医
    expect(logs.some((l) => l.includes("宠物医院"))).toBe(true);
  });

  it("B3 逃跑会落盘已受的伤（关闭窗口＝免费重置的漏洞）", () => {
    const s = setupCat();
    const pet = s.pets[0];
    const r = startBattle(s, "wild_stray");
    expect(r.ok).toBe(true);
    const b = s.catBattle!;
    b.player.hp = Math.round(b.player.attrs.hp * 0.4); // 打到残血
    expect(catCurHp(pet)).toBe(catMaxHp(pet)); // 开战前是满血
    const r2 = fleeCasualBattle(s);
    expect(r2.ok).toBe(true);
    expect(catCurHp(pet)).toBeLessThan(catMaxHp(pet)); // 掉血已落盘
    expect(s.catBattle).toBeUndefined();
  });

  it("B6 喵喵对决赛报名校验「生命归零」", () => {
    const s = setupCat();
    const pet = s.pets[0];
    pet.curHp = 0;
    const check = signupCheck(s, "tournament_primary");
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("宠物医院");
  });

  it("B9 回复短信使用当前日期（跨天回复不插进历史中间）", () => {
    const s = createInitialState(42);
    const day0 = gameDay(s.time);
    s.smsInbox.push({
      id: "sms_t1",
      sender: "妈妈",
      senderIcon: "👩",
      text: "吃饭了吗",
      options: [{ label: "吃了", tone: "warm", effects: {}, reply: "刚吃完" }],
      replied: false,
      day: day0,
      dir: "in",
      contactId: "mom",
      npcId: undefined,
    });
    // 跨一整天再回复
    advanceHours(s, 24);
    expect(gameDay(s.time)).toBeGreaterThan(day0);
    const r = replySms(s, "sms_t1", 0);
    expect(r.ok).toBe(true);
    const out = s.smsInbox.find((m) => m.id === "out_sms_t1");
    expect(out).toBeDefined();
    expect(out!.day).toBe(gameDay(s.time)); // 用「今天」而非旧 msg.day
    expect(out!.day).toBeGreaterThan(day0);
  });
});
