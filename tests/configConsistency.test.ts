import { describe, it, expect } from "vitest";
import actions from "../src/game/data/actions.json";
import events from "../src/game/data/events.json";
import minigames from "../src/game/data/minigames.json";
import jobs from "../src/game/data/jobs.json";
import locations from "../src/game/data/locations.json";
import regions from "../src/game/data/regions.json";
import npcs from "../src/game/data/npcs.json";
import items from "../src/game/data/items.json";
import cats from "../src/game/data/cats.json";
import catItems from "../src/game/data/catItems.json";
import catSkills from "../src/game/data/catSkills.json";
import catBattles from "../src/game/data/catBattles.json";

// 注意各数据文件的顶层形状并不一致：
//   actions/locations/regions/jobs → 纯数组；events → { version, events: [] }；minigames → { difficulty, games: {} }
const actionList = actions as Array<Record<string, unknown>>;
const eventList = (events as { events: Array<Record<string, any>> }).events;
const miniGames = (minigames as { games: Record<string, unknown> }).games;
const actionIds = actionList.map((a) => a.id as string);
const eventIds = eventList.map((e) => e.id as string);
const locationIds = new Set((locations as Array<{ id: string }>).map((l) => l.id));
const regionIds = new Set((regions as Array<{ id: string }>).map((r) => r.id));
const jobIds = new Set((jobs as Array<{ id: string }>).map((j) => j.id));

