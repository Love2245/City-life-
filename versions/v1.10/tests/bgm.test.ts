import { describe, it, expect } from "vitest";
import {
  BGM_TRACKS,
  setBgmVolume,
  getBgmVolume,
  setBgmEnabled,
  isBgmEnabled,
  type BgmTrackId,
} from "../src/lib/audio";

describe("v1.10 背景音乐", () => {
  it("BGM_TRACKS 含昼夜两首且字段合法", () => {
    const ids: BgmTrackId[] = ["day", "night"];
    for (const id of ids) {
      const t = BGM_TRACKS[id];
      expect(t).toBeDefined();
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.step).toBeGreaterThan(0);
      expect(t.notes.length).toBeGreaterThan(0);
      expect(t.gain).toBeGreaterThan(0);
      expect(["triangle", "sine", "square", "sawtooth"]).toContain(t.type);
    }
    // 两首曲目应有不同音序
    expect(BGM_TRACKS.day.notes).not.toEqual(BGM_TRACKS.night.notes);
  });

  it("音量 get/set 往返且 clamp 0-100", () => {
    setBgmVolume(35);
    expect(getBgmVolume()).toBe(35);
    setBgmVolume(150);
    expect(getBgmVolume()).toBe(100);
    setBgmVolume(-10);
    expect(getBgmVolume()).toBe(0);
  });

  it("开关 get/set 往返", () => {
    setBgmEnabled(true);
    expect(isBgmEnabled()).toBe(true);
    setBgmEnabled(false);
    expect(isBgmEnabled()).toBe(false);
    setBgmEnabled(true);
  });
});
