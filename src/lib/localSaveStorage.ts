/** Reclaim only rotating recovery copies when they prevent writing an authoritative save. */
export type LocalWriteResult = { ok: true } | { ok: false; reason: "quota" | "security" | "unavailable" };

function storageReason(error: unknown): "quota" | "security" | "unavailable" {
  const name = typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  return name === "SecurityError" ? "security" : "unavailable";
}

export function writeLocalSave(key: string, payload: string): LocalWriteResult {
  try { localStorage.setItem(key, payload); return { ok: true }; }
  catch (error) {
    const reason = storageReason(error);
    if (reason !== "quota") return { ok: false, reason };
    // Older copies go first. Never remove a manual slot, the auto slot, profile or unrelated data.
    for (const index of [3, 2, 1]) {
      for (const slot of ["auto", "slot_1", "slot_2", "slot_3"]) {
        const backup = `urban_life_save_${slot}_backup_${index}`;
        try {
          if (localStorage.getItem(backup) === null) continue;
          localStorage.removeItem(backup);
          localStorage.setItem(key, payload);
          return { ok: true };
        } catch (retryError) {
          const retryReason = storageReason(retryError);
          if (retryReason !== "quota") return { ok: false, reason: retryReason };
        }
      }
    }
    return { ok: false, reason: "quota" };
  }
}

export function localSaveFailureMessage(reason: "quota" | "security" | "unavailable"): string {
  if (reason === "quota") return "浏览器存储空间不足，旧存档已保留；请导出当前进度并释放空间后重试";
  if (reason === "security") return "浏览器限制了本地保存，旧存档已保留；请先导出当前进度，再允许此页面使用本地存储";
  return "本地存储暂时不可用，旧存档已保留；请导出当前进度后重试";
}
