/**
 * 音效系统：Web Audio API 程序化合成 8-bit 风格短提示音。
 * 零素材文件，运行时生成，便携版友好。
 * 纯工具库（允许访问 window/AudioContext；src/game/ 纯逻辑层不依赖本模块）。
 * 静音状态持久化到 localStorage（key 与 save.ts 的 urban_life_ 前缀一致）。
 */
import type { SoundId } from "../game/types";

/** 单音合成规格 */
export interface SoundSpec {
  /** 振荡器波形 */
  type: OscillatorType;
  /** 频率序列（Hz），单音循环播放 */
  notes: number[];
  /** 每音时长（秒），缺省 0.12 */
  step?: number;
  /** 起音（秒） */
  attack?: number;
  /** 衰减（秒） */
  decay?: number;
  /** 峰值增益 */
  gain?: number;
  /** 噪声类音效：rain=低通 2k / shower=带通 4k */
  noise?: "rain" | "shower";
  /** 噪声总时长（秒） */
  dur?: number;
}

/** 音效定义表（纯数据，可单测） */
export const SOUND_DEFS: Record<SoundId, SoundSpec> = {
  cashier: { type: "square", notes: [1568, 2093], step: 0.09, gain: 0.5 },
  eat: { type: "triangle", notes: [523, 659, 784], step: 0.1, gain: 0.4 },
  coin: { type: "square", notes: [988, 1319], step: 0.07, gain: 0.45 },
  shower: { type: "sine", notes: [0], noise: "shower", dur: 0.6, gain: 0.15 },
  exercise: { type: "sawtooth", notes: [392, 523], step: 0.08, gain: 0.5 },
  sleep: { type: "sine", notes: [392, 330, 262], step: 0.35, gain: 0.22 },
  nap: { type: "sine", notes: [392, 330], step: 0.3, gain: 0.2 },
  study: { type: "triangle", notes: [440, 550, 660], step: 0.11, gain: 0.35 },
  read: { type: "triangle", notes: [330, 392], step: 0.18, gain: 0.3 },
  walk: { type: "square", notes: [220, 220], step: 0.07, gain: 0.3 },
  rain: { type: "sine", notes: [0], noise: "rain", dur: 1.0, gain: 0.12 },
  success: { type: "square", notes: [523, 659, 784, 1047], step: 0.09, gain: 0.4 },
  error: { type: "sawtooth", notes: [220, 196, 165], step: 0.15, gain: 0.4 },
  phone: { type: "square", notes: [880, 880], step: 0.15, gain: 0.4 },
  game: { type: "square", notes: [523, 659, 784, 1047, 1319], step: 0.07, gain: 0.45 },
};

/** 静音持久化 key */
const MUTE_KEY = "urban_life_audio_muted";
/** BGM 持久化 keys（v1.10） */
const BGM_VOL_KEY = "urban_life_audio_bgm_volume";
const BGM_ENABLED_KEY = "urban_life_audio_bgm_enabled";
/** 同时发声上限（超出丢最早） */
const MAX_VOICES = 8;

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;

try {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  }
} catch {
  // localStorage 不可用（隐私模式等）时保持默认
}

/* ==================== v1.10 背景音乐（程序化合成循环） ==================== */

/** BGM 曲目 id */
export type BgmTrackId = "day" | "night";

/** BGM 曲目定义（纯数据，可单测） */
export interface BgmTrack {
  name: string;
  /** 每音间隔（秒） */
  step: number;
  /** 循环音序（Hz，0=休止） */
  notes: number[];
  /** 波形 */
  type: OscillatorType;
  /** 峰值增益 */
  gain: number;
}

/** 曲目表：城市白昼（明快五声音阶）/ 城市夜晚（舒缓小调） */
export const BGM_TRACKS: Record<BgmTrackId, BgmTrack> = {
  day: {
    name: "城市白昼",
    step: 0.38,
    type: "triangle",
    gain: 0.09,
    notes: [523, 659, 784, 659, 880, 784, 659, 523, 587, 698, 880, 698, 1047, 880, 698, 587],
  },
  night: {
    name: "城市夜晚",
    step: 0.52,
    type: "sine",
    gain: 0.08,
    notes: [440, 523, 440, 349, 392, 440, 330, 392, 440, 523, 587, 523, 440, 392, 330, 262],
  },
};

let bgmVolume = 60; // 0-100
let bgmEnabled = true;
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmTrack: BgmTrackId | null = null;
let bgmIdx = 0;

try {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const v = Number(localStorage.getItem(BGM_VOL_KEY));
    if (!Number.isNaN(v) && v >= 0 && v <= 100) bgmVolume = v;
    bgmEnabled = localStorage.getItem(BGM_ENABLED_KEY) !== "0";
  }
} catch {
  // 忽略持久化失败
}

