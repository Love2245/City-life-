import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicPlayer, type MusicFile } from "../src/lib/musicPlayer";

type GainEvent = { type: "set" | "ramp"; value: number; at: number };

class FakeParam {
  events: GainEvent[] = [];
  setValueAtTime = vi.fn((value: number, at: number) => { this.events.push({ type: "set", value, at }); });
  linearRampToValueAtTime = vi.fn((value: number, at: number) => { this.events.push({ type: "ramp", value, at }); });
  cancelScheduledValues = vi.fn((at: number) => { this.events = this.events.filter((event) => event.at < at); });
}

class FakeGain {
  gain = new FakeParam();
  connectedTo: unknown;
  connect = vi.fn((node: unknown) => { this.connectedTo = node; return node; });
  disconnect = vi.fn();
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  offset = 0;
  ended = false;
  disconnected = false;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  connectedTo: FakeGain | null = null;
  constructor(private readonly context: FakeContext) {}
  connect = vi.fn((node: FakeGain) => { this.connectedTo = node; return node; });
  disconnect = vi.fn(() => { this.disconnected = true; });
  start = vi.fn((at = 0, offset = 0) => {
    if (this.context.throwOnStart) {
      this.context.throwOnStart = false;
      throw new Error("device start failed");
    }
    this.startedAt = at;
    this.offset = offset;
  });
  stop = vi.fn((at = this.context.currentTime) => {
    if (this.endTimer !== null) clearTimeout(this.endTimer);
    const end = () => {
      this.endTimer = null;
      this.ended = true;
      this.onended?.();
    };
    if (at <= this.context.currentTime) end();
    else this.endTimer = setTimeout(end, (at - this.context.currentTime) * 1000);
  });
}

class FakeContext {
  destination = {};
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  throwOnStart = false;
  get currentTime(): number { return Date.now() / 1000; }
  createGain = vi.fn(() => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  });
  createBufferSource = vi.fn(() => {
    const source = new FakeSource(this);
    this.sources.push(source);
    return source;
  });
  decodeAudioData = vi.fn(async () => buffer(12));
  asAudioContext(): AudioContext { return this as unknown as AudioContext; }
  liveSources(): FakeSource[] { return this.sources.filter((source) => !source.ended && !source.disconnected); }
}

