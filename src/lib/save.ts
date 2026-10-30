/**
 * 存档读写层（v1.43.1 重构）：
 * - localStorage 永远是主存储：浏览器与 Tauri(WebView2) 环境都持久可用，
 *   写入同步、无插件/权限依赖；存储额度等失败由调用方报告。
 * - Tauri fs（AppData/saves/）是「尽力而为的镜像」：实际写入与删除按槽位串行，
 *   必须等原生操作完成才能释放队列。读取和界面等待最多 3s，镜像失败 console.warn。
 *   背景：exe 环境中 plugin-fs 写入存在环境性失败（AppData 目录从未建成），
 *   旧版把 fs 当唯一存储，导致存档全灭 + 等待挂起的连锁卡死（按钮无响应/
 *   结束对话锁死/窗口假死关不掉）。
 * 唯一 I/O 口：UI 只调 saveGame / loadGame / listSaves / deleteSave。
 */
import type { GameState } from "../game/types";
import { migrateSave, pruneExpiredWorkedFlags, SAVE_VERSION } from "../game/core/migrate";
import { gameDay } from "../game/core/calendar";
import { replaceState, markSessionClean } from "../stores/gameStore.svelte";
import { commitGiftCodesFromSave } from "./installation";
import { writeLocalSave, localSaveFailureMessage } from "./localSaveStorage";
import {reconcileFinancialLoad} from '../game/core/financialRisk';

const SAVE_DIR = "saves";
const SLOTS = ["slot_1", "slot_2", "slot_3", "auto"];
const FS_TIMEOUT_MS = 3000;
const BACKUP_COUNT = 3;

export interface SaveMeta {
  slot: string;
  day: number;
  month: number;
  year: number;
  money: number;
  jobId: string | null;
  updatedAt: string;
  version: number;
  status?: "valid" | "corrupt" | "future";
  problem?: string;
}

/** 是否运行在 Tauri 环境 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 向运行环境申请「持久化存储」豁免。
 *
 * v1.44.3：localStorage 是主存储，但 Tauri fs 镜像只在桌面版生效
 * （mirrorSaveToFs 首行 `if (!isTauri()) return;`），所以**安卓 APK 与网页版
 * 实际上只有一个存档落点**。Android WebView 与浏览器在存储紧张或用户清理
 * 应用数据时会无预警回收来源数据，几十小时的进度可能直接归零。
 * `navigator.storage.persist()` 授予后，来源数据不会被自动清除。
 *
 * 失败不抛错、不阻塞：最坏情况与现状一致，只是拿不到豁免。
 */
export function requestPersistentStorage(): void {
  if (typeof navigator === "undefined") return;
  const storage = navigator.storage;
  if (!storage || typeof storage.persist !== "function") return;
  void Promise.resolve(typeof storage.persisted === "function" ? storage.persisted() : false)
    .then((already) => (already ? true : storage.persist()))
    .then((granted) => {
      if (!granted) {
        console.warn("持久化存储未获授权：系统在存储紧张时可能清理存档，建议定期手动导出");
      }
    })
    .catch(() => { /* 环境不支持或被拒绝：维持现状 */ });
}

function storageKey(slot: string): string {
  return `urban_life_save_${slot}`;
}

function backupKey(slot: string, index: number): string {
  return `urban_life_save_${slot}_backup_${index}`;
}

