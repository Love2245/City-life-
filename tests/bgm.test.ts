import { describe, it, expect } from "vitest";
import {
  BGM_TRACKS,
  bgmForHour,
  legacyBgmForHour,
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

describe("小游戏旧配乐与四时段地图选曲", () => {
  it("小游戏保留五首旧配乐且字段合法", () => {
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

  it("地图配乐每六小时切换：00–06 深夜 / 06–12 早间 / 12–18 午间 / 18–24 晚间", () => {
    expect(bgmForHour(0)).toBe("dawn");
    expect(bgmForHour(3)).toBe("dawn");
    expect(bgmForHour(5)).toBe("dawn");
    expect(bgmForHour(6)).toBe("morning");
    expect(bgmForHour(10)).toBe("morning");
    expect(bgmForHour(11)).toBe("morning");
    expect(bgmForHour(12)).toBe("noon");
    expect(bgmForHour(13)).toBe("noon");
    expect(bgmForHour(14)).toBe("noon");
    expect(bgmForHour(17)).toBe("noon");
    expect(bgmForHour(18)).toBe("night");
    expect(bgmForHour(23)).toBe("night");
  });

  it("小游戏仍沿用原来五时段的音序选择", () => {
    expect(legacyBgmForHour(5)).toBe("dawn");
    expect(legacyBgmForHour(6)).toBe("morning");
    expect(legacyBgmForHour(10)).toBe("morning");
    expect(legacyBgmForHour(11)).toBe("noon");
    expect(legacyBgmForHour(13)).toBe("noon");
    expect(legacyBgmForHour(14)).toBe("afternoon");
    expect(legacyBgmForHour(17)).toBe("afternoon");
    expect(legacyBgmForHour(18)).toBe("night");
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

describe("手动地图选曲", () => {
  it("set/get 往返（auto 与地图曲目）", () => {
    setBgmSelection("auto");
    expect(getBgmSelection()).toBe("auto");
    setBgmSelection("night");
    expect(getBgmSelection()).toBe("night");
    setBgmSelection("dawn");
    expect(getBgmSelection()).toBe("dawn");
    setBgmSelection("auto");
  });

  it("旧存储中的 afternoon 选择兼容为午间配乐", () => {
    setBgmSelection("afternoon");
    expect(getBgmSelection()).toBe("noon");
    setBgmSelection("auto");
  });
});
