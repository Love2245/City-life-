/**
 * 交互音效优先使用离线短录音，原合成保留为兼容与异常回退；场景音乐使用已确认的 MP3。
 * 小游戏按场景沿用、自带配乐或旧旋律分配音乐，地图和设施文件音乐平滑循环。
 * 纯工具库（允许访问 window/AudioContext；src/game/ 纯逻辑层不依赖本模块）。
 * 静音状态持久化到 localStorage（key 与 save.ts 的 urban_life_ 前缀一致）。
 */
import type { SoundId } from "../game/types";
import { MusicPlayer } from "./musicPlayer";
import { BACKGROUND_MUSIC, DOOR_JINGLES } from "./musicCatalogue";
import { bgmForHour, musicForScene, doorJingles, type BgmTrackId, type MusicScene, type BackgroundMusicId } from "./musicRouting";
import {RecordedEffectPlayer} from './recordedEffects';
import {INTERACTION_SOUNDS} from './interactionSoundCatalogue';
import {isDuelMusicId,type DuelMusicId} from './catDuelMusic';
import {recordedSoundForAction,recordedSoundForLegacy,sceneInteractionSound,type InteractionSoundId} from './interactionSoundRouting';
export { bgmForHour };
export type { BgmTrackId, MusicScene };

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
  computer: { type: "square", notes: [784, 988, 1175], step: 0.06, gain: 0.35 },
  // v1.33 P2 卡牌对决音效
  battle_attack: { type: "square", notes: [392, 523], step: 0.07, gain: 0.4 },
  battle_hurt: { type: "sawtooth", notes: [330, 262, 196], step: 0.09, gain: 0.35 },
  battle_defend: { type: "sine", notes: [262, 330], step: 0.1, gain: 0.3 },
  battle_heal: { type: "triangle", notes: [523, 659, 784], step: 0.09, gain: 0.35 },
  battle_draw: { type: "square", notes: [784, 988], step: 0.06, gain: 0.25 },
  battle_win: { type: "square", notes: [523, 659, 784, 1047, 1319], step: 0.09, gain: 0.4 },
  battle_lose: { type: "sawtooth", notes: [330, 262, 196, 165], step: 0.14, gain: 0.35 },
  battle_intent: { type: "square", notes: [660, 660], step: 0.08, gain: 0.28 },
};

/** 静音持久化 key */
const MUTE_KEY = "urban_life_audio_muted";
/** BGM 持久化 keys（v1.10） */
const BGM_VOL_KEY = "urban_life_audio_bgm_volume";
const BGM_ENABLED_KEY = "urban_life_audio_bgm_enabled";
/** v1.11 手动选曲 / 音效音量 keys */
const BGM_SEL_KEY = "urban_life_audio_bgm_selection";
const SFX_VOL_KEY = "urban_life_audio_sfx_volume";
const AUDIO_VOLUME_DEFAULTS_MIGRATION_KEY = "urban_life_audio_default_volume_migration_v1";
/** 同时发声上限（超出丢最早） */
const MAX_VOICES = 8;

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let recordedEffects:RecordedEffectPlayer|null=null;
let muted = false;
/** v1.11 音效独立音量（0-100），与 muted 总开关、BGM 音量互不影响 */
let sfxVolume = 50;

try {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    muted = localStorage.getItem(MUTE_KEY) === "1";
    const savedSfx = localStorage.getItem(SFX_VOL_KEY);
    const sv = Number(savedSfx);
    if (savedSfx !== null && Number.isFinite(sv) && sv >= 0 && sv <= 100) sfxVolume = sv;
  }
} catch {
  // localStorage 不可用（隐私模式等）时保持默认
}

/* ==================== v1.11 背景音乐（程序化合成循环，五时段） ==================== */

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

/** 曲目表：凌晨舒缓 / 早上清新 / 中午轻快 / 下午活跃 / 晚上夜曲 */
export const BGM_TRACKS: Record<BgmTrackId, BgmTrack> = {
  dawn: {
    name: "凌晨静谧",
    step: 0.6,
    type: "sine",
    gain: 0.07,
    notes: [330, 392, 330, 262, 294, 330, 247, 294, 330, 392, 440, 392, 330, 294, 247, 220],
  },
  morning: {
    name: "清晨阳光",
    step: 0.4,
    type: "triangle",
    gain: 0.08,
    notes: [523, 587, 659, 587, 784, 659, 587, 523, 587, 698, 784, 698, 880, 784, 698, 587],
  },
  noon: {
    name: "正午轻快",
    step: 0.3,
    type: "square",
    gain: 0.06,
    notes: [659, 784, 880, 784, 988, 880, 784, 659, 587, 659, 784, 659, 880, 784, 659, 587],
  },
  afternoon: {
    name: "午后活力",
    step: 0.34,
    type: "sawtooth",
    gain: 0.055,
    notes: [587, 659, 784, 880, 784, 659, 587, 523, 587, 698, 880, 1047, 880, 698, 587, 523],
  },
  night: {
    name: "城市夜晚",
    step: 0.52,
    type: "sine",
    gain: 0.08,
    notes: [440, 523, 440, 349, 392, 440, 330, 392, 440, 523, 587, 523, 440, 392, 330, 262],
  },
};

