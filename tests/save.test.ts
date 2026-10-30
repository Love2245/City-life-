// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { createInitialState } from "../src/game/core/state";
import { fromLinearDay, gameDay, linearDay } from "../src/game/core/calendar";
import { SAVE_VERSION } from "../src/game/core/migrate";
import { loadGame, saveGame, saveGameImmediately } from "../src/lib/save";
import SaveLoadView from "../src/views/SaveLoadView.svelte";
import { gameState, navigation, replaceState } from "../src/stores/gameStore.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function mountSaveView(): HTMLElement {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const component = mount(SaveLoadView, { target });
  mounted.push({ component, target });
  flushSync();
  return target;
}

const settleUi = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
};

describe("v1.4 存档 schema 安全", () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      unmount(item.component);
      item.target.remove();
    }
    navigation.returnView = "menu";
    replaceState(createInitialState(1));
    vi.restoreAllMocks();
  });

  it("当前版本状态可写入并读回，且标记教程已保存", async () => {
    const state = createInitialState(395);
    await saveGame("auto", state);
    expect(state.flags.saved_once).toBe(true);
    const loaded = await loadGame("auto");
    expect(loaded?.version).toBe(SAVE_VERSION);
    expect(loaded?.rng.seed).toBe(state.rng.seed);
    expect(loaded?.flags.saved_once).toBe(true);
  });

  it("损坏旧档会留下轮换备份并提示，写入失败不改动当前状态", () => {
    const damaged = "{broken save";
    localStorage.setItem("urban_life_save_auto", damaged);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = createInitialState(3961);
    expect(() => saveGameImmediately("auto", state)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("旧内容无法解析"));
    expect(localStorage.getItem("urban_life_save_auto_backup_1")).toBe(damaged);

    const failedState = createInitialState(3962);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota exceeded"); });
    expect(() => saveGameImmediately("slot_1", failedState)).toThrow("存档写入失败");
    expect(failedState.flags.saved_once).toBeUndefined();
  });

  it("保存时只保留最近 60 天的每日工作标记", () => {
    const state = createInitialState(3963);
    Object.assign(state.time, fromLinearDay(linearDay(state.time) + 100));
    const currentDay = gameDay(state.time);
    state.flags[`worked_job_old_${currentDay - 61}`] = true;
    state.flags[`worked_job_recent_${currentDay - 59}`] = true;
    state.flags[`worked_job_future_${currentDay + 1}`] = true;
    saveGameImmediately("auto", state);
    expect(state.flags[`worked_job_old_${currentDay - 61}`]).toBeUndefined();
    expect(state.flags[`worked_job_recent_${currentDay - 59}`]).toBe(true);
    expect(state.flags[`worked_job_future_${currentDay + 1}`]).toBe(true);
    const saved = JSON.parse(localStorage.getItem("urban_life_save_auto")!) as { flags: Record<string, boolean> };
    expect(saved.flags[`worked_job_old_${currentDay - 61}`]).toBeUndefined();
  });

  it("同版结业存档通过真实读档入口幂等补齐证书", async () => {
    const certified = createInitialState(401);
    certified.version = SAVE_VERSION;
    certified.flags.item_training_cert = true;
    certified.flags.skill_certificate_level = 2;
    delete certified.inventory.training_certificate;
    localStorage.setItem("urban_life_save_auto", JSON.stringify(certified));

    const firstLoad = await loadGame("auto");
    const secondLoad = await loadGame("auto");
    expect(firstLoad?.inventory.training_certificate).toBe(1);
    expect(secondLoad?.inventory.training_certificate).toBe(1);
    expect(secondLoad?.flags.skill_certificate_level).toBe(2);

    certified.inventory.training_certificate = 1;
    localStorage.setItem("urban_life_save_auto", JSON.stringify(certified));
    expect((await loadGame("auto"))?.inventory.training_certificate).toBe(1);

    const uncertified = createInitialState(402);
    uncertified.version = SAVE_VERSION;
    uncertified.flags.item_training_cert = false;
    uncertified.flags.skill_certificate_level = 0;
    delete uncertified.inventory.training_certificate;
    localStorage.setItem("urban_life_save_auto", JSON.stringify(uncertified));
    expect((await loadGame("auto"))?.inventory.training_certificate).toBeUndefined();
  });

  it("版本号正确但缺少核心字段的损坏 JSON 回退为空槽", async () => {
    localStorage.setItem("urban_life_save_auto", JSON.stringify({ version: SAVE_VERSION }));
    expect(await loadGame("auto")).toBeNull();
  });

  it.each([
    ["缺少健康属性", (payload: Record<string, unknown>) => {
      delete (payload.player as { attrs: Record<string, unknown> }).attrs.health;
    }],
    ["把属性对象写成数组", (payload: Record<string, unknown>) => {
      (payload.player as { attrs: unknown }).attrs = [];
    }],
    ["物品数量为负数", (payload: Record<string, unknown>) => {
      (payload.inventory as Record<string, number>).phone = -1;
    }],
    ["佣金冷却表写成数组", (payload: Record<string, unknown>) => {
      (payload.cityCommissions as { cooldownUntilDay: unknown }).cooldownUntilDay = [];
    }],
    ["工资记录改成非数组", (payload: Record<string, unknown>) => {
      (payload.work as { wageRecords: unknown }).wageRecords = {};
    }],
    ["社交动态改成非数组", (payload: Record<string, unknown>) => {
      (payload.social as { posts: unknown }).posts = {};
    }],
    ["随机数调用计数改成字符串", (payload: Record<string, unknown>) => {
      (payload.rng as { calls: unknown }).calls = "bad";
    }],
  ])("隔离当前版本损坏存档：%s", async (_caseName, corrupt) => {
    const payload = JSON.parse(JSON.stringify(createInitialState(398))) as Record<string, unknown>;
    corrupt(payload);
    localStorage.setItem("urban_life_save_auto", JSON.stringify(payload));
    expect(await loadGame("auto")).toBeNull();
  });

  it("隔离包含 JSON 有效但溢出的数字存档", async () => {
    const valid = JSON.stringify(createInitialState(399));
    const overflow = valid.replace('"health":85', '"health":1e999');
    expect(overflow).not.toBe(valid);
    localStorage.setItem("urban_life_save_auto", overflow);
    expect(await loadGame("auto")).toBeNull();
  });

  it("迁移较早存档时补齐后续新增的 writing 与 management 技能", async () => {
    const legacy = createInitialState(400) as unknown as Record<string, unknown>;
    legacy.version = 31;
    const skills = (legacy.player as { skills: Record<string, unknown> }).skills;
    delete skills.writing;
    delete skills.management;
    localStorage.setItem("urban_life_save_auto", JSON.stringify(legacy));

    const loaded = await loadGame("auto");
    expect(loaded?.version).toBe(SAVE_VERSION);
    expect(loaded?.player.skills).toMatchObject({ writing: 0, management: 0 });
  });

  it("手动首次保存的快照包含引导标记，成功后才更新内存", async () => {
    replaceState(createInitialState(396));
    navigation.returnView = "game";
    const target = mountSaveView();
    await settleUi();

    target.querySelector<HTMLButtonElement>(".slot-actions .btn-primary")!.click();
    await settleUi();

    expect((await loadGame("slot_1"))?.flags.manual_saved_once).toBe(true);
    expect(gameState.flags.manual_saved_once).toBe(true);
    expect(gameState.flags.saved_once).toBe(true);
  });

  it("手动保存失败时不在内存标记首次保存", async () => {
    replaceState(createInitialState(397));
    gameState.flags.manual_saved_once = false;
    gameState.flags.saved_once = false;
    navigation.returnView = "game";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage quota exceeded");
    });
    const target = mountSaveView();
    await settleUi();

    target.querySelector<HTMLButtonElement>(".slot-actions .btn-primary")!.click();
    await settleUi();

    expect(gameState.flags.manual_saved_once).toBe(false);
    expect(gameState.flags.saved_once).toBe(false);
    expect(target.querySelector(".save-error")?.textContent).toContain("保存失败");
    expect(await loadGame("slot_1")).toBeNull();
  });

  it("1.4(v27) 存档迁移到 1.41(v28)，并补齐新字段", async () => {
    const legacy = createInitialState(26) as unknown as Record<string, unknown>;
    legacy.version = 27;
    delete legacy.smallPets;
    delete legacy.intercityTicket;
    delete legacy.cityCommissions;
    legacy.dailyGoals = [{ id: "eat_hot", text: "吃一顿热的", reward: { mood: 2 }, done: false }, { id: "removed_goal", text: "旧目标", reward: { mood: 2 }, done: false }];
    (legacy.career as Record<string, unknown>).passiveIncome = 1800;
    localStorage.setItem("urban_life_save_auto", JSON.stringify(legacy));
    const loaded = await loadGame("auto");
    expect(loaded?.version).toBe(SAVE_VERSION);
    expect(loaded?.smallPets).toEqual([]);
    expect(loaded?.intercityTicket).toBeUndefined();
    expect(loaded?.cityCommissions).toEqual({ weekIndex: 0, offeredIds: [], activeId: null, cooldownUntilDay: {} });
    expect(loaded?.career.passiveIncome).toBe(1500);
    expect(loaded?.dailyGoals).toBeUndefined();
  });
});
