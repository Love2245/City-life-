// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { localSaveFailureMessage, writeLocalSave } from "../src/lib/localSaveStorage";
import { createInitialState } from "../src/game/core/state";
import { exportCurrentSavePayload, saveGameImmediately } from "../src/lib/save";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
describe("主存档优先与配额恢复", () => {
  it("空间不足时只回收最旧轮换备份，保留主档、近备份和其他数据", () => {
    localStorage.clear();
    localStorage.setItem("urban_life_save_auto", "old");
    localStorage.setItem("urban_life_save_slot_1", "manual");
    localStorage.setItem("foreign_data", "foreign");
    localStorage.setItem("urban_life_save_auto_backup_3", "x".repeat(120));
    localStorage.setItem("urban_life_save_auto_backup_1", "x".repeat(90));
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      let used = value.length;
      for (let index = 0; index < this.length; index++) {
        const existing = this.key(index)!;
        if (existing !== key) used += this.getItem(existing)!.length;
      }
      if (used > 300) throw new DOMException("full", "QuotaExceededError");
      original.call(this, key, value);
    });
    const result = writeLocalSave("urban_life_save_auto", "new".repeat(60));
    expect(result.ok).toBe(true);
    expect(localStorage.getItem("urban_life_save_auto")).toBe("new".repeat(60));
    expect(localStorage.getItem("urban_life_save_auto_backup_3")).toBeNull();
    expect(localStorage.getItem("urban_life_save_auto_backup_1")).toBe("x".repeat(90));
    expect(localStorage.getItem("urban_life_save_slot_1")).toBe("manual");
    expect(localStorage.getItem("foreign_data")).toBe("foreign");
  });
  it("浏览器权限拒绝时不删除备份，并给出明确原因", () => {
    localStorage.setItem("urban_life_save_auto_backup_3", "backup");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    expect(writeLocalSave("urban_life_save_auto", "new")).toEqual({ ok: false, reason: "security" });
    expect(remove).not.toHaveBeenCalled();
    expect(localSaveFailureMessage("security")).toContain("浏览器限制");
  });
  it("保存新主档在增加备份之前，导出的是最新内存进度", () => {
    const state = createInitialState(94);
    saveGameImmediately("auto", state);
    const calls: string[] = [];
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) { calls.push(key); original.call(this, key, value); });
    state.player.money = 743;
    saveGameImmediately("auto", state);
    expect(calls[0]).toBe("urban_life_save_auto");
    state.player.money = 900;
    expect(JSON.parse(exportCurrentSavePayload(state)).player.money).toBe(900);
    expect(JSON.parse(localStorage.getItem("urban_life_save_auto")!).player.money).toBe(743);
  });
});