/**
 * v1.11 五时段映射：凌晨 0-6 / 早上 6-11 / 中午 11-14 / 下午 14-18 / 晚上 18-24。
 * 纯函数（可单测）。
 */
export function legacyBgmForHour(hour: number): BgmTrackId {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18) return "night";
  return "dawn"; // 0-6
}

let bgmVolume = 50; // 0-100
let bgmEnabled = true;
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmTrack: BgmTrackId | null = null;
let bgmIdx = 0;
let player: MusicPlayer | null = null;
let scene: MusicScene = { hour: 0, inGame: false };
let previousScene: MusicScene | null = null;
let musicRequested = false;
let failedTrack: BackgroundMusicId | null = null;
export type MinigameMusicMode = "legacy" | "scene" | "embedded" | DuelMusicId;
const minigames = new Map<symbol, MinigameMusicMode>();
let legacyBus: GainNode | null = null;
let legacyFadeTimer: ReturnType<typeof setTimeout> | null = null;
const MUSIC_FADE_SECONDS = 3;
let audioPaused = typeof document !== "undefined" && document.hidden;
/** Web Audio 在首次用户手势前不能可靠自动播放；先记住 BGM 曲目，解锁后再开始排音符。 */
let audioUnlocked = false;
/** v1.11 手动选曲："auto"=跟随时段，否则固定曲目 */
let bgmSelection: BgmTrackId | "auto" = "auto";
export interface AudioSettings { musicEnabled: boolean; musicVolume: number; sfxVolume: number; muted: boolean; paused: boolean }
const audioSettingsListeners = new Set<(settings: AudioSettings) => void>();
export function getAudioSettings(): AudioSettings {
  return { musicEnabled: bgmEnabled, musicVolume: bgmVolume / 100, sfxVolume: sfxVolume / 100, muted, paused: audioPaused || !audioUnlocked };
}
export function subscribeAudioSettings(listener: (settings: AudioSettings) => void): () => void {
  audioSettingsListeners.add(listener);
  listener(getAudioSettings());
  return () => { audioSettingsListeners.delete(listener); };
}
function notifyAudioSettings(): void {recordedEffects?.setState(canPlayEffects(),sfxVolume/100);for (const listener of audioSettingsListeners) listener(getAudioSettings()); }
function minigamePolicy(): "legacy" | "scene" | "embedded" {
  const modes = [...minigames.values()];
  if(modes.some(isDuelMusicId)&&!modes.includes('embedded'))return 'scene';
  return modes.includes("embedded") ? "embedded" : modes.includes("scene") ? "scene" : modes.includes("legacy") ? "legacy" : "scene";
}

function selectedMusic():BackgroundMusicId{
  const modes=[...minigames.values()];
  for(let i=modes.length-1;i>=0;i--)if(isDuelMusicId(modes[i]))return modes[i] as DuelMusicId;
  return musicForScene(scene,bgmSelection);
}

function clearBgmTimer(): void {
  if (bgmTimer) clearInterval(bgmTimer);
  bgmTimer = null;
}

function scheduleBgm(): void {
  if (!canPlayMusic() || !bgmTrack || bgmTimer) return;
  const tr = BGM_TRACKS[bgmTrack];
  bgmTimer = setInterval(bgmTick, (tr?.step ?? 0.5) * 1000);
}

try {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    const savedBgm = localStorage.getItem(BGM_VOL_KEY);
    const v = Number(savedBgm);
    if (savedBgm !== null && Number.isFinite(v) && v >= 0 && v <= 100) bgmVolume = v;
    bgmEnabled = localStorage.getItem(BGM_ENABLED_KEY) !== "0";
    const sel = localStorage.getItem(BGM_SEL_KEY);
    if (sel === "dawn" || sel === "morning" || sel === "noon" || sel === "afternoon" || sel === "night" || sel === "auto") {
      bgmSelection = sel === "afternoon" ? "noon" : sel;
    }
  }
} catch {
  // 忽略持久化失败
}

