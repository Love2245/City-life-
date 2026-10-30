/**
 * 都市生活 v1.43.1 — 多周目档案存储层
 * 命运点 / 永久加成 / 回忆录 / 模式解锁 的跨存档持久化。
 * - 主存储：localStorage（浏览器与 Tauri WebView2 均持久可用）
 * - Tauri fs（AppData/saves/profile.json）：串行后台镜像；读取限时，写入等实际完成。
 */
import { emptyProfile, type ProfileState } from "../game/core/profile";
import { writeLocalSave } from "./localSaveStorage";

const PROFILE_KEY = "urban_life_profile";
const PROFILE_FILE = "saves/profile.json";
const FS_TIMEOUT_MS = 3000;
let pendingMirrorPayload: string | null = null;
let mirrorWriteInFlight = false;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function withFsTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("fs 操作超时")), FS_TIMEOUT_MS),
    ),
  ]);
}

/** 补全缺失字段（旧档案/损坏数据容错） */
function normalize(raw: unknown): ProfileState {
  const base = emptyProfile();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ProfileState>;
  const fatePoints = typeof r.fatePoints === "number" && Number.isFinite(r.fatePoints)
    ? Math.max(0, Math.floor(r.fatePoints))
    : 0;
  const boosts: Record<string, number> = {};
  if (r.boosts && typeof r.boosts === "object") {
    for (const [id, value] of Object.entries(r.boosts)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        boosts[id] = Math.floor(value);
      }
    }
  }
  const memoirs = Array.isArray(r.memoirs)
    ? r.memoirs.filter((entry): entry is ProfileState["memoirs"][number] => (
      !!entry && typeof entry === "object"
      && typeof entry.id === "string"
      && typeof entry.endingId === "string"
      && typeof entry.endingName === "string"
    ))
    : [];
  return {
    fatePoints,
    unlocked: {
      eternal: !!r.unlocked?.eternal,
      story: false,
    },
    unlockedEndings: Array.isArray(r.unlockedEndings)
      ? Array.from(new Set(r.unlockedEndings.filter((id): id is string => typeof id === "string")))
      : [],
    boosts,
    memoirs,
  };
}

/** 读取档案（缺失/损坏回退空档案） */
export async function loadProfile(): Promise<ProfileState> {
  // 1) localStorage 优先
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    // 损坏/不可用 → 继续尝试 fs 镜像
  }
  // 2) fs 镜像兜底
  if (isTauri()) {
    try {
      const { readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");
      const raw = await withFsTimeout(
        readTextFile(PROFILE_FILE, { baseDir: BaseDirectory.AppData }),
      );
      const profile = normalize(JSON.parse(raw));
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      } catch {
        // 回填失败不影响读取结果
      }
      return profile;
    } catch {
      // fs 不可用/超时
    }
  }
  return emptyProfile();
}

/** Persist a newer mirror after any older in-flight write, so an old snapshot cannot win the race. */
function enqueueProfileMirror(payload: string): void {
  pendingMirrorPayload = payload;
  if (mirrorWriteInFlight) return;
  mirrorWriteInFlight = true;
  void drainProfileMirrorQueue();
}

async function drainProfileMirrorQueue(): Promise<void> {
  try {
    while (pendingMirrorPayload !== null) {
      const payload = pendingMirrorPayload;
      pendingMirrorPayload = null;
      try {
        const { writeTextFile, mkdir, BaseDirectory } = await import("@tauri-apps/plugin-fs");
        await mkdir("saves", { baseDir: BaseDirectory.AppData, recursive: true });
        // UI writes already return after localStorage. Serialize native mutations
        // by their true lifetime, not by a timeout that leaves the old write alive.
        await writeTextFile(PROFILE_FILE, payload, { baseDir: BaseDirectory.AppData });
      } catch (e) {
        console.warn("档案 fs 镜像失败（localStorage 主档已保存）", e);
      }
    }
  } finally {
    mirrorWriteInFlight = false;
    // Cover an enqueue that lands between the loop's final check and this cleanup.
    if (pendingMirrorPayload !== null) {
      mirrorWriteInFlight = true;
      void drainProfileMirrorQueue();
    }
  }
}

/** Synchronously save the authoritative profile and queue its ordered desktop mirror. */
export function saveProfileImmediately(profile: ProfileState): boolean {
  const payload = JSON.stringify(profile);
  try {
    const stored = writeLocalSave(PROFILE_KEY, payload);
    if (!stored.ok) return false;
  } catch (e) {
    console.error("档案 localStorage 保存失败", e);
    return false;
  }
  if (isTauri()) enqueueProfileMirror(payload);
  return true;
}

/** Save profile; the bool describes the authoritative localStorage write, not the best-effort mirror. */
export function saveProfile(profile: ProfileState): Promise<boolean> {
  return Promise.resolve(saveProfileImmediately(profile));
}
