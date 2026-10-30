// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const music = vi.hoisted(() => ({
  setTrack: vi.fn(), setVolume: vi.fn(), playJingle: vi.fn(), cancelJingle: vi.fn(),
  pause: vi.fn(), resume: vi.fn(), started: undefined as undefined | ((id: string) => void),
  failed: undefined as undefined | ((error: unknown, id: string) => void),
}));
vi.mock("../src/lib/musicPlayer", () => ({
  MusicPlayer: class {
    constructor(_context: unknown, options: { onStarted: (id: string) => void; onError: (error: unknown, id: string) => void }) {
      music.started = options.onStarted; music.failed = options.onError;
    }
    setTrack = music.setTrack;
    setVolume = music.setVolume;
    playJingle = music.playJingle;
    cancelJingle = music.cancelJingle;
    pause = music.pause;
    resume = music.resume;
  },
}));

describe("场景音乐与音频生命周期", () => {
  let context: {
    state: string; currentTime: number; destination: object;
    resume: ReturnType<typeof vi.fn>; suspend: ReturnType<typeof vi.fn>;
    createOscillator: ReturnType<typeof vi.fn>; createGain: ReturnType<typeof vi.fn>;
  };
  let originalAudioContext: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers(); vi.resetModules(); vi.clearAllMocks(); localStorage.clear();
    const oscillator = {
      type: "sine", frequency: { value: 0 },
      connect: vi.fn(function (this: unknown) { return this; }),
      start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null,
    };
    const gain = {
      gain: { value: 0, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
        linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(function (this: unknown) { return this; }),
    };
    context = {
      state: "suspended", currentTime: 0, destination: {},
      resume: vi.fn(async () => { context.state = "running"; }),
      suspend: vi.fn(async () => { context.state = "suspended"; }),
      createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain),
    };
    originalAudioContext = Object.getOwnPropertyDescriptor(window, "AudioContext");
    Object.defineProperty(window, "AudioContext", { configurable: true, value: vi.fn(function () { return context; }) });
  });

  afterEach(() => {
    vi.clearAllTimers(); vi.useRealTimers(); vi.resetModules();
    if (originalAudioContext) Object.defineProperty(window, "AudioContext", originalAudioContext);
    else Reflect.deleteProperty(window, "AudioContext");
  });

  it("未保存音量使用默认值，保存的零音量保持为零", async () => {
    let audio = await import("../src/lib/audio");
    expect(audio.getBgmVolume()).toBe(50); expect(audio.getSfxVolume()).toBe(50);
    localStorage.setItem("urban_life_audio_bgm_volume", "0");
    localStorage.setItem("urban_life_audio_sfx_volume", "0");
    vi.resetModules(); audio = await import("../src/lib/audio");
    expect(audio.getBgmVolume()).toBe(0); expect(audio.getSfxVolume()).toBe(0);
  });

  it("旧版默认音量升级到50%，自定义音量保持不变", async () => {
    localStorage.setItem("urban_life_audio_bgm_volume", "60");
    localStorage.setItem("urban_life_audio_sfx_volume", "80");
    let audio = await import("../src/lib/audio");
    expect(audio.getBgmVolume()).toBe(50);
    expect(audio.getSfxVolume()).toBe(50);

    vi.resetModules();
    localStorage.clear();
    localStorage.setItem("urban_life_audio_bgm_volume", "35");
    localStorage.setItem("urban_life_audio_sfx_volume", "100");
    audio = await import("../src/lib/audio");
    expect(audio.getBgmVolume()).toBe(35);
    expect(audio.getSfxVolume()).toBe(100);
  });

  it("首次手势后才播放文件音乐，后台暂停，前台恢复同一曲", async () => {
    const audio = await import("../src/lib/audio");
    audio.setMusicScene({ hour: 9, inGame: true });
    expect(music.setTrack).not.toHaveBeenCalled();
    audio.unlockAudio();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "morning" }),false);
    expect(context.createOscillator).not.toHaveBeenCalled();
    audio.pauseAudio();
    expect(context.suspend).toHaveBeenCalledTimes(1); expect(music.pause).toHaveBeenCalled();
    audio.resumeAudio();
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "morning" }),false);
    expect(music.resume).toHaveBeenCalled();
  });

  it("设施覆盖手动地图曲，门乐句只在真实进出触发，读档和刷新不重复", async () => {
    const audio = await import("../src/lib/audio");
    const outside = { hour: 9, inGame: true, locationId: "map", sessionKey: 1 };
    audio.setMusicScene(outside); audio.unlockAudio();
    audio.setBgmSelection("night");
    audio.setMusicScene({ ...outside, locationId: "church" });
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "church" }),false);
    audio.applyBgmForHour(12);
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "church" }),false);
    const shop = { ...outside, locationId: "convenience_store" };
    audio.setMusicScene(shop);
    expect(music.playJingle).toHaveBeenLastCalledWith(expect.objectContaining({ id: "store-enter" }));
    music.playJingle.mockClear();
    audio.setMusicScene({ ...shop, hour: 12 });
    audio.setMusicScene({ ...shop, sessionKey: 2 });
    expect(music.playJingle).not.toHaveBeenCalled();
    expect(music.cancelJingle).toHaveBeenCalled();
    audio.setMusicScene({ ...outside, sessionKey: 2 });
    expect(music.playJingle).toHaveBeenCalledTimes(1);
    expect(music.playJingle).toHaveBeenLastCalledWith(expect.objectContaining({ id: "store-exit" }));
  });

  it("音乐关或静音时门乐句跳过，重新开启不补播", async () => {
    const audio = await import("../src/lib/audio");
    audio.setMusicScene({ hour: 9, inGame: true }); audio.unlockAudio();
    audio.setBgmEnabled(false);
    audio.setMusicScene({ hour: 9, inGame: true, locationId: "cafe" });
    audio.setBgmEnabled(true); audio.setMuted(true);
    audio.setMusicScene({ hour: 9, inGame: true, locationId: "map" });
    audio.setMuted(false);
    expect(music.playJingle).not.toHaveBeenCalled(); expect(music.pause).toHaveBeenCalled();
  });

  it("多个可见小游戏 token 使用旧曲，最后一个退出才回设施曲", async () => {
    const audio = await import("../src/lib/audio");
    audio.setMusicScene({ hour: 15, inGame: true, locationId: "boyue_texas_shop" }); audio.unlockAudio();
    const endOne = audio.beginMinigameMusic(); const endTwo = audio.beginMinigameMusic();
    expect(music.setTrack).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(340);
    expect(context.createOscillator).toHaveBeenCalled();
    endOne(); expect(music.setTrack).toHaveBeenLastCalledWith(null);
    endTwo(); endTwo();
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "texas" }),false);
    music.started?.("texas");
    await vi.advanceTimersByTimeAsync(3000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('猫咪对决临时曲覆盖旧小游戏token，退出后恢复设施音乐且重复清理安全',async()=>{
    const audio=await import('../src/lib/audio');
    audio.setMusicScene({hour:15,inGame:true,locationId:'cafe'});audio.unlockAudio();
    const stopLegacy=audio.beginMinigameMusic('legacy');
    const stopDuel=audio.beginMinigameMusic('duel-street');
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'duel-street'}),false);
    music.started?.('duel-street');await vi.advanceTimersByTimeAsync(3000);
    context.createOscillator.mockClear();await vi.advanceTimersByTimeAsync(1000);expect(context.createOscillator).not.toHaveBeenCalled();
    stopLegacy();expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'duel-street'}),false);
    stopDuel();stopDuel();expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'cafe'}),false);
  });

  it('对决切曲沿用音量静音及后台暂停，退出还原手动选曲',async()=>{
    const audio=await import('../src/lib/audio');
    audio.setMusicScene({hour:9,inGame:false});audio.setBgmSelection('night');audio.unlockAudio();audio.setBgmVolume(30);
    const stop=audio.beginMinigameMusic('duel-final');expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'duel-final'}),false);expect(music.setVolume).toHaveBeenLastCalledWith(.3);
    audio.setMuted(true);expect(music.pause).toHaveBeenCalled();audio.setMuted(false);expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'duel-final'}),false);
    audio.pauseAudio();expect(context.suspend).toHaveBeenCalled();audio.resumeAudio();expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'duel-final'}),false);
    stop();expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'night'}),false);
  });

  it('对决解码失败不死循环，下一场可以重新尝试文件音乐',async()=>{
    const audio=await import('../src/lib/audio');audio.setMusicScene({hour:12,inGame:true});audio.unlockAudio();
    const stop=audio.beginMinigameMusic('duel-arcade');music.failed?.(new Error('decode'),'duel-arcade');expect(music.setTrack).toHaveBeenLastCalledWith(null);
    stop();const again=audio.beginMinigameMusic('duel-arcade');expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({id:'duel-arcade'}),false);again();
  });

  it("加载新曲失败会回退旧曲，短乐句失败不会替换背景曲", async () => {
    const audio = await import("../src/lib/audio");
    audio.setMusicScene({ hour: 9, inGame: true }); audio.unlockAudio();
    audio.setMusicScene({ hour: 21, inGame: true, locationId: "temple" });
    music.failed?.(new Error("offline"), "temple");
    expect(music.setTrack).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(520);
    expect(context.createOscillator).toHaveBeenCalled();
    audio.setMusicScene({ hour: 12, inGame: true });
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "noon" }),false);
    music.failed?.(new Error("offline"), "store-enter");
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "noon" }),false);
  });
  it("自带音乐的外卖小游戏阻止全局旧配乐，返回后恢复地图曲", async () => {
    const audio = await import("../src/lib/audio");
    audio.setMusicScene({ hour: 9, inGame: true }); audio.unlockAudio();
    const endEmbedded = audio.beginMinigameMusic("embedded");
    const endLegacy = audio.beginMinigameMusic("legacy");
    expect(music.setTrack).toHaveBeenLastCalledWith(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.createOscillator).not.toHaveBeenCalled();
    endLegacy(); endEmbedded();
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "morning" }),false);
  });
  it("场景棋牌与舞蹈不切到旧配乐，即使嵌套组件还保有旧曲 token", async () => {
    const audio = await import("../src/lib/audio");
    audio.setMusicScene({ hour: 21, inGame: true, locationId: "boyue_texas_shop" }); audio.unlockAudio();
    const endLegacy = audio.beginMinigameMusic("legacy");
    const endScene = audio.beginMinigameMusic("scene");
    expect(music.setTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: "texas" }),false);
    music.started?.("texas");
    await vi.advanceTimersByTimeAsync(3000);
    context.createOscillator.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.createOscillator).not.toHaveBeenCalled();
    endLegacy(); endScene();
  });

});