// Migrate installations still using the former untouched defaults (60% music / 80% effects)
// once, while preserving explicit player choices.
try {
  if (typeof localStorage !== "undefined" && localStorage.getItem(AUDIO_VOLUME_DEFAULTS_MIGRATION_KEY) !== "1") {
    if (Number(localStorage.getItem(BGM_VOL_KEY)) === 60) {
      bgmVolume = 50;
      localStorage.setItem(BGM_VOL_KEY, "50");
    }
    if (Number(localStorage.getItem(SFX_VOL_KEY)) === 80) {
      sfxVolume = 50;
      localStorage.setItem(SFX_VOL_KEY, "50");
    }
    localStorage.setItem(AUDIO_VOLUME_DEFAULTS_MIGRATION_KEY, "1");
  }
} catch {
  // Keep the in-memory defaults if storage is unavailable.
}

/** 播放 BGM 循环中的一个音符 */
function bgmTick(): void {
  if (!audioUnlocked || audioPaused || (typeof document !== "undefined" && document.hidden) || !bgmEnabled || muted || !bgmTrack) return;
  const c = getCtx();
  if (!c) return;
  const tr = BGM_TRACKS[bgmTrack];
  if (!tr) return;
  const f = tr.notes[bgmIdx % tr.notes.length];
  bgmIdx++;
  if (f > 0) {
    try {
      tone(c, { type: tr.type, notes: [f], step: tr.step, gain: tr.gain, decay: tr.step * 0.9 }, f, c.currentTime + 0.02, (tr.gain * bgmVolume) / 100, true);
    } catch {
      // 音频异常静默降级
    }
  }
}

/**
 * v1.11 统一 BGM 入口：手动选曲时播固定曲目，否则按时段自动切换。
 * startBgm 对同曲目有幂等 guard（不重启 timer）。
 */
export function applyBgmForHour(hour: number): void {
  scene = { ...scene, hour };
  musicRequested = true;
  syncMusic();
}

/** Called by the app's live scene effect; loading a save is not a doorway event. */
export function setMusicScene(next: MusicScene): void {
  const jingles = doorJingles(previousScene, next);
  const interaction=sceneInteractionSound(previousScene,next);
  const oldMusic = musicForScene(scene, bgmSelection);
  const newSession = previousScene?.sessionKey !== next.sessionKey;
  scene = { ...next };
  previousScene = { ...next };
  musicRequested = true;
  if (!next.inGame || newSession) player?.cancelJingle();
  const nextMusic = musicForScene(scene, bgmSelection);
  if (oldMusic !== nextMusic) failedTrack = null;
  // The café soundtrack belongs to the café even if the next file is slow to decode.
  syncMusic(oldMusic === 'cafe' && nextMusic !== 'cafe');
  // A direct move between two shops uses the destination's welcome phrase.
  // Ordinary travel has separate exit and entry events.
  if (canPlayMusic() && minigames.size === 0 && jingles.length > 0) {
    player?.playJingle(DOOR_JINGLES[jingles[jingles.length - 1]]);
  }
  if(interaction&&minigames.size===0)playInteractionSound(interaction);
}

/** A token belongs to a visible minigame, never to a persisted active session. */
export function beginMinigameMusic(mode: MinigameMusicMode = "legacy"): () => void {
  const previous=selectedMusic();
  const token = Symbol("minigame music");
  minigames.set(token, mode);
  if(isDuelMusicId(mode))musicRequested=true;
  if(previous!==selectedMusic())failedTrack=null;
  player?.cancelJingle();
  syncMusic();
  return () => {
    const previous=selectedMusic();
    if (!minigames.delete(token)) return;
    if(previous!==selectedMusic())failedTrack=null;
    syncMusic();
  };
}

function canPlayMusic(): boolean {
  return musicRequested && audioUnlocked && !audioPaused && !muted && bgmEnabled;
}

function getLegacyBus(c: AudioContext): GainNode {
  if (!legacyBus) {
    legacyBus = c.createGain();
    legacyBus.gain.value = 0;
    legacyBus.connect(c.destination);
  }
  return legacyBus;
}

