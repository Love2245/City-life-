import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  DIFFICULTY,
  getMiniGameConfig,
  getMiniGameConfigFor,
  configuredMiniGameKeys,
  judgeTiming,
  JUDGE_WINDOW,
  scaleTimeLimit,
  scaleWrongLimit,
  miniGameTimeFactor,
  estimateMiniGameSec,
  applyMiniGameReward,
  isAmusementGame,
  amusementPrizeOf,
} from "../src/game/core/minigame";
import { JOB_DEFS } from "../src/game/core/jobs";
import { performAction } from "../src/game/core/actions";

describe("v0.96 工作小游戏：配置完整性", () => {
  it("全局难度系数 = 0.965", () => {
    expect(DIFFICULTY).toBe(0.965);
  });

  it("34 个游戏配置齐全（26 工作 + 2 锻炼 + 卖唱 + 街边摆摊 + 周末集市摆摊 + 寺庙义工 + 公园象棋 + 网管兼职；v1.34 移除 4 个游乐场小游戏）", () => {
    const keys = configuredMiniGameKeys();
    expect(keys.length).toBe(34); // v1.3b2：新增 internet_night_job（兼职网管）+ stall_market_fair（周末集市摆摊）；v1.33 P5：+4 个游乐场小游戏；v1.33 P6：移除 exercise_park（公园锻炼改为直接结算）；v1.34：移除 4 个游乐场小游戏（改直接结算，等下次更新植入）
    expect(keys).toContain("internet_night_job");
    expect(keys).toContain("stall_market_fair");
    // v1.34：游乐场设施改为直接结算，小游戏配置已移除（下次更新再植入）
    expect(keys).not.toContain("amusement_icecream");
    expect(keys).not.toContain("amusement_bowling");
    expect(keys).not.toContain("amusement_dart");
    expect(keys).not.toContain("amusement_ringtoss");
    expect(keys).not.toContain("exercise_park");
  });

  it("v1.3b2 摆摊配置：独立玩法标记 + 周末集市 1.5 倍单价", () => {
    const street = getMiniGameConfig("stall_street_night");
    expect(street?.type).toBe("restaurant");
    if (street?.type === "restaurant") {
      expect(street.stall).toBe(true);
      expect(street.stallPerCustomerPay).toBeGreaterThan(0);
      expect(street.stallStaminaCost).toBeGreaterThan(0);
      expect(street.stallHourPerCustomer).toBeGreaterThan(0);
    }
    const fair = getMiniGameConfig("stall_market_fair");
    expect(fair?.type).toBe("restaurant");
    if (fair?.type === "restaurant" && street?.type === "restaurant") {
      expect(fair.stall).toBe(true);
      expect(fair.stallPerCustomerPay).toBe(street.stallPerCustomerPay! * 1.5); // 周末夜市 1.5 倍
    }
  });

  it("每一份工作（JOB_DEFS 20 个）都有专属小游戏", () => {
    for (const job of JOB_DEFS) {
      const cfg = getMiniGameConfig(job.id);
      expect(cfg, `缺少配置: ${job.id}`).toBeDefined();
    }
  });

  it("锻炼 / 卖唱 / 摆摊行动有配置且为对应类型（v1.33 P6：公园锻炼改为直接结算，无小游戏）", () => {
    expect(getMiniGameConfig("exercise_gym")?.type).toBe("rhythm");
    expect(getMiniGameConfig("exercise_park")).toBeUndefined();
    expect(getMiniGameConfig("exercise_home_equip")?.type).toBe("rhythm");
    expect(getMiniGameConfig("street_perform")?.type).toBe("rhythm");
    // v0.981：修正死键 street_stall（那是创业项目 id）→ 真实行动 id stall_street_night
    // v1.3b2：摆摊归入「餐饮制作」类别（restaurant 引擎，按序堆叠）
    expect(getMiniGameConfig("stall_street_night")?.type).toBe("restaurant");
    expect(getMiniGameConfig("street_stall")).toBeUndefined();
  });

  it("v0.981 新增：农场 / 牧场 / 果园 / 寺庙义工小游戏", () => {
    expect(getMiniGameConfig("job_farm_hand")).toBeDefined();
    expect(getMiniGameConfig("job_pasture_milk")).toBeDefined();
    expect(getMiniGameConfig("job_orchard_pick")).toBeDefined();
    expect(getMiniGameConfig("temple_volunteer")).toBeDefined();
  });

  it("流水线：v1.3 工厂模板（传送带按工单顺序抓取，零件池 ≥6）", () => {
    const cfg = getMiniGameConfig("job_factory_line");
    expect(cfg?.type).toBe("factory");
    if (cfg?.type === "factory") {
      expect(cfg.parts.length).toBeGreaterThanOrEqual(6);
      expect(cfg.productsToWin).toBeGreaterThan(0);
      expect(cfg.spawnMs).toBeGreaterThan(0);
      expect(cfg.targetWeight).toBeGreaterThan(0);
      expect(cfg.targetWeight).toBeLessThanOrEqual(0.6);
    }
  });

  it("咖啡店：v1.3 餐饮组装模板（配方顺序 + 配菜/饮料 + 顾客类型）", () => {
    const cfg = getMiniGameConfig("job_cafe_staff");
    expect(cfg?.type).toBe("restaurant");
    if (cfg?.type === "restaurant") {
      expect(cfg.ingredients.length).toBeGreaterThanOrEqual(4);
      expect(cfg.recipes.length).toBeGreaterThanOrEqual(2);
      expect(cfg.customerTypes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("音游（锻炼/卖唱）：轨道 1-3、音符 ≥8、有间隔与下落时长（v1.33 P6：时长已精简，不含已移除的 exercise_park）", () => {
    for (const key of ["exercise_gym", "exercise_home_equip", "street_perform"]) {
      const cfg = getMiniGameConfig(key);
      expect(cfg?.type).toBe("rhythm");
      if (cfg?.type === "rhythm") {
        expect(cfg.tracks).toBeGreaterThanOrEqual(1);
        expect(cfg.tracks).toBeLessThanOrEqual(3);
        expect(cfg.notes).toBeGreaterThanOrEqual(8);
        expect(cfg.intervalMs).toBeGreaterThan(0);
        expect(cfg.fallMs).toBeGreaterThan(0);
      }
    }
  });

  it("v1.3 新模板配置字段完整（checkout/factory/dispatch）+ whack 保留", () => {
    const checkout = getMiniGameConfig("job_convenience_day");
    expect(checkout?.type).toBe("checkout");
    if (checkout?.type === "checkout") {
      expect(checkout.items.length).toBeGreaterThanOrEqual(6);
      expect(checkout.customers).toBeGreaterThan(0);
    }
    const sort = getMiniGameConfig("job_sorting");
    expect(sort?.type).toBe("factory");
    if (sort?.type === "factory") expect(sort.parts.length).toBeGreaterThanOrEqual(4);
    const tutor = getMiniGameConfig("job_driving_tutor");
    expect(tutor?.type).toBe("dispatch");
    if (tutor?.type === "dispatch") {
      expect(tutor.guests.length).toBeGreaterThanOrEqual(3);
      expect(tutor.rooms.length).toBeGreaterThanOrEqual(4);
    }
    const whack = getMiniGameConfig("job_market_cleaner");
    expect(whack?.type).toBe("whack");
    if (whack?.type === "whack") {
      expect(whack.goodLabel).toBeTruthy();
      expect(whack.badLabel).toBeTruthy();
      expect(whack.targets).toBeGreaterThan(0);
    }
  });

  it("v1.3b2 五个外送岗都是 delivery 且 mode 映射正确", () => {
    const expectDelivery = (key: string, mode: string): void => {
      const cfg = getMiniGameConfig(key);
      expect(cfg?.type, key).toBe("delivery");
      if (cfg?.type === "delivery") {
        expect(cfg.mode, key).toBe(mode);
        expect(cfg.targetOrders).toBeGreaterThanOrEqual(2);
        expect(cfg.pickups.length).toBeGreaterThan(0);
        expect(cfg.drops.length).toBeGreaterThan(0);
        expect(cfg.timeLimit).toBeGreaterThan(0);
      }
    };
    expectDelivery("job_delivery", "food");
    expectDelivery("job_delivery_fulltime", "food");
    expectDelivery("job_express", "parcel");
    expectDelivery("job_ride_hailing", "rideshare");
    expectDelivery("job_taxi", "rideshare");
  });

  it("v1.3b2 兼职网管与全职网管共享同一小游戏（玩法字段完全一致，desc 文案可不同）", () => {
    const part = getMiniGameConfig("internet_night_job");
    const full = getMiniGameConfig("job_netbar_admin");
    expect(part?.type).toBe("restaurant");
    expect(full?.type).toBe("restaurant");
    if (part && full && part.type === "restaurant" && full.type === "restaurant") {
      // 玩法相关字段逐一相等（desc 为兼职身份描述，允许不同）
      expect(part.title).toBe(full.title);
      expect(part.icon).toBe(full.icon);
      expect(part.mode).toBe(full.mode);
      expect(part.timeLimit).toBe(full.timeLimit);
      expect(part.totalCustomers).toBe(full.totalCustomers);
      expect(part.spawnMs).toBe(full.spawnMs);
      expect(part.lives).toBe(full.lives);
      expect(part.maxWaiting).toBe(full.maxWaiting);
      expect(part.ingredients).toEqual(full.ingredients);
      expect(part.recipes).toEqual(full.recipes);
      expect(part.drinks).toEqual(full.drinks);
      expect(part.sides).toEqual(full.sides);
      expect(part.customerTypes).toEqual(full.customerTypes);
    }
  });

  it("v1.3b2 所有 restaurant 配置的饮料无「同 group 且同 icon」重复（防可乐/雪碧同图标歧义）", () => {
    const keys = configuredMiniGameKeys();
    for (const key of keys) {
      const cfg = getMiniGameConfig(key);
      if (cfg?.type !== "restaurant") continue;
      const drinks = cfg.drinks ?? [];
      for (let i = 0; i < drinks.length; i++) {
        for (let j = i + 1; j < drinks.length; j++) {
          const a = drinks[i];
          const b = drinks[j];
          const sameIcon = (a.icon ?? "") === (b.icon ?? "");
          const sameGroup = Boolean(a.group) && a.group === b.group;
          expect(sameIcon && sameGroup, `${key}: ${a.id} 与 ${b.id} 同组同图标`).toBe(false);
        }
      }
    }
  });

  it("v1.33 P6 时长规范：音游单局 ≤15 秒，其余配置 ∈ [26, 34] 秒（chess 跳过）", () => {
    const keys = configuredMiniGameKeys();
    for (const key of keys) {
      const cfg = getMiniGameConfig(key);
      if (!cfg || cfg.type === "chess") continue;
      const sec = estimateMiniGameSec(cfg);
      if (cfg.type === "rhythm") {
        // v1.33 P6：锻炼/卖唱/保龄球等音游精简为短局（≤15s，且不能短到失去玩法）
        expect(sec, `${key} 音游估算 ${sec}s`).toBeGreaterThanOrEqual(6);
        expect(sec, `${key} 音游估算 ${sec}s`).toBeLessThanOrEqual(15);
      } else {
        expect(sec, `${key} 估算 ${sec}s`).toBeGreaterThanOrEqual(26);
        expect(sec, `${key} 估算 ${sec}s`).toBeLessThanOrEqual(34);
      }
    }
  });

  it("v1.3b2 miniGameTimeFactor：0 级=1 / 6 级=0.52 / 7 级及以上=0.5（下限 50%）", () => {
    expect(miniGameTimeFactor(0)).toBe(1);
    expect(miniGameTimeFactor(1)).toBe(0.92);
    expect(miniGameTimeFactor(6)).toBe(0.52);
    expect(miniGameTimeFactor(7)).toBe(0.5);
    expect(miniGameTimeFactor(20)).toBe(0.5);
  });

  it("v1.3b2 getMiniGameConfigFor 缩放不改动原配置（防污染累乘）", () => {
    const state = createInitialState();
    state.player.skills.cooking = 6; // 高技能 → 强缩放
    const base = getMiniGameConfig("job_factory_line");
    const scaled = getMiniGameConfigFor(state, "job_factory_line");
    expect(base).toBeDefined();
    expect(scaled).toBeDefined();
    // 原配置未被修改（模块级 GAMES 不能被污染）
    expect(getMiniGameConfig("job_factory_line")).toEqual(base);
    // 缩放后的 timeLimit ≤ 原值（有缩短）
    if (base?.type === "factory" && scaled?.type === "factory") {
      expect(scaled.timeLimit ?? 999).toBeLessThanOrEqual(base.timeLimit ?? 999);
      expect(scaled.productsToWin ?? 0).toBeLessThanOrEqual(base.productsToWin ?? 0);
    }
    // 再取一次仍与第一次缩放一致（不累乘）
    const scaled2 = getMiniGameConfigFor(state, "job_factory_line");
    expect(scaled2).toEqual(scaled);
  });
});

describe("v0.965 音游判定（难度系数缩放）", () => {
  it("判定窗 = 放宽基准（110/185/280）× 0.965", () => {
    expect(JUDGE_WINDOW.perfect).toBe(Math.round(110 * DIFFICULTY));
    expect(JUDGE_WINDOW.good).toBe(Math.round(185 * DIFFICULTY));
    expect(JUDGE_WINDOW.ok).toBe(Math.round(280 * DIFFICULTY));
  });

  it("judgeTiming 分级：perfect/good/ok/miss", () => {
    expect(judgeTiming(0)).toBe("perfect");
    expect(judgeTiming(JUDGE_WINDOW.perfect)).toBe("perfect");
    expect(judgeTiming(JUDGE_WINDOW.perfect + 1)).toBe("good");
    expect(judgeTiming(JUDGE_WINDOW.good + 1)).toBe("ok");
    expect(judgeTiming(JUDGE_WINDOW.ok + 1)).toBe("miss");
  });

  it("限时放宽（×1.15）且失误容错下限 2", () => {
    expect(scaleTimeLimit(15)).toBe(17.3); // 15 * 1.15
    expect(scaleTimeLimit(10)).toBe(11.5);
    expect(scaleWrongLimit(2)).toBe(2); // 下限 2
  });
});

describe("v0.96 评分奖励", () => {
  it("完美（ratio=1）：工资 +5%", () => {
    const s = createInitialState();
    s.player.money = 100;
    const r = applyMiniGameReward(s, "job_factory_line", 1, 100);
    expect(r.rewarded).toBe(true);
    expect(r.bonus).toBe(5);
    expect(s.player.money).toBe(105);
  });

  it("按得分比例加成（ratio=0.5 → 一半加成）", () => {
    const s = createInitialState();
    s.player.money = 100;
    const r = applyMiniGameReward(s, "job_factory_line", 0.5, 100);
    expect(r.bonus).toBe(Math.max(1, Math.round(100 * 0.05 * 0.5))); // round(2.5)=3
    expect(s.player.money).toBe(103);
  });

  it("0 分：无任何变化（绝不惩罚）", () => {
    const s = createInitialState();
    s.player.money = 100;
    const mood0 = s.player.attrs.mood;
    const r = applyMiniGameReward(s, "job_factory_line", 0, 100);
    expect(r.rewarded).toBe(false);
    expect(s.player.money).toBe(100);
    expect(s.player.attrs.mood).toBe(mood0);
  });

  it("工资为 0：按表现给心情补偿", () => {
    const s = createInitialState();
    const mood0 = s.player.attrs.mood;
    const r = applyMiniGameReward(s, "street_stall", 1, 0);
    expect(r.rewarded).toBe(true);
    expect(s.player.attrs.mood).toBe(Math.min(100, mood0 + 1));
  });

  it("v1.215 修复：加成不足 1 元时不再强制 +1 元（0 加成即为 0）", () => {
    const s = createInitialState();
    s.player.money = 100;
    const r = applyMiniGameReward(s, "job_factory_line", 0.1, 10); // 10 × 5% × 0.1 = 0.05 → 0
    expect(r.bonus).toBe(0);
    expect(s.player.money).toBe(100); // 原实现 Math.max(1,…) 会强制 +1
  });
});

describe("v1.34 游乐场小游戏：已移除改直接结算（下次更新再植入）", () => {
  it("识别游乐场小游戏 key 的函数保留（isAmusementGame 仍可识别旧 key）", () => {
    expect(isAmusementGame("amusement_icecream")).toBe(true);
    expect(isAmusementGame("amusement_bowling")).toBe(true);
    expect(isAmusementGame("amusement_dart")).toBe(true);
    expect(isAmusementGame("amusement_ringtoss")).toBe(true);
    // 非游乐场小游戏不受影响
    expect(isAmusementGame("job_factory_line")).toBe(false);
    expect(isAmusementGame("park_chess")).toBe(false);
  });

  it("4 个游乐场设施的 minigame 配置已移除（点击直接结算，不再弹小游戏）", () => {
    for (const key of ["amusement_icecream", "amusement_bowling", "amusement_dart", "amusement_ringtoss"]) {
      expect(getMiniGameConfig(key), `${key} 配置应已移除`).toBeUndefined();
      expect(amusementPrizeOf(key, 1)).toBeUndefined();
    }
  });

  it("冰淇淋店：当场吃（eat）或打包带走（pack），不再进小游戏", () => {
    // 当场吃：扣钱 + 饱腹/心情生效，不占背包
    const s = createInitialState();
    s.time.hour = 12;
    s.player.money = 100;
    const sat0 = s.player.attrs.satiety;
    const r1 = performAction(s, "amusement_icecream", { dine: "eat" });
    expect(r1.ok).toBe(true);
    expect(s.player.money).toBe(92);
    expect(s.player.attrs.satiety).toBeGreaterThan(sat0);
    expect(s.inventory["icecream_sundae"]).toBeUndefined();
    // 打包带走：扣钱 + 入包，不立即吃（饱腹仅因时间流逝略降，无 +25）
    const s2 = createInitialState();
    s2.time.hour = 12;
    s2.player.money = 100;
    const sat02 = s2.player.attrs.satiety;
    const r2 = performAction(s2, "amusement_icecream", { dine: "pack" });
    expect(r2.ok).toBe(true);
    expect(s2.player.money).toBe(92);
    expect(s2.player.attrs.satiety).toBeLessThan(sat02);
    expect(s2.inventory["icecream_sundae"]).toBe(1);
  });

  it("保龄球 / 飞镖 / 套圈直接结算（扣钱 + 心情，不弹小游戏、无奖金）", () => {
    for (const id of ["amusement_bowling", "amusement_dart", "amusement_ringtoss"]) {
      const s = createInitialState();
      s.time.hour = 12;
      s.player.money = 100;
      const mood0 = s.player.attrs.mood;
      const r = performAction(s, id);
      expect(r.ok, `${id} 应直接结算`).toBe(true);
      expect(s.player.money).toBeLessThan(100);
      expect(s.player.attrs.mood).toBeGreaterThanOrEqual(mood0);
      expect(s.catBattle).toBeUndefined();
    }
  });
});

describe("v1.33 P6 时长精简：公园锻炼移除 + 音游短局化", () => {
  it("exercise_park 无小游戏配置（公园锻炼改为直接结算）", () => {
    expect(getMiniGameConfig("exercise_park")).toBeUndefined();
    // 行动本身保留原有效果，仅不再弹小游戏
    const s = createInitialState();
    s.player.attrs.stamina = 80;
    const fit0 = s.player.stats.fitness;
    const stam0 = s.player.attrs.stamina;
    // 通过 performAction 验证：公园锻炼仍可直接结算（不抛错、正常扣体力、涨体质）
    const r = performAction(s, "exercise_park");
    expect(r.ok).toBe(true);
    expect(s.player.stats.fitness).toBe(fit0 + 4);
    expect(s.player.attrs.stamina).toBe(stam0 - 20);
  });

  it("健身房小游戏精简为短局（≤12 秒）", () => {
    const cfg = getMiniGameConfig("exercise_gym");
    expect(cfg?.type).toBe("rhythm");
    if (cfg?.type === "rhythm") {
      expect(cfg.notes).toBeLessThanOrEqual(20);
      const sec = estimateMiniGameSec(cfg);
      expect(sec).toBeLessThanOrEqual(12);
      expect(cfg.tracks).toBeLessThanOrEqual(3);
    }
  });

  it("其余音游（居家训练/卖唱）时长均 ≤15 秒", () => {
    for (const key of ["exercise_home_equip", "street_perform"]) {
      const cfg = getMiniGameConfig(key);
      expect(cfg?.type, key).toBe("rhythm");
      if (cfg?.type === "rhythm") {
        const sec = estimateMiniGameSec(cfg);
        expect(sec, `${key} 估算 ${sec}s`).toBeLessThanOrEqual(15);
      }
    }
  });
});