const buffer = (duration: number): AudioBuffer => ({ duration } as AudioBuffer);
const file = (id: string): MusicFile => ({ id, url: `/${id}.mp3` });
const settle = async () => { await vi.advanceTimersByTimeAsync(0); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("文件背景音乐的循环、切换和生命周期", () => {
  let context: FakeContext;
  const players: MusicPlayer[] = [];
  const makePlayer = (options: ConstructorParameters<typeof MusicPlayer>[1] = {}) => {
    const player = new MusicPlayer(context.asAudioContext(), options);
    players.push(player);
    return player;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    context = new FakeContext();
  });
  afterEach(() => {
    for (const player of players.splice(0)) player.dispose();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("只解码当前曲目，以音频时钟提前安排 3 秒循环交叉渐变，连续循环不重复解码", async () => {
    const loader = vi.fn(async () => buffer(12));
    const onStarted = vi.fn();
    const player = makePlayer({ loader, onStarted });
    expect(loader).not.toHaveBeenCalled();
    player.setTrack(file("morning"));
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(context.sources.map((source) => source.start.mock.calls[0])).toEqual([[0, 0], [9, 0]]);
    expect(context.sources.every((source) => source.loop === false)).toBe(true);
    expect(context.sources[0].connectedTo!.gain.events).toEqual([
      { type: "set", value: 0, at: 0 },
      { type: "ramp", value: 1, at: 3 },
      { type: "set", value: 1, at: 9 },
      { type: "ramp", value: 0, at: 12 },
    ]);
    expect(context.sources[1].connectedTo!.gain.events.slice(0, 2)).toEqual([
      { type: "set", value: 0, at: 9 },
      { type: "ramp", value: 1, at: 12 },
    ]);
    await vi.advanceTimersByTimeAsync(36000);
    expect(context.sources.map((source) => source.startedAt)).toEqual([0, 9, 18, 27, 36, 45]);
    expect(context.liveSources().length).toBeLessThanOrEqual(3);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(onStarted).toHaveBeenCalledExactlyOnceWith("morning");
  });

  it("换曲同时淡出旧曲、淡入新曲，并取消尚未开始的旧循环；同曲不会重新开始", async () => {
    const loader = vi.fn(async () => buffer(20));
    const player = makePlayer({ loader });
    player.setTrack(file("morning"));
    await settle();
    const old = context.sources[0];
    const oldQueued = context.sources[1];
    await vi.advanceTimersByTimeAsync(5000);
    player.setTrack(file("afternoon"));
    await settle();
    expect(old.stop).toHaveBeenLastCalledWith(8);
    expect(old.connectedTo!.gain.events.slice(-2)).toEqual([
      { type: "set", value: 1, at: 5 },
      { type: "ramp", value: 0, at: 8 },
    ]);
    expect(oldQueued.stop).toHaveBeenLastCalledWith(5);
    expect(oldQueued.disconnected).toBe(true);
    const fresh = context.sources[2];
    expect(fresh.start).toHaveBeenCalledWith(5, 0);
    expect(fresh.connectedTo!.gain.events[1]).toEqual({ type: "ramp", value: 1, at: 8 });
    player.setTrack(file("afternoon"));
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(context.sources.length).toBe(4);
    await vi.advanceTimersByTimeAsync(3000);
    expect(old.disconnected).toBe(true);
    expect(context.liveSources().length).toBe(2);
  });

  it("离开咖啡馆时即使下一首尚未加载，旧场所曲也会快速停止且不会续播", async () => {
    const slow = deferred<AudioBuffer>();
    const player = makePlayer({loader:url=>url==='/slow.mp3'?slow.promise:Promise.resolve(buffer(20))});
    player.setTrack(file('cafe'));await settle();await vi.advanceTimersByTimeAsync(4000);
    player.setTrack(file('slow'),true);await settle();
    await vi.advanceTimersByTimeAsync(250);
    expect(context.liveSources()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(20000);
    expect(context.liveSources()).toHaveLength(0);
    slow.resolve(buffer(20));await settle();
    expect(context.liveSources()).toHaveLength(2);
  });

  it("新曲加载失败会继续旧曲，失败回调只对应当前请求", async () => {
    const bad = deferred<AudioBuffer>();
    const loader = vi.fn((url: string) => url === "/bad.mp3" ? bad.promise : Promise.resolve(buffer(20)));
    const onError = vi.fn();
    const player = makePlayer({ loader, onError });
    player.setTrack(file("morning"));
    await settle();
    player.setTrack(file("bad"));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(context.sources[0].stop).toHaveBeenLastCalledWith(20);
    bad.reject(new Error("missing asset"));
    await settle();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "missing asset" }), "bad");
    expect(context.liveSources().length).toBe(2);
    await vi.advanceTimersByTimeAsync(12000);
    expect(context.sources[2].start).toHaveBeenCalledWith(34, 0);
  });

  it("异步返回的过期曲目及过期错误不能替换最新场景音乐", async () => {
    const slow = deferred<AudioBuffer>();
    const failed = deferred<AudioBuffer>();
    const onStarted = vi.fn();
    const onError = vi.fn();
    const player = makePlayer({
      loader: (url) => url === "/slow.mp3" ? slow.promise : url === "/failed.mp3" ? failed.promise : Promise.resolve(buffer(20)),
      onStarted, onError,
    });
    player.setTrack(file("slow"));
    await settle();
    player.setTrack(file("failed"));
    await settle();
    player.setTrack(file("night"));
    await settle();
    slow.resolve(buffer(20));
    failed.reject(new Error("stale"));
    await settle();
    expect(onStarted).toHaveBeenCalledExactlyOnceWith("night");
    expect(onError).not.toHaveBeenCalled();
    expect(context.sources.length).toBe(2);
  });

  it("新曲未加载前返回当前曲不会重启当前曲，迟到的新曲也不会播放", async () => {
    const slow = deferred<AudioBuffer>();
    const onStarted = vi.fn();
    const loader = vi.fn((url: string) => url === "/slow.mp3" ? slow.promise : Promise.resolve(buffer(20)));
    const player = makePlayer({ loader, onStarted });
    player.setTrack(file("morning"));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    player.setTrack(file("slow"));
    await settle();
    player.setTrack(file("morning"));
    slow.resolve(buffer(20));
    await settle();
    expect(context.sources).toHaveLength(2);
    expect(context.sources[0].stop).toHaveBeenLastCalledWith(20);
    expect(onStarted).toHaveBeenCalledExactlyOnceWith("morning");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('按解码字节限制长曲缓存，淘汰旧曲后能重新载入播放',async()=>{
    const loader=vi.fn(async()=>({duration:60,length:1_572_864,numberOfChannels:2} as AudioBuffer));
    const player=makePlayer({loader});
    for(const id of ['a','b','c','a']){player.setTrack(file(id));await settle();}
    expect(loader).toHaveBeenCalledTimes(4);expect(context.sources.at(-1)?.buffer?.duration).toBe(60);
  });
  it("完成换曲后返回之前的同曲仍有 3 秒渐变，并复用缓存", async () => {
    const loader = vi.fn(async () => buffer(20));
    const player = makePlayer({ loader });
    player.setTrack(file("morning"));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    player.setTrack(file("night"));
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    player.setTrack(file("morning"));
    await settle();
    expect(context.sources.at(-2)!.start).toHaveBeenCalledWith(6, 0);
    expect(context.sources.at(-2)!.connectedTo!.gain.events[1]).toEqual({ type: "ramp", value: 1, at: 9 });
    expect(context.sources[2].stop).toHaveBeenLastCalledWith(9);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(context.liveSources().length).toBeLessThanOrEqual(4);
  });

  it("快速连续换曲最多保留 4 个背景 source，旧曲的未来循环不残留", async () => {
    const player = makePlayer({ loader: async () => buffer(20) });
    for (let i = 0; i < 12; i++) {
      player.setTrack(file(`scene${i}`));
      await settle();
      expect(context.liveSources().length).toBeLessThanOrEqual(4);
      expect(context.liveSources().filter((source) => source.startedAt! > context.currentTime).length).toBe(1);
    }
    await vi.advanceTimersByTimeAsync(3000);
    expect(context.liveSources().length).toBe(2);
  });

  it("暂停立即停音并保留循环中正在播放的进度；恢复淡入续播且短乐句不重放", async () => {
    const loader = vi.fn(async (url: string) => buffer(url === "/door.mp3" ? 4 : 12));
    const player = makePlayer({ loader });
    player.setTrack(file("morning"));
    await settle();
    await vi.advanceTimersByTimeAsync(10000);
    player.playJingle(file("door"));
    await settle();
    player.pause();
    expect(context.liveSources()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30000);
    player.resume();
    await settle();
    const resumed = context.sources[context.sources.length - 2];
    expect(resumed.start).toHaveBeenCalledWith(40, 1);
    expect(resumed.connectedTo!.gain.events[1]).toEqual({ type: "ramp", value: 1, at: 43 });
    expect(loader.mock.calls.filter(([url]) => url === "/door.mp3")).toHaveLength(1);
    expect(context.liveSources()).toHaveLength(2);
    expect(context.gains[1].gain.events.at(-1)).toEqual({ type: "set", value: 1, at: 10 });
  });

  it("暂停中可改场景，但直到恢复才加载新曲，并从新曲起点开始", async () => {
    const loader = vi.fn(async () => buffer(20));
    const player = makePlayer({ loader });
    player.setTrack(file("morning"));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    player.pause();
    player.setTrack(file("temple"));
    player.playJingle(file("door"));
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    player.resume();
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(context.sources[2].start).toHaveBeenCalledWith(5, 0);
  });

  it("暂停后设置空曲目，恢复也不会重放之前的背景", async () => {
    const loader = vi.fn(async () => buffer(20));
    const player = makePlayer({ loader });
    player.setTrack(file("morning"));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    player.pause();
    player.setTrack(null);
    player.resume();
    await settle();
    expect(context.sources).toHaveLength(2);
    expect(context.liveSources()).toHaveLength(0);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("设置空曲目淡出当前曲并停止循环，正在加载的旧请求不会在之后播放", async () => {
    const slow = deferred<AudioBuffer>();
    const player = makePlayer({ loader: (url) => url === "/slow.mp3" ? slow.promise : Promise.resolve(buffer(20)) });
    player.setTrack(file("morning"));
    await settle();
    await vi.advanceTimersByTimeAsync(4000);
    player.setTrack(file("slow"));
    await settle();
    player.setTrack(null);
    expect(context.sources[0].stop).toHaveBeenLastCalledWith(7);
    expect(context.sources[1].disconnected).toBe(true);
    slow.resolve(buffer(20));
    await settle();
    await vi.advanceTimersByTimeAsync(30000);
    expect(context.sources.length).toBe(2);
    expect(context.liveSources()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("仅缓存最近使用的 3 个解码缓冲，缓存命中不重新解码", async () => {
    const loader = vi.fn(async () => buffer(20));
    const player = makePlayer({ loader });
    for (const id of ["a", "b", "c", "a", "d", "b", "a"]) {
      player.setTrack(file(id));
      await settle();
    }
    expect(loader.mock.calls.map(([url]) => url)).toEqual(["/a.mp3", "/b.mp3", "/c.mp3", "/d.mp3", "/b.mp3"]);
  });

  it("source 启动失败时旧曲仍继续，异常被回调接收且可之后重试", async () => {
    const onError = vi.fn();
    const player = makePlayer({ loader: async () => buffer(20), onError });
    player.setTrack(file("morning"));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    context.throwOnStart = true;
    player.setTrack(file("night"));
    await settle();
    expect(context.sources[0].stop).toHaveBeenLastCalledWith(20);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "device start failed" }), "night");
    player.setTrack(file("night"));
    await settle();
    expect(context.sources.at(-2)!.start).toHaveBeenCalledWith(5, 0);
  });

  it("预排下一轮 source 失败时不遗留调度计时器，也不错误通知播放成功", async () => {
    const onError = vi.fn();
    const onStarted = vi.fn();
    const create = context.createBufferSource.getMockImplementation()!;
    context.createBufferSource.mockImplementation(() => {
      const source = create();
      if (context.sources.length === 2) source.start.mockImplementation(() => { throw new Error("queued start failed"); });
      return source;
    });
    const player = makePlayer({ loader: async () => buffer(20), onError, onStarted });
    player.setTrack(file("morning"));
    await settle();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "queued start failed" }), "morning");
    expect(onStarted).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1); // Only the already-started source's natural end remains.
    await vi.advanceTimersByTimeAsync(21000);
    expect(vi.getTimerCount()).toBe(0);
    expect(context.sources).toHaveLength(2);
  });

  it("dispose 清理调度和音频节点，未完成加载也不会创建后续播放", async () => {
    const slow = deferred<AudioBuffer>();
    const player = makePlayer({ loader: (url) => url === "/slow.mp3" ? slow.promise : Promise.resolve(buffer(12)) });
    player.setTrack(file("morning"));
    await settle();
    player.playJingle(file("slow"));
    await settle();
    player.dispose();
    expect(context.liveSources()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(context.gains[0].disconnect).toHaveBeenCalled();
    expect(context.gains[1].disconnect).toHaveBeenCalled();
    slow.resolve(buffer(4));
    await settle();
    player.resume();
    player.setTrack(file("night"));
    expect(context.sources.length).toBe(2);
  });
});

describe("短乐句和独立音乐音量", () => {
  let context: FakeContext;
  let player: MusicPlayer;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    context = new FakeContext();
    player = new MusicPlayer(context.asAudioContext(), { loader: async (url) => buffer(url.includes("door") ? 4 : 20) });
  });
  afterEach(() => { player.dispose(); vi.useRealTimers(); });

  it("进出门乐句只播放一次，压低背景并自动恢复，不改变背景的播放进度", async () => {
    player.setTrack(file("morning"));
    await settle();
    const background = context.sources[0];
    await vi.advanceTimersByTimeAsync(4000);
    player.playJingle(file("door"));
    await settle();
    const jingle = context.sources[2];
    expect(jingle.loop).toBe(false);
    expect(jingle.start).toHaveBeenCalledExactlyOnceWith(4, 0);
    expect(jingle.connectedTo!.connectedTo).toBe(context.gains[0]);
    expect(background.connectedTo!.connectedTo).toBe(context.gains[1]);
    expect(context.gains[1].gain.events.slice(-4)).toEqual([
      { type: "set", value: 1, at: 4 },
      { type: "ramp", value: 0.25, at: 4.25 },
      { type: "set", value: 0.25, at: 8 },
      { type: "ramp", value: 1, at: 8.6 },
    ]);
    await vi.advanceTimersByTimeAsync(9000);
    expect(jingle.disconnected).toBe(true);
    expect(background.start).toHaveBeenCalledExactlyOnceWith(0, 0);
    expect(context.sources.length).toBe(3);
  });

  it("主音量只调整音乐 master，保持循环包络和 jingle 压低比例", async () => {
    player.setTrack(file("morning"));
    await settle();
    const backgroundEnvelope = [...context.sources[0].connectedTo!.gain.events];
    const duckEnvelope = [...context.gains[1].gain.events];
    player.setVolume(0.5);
    expect(context.gains[0].gain.events.at(-1)).toEqual({ type: "ramp", value: 0.5, at: 0.08 });
    expect(context.sources[0].connectedTo!.gain.events).toEqual(backgroundEnvelope);
    expect(context.gains[1].gain.events).toEqual(duckEnvelope);
    player.setVolume(2);
    expect(context.gains[0].gain.events.at(-1)!.value).toBe(1);
    player.setVolume(-1);
    expect(context.gains[0].gain.events.at(-1)!.value).toBe(0);
  });

  it("取消未加载完成的短乐句不会稍后突然响起，连续乐句不会残留旧 source", async () => {
    const slow = deferred<AudioBuffer>();
    player.dispose();
    player = new MusicPlayer(context.asAudioContext(), { loader: (url) => url.includes("slow") ? slow.promise : Promise.resolve(buffer(4)) });
    player.playJingle(file("slow-door"));
    await settle();
    player.cancelJingle();
    slow.resolve(buffer(4));
    await settle();
    expect(context.sources).toHaveLength(0);
    player.playJingle(file("door-a"));
    await settle();
    const first = context.sources[0];
    await vi.advanceTimersByTimeAsync(1000);
    player.playJingle(file("door-b"));
    await settle();
    expect(first.disconnected).toBe(true);
    expect(context.liveSources()).toHaveLength(1);
    player.cancelJingle();
    await vi.advanceTimersByTimeAsync(100);
    expect(context.liveSources()).toHaveLength(0);
  });
});

describe("默认 MP3 加载", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("检查 HTTP 状态并交给当前 AudioContext 解码，失败不会启动 source", async () => {
    const context = new FakeContext();
    const payload = new ArrayBuffer(8);
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => payload }));
    vi.stubGlobal("fetch", fetchMock);
    const onStarted = vi.fn();
    const player = new MusicPlayer(context.asAudioContext(), { onStarted });
    player.setTrack(file("morning"));
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalledWith("morning"));
    expect(fetchMock).toHaveBeenCalledWith("/morning.mp3");
    expect(context.decodeAudioData).toHaveBeenCalledExactlyOnceWith(payload);
    player.dispose();
    const onError = vi.fn();
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as never);
    const failed = new MusicPlayer(context.asAudioContext(), { onError });
    failed.setTrack(file("missing"));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("404") }), "missing"));
    expect(context.sources).toHaveLength(2);
    failed.dispose();
  });
});