function fadeLegacy(target: number, stopAfter = false): void {
  if (legacyFadeTimer) clearTimeout(legacyFadeTimer);
  legacyFadeTimer = null;
  if (!ctx || !legacyBus) return;
  const now = ctx.currentTime;
  const gain = legacyBus.gain;
  // Keep the current interpolated level when a transition is interrupted.
  if (typeof gain.cancelAndHoldAtTime === "function") gain.cancelAndHoldAtTime(now);
  else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
  gain.linearRampToValueAtTime(target, now + MUSIC_FADE_SECONDS);
  if (stopAfter) {
    legacyFadeTimer = setTimeout(() => {
      legacyFadeTimer = null;
      clearBgmTimer();
      stopBgmVoices();
      bgmTrack = null;
    }, MUSIC_FADE_SECONDS * 1000);
  }
}

function startLegacy(trackId: BgmTrackId): void {
  if (bgmTrack === trackId && bgmTimer && !legacyFadeTimer) return;
  if (legacyFadeTimer) clearTimeout(legacyFadeTimer);
  legacyFadeTimer = null;
  if (bgmTrack !== trackId) {
    bgmTrack = trackId;
    bgmIdx = 0;
    clearBgmTimer();
  }
  const c = getCtx();
  if (!c) return;
  getLegacyBus(c);
  fadeLegacy(1);
  scheduleBgm();
}

function silenceMusic(): void {
  player?.pause();
  clearBgmTimer();
  if (legacyFadeTimer) clearTimeout(legacyFadeTimer);
  legacyFadeTimer = null;
  stopBgmVoices();
  if (ctx && legacyBus) {
    legacyBus.gain.cancelScheduledValues(ctx.currentTime);
    legacyBus.gain.setValueAtTime(0, ctx.currentTime);
  }
}

function syncMusic(retireCurrentQuickly = false): void {
  if (!canPlayMusic()) { silenceMusic(); return; }
  const c = getCtx();
  if (!c) return;
  const selected = selectedMusic();
  const policy = minigamePolicy();
  if (policy === "embedded") {
    player?.cancelJingle();
    player?.setTrack(null);
    player?.resume();
    if (bgmTrack && !legacyFadeTimer) fadeLegacy(0, true);
    return;
  }
  const usesLegacy = policy === "legacy";
  if (usesLegacy || failedTrack === selected) {
    player?.cancelJingle();
    player?.setTrack(null);
    player?.resume();
    startLegacy(bgmSelection === "auto" ? legacyBgmForHour(scene.hour) : bgmSelection);
    return;
  }
  if (!player) {
    player = new MusicPlayer(c, {
      fadeSeconds: MUSIC_FADE_SECONDS,
      onStarted: (id) => {
        if (canPlayMusic() && minigamePolicy() === "scene" && id === selectedMusic() && bgmTrack) fadeLegacy(0, true);
      },
      onError: (_error, id) => {
        // Jingle failures do not interrupt the current background music.
        if (canPlayMusic() && minigamePolicy() === "scene" && id === selectedMusic()) {
          failedTrack = id as BackgroundMusicId;
          syncMusic();
        }
      },
    });
  }
  player.setVolume(bgmVolume / 100);
  player.setTrack(BACKGROUND_MUSIC[selected], retireCurrentQuickly);
  player.resume();
}

/** 手动选曲（"auto"=跟随时段自动切换） */
export function setBgmSelection(sel: BgmTrackId | "auto"): void {
  bgmSelection = sel === "afternoon" ? "noon" : sel;
  failedTrack = null;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(BGM_SEL_KEY, bgmSelection);
  } catch {
    // 忽略
  }
  syncMusic();
}

export function getBgmSelection(): BgmTrackId | "auto" {
  return bgmSelection;
}

/** 开始播放背景音乐 */
export function startBgm(track: BgmTrackId): void {
  scene = { ...scene, hour: { dawn: 0, morning: 6, noon: 12, afternoon: 12, night: 18 }[track] };
  musicRequested = true;
  syncMusic();
}

/** 停止背景音乐 */
export function stopBgm(): void {
  musicRequested = false;
  silenceMusic();
}

/** 设置 BGM 音量（0-100），持久化 */
export function setBgmVolume(v: number): void {
  bgmVolume = Math.max(0, Math.min(100, Math.round(v)));
  player?.setVolume(bgmVolume / 100);
  notifyAudioSettings();
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
  notifyAudioSettings();
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(BGM_ENABLED_KEY, on ? "1" : "0");
  } catch {
    // 忽略
  }
  if (on) musicRequested = true;
  syncMusic();
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
    if (audioUnlocked && !audioPaused && ctx.state === "suspended") void ctx.resume().catch(() => {});
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
function tone(c: AudioContext, spec: SoundSpec, freq: number, at: number, peak: number, isBgm = false): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  const attack = spec.attack ?? 0.01;
  const decay = spec.decay ?? 0.08;
  osc.type = spec.type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.001, at + attack + decay);
  osc.connect(g).connect(isBgm ? getLegacyBus(c) : c.destination);
  osc.start(at);
  osc.stop(at + attack + decay + 0.02);
  track(osc, isBgm);
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
const bgmVoices = new Set<AudioScheduledSourceNode>();

