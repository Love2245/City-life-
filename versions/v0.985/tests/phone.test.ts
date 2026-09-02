import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { callFamily, callFriend, playGame, studyOnline } from "../src/game/core/phone";
import type { GameState } from "../src/game/types";

function fresh(): GameState {
  return createInitialState(42);
}

describe("手机：给家人打电话（按家庭分流）", () => {
  it("赤贫：被催寄钱，心情下降压力上升", () => {
    const s = fresh();
    s.family = "destitute";
    const r = callFamily(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(70 - 4);
    expect(s.player.stress).toBe(6);
    expect(s.time.hour).toBe(7); // 通话 0.5h → 7:30
    expect(s.time.minute).toBe(30);
  });

  it("拮据：被叮嘱别太省，心情上升", () => {
    const s = fresh();
    s.family = "tight";
    const r = callFamily(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(70 + 4);
    expect(s.player.stress).toBe(0); // -3 被 clamp 到 0
  });

  it("普通：家常问候", () => {
    const s = fresh();
    const r = callFamily(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(70 + 3);
    expect(s.player.stress).toBe(0);
  });

  it("富裕：被关心，心情大幅上升", () => {
    const s = fresh();
    s.family = "wealthy";
    const r = callFamily(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(70 + 6);
    expect(s.player.stress).toBe(0);
  });
});

describe("手机：给朋友打电话", () => {
  it("没有朋友：翻遍通讯录，心情下降", () => {
    const s = fresh();
    const r = callFriend(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(70 - 2);
    expect(s.time.hour).toBe(7); // 0.3h → 7:18
    expect(s.time.minute).toBe(18);
  });

  it("有朋友：煲电话粥，心情上升压力下降", () => {
    const s = fresh();
    s.relationships.push({ npcId: "npc_wang", affinity: 60, state: "friend" });
    const r = callFriend(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(70 + 5);
    expect(s.player.stress).toBe(0);
  });
});

describe("手机：玩游戏", () => {
  it("解压但耗体力费时间", () => {
    const s = fresh();
    const r = playGame(s);
    expect(r.ok).toBe(true);
    expect(s.player.attrs.mood).toBe(70 + 6);
    expect(s.player.stress).toBe(0);
    expect(s.player.attrs.stamina).toBe(80 - 3);
    expect(s.time.hour).toBe(8); // 1h
  });
});

describe("手机：在线学习", () => {
  it("流量费不足：拒绝", () => {
    const s = fresh();
    s.player.money = 2;
    const r = studyOnline(s);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("流量费");
    expect(s.player.stats.intelligence).toBe(30);
  });

  it("普通学习：扣流量费 +2 智力", () => {
    const s = fresh();
    const r = studyOnline(s);
    expect(r.ok).toBe(true);
    expect(s.player.money).toBe(500 - 3);
    expect(s.player.stats.intelligence).toBe(30 + 2);
    expect(s.time.hour).toBe(8);
  });

  it("有笔记本电脑：效率翻倍 +4 智力", () => {
    const s = fresh();
    s.flags["item_laptop"] = true;
    const r = studyOnline(s);
    expect(r.ok).toBe(true);
    expect(s.player.stats.intelligence).toBe(30 + 4);
    expect(s.player.money).toBe(500 - 3);
  });
});