function lsGetKey(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSetKey(key: string, payload: string): boolean {
  try { localStorage.setItem(key, payload); return true; } catch { return false; }
}

function rotateBackups(slot: string, current: string | null): void {
  for (let i = BACKUP_COUNT; i > 1; i--) {
    const older = lsGetKey(backupKey(slot, i - 1));
    if (older) lsSetKey(backupKey(slot, i), older);
  }
  if (current) lsSetKey(backupKey(slot, 1), current);
}

/** 给任意 fs Promise 加超时竞速：超时即放弃，绝不挂起调用链 */
function withFsTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fs 操作超时")), FS_TIMEOUT_MS);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 当前版存档最小结构校验：版本号正确不代表 JSON 内容完整，损坏槽位必须回退为空。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFiniteNumbers(value: unknown, keys: string[]): boolean {
  return isRecord(value) && keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function isCurrentState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  const r = value as Partial<GameState>;
  const player = r.player as GameState["player"] | undefined;
  const time = r.time as unknown;
  const attrs = player?.attrs as unknown;
  const stats = player?.stats as unknown;
  const skills = player?.skills as unknown;
  return r.version === SAVE_VERSION
    && hasFiniteNumbers(time, ["year", "month", "day", "hour", "minute"])
    && !!player && isRecord(player)
    && hasFiniteNumbers(attrs, ["stamina", "health", "mood", "hygiene", "satiety"])
    && hasFiniteNumbers(stats, ["intelligence", "charm", "fitness", "fame"])
    && hasFiniteNumbers(skills, ["programming", "design", "writing", "operation", "cooking", "service", "driving", "management"])
    && typeof player.money === "number" && Number.isFinite(player.money)
    && isRecord(r.living)
    && ["gov", "lease", "nightly", "own"].includes(r.living.mode)
    && isRecord(r.career)
    && isRecord(r.inventory)
    && Object.values(r.inventory).every((count) => typeof count === "number" && Number.isFinite(count) && count >= 0)
    && isRecord(r.rng)
    && hasFiniteNumbers(r.rng, ["seed", "calls", "state"])
    && Array.isArray(r.log)
    && isRecord(r.social) && Array.isArray(r.social.posts)
    && Array.isArray(r.smsInbox)
    && Array.isArray(r.navStack)
    && isRecord(r.work) && Array.isArray(r.work.wageRecords) && Array.isArray(r.work.settledIds)
    && isRecord(r.districtLeisure) && (r.districtLeisure.active === null || isRecord(r.districtLeisure.active))
    && isRecord(r.fishing) && (r.fishing.active === null || isRecord(r.fishing.active))
    && Array.isArray(r.relationships)
    && isRecord(r.flags)
    && Array.isArray(r.unlockedEndings)
    && !!r.tutorial && Array.isArray(r.tutorial.done)
    && Array.isArray(r.pets)
    && Array.isArray(r.smallPets)
    && isRecord(r.cityCommissions)
    && Array.isArray(r.cityCommissions.offeredIds)
    && isRecord(r.cityCommissions.cooldownUntilDay)
    && isRecord(r.fridge)
    && isRecord(r.fridge.items)
    && isRecord(r.cooking)
    && Array.isArray(r.cooking.unlockedRecipeIds);
}

function parsePayload(raw: string): GameState | null {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version !== "number" || !Number.isInteger(parsed.version) || parsed.version < 1 || parsed.version > SAVE_VERSION) return null;
    const state = migrateSave(parsed);
    return isCurrentState(state) ? state : null;
  } catch {
    return null;
  }
}

function lsGet(slot: string): string | null {
  try {
    return localStorage.getItem(storageKey(slot));
  } catch {
    return null;
  }
}

let lastSaveFailure = "";
function lsSet(slot: string, payload: string): boolean {
  const result = writeLocalSave(storageKey(slot), payload);
  lastSaveFailure = result.ok ? "" : localSaveFailureMessage(result.reason);
  return result.ok;
}

/** Export live progress even if its latest automatic write could not be stored. */
export function exportCurrentSavePayload(state: GameState): string {
  if (!isCurrentState(state)) throw new Error("当前进度存在无效数据，请保留旧存档并反馈此问题");
  return JSON.stringify({ ...state, savedAt: new Date().toISOString() });
}

/** Expose one validated local save to native cloud-sync UI without leaking storage keys. */
export function exportSavePayload(slot: string): string | null {
  return SLOTS.includes(slot) ? lsGet(slot) : null;
}

/** Validate cloud data before it can replace a local slot. */
export function isImportableSavePayload(payload: string): boolean {
  return parsePayload(payload) !== null;
}

