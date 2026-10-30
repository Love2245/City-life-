// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { createInitialState } from "../src/game/core/state";
import {
  autoSaveStatus, backToMenu, checkpointAutoSave, checkpointFingerprint, currentView, gameState, goto, isSessionDirty, markSessionClean, navigation,
  newGame, replaceState, musicSession,
} from "../src/stores/gameStore.svelte";
import { dismissToast, uiState } from "../src/stores/uiStore.svelte";
import CheckpointFingerprintProbe from "./fixtures/CheckpointFingerprintProbe.svelte";

const storage = vi.hoisted(() => ({ saveGame: vi.fn() }));
vi.mock("../src/lib/save", () => ({ saveGame: storage.saveGame }));

afterEach(() => {
  currentView.name = "menu";
  markSessionClean();
  autoSaveStatus.status = "idle";
  autoSaveStatus.error = "";
  if (uiState.toast?.includes("本次进度未保存")) dismissToast();
  storage.saveGame.mockReset();
});

describe("游戏会话存档生命周期", () => {
  it("新游戏和读档状态替换各开启新的音乐会话", () => {
    const initialSession = musicSession.value;
    newGame({
      familyId: "destitute",
      allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 },
      ownedItems: [],
    }, 32);
    expect(musicSession.value).toBe(initialSession + 1);

    const loaded = createInitialState(33);
    loaded.player.money = 456;
    replaceState(loaded);
    expect(musicSession.value).toBe(initialSession + 2);
    expect(gameState.player.money).toBe(456);
  });

  it("同会话的 NPC 状态事务保留音乐会话并正常提交游戏变化", () => {
    replaceState(createInitialState(34));
    const initialSession = musicSession.value;
    const draft = JSON.parse(JSON.stringify(gameState));
    draft.player.money += 75;
    draft.flags["npc_transaction_committed"] = true;
    replaceState(draft, { sameSession: true });

    expect(musicSession.value).toBe(initialSession);
    expect(gameState.player.money).toBe(draft.player.money);
    expect(gameState.flags["npc_transaction_committed"]).toBe(true);
  });

  it("自动存档指纹覆盖不推进时间的持久化设置和关系变化", () => {
    const state = createInitialState(28);
    const initial = checkpointFingerprint(state);

    state.alarmHour = 8;
    expect(checkpointFingerprint(state)).not.toBe(initial);

    const afterAlarm = checkpointFingerprint(state);
    state.equipped.hat = "hat_sunshade";
    expect(checkpointFingerprint(state)).not.toBe(afterAlarm);

    const afterEquipment = checkpointFingerprint(state);
    state.activePet = "pet_orange_1";
    expect(checkpointFingerprint(state)).not.toBe(afterEquipment);

    const afterPet = checkpointFingerprint(state);
    state.relationships.push({
      npcId: "npc_test",
      affinity: 21,
      state: "acquaintance",
      lastInteractionDay: 1,
    });
    expect(checkpointFingerprint(state)).not.toBe(afterPet);
  });

  it("Svelte 自动存档观察器能跟踪指纹中的嵌套存档字段", () => {
    replaceState(createInitialState(27));
    const target = document.createElement("div");
    document.body.appendChild(target);
    const probe = mount(CheckpointFingerprintProbe, { target });
    flushSync();
    const initial = probe.readFingerprint();

    gameState.equipped.hat = "hat_sunshade";
    flushSync();
    expect(probe.readFingerprint()).not.toBe(initial);

    unmount(probe);
    target.remove();
  });

  it("返回菜单的旧存档完成后，仍保留新局的未保存标记", async () => {
    let finishSave!: () => void;
    storage.saveGame.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishSave = resolve;
    }));
    replaceState(createInitialState(29));
    markSessionClean();
    goto("game");
    backToMenu();
    expect(currentView.name).toBe("menu");
    await vi.waitFor(() => expect(storage.saveGame).toHaveBeenCalledOnce());

    newGame({
      familyId: "destitute",
      allocation: { money: 0, charm: 0, stamina: 0, intelligence: 0, items: 0 },
      ownedItems: [],
    }, 30);
    expect(isSessionDirty()).toBe(true);
    finishSave();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isSessionDirty()).toBe(true);
  });

  it("返回菜单时自动存档失败会显示提示并保留失败状态", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    storage.saveGame.mockRejectedValueOnce(new Error("存储空间不足"));
    replaceState(createInitialState(35));
    markSessionClean();
    goto("game");

    backToMenu();

    await vi.waitFor(() => expect(uiState.toast).toContain("本次进度未保存"));
    expect(autoSaveStatus.status).toBe("failed");
    expect(autoSaveStatus.error).toBe("存储空间不足");
    expect(currentView.name).toBe("menu");
    expect(logError).toHaveBeenCalledOnce();
    logError.mockRestore();
  });

  it("游戏内周报覆盖页仍能自动存档周薪和待展示周报", async () => {
    replaceState(createInitialState(31));
    goto("game");
    gameState.player.money += 850;
    gameState.weekly.pending = true;
    gameState.weekly.report = { earned: 850, spent: 0, interactions: [], jobsDone: 0, goalGap: null };
    goto("weeklyReport");
    markSessionClean();

    await checkpointAutoSave();

    expect(storage.saveGame).toHaveBeenCalledOnce();
    expect(storage.saveGame.mock.calls[0][0]).toBe("auto");
    expect(storage.saveGame.mock.calls[0][1]).toMatchObject({
      player: { money: gameState.player.money },
      weekly: { pending: true, report: { earned: 850 } },
    });
    expect(isSessionDirty()).toBe(false);
    expect(navigation.returnView).toBe("game");
  });
});