function stopSources(sources: Set<AudioScheduledSourceNode>): void {
  for (const source of [...sources]) {
    try {
      source.stop();
    } catch {
      // 已停止或尚未启动
    }
  }
}

function stopBgmVoices(): void {
  stopSources(bgmVoices);
}

function track(v: AudioScheduledSourceNode, isBgm = false): void {
  voices.add(v);
  if (isBgm) bgmVoices.add(v);
  v.onended = () => {
    voices.delete(v);
    bgmVoices.delete(v);
  };
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
function playSynthSound(id: SoundId, opts?: { gain?: number }): void {
  if (!canPlayEffects()) return;
  const c = getCtx();
  if (!c) return;
  const spec = SOUND_DEFS[id];
  if (!spec) return;
  try {
    // v1.11：音效峰值 × SFX 独立音量（原固定 ×0.9）
    const peak = (opts?.gain ?? spec.gain ?? 0.4) * 0.9 * (sfxVolume / 100);
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

function canPlayEffects(){return audioUnlocked&&!muted&&!audioPaused&&sfxVolume>0&&!(typeof document!=='undefined'&&document.hidden);}
function getRecordedEffects(){
  if(!canPlayEffects())return null;
  const c=getCtx();if(!c||typeof c.createBufferSource!=='function'||typeof c.decodeAudioData!=='function')return null;
  try{recordedEffects??=new RecordedEffectPlayer(c,INTERACTION_SOUNDS);recordedEffects.setState(true,sfxVolume/100);return recordedEffects;}catch{return null;}
}
function playRecording(id:InteractionSoundId,gain=1,fallback?:()=>void){
  if(!canPlayEffects())return true;
  const player=getRecordedEffects();if(!player)return false;player.play(id,gain,fallback);return true;
}
/** Existing result/action IDs retain their public contract while common sounds use recordings. */
export function playSound(id:SoundId,opts?:{gain?:number}){
  const recording=recordedSoundForLegacy(id),base=SOUND_DEFS[id]?.gain??.4;
  if(recording&&playRecording(recording,opts?.gain===undefined?1:opts.gain/base,()=>playSynthSound(id,opts)))return;
  playSynthSound(id,opts);
}
export function playInteractionSound(id:InteractionSoundId,gain=1){playRecording(id,gain,()=>playSynthSound('phone',{gain:.15}));}
export function playActionSound(actionId:string,fallback:SoundId){
  const recording=recordedSoundForAction(actionId,fallback);
  if(recording&&playRecording(recording,1,()=>playSynthSound(fallback)))return;
  playSynthSound(fallback);
}

/** v1.11 设置音效音量（0-100，独立于 BGM 音量与静音总开关），持久化 */
export function setSfxVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(100, Math.round(v)));
  notifyAudioSettings();
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(SFX_VOL_KEY, String(sfxVolume));
  } catch {
    // 忽略
  }
}

export function getSfxVolume(): number {
  return sfxVolume;
}

export function setMuted(m: boolean): void {
  muted = m;
  notifyAudioSettings();
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    // 忽略持久化失败
  }
  if (m) stopSources(voices);
  syncMusic();
}

export function isMuted(): boolean {
  return muted;
}

/** 切换静音，返回新状态 */
export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

/** 暂停后台音频并立即停止当前音源；回到前台时保留曲目并可继续播放。 */
export function pauseAudio(): void {
  audioPaused = true;
  notifyAudioSettings();
  silenceMusic();
  stopSources(voices);
  if (ctx && ctx.state !== "suspended" && ctx.state !== "closed") {
    void ctx.suspend().catch(() => {});
  }
}

/** 应用回到前台时恢复 AudioContext 与当前 BGM。 */
export function resumeAudio(): void {
  audioPaused = false;
  notifyAudioSettings();
  if (audioUnlocked && ctx?.state === "suspended") void ctx.resume().catch(() => {});
  syncMusic();
}

/** 用户手势解锁：由 App 监听首次触控或键盘操作。 */
export function unlockAudio(): void {
  if (typeof document !== "undefined" && document.hidden) return;
  audioUnlocked = true;
  audioPaused = false;
  notifyAudioSettings();
  const c = getCtx();
  if (c?.state === "suspended") void c.resume().catch(() => {});
  void getRecordedEffects()?.preload();
  syncMusic();
}
