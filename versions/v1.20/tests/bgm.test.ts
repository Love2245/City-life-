import { describe, it, expect } from "vitest";
import {
  BGM_TRACKS,
  bgmForHour,
  setBgmVolume,
  getBgmVolume,
  setBgmEnabled,
  isBgmEnabled,
  setSfxVolume,
  getSfxVolume,
  setBgmSelection,
  getBgmSelection,
  type BgmTrackId,
} from "../src/lib/audio";

describe("v1.11 背景音乐：五时段", () => {
  it("BGM_TRACKS 含五首且字段合法", () => {
    const ids: BgmTrackId[] = ["dawn", "morning", "noon", "afternoon", "night"];
    for (const id of ids) {
      const t = BGM_TRACKS[id];
      expect(t).toBeDefined();
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.step).toBeGreaterThan(0);
      expect(t.notes.length).toBeGreaterThan(0);
      expect(t.gain).toBeGreaterThan(0);
      expect(["triangle", "sine", "square", "sawtooth"]).toContain(t.type);
    }
    // 五首音序各不相同
    const sigs = ids.map((id) => BGM_TRACKS[id].notes.join(","));
    expect(new Set(sigs).size).toBe(5);
  });

  it("bgmForHour 时段边界：0-6 凌晨 / 6-11 早 / 11-14 中 / 14-18 下午 / 18-24 晚", () => {
    expect(bgmForHour(0)).toBe("dawn");
    expect(bgmForHour(3)).toBe("dawn");
    expect(bgmForHour(5)).toBe("dawn");
    expect(bgmForHour(6)).toBe("morning");
    expect(bgmForHour(10)).toBe("morning");
    expect(bgmForHour(11)).toBe("noon");
    expect(bgmForHour(13)).toBe("noon");
    expect(bgmForHour(14)).toBe("afternoon");
    expect(bgmForHour(17)).toBe("afternoon");
    expect(bgmForHour(18)).toBe("night");
    expect(bgmForHour(23)).toBe("night");
  });
});

describe("v1.11 独立音量", () => {
  it("音乐音量 get/set 往返且 clamp 0-100", () => {
    setBgmVolume(35);
    expect(getBgmVolume()).toBe(35);
    setBgmVolume(150);
    expect(getBgmVolume()).toBe(100);
    setBgmVolume(-10);
    expect(getBgmVolume()).toBe(0);
  });

  it("音效音量 get/set 往返且 clamp 0-100（与音乐音量独立）", () => {
    setSfxVolume(70);
    expect(getSfxVolume()).toBe(70);
    // 音乐音量不受影响
    setBgmVolume(20);
    expect(getSfxVolume()).toBe(70);
    setSfxVolume(999);
    expect(getSfxVolume()).toBe(100);
    setSfxVolume(-5);
    expect(getSfxVolume()).toBe(0);
  });

  it("开关 get/set 往返", () => {
    setBgmEnabled(true);
    expect(isBgmEnabled()).toBe(true);
    setBgmEnabled(false);
    expect(isBgmEnabled()).toBe(false);
    setBgmEnabled(true);
  });
});

describe("v1.11 手动选曲", () => {
  it("set/get 往返（auto 与五曲目）", () => {
    setBgmSelection("auto");
    expect(getBgmSelection()).toBe("auto");
    setBgmSelection("night");
    expect(getBgmSelection()).toBe("night");
    setBgmSelection("dawn");
    expect(getBgmSelection()).toBe("dawn");
    setBgmSelection("auto");
  });
});
