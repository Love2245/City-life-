/**
 * 存档读写层：Tauri fs 插件（AppData）+ 浏览器 localStorage 降级。
 * 唯一 I/O 口：UI 只调 saveGame / loadGame / listSaves / deleteSave。
 * 原子写：先写 tmp 再 rename，防写一半损坏。
 */
import type { GameState } from "../game/types";
import { migrateSave } from "../game/core/migrate";
import { replaceState } from "../stores/gameStore.svelte";

const SAVE_DIR = "saves";
const SLOTS = ["slot_1", "slot_2", "slot_3", "auto"];

export interface SaveMeta {
  slot: string;
  day: number;
  month: number;
  year: number;
  money: number;
  jobId: string | null;
  updatedAt: string;
  version: number;
}

/** 是否运行在 Tauri 环境 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function storageKey(slot: string): string {
  return `urban_life_save_${slot}`;
}

async function ensureSaveDir(slot: string): Promise<void> {
  if (!isTauri()) return;
  const { mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
  try {
    // v0.99 修复：一次性建到槽位子目录（原只建 saves，首次写 save.json 时父目录不存在会失败）
    await mkdir(`${SAVE_DIR}/${slot}`, { baseDir: BaseDirectory.AppData, recursive: true });
  } catch {
    // 目录已存在则忽略
  }
}

/** 保存到指定槽位 */
export async function saveGame(slot: string, state: GameState): Promise<void> {
  // v0.99 修复：写入真实保存时间（列表排序依赖，原为读取时刻导致四槽同值）
  const payload = JSON.stringify({ ...state, savedAt: new Date().toISOString() });
  if (isTauri()) {
    const { writeTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    await ensureSaveDir(slot);
    const path = `${SAVE_DIR}/${slot}/save.json`;
    const tmp = `${SAVE_DIR}/${slot}/save.json.tmp`;
    try {
      await writeTextFile(tmp, payload, { baseDir: BaseDirectory.AppData });
      const { rename } = await import("@tauri-apps/plugin-fs");
      await rename(tmp, path, {
        oldPathBaseDir: BaseDirectory.AppData,
        newPathBaseDir: BaseDirectory.AppData,
      });
    } catch (e) {
      console.error("存档失败", e);
      throw e;
    }
  } else {
    localStorage.setItem(storageKey(slot), payload);
  }
}

/** 从指定槽位读档（自动迁移旧版本存档） */
export async function loadGame(slot: string): Promise<GameState | null> {
  if (isTauri()) {
    const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    try {
      const raw = await readTextFile(`${SAVE_DIR}/${slot}/save.json`, { baseDir: BaseDirectory.AppData });
      return migrateSave(JSON.parse(raw));
    } catch {
      return null;
    }
  } else {
    const raw = localStorage.getItem(storageKey(slot));
    return raw ? migrateSave(JSON.parse(raw)) : null;
  }
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
        // v0.99 修复：读取存档时写入的真实时间；旧档无 savedAt 回退远古时间（排最末）
        updatedAt: s.savedAt ?? new Date(0).toISOString(),
        version: s.version,
      });
    }
  }
  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 删除存档 */
export async function deleteSave(slot: string): Promise<void> {
  if (isTauri()) {
    const { remove, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    try {
      await remove(`${SAVE_DIR}/${slot}/save.json`, { baseDir: BaseDirectory.AppData });
    } catch {
      // 文件不存在忽略
    }
  } else {
    localStorage.removeItem(storageKey(slot));
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
  replaceState(s);
  return true;
}