/** 播放 BGM 循环中的一个音符 */
function bgmTick(): void {
  if (!bgmEnabled || muted || !bgmTrack) return;
  const c = getCtx();
  if (!c) return;
  const tr = BGM_TRACKS[bgmTrack];
  if (!tr) return;
  const f = tr.notes[bgmIdx % tr.notes.length];
  bgmIdx++;
  if (f > 0) {
    try {
      tone(c, { type: tr.type, notes: [f], step: tr.step, gain: tr.gain, decay: tr.step * 0.9 }, f, c.currentTime + 0.02, (tr.gain * bgmVolume) / 100);
    } catch {
      // 音频异常静默降级
    }
  }
}

/** 开始播放背景音乐（track: day/night） */
export function startBgm(track: BgmTrackId): void {
  if (bgmTrack === track && bgmTimer) return;
  bgmTrack = track;
  bgmIdx = 0;
  if (bgmTimer) clearInterval(bgmTimer);
  const tr = BGM_TRACKS[track];
  bgmTimer = setInterval(bgmTick, (tr?.step ?? 0.5) * 1000);
}

/** 停止背景音乐 */
export function stopBgm(): void {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
  bgmTrack = null;
}

/** 设置 BGM 音量（0-100），持久化 */
export function setBgmVolume(v: number): void {
  bgmVolume = Math.max(0, Math.min(100, Math.round(v)));
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(BGM_VOL_KEY, String(bgmVolume));
  } catch {
    // 忽略
  }
}

export function getBgmVolume(): number {
  return bgmVolume;
}

/** 设置 BGM 开关（true=开），持久化；关闭即停播，打开恢复播放 */
export function setBgmEnabled(on: boolean): void {
  bgmEnabled = on;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(BGM_ENABLED_KEY, on ? "1" : "0");
  } catch {
    // 忽略
  }
  if (!on) {
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = null;
  } else if (bgmTrack && !bgmTimer) {
    const tr = BGM_TRACKS[bgmTrack];
    bgmTimer = setInterval(bgmTick, (tr?.step ?? 0.5) * 1000);
  }
}

export function isBgmEnabled(): boolean {
  return bgmEnabled;
}

/** 懒初始化 AudioContext */
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** 生成 1s 白噪声缓冲并缓存 */
function getNoise(c: AudioContext): AudioBuffer | null {
  if (noiseBuffer) return noiseBuffer;
  const len = c.sampleRate;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/** 播放单个频率音（带包络） */
function tone(c: AudioContext, spec: SoundSpec, freq: number, at: number, peak: number): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  const attack = spec.attack ?? 0.01;
  const decay = spec.decay ?? 0.08;
  osc.type = spec.type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.001, at + attack + decay);
  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + attack + decay + 0.02);
  track(osc);
}

/** 播放噪声音（rain/shower，带滤波与包络） */
function noise(c: AudioContext, spec: SoundSpec, at: number, peak: number): void {
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const g = c.createGain();
  const attack = spec.attack ?? 0.15;
  const decay = spec.decay ?? 0.3;
  const dur = spec.dur ?? 1.0;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.001, at + attack + decay);
  if (spec.noise === "rain") {
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2000;
    src.connect(filter).connect(g).connect(c.destination);
  } else {
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 4000;
    src.connect(filter).connect(g).connect(c.destination);
  }
  src.start(at);
  src.stop(at + dur + 0.05);
  track(src);
}

/** 音量管理：超上限停止最早的音源 */
const voices = new Set<AudioScheduledSourceNode>();
function track(v: AudioScheduledSourceNode): void {
  voices.add(v);
  v.onended = () => voices.delete(v);
  if (voices.size > MAX_VOICES) {
    const oldest = voices.values().next().value;
    if (oldest) {
      try {
        oldest.stop();
      } catch {
        // 已停止
      }
    }
  }
}

/**
 * 播放音效（静音时静默跳过）。
 * 所有调用点都在用户交互链上，AudioContext 会自动 resume。
 */
export function playSound(id: SoundId, opts?: { gain?: number }): void {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  const spec = SOUND_DEFS[id];
  if (!spec) return;
  try {
    const peak = (opts?.gain ?? spec.gain ?? 0.4) * 0.9;
    const now = c.currentTime + 0.01;
    if (spec.noise) {
      noise(c, spec, now, peak);
      return;
    }
    const step = spec.step ?? 0.12;
    spec.notes.forEach((f, i) => {
      if (f > 0) tone(c, spec, f, now + i * step, peak);
    });
  } catch {
    // 音频设备异常时静默降级
  }
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    // 忽略持久化失败
  }
}

export function isMuted(): boolean {
  return muted;
}

/** 切换静音，返回新状态 */
export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

/** 用户手势兜底：确保 AudioContext 可用（TopBar pointerdown 挂一次） */
export function unlockAudio(): void {
  getCtx();
}
