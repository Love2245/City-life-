import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialState } from "../src/game/core/state";
import { ensureRelationship } from "../src/game/core/relationships";
import { JOB_DEFS, jobApplicationSuccessChance } from "../src/game/core/jobs";
import {
  clothingOccasionTags,
  outfitOccasionFitForState,
} from "../src/game/core/playerOutfitResolver";
import {
  NPC_DIALOGUE_REMASTER,
  hintFor,
  recordRemasterConversation,
  remasterConversationStart,
} from "../src/game/data/npcDialogueRemaster";
import { listSpriteUrls, spriteUrl } from "../src/lib/minigameSprites";
import type { NpcTalkOption } from "../src/game/core/npcs";

const FOOD_IDS = [
  "bun_top", "bun_bottom", "bread", "bread_basket", "patty", "cheese", "egg", "bacon", "lettuce", "tomato",
  "coffee", "tea", "juice", "soda", "water", "fries", "cookie", "croissant", "cake", "salad",
  "espresso", "hot_water", "milk", "foam", "caramel", "choco", "ice", "wine", "soup", "steak",
  "pasta", "fish", "dessert", "skewer", "meat", "veg", "sausage", "wrap", "sauce", "chili", "box",
  "cup", "pearl", "sugar", "plate", "mushroom", "nuggets", "rings", "corn", "gluten", "chips", "noodle",
  "nuts", "chocolate", "red_wine", "orange", "icetea", "energy", "beer",
];

