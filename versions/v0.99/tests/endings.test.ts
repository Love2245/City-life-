import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { checkEnding, getEnding, endingGallery } from "../src/game/core/endings";
import { workOnProject } from "../src/game/core/projects";

function freshState() {
  const s = createInitialState();
  s.player.skills.programming = 5;
  s.player.skills.cooking = 5;
  s.flags["item_laptop"] = true;
  return s;
}

/** 完成全部 3 个创业项目 */
function completeAllProjects(s: ReturnType<typeof freshState>): void {
  for (const pid of ["indie_game", "mobile_app", "street_stall"]) {
    for (let i = 0; i < 30; i++) {
      const r = workOnProject(s, pid);
      if (r.completed) break;
    }
  }
}

describe("endings 结局系统", () => {
  it("9 个结局定义完整且唯一", () => {
    const ids = endingGallery(freshState()).map((g) => g.ending.id);
    expect(ids.length).toBe(9);
    expect(new Set(ids).size).toBe(9);
  });

  it("初始无结局触发", () => {
    const s = freshState();
    expect(checkEnding(s)).toBeNull();
    expect(s.endingId).toBeNull();
  });

  it("破产离场：连续 7 天入不敷出", () => {
    const s = freshState();
    s.player.negativeMoneyStreak = 7;
    const e = checkEnding(s);
    expect(e?.id).toBe("ending_bankrupt");
    expect(s.endingId).toBe("ending_bankrupt");
    expect(s.unlockedEndings).toContain("ending_bankrupt");
  });

  it("孤独终老：连续 14 天心情低落", () => {
    const s = freshState();
    s.player.lowMoodStreak = 14;
    expect(checkEnding(s)?.id).toBe("ending_lonely");
  });

  it("饿死街头：连续 5 顿没吃饭", () => {
    const s = freshState();
    s.player.hungryStreak = 5;
    expect(checkEnding(s)?.id).toBe("ending_starved");
  });

  it("猝死：健康归零且超过 3 天抢救期", () => {
    const s = freshState();
    s.player.attrs.health = 0;
    // v0.92：健康归零后有 3 天抢救窗口，第 4 天才判定猝死
    s.player.criticalHealthStreak = 3;
    expect(checkEnding(s)).toBeNull();
    s.player.criticalHealthStreak = 4;
    expect(checkEnding(s)?.id).toBe("ending_sick");
  });

  it("心灯熄灭：抑郁连续 21 天", () => {
    const s = freshState();
    s.player.depressionStreak = 21;
    expect(checkEnding(s)?.id).toBe("ending_depression");
  });

  it("白手起家：完成全部 3 个创业项目", () => {
    const s = freshState();
    completeAllProjects(s);
    expect(checkEnding(s)?.id).toBe("ending_entrepreneur");
  });

  it("财务自由：存款达到 10 万", () => {
    const s = freshState();
    s.player.money = 100000;
    expect(checkEnding(s)?.id).toBe("ending_rich");
  });

  it("声名鹊起：影响力达到 80", () => {
    const s = freshState();
    s.player.stats.fame = 80;
    expect(checkEnding(s)?.id).toBe("ending_famous");
  });

  it("熬出个黎明：活满 360 天", () => {
    const s = freshState();
    s.time.year = 2027;
    s.time.month = 8;
    s.time.day = 1; // 开局 2026-08-01 + 360 天
    expect(checkEnding(s)?.id).toBe("ending_survivor");
  });

  it("失败结局优先于成功结局", () => {
    const s = freshState();
    // 同时满足破产 + 财务自由（矛盾场景）→ 应取 bad 优先
    s.player.negativeMoneyStreak = 7;
    s.player.money = 100000;
    expect(checkEnding(s)?.tier).toBe("bad");
  });

  it("触发后再次判定返回同一结局", () => {
    const s = freshState();
    s.player.attrs.health = 0;
    s.player.criticalHealthStreak = 4;
    checkEnding(s);
    const e2 = checkEnding(s);
    expect(e2?.id).toBe("ending_sick");
    expect(s.unlockedEndings.length).toBe(1); // 不重复解锁
  });

  it("未达条件不触发且不写入图鉴", () => {
    const s = freshState();
    s.player.negativeMoneyStreak = 6; // 差一天
    expect(checkEnding(s)).toBeNull();
    expect(s.unlockedEndings.length).toBe(0);
  });

  it("getEnding 按 id 查询", () => {
    expect(getEnding("ending_rich")?.name).toBe("财务自由");
    expect(getEnding("not_exist")).toBeUndefined();
  });

  it("解锁后图鉴标记 unlocked", () => {
    const s = freshState();
    s.player.money = 100000;
    checkEnding(s);
    const gallery = endingGallery(s);
    const rich = gallery.find((g) => g.ending.id === "ending_rich");
    expect(rich?.unlocked).toBe(true);
    const other = gallery.find((g) => g.ending.id === "ending_famous");
    expect(other?.unlocked).toBe(false);
  });
});
