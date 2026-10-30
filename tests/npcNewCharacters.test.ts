import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { weekdayOf } from "../src/game/core/calendar";
import { findRelationship } from "../src/game/core/relationships";
import {
  advanceNpcConversation,
  beginNpcConversation,
  commitNpcConversation,
  npcConversationView,
} from "../src/game/core/npcTalk";
import { getNpcDef, npcPresenceAt } from "../src/game/core/npcs";
import { NPC_DIALOGUE_REMASTER } from '../src/game/data/npcDialogueRemaster';
import {
  npcPortraitForContext,
  npcPortraitForDialogue,
  preloadUnmaskedPortraits,
} from "../src/game/core/npcPortraits";

const SCHEDULE_PROBES = [
  { npcId: "npc_fan_kejie", weekday: 0, hour: 20, locationId: "boyue_lounge_bar", regionId: "boyue_night_market" },
  { npcId: "npc_fan_kejie", weekday: 1, hour: 16, locationId: "boyue_arcade", regionId: "boyue_night_market" },
  { npcId: "npc_fan_kejie", weekday: 2, hour: 18, locationId: "dev_food_street", regionId: "development_university" },
  { npcId: "npc_fan_kejie", weekday: 4, hour: 22, locationId: "boyue_nightclub", regionId: "boyue_night_market" },
  { npcId: "npc_jack_fanma", weekday: 0, hour: 10, locationId: "boyue_engineering_college", regionId: "boyue_university" },
  { npcId: "npc_jack_fanma", weekday: 0, hour: 16, locationId: "boyue_gym", regionId: "boyue_mall" },
  { npcId: "npc_jack_fanma", weekday: 1, hour: 17, locationId: "boyue_basketball_court", regionId: "boyue_olympic" },
  { npcId: "npc_jack_fanma", weekday: 4, hour: 20, locationId: "boyue_lounge_bar", regionId: "boyue_night_market" },
  { npcId: "npc_fan_kexi", weekday: 0, hour: 10, locationId: "dev_university", regionId: "development_university" },
  { npcId: "npc_fan_kexi", weekday: 2, hour: 17, locationId: "dev_food_street", regionId: "development_university" },
  { npcId: "npc_fan_kexi", weekday: 5, hour: 12, locationId: "western_restaurant", regionId: "downtown_center" },
  { npcId: "npc_fan_kexi", weekday: 6, hour: 12, locationId: "boyue_western_restaurant", regionId: "boyue_mall" },
] as const;

function stateAt(npcId: string, weekday: number, hour: number) {
  const state = createInitialState(43);
  state.time.year = 2026;
  state.time.month = 8;
  state.time.day = 3 + weekday; // 2026-08-03 是周一。
  state.time.hour = hour;
  state.time.minute = 0;
  const presence = npcPresenceAt(npcId, {
    ...state.time,
    seed: state.rng.seed,
    weekday: weekdayOf(state.time),
    hour,
    minute: 0,
  });
  if (!presence) throw new Error(`${npcId} 在周${weekday + 1} ${hour}:00 不在排班地点`);
  state.locationId = presence.locationId;
  if (presence.regionId) state.region = presence.regionId;
  return state;
}

describe("v1.49 新 NPC 接入", () => {
  it("三位新 NPC 按设定出现在校园、夜市、运动场和西餐厅", () => {
    for (const probe of SCHEDULE_PROBES) {
      const presence = npcPresenceAt(probe.npcId, {
        year: 2026,
        month: 8,
        day: 3 + probe.weekday,
        seed: 43,
        weekday: probe.weekday,
        hour: probe.hour,
      });
      expect(presence, probe.npcId).not.toBeNull();
      expect(presence?.locationId, probe.npcId).toBe(probe.locationId);
      expect(presence?.regionId, probe.npcId).toBe(probe.regionId);
    }
  });

  it("三人已有完整日常与话题，个人初见必须让位于共同开场", () => {
    for (const npcId of ["npc_fan_kejie", "npc_jack_fanma", "npc_fan_kexi"]) {
      const scenes = Object.values(NPC_DIALOGUE_REMASTER[npcId].scenes);
      expect(scenes.filter(s => s.id.includes('_d'))).toHaveLength(24);
      expect(scenes.filter(s => s.id.startsWith('reset_topic_'))).toHaveLength(5);
      const state = stateAt(npcId, 0, npcId === "npc_fan_kejie" ? 20 : 10);
      const started = beginNpcConversation(state, npcId, "meet");
      expect(started.ok).toBe(false);
      expect(started.reason).toContain('共同初见');
      expect(findRelationship(state, npcId)).toBeUndefined();
    }
  });

  it("三位新 NPC 都使用素材库立绘，并能加载轻微表情动作与合并情绪图", async () => {
    await preloadUnmaskedPortraits();
    const emotionLines = [
      ["emotion_embarrassed", "我脸红了，我也喜欢你。"],
      ["emotion_sad", "我现在真的很难过。"],
      ["emotion_worried", "我很担心。"],
      ["emotion_confident", "我很有信心。"],
    ] as const;
    for (const npcId of ["npc_fan_kejie", "npc_jack_fanma", "npc_fan_kexi"]) {
      expect(npcPortraitForContext(npcId, "casual", "default", false).source)
        .toContain(`/portraits/unmasked-clean/${npcId}/default.png`);
      expect(npcPortraitForContext(npcId, "casual", "default", true).source)
        .toContain(`/portraits/unmasked-clean/${npcId}/default.png`);
      const smile=npcPortraitForDialogue(npcId,"（开心地笑了。）","acquaintance","placeholder",true);
      expect(smile.source).toContain(`/portraits/npc_dialogue/${npcId}/default_20261015.png`);
      expect(smile.emotionCategory).toBe('happy');expect(smile.visualLevel).toBe(1);
      expect(smile.atlas).toBeTruthy();expect(smile.faceOverlay).toBeUndefined();
      const restrainedVariants = [
        ["expression_sad", "我有点难过。"],
        ["expression_angry", "我有点烦。"],
        ["expression_embarrassed", "我脸红了。"],
      ] as const;
      for (const [variant, line] of restrainedVariants) {
        const portrait = npcPortraitForDialogue(npcId, line, "acquaintance", "restrained-test", true);
        expect(portrait.variant).toBe(variant);
        expect(portrait.source).toContain(`/portraits/npc_dialogue/${npcId}/default_20261015.png`);
        expect(portrait.atlas).toBeTruthy();expect(portrait.faceOverlay).toBeUndefined();
      }
      for (const [emotion, line] of emotionLines) {
        const knownPortrait = npcPortraitForDialogue(npcId, line, "acquaintance", "emotion-test", true);
        const concealedPortrait = npcPortraitForDialogue(npcId, line, "acquaintance", "emotion-test", false);
        expect(knownPortrait.assetVariant).toBe('default');
        expect(knownPortrait.source).toContain(`/portraits/npc_dialogue/${npcId}/default_20261015.png`);
        expect(knownPortrait.emotionCategory).toBe(emotion.replace('emotion_',''));
        expect(knownPortrait.atlas).toBeTruthy();expect(knownPortrait.faceOverlay).toBeUndefined();
        expect(concealedPortrait.assetVariant).toBe('default');
        expect(concealedPortrait.source).toBe(knownPortrait.source);
        expect(concealedPortrait.atlas).toEqual(knownPortrait.atlas);
        expect(concealedPortrait).not.toHaveProperty('faceOverlay');
        expect(npcPortraitForContext(npcId,'casual',emotion,true).source).toContain(`/portraits/unmasked-clean/${npcId}/${emotion}.png`);
      }
    }
  });
});
