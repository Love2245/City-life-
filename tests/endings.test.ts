import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { checkEnding, getEnding, endingGallery, isStoryExclusiveEnding, STORY_EXCLUSIVE_ENDING_IDS } from "../src/game/core/endings";
import { workOnProject } from "../src/game/core/projects";
import {advanceHours} from '../src/game/core/time';
import {developmentWorkBudget} from '../src/game/core/developmentWork';

function freshState() {
  const s = createInitialState();
  s.player.skills.programming = 5;
  s.player.skills.cooking = 5;
  s.flags["item_laptop"] = true;
  // v1.25：摆摊创业需备好食材（背包有蔬菜/肉才能开工）
  s.inventory["vegetable"] = 20;
  s.inventory["meat"] = 20;
  return s;
}

/** 完成全部 3 个创业项目 */
function completeAllProjects(s: ReturnType<typeof freshState>): void {
  for (const pid of ["indie_game", "mobile_app", "street_stall"]) {
    for (let i = 0; i < 30; i++) {
      if(pid!=='street_stall'){
        if(developmentWorkBudget(s).remainingMinutes<480)advanceHours(s,24-s.time.hour+9-s.time.minute/60,false,true);
        Object.assign(s.player.attrs,{stamina:100,health:100,mood:80,satiety:100});
      }
      const r = workOnProject(s, pid);
      expect(r.ok).toBe(true);
      if (r.completed) break;
    }
  }
}

describe("endings 结局系统", () => {
  it("14 个结局定义完整且唯一（10 基础 + 4 剧情模式）", () => {
    const ids = endingGallery(freshState()).map((g) => g.ending.id);
    expect(ids.length).toBe(14);
    expect(new Set(ids).size).toBe(14);
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

  it("破产离场：只有连续三天日结仍有债务才走债务分支", () => {
    const s = freshState();
    s.player.debt = 1;
    expect(checkEnding(s)).toBeNull();
    s.player.debtStreak = 2;
    expect(checkEnding(s)).toBeNull();
    s.player.debtStreak = 3;
    expect(checkEnding(s)?.id).toBe("ending_bankrupt");
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
    s.flags.sudden_death = true;
    expect(checkEnding(s)?.id).toBe("ending_sick");
  });

  it("心灯熄灭：抑郁连续 21 天", () => {
    const s = freshState();
    s.player.depressionStreak = 21;
    expect(checkEnding(s)?.id).toBe("ending_depression");
  });

  it("v1.44 白手起家：完成全部 3 个创业项目 → 只解锁图鉴，游戏继续", () => {
    const s = freshState();
    completeAllProjects(s);
    expect(checkEnding(s)).toBeNull();
    expect(s.endingId).toBeNull(); // 好结局不再结束游戏
    expect(s.unlockedEndings).toContain("ending_entrepreneur");
  });

  it("v1.44 财务自由：存款达到 10 万 → 只解锁图鉴，游戏继续", () => {
    const s = freshState();
    s.player.money = 100000;
    expect(checkEnding(s)).toBeNull();
    expect(s.endingId).toBeNull();
    expect(s.unlockedEndings).toContain("ending_rich");
  });

  it("v1.44 声名鹊起：影响力达到 80 → 只解锁图鉴，游戏继续", () => {
    const s = freshState();
    s.player.stats.fame = 80;
    expect(checkEnding(s)).toBeNull();
    expect(s.endingId).toBeNull();
    expect(s.unlockedEndings).toContain("ending_famous");
  });

  it("v1.44 熬出个黎明：活满 360 天 → 只解锁图鉴，游戏继续", () => {
    const s = freshState();
    s.time.year = 2027;
    s.time.month = 8;
    s.time.day = 1; // 开局 2026-08-01 + 360 天
    expect(checkEnding(s)).toBeNull();
    expect(s.endingId).toBeNull();
    expect(s.unlockedEndings).toContain("ending_survivor");
  });

  it("v1.44 好结局幂等：条件持续满足不重复解锁、不重复推日志", () => {
    const s = freshState();
    s.player.money = 100000;
    checkEnding(s);
    checkEnding(s);
    checkEnding(s);
    expect(s.unlockedEndings.filter((id) => id === "ending_rich").length).toBe(1);
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
    s.flags.sudden_death = true;
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

  it("v1.43 修复：4 个剧情模式专属结局被正确识别且不从数据删除", () => {
    const expected = ["ending_story_flee", "ending_story_home", "ending_story_honor", "ending_story_citizen"];
    // 13 结局判定仍完整（含这 4 个），未被移除
    const ids = endingGallery(freshState()).map((g) => g.ending.id);
    expect(ids.length).toBe(14);
    for (const id of expected) expect(ids).toContain(id);
    // 探测函数识别正确
    expect(STORY_EXCLUSIVE_ENDING_IDS.slice().sort()).toEqual(expected.slice().sort());
    for (const id of expected) expect(isStoryExclusiveEnding(id)).toBe(true);
    // 普通结局不应被标记为剧情专属
    expect(isStoryExclusiveEnding("ending_rich")).toBe(false);
    expect(isStoryExclusiveEnding("ending_survivor")).toBe(false);
  });

  it("getEnding 按 id 查询", () => {
    expect(getEnding("ending_rich")?.name).toBe("财务自由");
    expect(getEnding("not_exist")).toBeUndefined();
  });

  it("解锁后图鉴标记 unlocked", () => {
    const s = freshState();
    s.player.money = 100000;
    checkEnding(s);
    expect(s.endingId).toBeNull(); // 好结局只进图鉴，不写 endingId
    const gallery = endingGallery(s);
    const rich = gallery.find((g) => g.ending.id === "ending_rich");
    expect(rich?.unlocked).toBe(true);
    const other = gallery.find((g) => g.ending.id === "ending_famous");
    expect(other?.unlocked).toBe(false);
  });
});