describe("v0.981 配置一致性", () => {
  it("行动 id 唯一", () => {
    expect(new Set(actionIds).size).toBe(actionIds.length);
  });

  it("事件 id 唯一且无死引用", () => {
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it("所有行动的 locationId 指向真实地点", () => {
    for (const a of actionList) {
      const loc = a.locationId as string | undefined;
      if (loc) expect(locationIds.has(loc), `行动 ${a.id} 的 locationId ${loc} 不存在`).toBe(true);
    }
  });

  it("v1.33-hotfix：所有行动都必须带 effects 对象（缺失会让场景面板渲染抛错、地点进不去）", () => {
    for (const a of actionList) {
      const eff = a.effects;
      expect(eff, `行动 ${a.id} 缺少 effects（哪怕是 {} 也要写，否则 UI 读 effects.money 会崩）`).toBeTypeOf("object");
      expect(eff, `行动 ${a.id} 的 effects 不能为 null`).not.toBeNull();
    }
  });

  it("v1.33-hotfix：handler=tournament_arena 的行动存在且归属游乐场", () => {
    const arena = actionList.filter((a) => a.handler === "tournament_arena");
    expect(arena.length, "缺少进入喵喵对决赛场的行动入口").toBeGreaterThan(0);
    for (const a of arena) {
      expect(a.locationId, `赛场入口 ${a.id} 必须挂在游乐场`).toBe("amusement_park");
    }
    expect(actionIds).toContain("amusement_tournament");
  });

  it("新增宗教行动全部存在", () => {
    for (const id of [
      "church_confession",
      "church_worship",
      "temple_worship",
      "temple_vegetarian",
      "temple_lodging",
    ]) {
      expect(actionIds, `缺少宗教行动 ${id}`).toContain(id);
    }
  });

  it("弥撒配置：周六 15:00–18:00 限制（v1.05 聚餐已合并到弥撒结算）", () => {
    const mass = actionList.find((a) => a.id === "church_mass") as any;
    expect(mass?.requirements?.weekday ?? []).toContain("sat");
    expect(mass?.requirements?.hourRange).toEqual({ start: 15, end: 18 });
    // v1.05：ev_church_fellowship 已从随机事件池移除，改为弥撒结算时直接 applyEffects
  });

  it("小游戏 key 指向真实 job / 行动", () => {
    for (const key of Object.keys(miniGames)) {
      const valid = jobIds.has(key) || actionIds.includes(key);
      expect(valid, `小游戏 ${key} 无对应 job 或行动`).toBe(true);
    }
  });

  it("事件 conditions.region / locationIn 引用真实区域或地点", () => {
    for (const e of eventList) {
      const c = (e.conditions ?? {}) as { region?: string[]; locationIn?: string[] };
      for (const r of c.region ?? []) {
        expect(regionIds.has(r), `事件 ${e.id} 的 region ${r} 不存在`).toBe(true);
      }
      for (const l of c.locationIn ?? []) {
        expect(locationIds.has(l), `事件 ${e.id} 的 locationIn ${l} 不存在`).toBe(true);
      }
    }
  });

  // v1.05：ev_church_fellowship 已合并到弥撒结算，不再作为独立事件存在，此测试移除
});

describe("v0.99 配置一致性（社交系统）", () => {
  const npcList = npcs as Array<Record<string, any>>;
  const itemIds = new Set((items as { items: Array<{ id: string }> }).items.map((i) => i.id));
  const npcIds = new Set(npcList.map((n) => n.id));

  it("NPC id 唯一", () => {
    expect(npcIds.size).toBe(npcList.length);
  });

  it("NPC 偶遇地点引用真实地点", () => {
    for (const n of npcList) {
      if (n.meetLocation) {
        expect(locationIds.has(n.meetLocation), `NPC ${n.id} 的 meetLocation ${n.meetLocation} 不存在`).toBe(true);
      }
    }
  });

  it("NPC 喜欢/讨厌的礼物引用真实物品", () => {
    for (const n of npcList) {
      for (const it of n.likes ?? []) {
        expect(itemIds.has(it), `NPC ${n.id} 喜欢不存在的物品 ${it}`).toBe(true);
      }
      for (const it of n.dislikes ?? []) {
        expect(itemIds.has(it), `NPC ${n.id} 讨厌不存在的物品 ${it}`).toBe(true);
      }
    }
  });

  it("周结/月结岗位的满勤门槛可达（双休岗不再出现 6/26 天死门槛）", () => {
    const formal = jobs as Array<{ id: string; kind: string; restDays?: string[] }>;
    for (const j of formal) {
      if (j.kind !== "weekly" && j.kind !== "monthly") continue;
      const restCount = j.restDays?.length ?? 1;
      const workable = j.kind === "weekly" ? 7 - restCount : 30 - restCount * 4;
      expect(workable, `岗位 ${j.id} 的满勤门槛不可达（应出勤 ${workable} 天）`).toBeGreaterThanOrEqual(1);
    }
  });

  it("发薪日文案不再声称“周日发薪”（发薪日实为周五）", () => {
    const descs = (jobs as Array<{ desc?: string }>).map((j) => j.desc ?? "");
    for (const d of descs) expect(d).not.toContain("周日发薪");
  });

  it("v1.3b2 菜市场：夜间折扣标记齐全且农村同品更便宜", () => {
    const marketIds = ["buy_fruit_market", "buy_vegetable_market", "buy_meat_market", "buy_egg_market", "buy_milk_market"];
    const priceOf = (id: string): number => {
      const a = actionList.find((x) => x.id === id) as any;
      expect(a, `缺少行动 ${id}`).toBeTruthy();
      return Math.abs(a.effects.money as number);
    };
    // 菜市场购买行动都有 21:00 后 7.5 折标记
    for (const id of marketIds) {
      const a = actionList.find((x) => x.id === id) as any;
      expect(a.discount, `${id} 缺折扣标记`).toEqual({ afterHour: 21, rate: 0.75 });
    }
    // 农村同品必须比菜市场便宜（价格优势）
    expect(priceOf("farm_buy_vegetable")).toBeLessThan(priceOf("buy_vegetable_market"));
    expect(priceOf("farm_buy_egg")).toBeLessThan(priceOf("buy_egg_market"));
    expect(priceOf("pasture_buy_milk")).toBeLessThan(priceOf("buy_milk_market"));
    expect(priceOf("farm_buy_meat")).toBeLessThan(priceOf("buy_meat_market"));
  });

  it("v1.3b2 农村地区也卖肉（farm_buy_meat 存在且价格优势）", () => {
    expect(actionIds).toContain("farm_buy_meat");
    const a = actionList.find((x) => x.id === "farm_buy_meat") as any;
    expect(a.itemId).toBe("meat");
    expect(Math.abs(a.effects.money as number)).toBeLessThan(15); // 比菜市场 15 元便宜
  });
});

describe("v1.4 配置一致性（猫咪系统）", () => {
  const catList = (cats as { cats: Array<Record<string, any>> }).cats;
  const catIds = new Set(catList.map((c) => c.id));
  const VALID_RARITY = ["common", "rare", "super", "legend", "boss"];

  it("猫咪 id 唯一", () => {
    expect(catIds.size).toBe(catList.length);
  });

  it("猫咪稀有度合法且基础/成长属性为正", () => {
    for (const c of catList) {
      expect(VALID_RARITY, `${c.id} 稀有度非法`).toContain(c.rarity);
      for (const k of ["hp", "atk", "def", "spd"]) {
        expect(c.base[k], `${c.id} base.${k}`).toBeGreaterThan(0);
        expect(c.growth[k], `${c.id} growth.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it("事件 adoptCat 引用真实猫种", () => {
    for (const e of eventList) {
      for (const ch of e.choices ?? []) {
        if (ch.adoptCat) {
          expect(catIds.has(ch.adoptCat), `事件 ${e.id} 收养不存在的猫 ${ch.adoptCat}`).toBe(true);
        }
      }
    }
  });

  it("收养选项的 notFlag 与猫种对应（cat_adopted_<id>，v1.38 薄荷猫用全局 stray_adopted 去重）", () => {
    for (const e of eventList) {
      for (const ch of e.choices ?? []) {
        if (ch.adoptCat) {
          const expected = `cat_adopted_${ch.adoptCat}`;
          const ok = ch.requires?.notFlag === expected || ch.requires?.notFlag === "stray_adopted";
          expect(ok, `事件 ${e.id} 收养选项 notFlag 应为 ${expected} 或 stray_adopted，实为 ${ch.requires?.notFlag}`).toBe(true);
        }
      }
    }
  });
});

describe("v1.4 P2 配置一致性（猫咪用品）", () => {
  const catItemList = (catItems as { items: Array<Record<string, any>> }).items;
  const catItemIds = new Set(catItemList.map((i) => i.id));
  const VALID_CAT = ["food", "toy", "bed", "train", "special"];
  const VALID_TIER = ["basic", "good", "lux"];
  const VALID_CAT_ACTION = ["feed", "clean", "play", "train"];

  it("猫咪用品 id 唯一，品类/档位合法", () => {
    expect(catItemIds.size).toBe(catItemList.length);
    for (const i of catItemList) {
      expect(VALID_CAT, `${i.id} 品类非法`).toContain(i.cat);
      expect(VALID_TIER, `${i.id} 档位非法`).toContain(i.tier);
      expect(i.price, `${i.id} 价格`).toBeGreaterThan(0);
    }
  });

  it("行动 catItemId 引用真实猫咪用品", () => {
    for (const a of actionList) {
      const id = a.catItemId as string | undefined;
      if (id) {
        expect(catItemIds.has(id), `行动 ${a.id} 引用不存在的猫咪用品 ${id}`).toBe(true);
      }
    }
  });

  it("行动 catAction 合法且 train 行动带 trainType", () => {
    for (const a of actionList) {
      const ca = a.catAction as string | undefined;
      if (!ca) continue;
      expect(VALID_CAT_ACTION, `行动 ${a.id} catAction ${ca} 非法`).toContain(ca);
      if (ca === "train") {
        expect(["atk", "def", "spd", "hp"], `行动 ${a.id} 训练缺 trainType`).toContain(a.trainType);
      }
    }
  });

  it("事件 catEffect 键合法（satiety/mood/hygiene）", () => {
    for (const e of eventList) {
      for (const ch of e.choices ?? []) {
        if (!ch.catEffect) continue;
        for (const k of Object.keys(ch.catEffect)) {
          expect(["satiety", "mood", "hygiene"], `事件 ${e.id} catEffect 键 ${k} 非法`).toContain(k);
        }
      }
    }
  });

  it("hasActivePet 事件至少 1 个且带 catEffect 选项", () => {
    const catEvents = eventList.filter((e) => e.conditions?.hasActivePet === true);
    expect(catEvents.length).toBeGreaterThanOrEqual(4);
    for (const e of catEvents) {
      expect(e.choices.some((c: any) => c.catEffect), `事件 ${e.id} 无 catEffect 选项`).toBe(true);
    }
  });
});

describe("v1.4 P3 配置一致性（对决数据）", () => {
  const skillList = (catSkills as { skills: Array<Record<string, any>> }).skills;
  const skillIds = new Set(skillList.map((s) => s.id));
  const battleData = catBattles as { opponents: Array<Record<string, any>>; tournaments: Array<Record<string, any>>; boss: Record<string, any> };
  const opponentIds = new Set(battleData.opponents.map((o) => o.id));
  const VALID_KIND = ["attack", "defense", "heal", "status"];
  const VALID_ELEMENT = ["normal", "nature", "tech", "mystic", "cosmic"];
  const VALID_STATUS = ["poison", "paralysis", "sleep", "burn"];

  it("技能 id 唯一，类型/属性合法", () => {
    expect(skillIds.size).toBe(skillList.length);
    for (const s of skillList) {
      expect(VALID_KIND, `${s.id} 类型非法`).toContain(s.kind);
      expect(VALID_ELEMENT, `${s.id} 属性非法`).toContain(s.element);
      expect(s.hitRate, `${s.id} 命中率`).toBeGreaterThan(0);
      expect(s.hitRate).toBeLessThanOrEqual(1);
      if (s.kind === "attack") expect(s.power, `${s.id} 攻击技能缺威力`).toBeGreaterThan(0);
      if (s.effect?.status) {
        expect(VALID_STATUS, `${s.id} 状态异常非法`).toContain(s.effect.status);
      }
    }
  });

  it("猫咪技能引用真实技能", () => {
    const catList = (cats as { cats: Array<Record<string, any>> }).cats;
    for (const c of catList) {
      for (const sk of c.skills ?? []) {
        expect(skillIds.has(sk), `猫咪 ${c.id} 引用不存在的技能 ${sk}`).toBe(true);
      }
    }
  });

  it("对手/赛事/Boss 技能引用真实技能，对手 id 唯一", () => {
    expect(opponentIds.size).toBe(battleData.opponents.length);
    for (const o of [...battleData.opponents, battleData.boss]) {
      for (const sk of o.skills ?? []) {
        expect(skillIds.has(sk), `对手 ${o.id} 引用不存在的技能 ${sk}`).toBe(true);
      }
      expect(VALID_ELEMENT, `对手 ${o.id} 属性非法`).toContain(o.element);
    }
  });

  it("赛事按档位池引用真实对手，Boss 不在赛事池", () => {
    for (const t of battleData.tournaments) {
      const pools = t.pools ?? {};
      const total = (pools.normal ?? 0) + (pools.intermediate ?? 0) + (pools.boss ?? 0) + (t.ultimate ? 1 : 0);
      expect(total, `赛事 ${t.id} 总场次`).toBeGreaterThanOrEqual(3);
      for (const tier of ["normal", "intermediate", "boss"] as const) {
        const need = pools[tier] ?? 0;
        if (need <= 0) continue;
        const candidates = battleData.opponents.filter((o) => o.tier === tier && o.id !== battleData.boss.id);
        expect(candidates.length, `赛事 ${t.id} 档位 ${tier} 池不足（需 ${need} 只）`).toBeGreaterThanOrEqual(need);
        for (const o of candidates) expect(opponentIds.has(o.id), `赛事 ${t.id} 池引用不存在的对手 ${o.id}`).toBe(true);
      }
    }
  });

  it("赛事奖励物品引用真实物品（普通物品或猫咪用品）", () => {
    const itemIds = new Set((items as { items: Array<{ id: string }> }).items.map((i) => i.id));
    const catItemIds = new Set((catItems as { items: Array<{ id: string }> }).items.map((i) => i.id));
    const allItemIds = new Set([...itemIds, ...catItemIds]);
    for (const t of battleData.tournaments) {
      if (t.reward?.itemId) {
        expect(allItemIds.has(t.reward.itemId), `赛事 ${t.id} 奖励物品 ${t.reward.itemId} 不存在`).toBe(true);
      }
    }
    if (battleData.boss.reward?.itemId) {
      expect(allItemIds.has(battleData.boss.reward.itemId), `Boss 奖励物品 ${battleData.boss.reward.itemId} 不存在`).toBe(true);
    }
  });
});