/** Validate imported data before it can replace a local slot. */
export function importSavePayload(slot: string, payload: string): boolean {
  if (!SLOTS.includes(slot)) return false;
  const state = parsePayload(payload);
  if (!state) return false;
  const savedAt = (() => {
    try {
      const parsed = JSON.parse(payload) as { savedAt?: unknown };
      return typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  })();
  const normalized = JSON.stringify({ ...state, savedAt });
  const previous = lsGet(slot);
  if (!lsSet(slot, normalized)) return false;
  rotateBackups(slot, previous);
  commitGiftCodesFromSave(state);
  if (isTauri()) void enqueueFsOperation(slot, { kind: "write", payload: normalized, waiters: [] });
  return true;
}

/** Tauri fs 镜像写入：尽力而为，任何失败静默 */
async function mirrorSaveToFs(slot: string, payload: string): Promise<void> {
  if (!isTauri()) return;
  const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  await mkdir(`${SAVE_DIR}/${slot}`, { baseDir: BaseDirectory.AppData, recursive: true });
  // Keep the queue locked until the native mutation actually finishes. A timeout
  // cannot cancel writeTextFile and therefore cannot release this lock safely.
  await writeTextFile(`${SAVE_DIR}/${slot}/save.json`, payload, { baseDir: BaseDirectory.AppData });
}

async function removeSaveFromFs(slot: string): Promise<void> {
  if (!isTauri()) return;
  const { remove, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  await remove(`${SAVE_DIR}/${slot}/save.json`, { baseDir: BaseDirectory.AppData });
}

// localStorage 是主存储，但桌面版仍依靠文件镜像应对浏览器数据损坏/丢失。
// 检查点可高频触发；并行写会让慢旧写最后覆盖新档，删除也可能被尚未完成的
// 镜像重新创建。每槽位串行处理；等待中的多次操作合并为最新意图。
type FsMirrorOperation =
  | { kind: "write"; payload: string; waiters: Array<() => void> }
  | { kind: "delete"; waiters: Array<() => void> };

const pendingFsOperations = new Map<string, FsMirrorOperation>();
const activeFsOperations = new Set<string>();

function enqueueFsOperation(slot: string, operation: FsMirrorOperation): Promise<void> {
  const done = new Promise<void>((resolve) => operation.waiters.push(resolve));
  const replaced = pendingFsOperations.get(slot);
  if (replaced) operation.waiters.unshift(...replaced.waiters);
  pendingFsOperations.set(slot, operation);
  if (!activeFsOperations.has(slot)) {
    activeFsOperations.add(slot);
    void drainFsOperations(slot);
  }
  return done;
}

async function drainFsOperations(slot: string): Promise<void> {
  try {
    while (pendingFsOperations.has(slot)) {
      const operation = pendingFsOperations.get(slot)!;
      pendingFsOperations.delete(slot);
      try {
        if (operation.kind === "write") await mirrorSaveToFs(slot, operation.payload);
        else await removeSaveFromFs(slot);
      } catch (e) {
        if (operation.kind === "write") {
          console.warn("fs 存档镜像失败（已由 localStorage 兜底）", e);
        }
      } finally {
        for (const resolve of operation.waiters) resolve();
      }
    }
  } finally {
    activeFsOperations.delete(slot);
    // 新操作可能刚好在循环退出与清理之间排入。
    if (pendingFsOperations.has(slot)) {
      activeFsOperations.add(slot);
      void drainFsOperations(slot);
    }
  }
}

/** 保存到指定槽位：localStorage 同步主存储 + fs 后台镜像。主存储失败会抛错。 */
export function saveGameImmediately(slot: string, state: GameState): void {
  if (!SLOTS.includes(slot)) throw new Error(`未知存档槽位：${slot}`);
  if (state.version !== SAVE_VERSION) throw new Error("当前状态版本不匹配，拒绝写入存档");
  if (!isCurrentState(state)) throw new Error("当前状态结构无效，拒绝写入存档");
  const previous = lsGet(slot);
  if (previous) {
    try {
      const version = (JSON.parse(previous) as { version?: unknown }).version;
      if (typeof version === "number" && version > SAVE_VERSION) {
        throw new Error("检测到由较新版本创建的存档，已拒绝覆盖；请先升级游戏或导出该存档");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("较新版本")) throw error;
      console.warn(`存档槽位 ${slot} 的旧内容无法解析，成功写入后会尝试保留为轮换备份`);
    }
  }
  const stateForSave: GameState = { ...state, flags: { ...state.flags } };
  pruneExpiredWorkedFlags(stateForSave.flags, gameDay(state.time));
  stateForSave.flags["saved_once"] = true;
  // 写入真实保存时间（存档列表排序依赖）
  const payload = JSON.stringify({ ...stateForSave, savedAt: new Date().toISOString() });
  // 主存储：localStorage。同步、无外部依赖，失败仅可能是配额爆满。
  const primaryOk = lsSet(slot, payload);
  if (primaryOk) {
    state.flags["saved_once"] = true;
    pruneExpiredWorkedFlags(state.flags, gameDay(state.time));
    rotateBackups(slot, previous);
    commitGiftCodesFromSave(stateForSave);
  }
  // 镜像：Tauri fs。后台执行，带超时，失败静默——UI 调用链不 await 它的 fs 部分。
  if (isTauri()) {
    void enqueueFsOperation(slot, { kind: "write", payload, waiters: [] });
  }
  if (!primaryOk) throw new Error(`存档写入失败：${lastSaveFailure}`);
}

export async function saveGame(slot: string, state: GameState): Promise<void> {
  saveGameImmediately(slot, state);
}

/** 从指定槽位读档：接受所有已知历史版本并统一迁移到当前版。 */
export async function loadGame(slot: string): Promise<GameState | null> {
  // 1) localStorage 优先（与 saveGame 主存储一致）
  const raw = lsGet(slot);
  if (raw) {
    try {
      const version = (JSON.parse(raw) as { version?: unknown }).version;
      if (typeof version === "number" && version > SAVE_VERSION) return null;
    } catch { /* Continue through validation and backup mirrors. */ }
  }
  const local = raw ? parsePayload(raw) : null;
  if (local) {
    commitGiftCodesFromSave(local);
    return local;
  }
  // 2) 本地没有（或损坏）时兜底读 fs 镜像，读到有效档则回填 localStorage
  if (isTauri()) {
    try {
      const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      const fsRaw = await withFsTimeout(
        readTextFile(`${SAVE_DIR}/${slot}/save.json`, { baseDir: BaseDirectory.AppData }),
      );
      const fromFs = parsePayload(fsRaw);
      if (fromFs) {
        lsSet(slot, JSON.stringify({ ...fromFs, savedAt: fromFs.savedAt ?? new Date().toISOString() }));
        commitGiftCodesFromSave(fromFs);
        return fromFs;
      }
    } catch {
      // fs 不可用/超时：视为无镜像档
    }
  }
  // raw 存在但内容校验失败 → 视为损坏空档（交给 UI 显示并允许覆盖）
  return null;
}

/** 列出所有槽位元信息（读档界面用） */
export async function listSaves(): Promise<SaveMeta[]> {
  const metas: SaveMeta[] = [];
  for (const slot of SLOTS) {
    const s = await loadGame(slot);
    if (s) {
      metas.push({
        slot,
        day: s.time.day,
        month: s.time.month,
        year: s.time.year,
        money: s.player.money,
        jobId: s.career.jobId,
        updatedAt: s.savedAt ?? new Date(0).toISOString(),
        version: s.version,
        status: "valid",
      });
    } else {
      const raw = lsGet(slot);
      if (!raw) continue;
      let version = 0;
      try {
        const parsed = JSON.parse(raw) as { version?: unknown };
        if (typeof parsed.version === "number") version = parsed.version;
      } catch { /* malformed JSON remains visible as a damaged slot */ }
      metas.push({
        slot, day: 0, month: 0, year: 0, money: 0, jobId: null,
        updatedAt: "", version,
        status: version > SAVE_VERSION ? "future" : "corrupt",
        problem: version > SAVE_VERSION ? `由较新版本 v${version} 创建，当前版本 v${SAVE_VERSION} 不能读取` : "数据损坏或结构校验失败",
      });
    }
  }
  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Whether a slot has a valid local recovery point. */
export function hasBackupSave(slot: string): boolean {
  if (!SLOTS.includes(slot)) return false;
  return Array.from({ length: BACKUP_COUNT }, (_, i) => lsGetKey(backupKey(slot, i + 1)))
    .some((raw) => !!raw && !!parsePayload(raw));
}

/** Restore the newest valid local backup after explicit player confirmation. */
export function restoreLatestBackup(slot: string): boolean {
  if (!SLOTS.includes(slot)) return false;
  for (let index = 1; index <= BACKUP_COUNT; index++) {
    const raw = lsGetKey(backupKey(slot, index));
    if (!raw) continue;
    const state = parsePayload(raw);
    if (!state) continue;
    const previous = lsGet(slot);
    const payload = JSON.stringify({ ...state, savedAt: state.savedAt ?? new Date().toISOString() });
    if (!lsSet(slot, payload)) return false;
    rotateBackups(slot, previous);
    commitGiftCodesFromSave(state);
    if (isTauri()) void enqueueFsOperation(slot, { kind: "write", payload, waiters: [] });
    return true;
  }
  return false;
}

/** 删除存档：localStorage 必清；fs 镜像尽力而为 */
export async function deleteSave(slot: string): Promise<void> {
  try {
    localStorage.removeItem(storageKey(slot));
    for (let index = 1; index <= BACKUP_COUNT; index++) {
      localStorage.removeItem(backupKey(slot, index));
    }
  } catch {
    // 忽略
  }
  if (isTauri()) {
    // UI waiting is bounded; the queued delete still follows the actual old write.
    await withFsTimeout(enqueueFsOperation(slot, { kind: "delete", waiters: [] })).catch(() => {});
  }
}

/** 删除全部存档（3 个手动槽 + 自动槽）。手机「设置」与 SettingsView 共用。 */
export async function resetAllSaves(): Promise<void> {
  await Promise.all(SLOTS.map((s) => deleteSave(s)));
}

/** 读档并注入游戏状态（返回是否成功） */
export async function loadGameIntoState(slot: string): Promise<boolean> {
  const s = await loadGame(slot);
  if (!s) return false;
  reconcileFinancialLoad(s);
  replaceState(s);
  markSessionClean();
  return true;
}
