/** 独立于游戏存档；十连点只解锁，启用必须由设置页明确操作。 */
export const DEVELOPER_STORAGE_KEY = "urban-life-super-developer-v1";
export const DEVELOPER_TAP_GAP_MS = 1500;
export interface DeveloperAccess { unlocked: boolean; enabled: boolean }
export function readDeveloperAccess(storage?: Pick<Storage, "getItem">): DeveloperAccess {
  try {
    const value = JSON.parse(storage?.getItem(DEVELOPER_STORAGE_KEY) ?? "null");
    const unlocked = value?.unlocked === true;
    return { unlocked, enabled: unlocked && value?.enabled === true };
  } catch { return { unlocked: false, enabled: false }; }
}
export function writeDeveloperAccess(access: DeveloperAccess, storage?: Pick<Storage, "setItem">): void {
  try { storage?.setItem(DEVELOPER_STORAGE_KEY, JSON.stringify({ unlocked: access.unlocked, enabled: access.unlocked && access.enabled })); } catch { /* 本次会话仍可使用。 */ }
}
export function createTitleTapCounter() {
  let count = 0, last = -Infinity;
  return {
    tap(now: number): boolean {
      if (!Number.isFinite(now)) return false;
      count = now >= last && now - last <= DEVELOPER_TAP_GAP_MS ? count + 1 : 1;
      last = now;
      if (count < 10) return false;
      count = 0; last = -Infinity;
      return true;
    },
    reset(): void { count = 0; last = -Infinity; },
  };
}