describe("v1.461 食材素材与场合穿搭", () => {
  it("接入 59 个 food WebP，且每个文件不超过 20KB", () => {
    const dir = resolve("src/assets/ui/v1.42/minigame-sprites/food");
    const names = readdirSync(dir).filter((name) => name.endsWith(".webp")).sort();
    expect(names).toEqual(FOOD_IDS.map((id) => `${id}.webp`).sort());
    for (const name of names) expect(statSync(resolve(dir, name)).size).toBeLessThanOrEqual(20 * 1024);
  });

  it("运行时 manifest 能解析全部 59 个 food WebP，而不是静默回退", () => {
    const foodKeys = Object.keys(listSpriteUrls()).filter((key) => key.includes("/minigame-sprites/food/"));
    expect(foodKeys).toHaveLength(59);
    for (const id of FOOD_IDS) expect(spriteUrl("food", id)).toContain(`/food/${id}.webp`);
    expect(spriteUrl("food", "patty")).toContain("/food/patty.webp");
  });

  it("正装明显提高面试适配，日常穿搭不会被误判为正装", () => {
    const state = createInitialState(7);
    state.player.attrs.health = 100;
    state.player.attrs.stamina = 100;
    state.player.stats.intelligence = 100;
    for (const key of Object.keys(state.player.skills) as Array<keyof typeof state.player.skills>) state.player.skills[key] = 10;
    state.flags.item_training_cert = true;
    const casual = outfitOccasionFitForState(state, "interview");
    state.inventory.suit = 1;
    state.equipped.clothes = "suit";
    const formal = outfitOccasionFitForState(state, "interview");
    expect(formal.bonus).toBeGreaterThan(casual.bonus);
    expect(clothingOccasionTags("suit")).toEqual(["面试", "上班", "约会"]);
    const formalJob = JOB_DEFS.find((job) => job.kind === "formal");
    expect(formalJob).toBeDefined();
    expect(jobApplicationSuccessChance(state, formalJob!)).toBe(1);
    const dayJob = JOB_DEFS.find((job) => job.kind === "day");
    expect(dayJob).toBeDefined();
    expect(jobApplicationSuccessChance(state, dayJob!)).toBe(1);
  });

  it("雨天、安静和被动交流计数累计，不会被晴天或主动请求清零", () => {
    const state = createInitialState(7);
    const rainNpc = "npc_lin_xiaoyu";
    const rainDaily = NPC_DIALOGUE_REMASTER[rainNpc].dailySceneIds.friend?.[0];
    expect(rainDaily).toBeTruthy();
    state.weather.id = "rain";
    recordRemasterConversation(state, rainNpc, rainDaily, [{ label: "陪你坐一会儿" }]);
    state.weather.id = "sunny";
    recordRemasterConversation(state, rainNpc, rainDaily, [{ label: "普通地聊几句" }]);
    expect(state.flags[`npc_remaster_rain_talks_${rainNpc}`]).toBe(1);
    expect(state.flags[`npc_remaster_quiet_${rainNpc}`]).toBe(1);

    const passiveNpc = "npc_zhao_gang";
    const passiveDaily = NPC_DIALOGUE_REMASTER[passiveNpc].dailySceneIds.close_friend?.[0];
    expect(passiveDaily).toBeTruthy();
    recordRemasterConversation(state, passiveNpc, passiveDaily, [{ label: "坐着听他把话说完" }]);
    recordRemasterConversation(state, passiveNpc, passiveDaily, [{ label: "安静陪着" }]);
    const request: NpcTalkOption = { label: "我来帮忙", help: { log: "已答应帮忙", reward: {} } };
    recordRemasterConversation(state, passiveNpc, passiveDaily, [request]);
    expect(state.flags[`npc_remaster_passive_${passiveNpc}`]).toBe(2);
    expect(state.flags[`npc_remaster_ever_requested_${passiveNpc}`]).toBe(true);
  });

  it("特殊事件满足连续条件时确定可达，请求打断后重新积累仍可达", () => {
    const npcId = "npc_zhao_gang";
    const event = NPC_DIALOGUE_REMASTER[npcId].scenes.event_6;
    const state = createInitialState(11);
    ensureRelationship(state, npcId).affinity = 95;
    state.flags[`npc_remaster_talks_${npcId}`] = 5;
    state.flags[`npc_remaster_quiet_${npcId}`] = 5;
    state.flags[`npc_remaster_passive_streak_${npcId}`] = 5;
    for (const other of Object.values(NPC_DIALOGUE_REMASTER[npcId].scenes)) {
      if (other.kind === "event" && other.id !== event.id) state.flags[`npc_remaster_event_seen_${npcId}_${other.id}`] = true;
    }
    expect(remasterConversationStart(state, npcId, "close_friend")?.sceneId).toBe(event.id);
    state.flags[`npc_remaster_ever_requested_${npcId}`] = true;
    state.flags[`npc_remaster_passive_streak_${npcId}`] = 0;
    expect(remasterConversationStart(state, npcId, "close_friend")?.sceneId).not.toBe(event.id);
    state.flags[`npc_remaster_passive_streak_${npcId}`] = 5;
    expect(remasterConversationStart(state, npcId, "close_friend")?.sceneId).toBe(event.id);
  });

  it("至少三位 NPC 的特殊对话入口均可直接命中", () => {
    const cases = [
      { npcId: "npc_lin_xiaoyu", stage: "friend" as const, eventId: "event_1", talks: 3 },
      { npcId: "npc_zhao_gang", stage: "close_friend" as const, eventId: "event_6", talks: 5, quiet: 5, passive: 5 },
      { npcId: "npc_chen_jie", stage: "friend" as const, eventId: "event_a", talks: 0 },
    ];

    for (const testCase of cases) {
      const state = createInitialState(31);
      ensureRelationship(state, testCase.npcId).affinity = 95;
      if (testCase.npcId === "npc_lin_xiaoyu") {
        state.locationId = "cafe";
        state.region = "downtown_residential";
      }
      state.flags[`npc_remaster_talks_${testCase.npcId}`] = testCase.talks;
      state.flags[`npc_remaster_visit_streak_${testCase.npcId}`] = testCase.talks;
      if (testCase.quiet) state.flags[`npc_remaster_quiet_${testCase.npcId}`] = testCase.quiet;
      if (testCase.passive) state.flags[`npc_remaster_passive_streak_${testCase.npcId}`] = testCase.passive;
      for (const scene of Object.values(NPC_DIALOGUE_REMASTER[testCase.npcId].scenes)) {
        if (scene.kind === "event" && scene.id !== testCase.eventId) {
          state.flags[`npc_remaster_event_seen_${testCase.npcId}_${scene.id}`] = true;
        }
      }
      expect(remasterConversationStart(state, testCase.npcId, testCase.stage)?.sceneId).toBe(testCase.eventId);
    }
  });

  it("日常场景能显示不暴露数字的自然提示", () => {
    const state = createInitialState(13);
    const sceneId = NPC_DIALOGUE_REMASTER.npc_lin_xiaoyu.dailySceneIds.friend?.[0];
    const hint = hintFor(state, "npc_lin_xiaoyu", sceneId);
    expect(hint).toContain("咖啡馆");
    expect(hint).not.toMatch(/\d+次|还差/);
  });

  it("没有特殊内容的 NPC 不返回误导性日常提示", () => {
    const state = createInitialState(17);
    const sceneId = NPC_DIALOGUE_REMASTER.npc_wang_lei.dailySceneIds.friend?.[0];
    expect(sceneId).toBeTruthy();
    expect(hintFor(state, "npc_wang_lei", sceneId)).toBeUndefined();
  });
});
