/**
 * 都市生活 v0.991 — 多周目档案存储层
 * 命运点 / 永久加成 / 回忆录 / 模式解锁 的跨存档持久化。
 * - Tauri：AppData/saves/profile.json
 * - 浏览器：localStorage["urban_life_profile"]
 */
import { emptyProfile, type ProfileState } from "../game/core/profile";

const PROFILE_KEY = "urban_life_profile";
const PROFILE_FILE = "saves/profile.json";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** 读取档案（缺失/损坏回退空档案） */
export async function loadProfile(): Promise<ProfileState> {
  if (isTauri()) {
    const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    try {
      const raw = await readTextFile(PROFILE_FILE, { baseDir: BaseDirectory.AppData });
      return normalize(JSON.parse(raw));
    } catch {
      return emptyProfile();
    }
  } else {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyProfile();
    } catch {
      return emptyProfile();
    }
  }
}

/** 保存档案 */
export async function saveProfile(profile: ProfileState): Promise<void> {
  const payload = JSON.stringify(profile);
  if (isTauri()) {
    const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
    try {
      await mkdir("saves", { baseDir: BaseDirectory.AppData, recursive: true });
      await writeTextFile(PROFILE_FILE, payload, { baseDir: BaseDirectory.AppData });
    } catch (e) {
      console.error("档案保存失败", e);
    }
  } else {
    localStorage.setItem(PROFILE_KEY, payload);
  }
}

/** 补全缺失字段（旧档案/损坏数据容错） */
function normalize(raw: unknown): ProfileState {
  const base = emptyProfile();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ProfileState>;
  return {
    fatePoints: typeof r.fatePoints === "number" ? r.fatePoints : 0,
    unlocked: {
      eternal: !!r.unlocked?.eternal,
      story: !!r.unlocked?.story,
    },
    boosts: r.boosts && typeof r.boosts === "object" ? (r.boosts as Record<string, number>) : {},
    memoirs: Array.isArray(r.memoirs) ? (r.memoirs as ProfileState["memoirs"]) : [],
  };
}
