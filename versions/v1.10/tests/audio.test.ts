import { describe, it, expect } from "vitest";
import { SOUND_DEFS, isMuted, setMuted, toggleMute } from "../src/lib/audio";
import { ACTIONS, performAction } from "../src/game/core/actions";
import { JOB_DEFS } from "../src/game/core/jobs";
import { EVENTS } from "../src/game/core/events";
import { createInitialState } from "../src/game/core/state";
import type { SoundId } from "../src/game/types";

/** 全部 SoundId（与 types.ts 定义一致） */
const ALL_SOUND_IDS: SoundId[] = [
  "cashier", "eat", "coin", "shower", "exercise", "sleep", "nap",
  "study", "read", "walk", "rain", "success", "error", "phone", "game",
];

describe("音效定义表", () => {
  it("15 种音效全部有合成规格", () => {
    for (const id of ALL_SOUND_IDS) {
      expect(SOUND_DEFS[id], `缺音效定义: ${id}`).toBeDefined();
      expect(SOUND_DEFS[id].type).toBeTruthy();
      expect(SOUND_DEFS[id].notes.length).toBeGreaterThan(0);
    }
    expect(Object.keys(SOUND_DEFS).length).toBe(ALL_SOUND_IDS.length);
  });
});

describe("数据文件 sound 字段合法性", () => {
  it("所有行动都配置了合法 sound", () => {
    for (const a of ACTIONS) {
      expect(a.sound, `行动缺 sound: ${a.id}`).toBeDefined();
      expect(SOUND_DEFS[a.sound!]).toBeDefined();
    }
  });

  it("所有工作都配置了合法 sound", () => {
    for (const j of JOB_DEFS) {
      expect(j.sound, `工作缺 sound: ${j.id}`).toBeDefined();
      expect(SOUND_DEFS[j.sound!]).toBeDefined();
    }
  });

  it("所有事件都配置了合法 sound", () => {
    for (const e of EVENTS) {
      expect(e.sound, `事件缺 sound: ${e.id}`).toBeDefined();
      expect(SOUND_DEFS[e.sound!]).toBeDefined();
    }
  });
});

describe("sound 透传到结算结果", () => {
  it("performAction 的 result 携带行动 sound", () => {
    const s = createInitialState(1);
    s.time.hour = 10; // park 6-22 营业
    const r = performAction(s, "walk_park");
    expect(r.ok).toBe(true);
    expect(r.result?.sound).toBe("walk");
  });

  it("非休息类行动 sound 正确透传", () => {
    const s = createInitialState(1);
    s.time.hour = 12; // street 白天营业
    const r = performAction(s, "wander_street");
    expect(r.ok).toBe(true);
    expect(r.result?.sound).toBe("walk");
  });
});

describe("静音状态", () => {
  it("默认不静音", () => {
    expect(isMuted()).toBe(false);
  });

  it("setMuted / toggleMute 往返", () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(toggleMute()).toBe(false);
    expect(isMuted()).toBe(false);
    setMuted(false);
  });
});
