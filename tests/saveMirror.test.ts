// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { deleteSave, saveGame } from "../src/lib/save";

const fsState = vi.hoisted(() => ({
  writes: [] as Array<{ payload: string; finish: () => void }>,
  fileContents: new Map<string, string>(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  mkdir: vi.fn(async () => {}),
  remove: vi.fn(async () => { fsState.fileContents.delete("auto"); }),
  writeTextFile: vi.fn((_path: string, payload: string) => new Promise<void>((resolve) => {
    fsState.writes.push({
      payload,
      finish: () => {
        fsState.fileContents.set("auto", payload);
        resolve();
      },
    });
  })),
}));

describe("桌面版存档镜像顺序", () => {
  beforeEach(() => {
    localStorage.clear();
    fsState.writes.length = 0;
    fsState.fileContents.clear();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("同一槽位只写最新快照，慢旧写入不会覆盖新进度", async () => {
    const oldState = createInitialState(51);
    oldState.player.money = 111;
    const newState = createInitialState(52);
    newState.player.money = 222;

    await saveGame("auto", oldState);
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(1));
    await saveGame("auto", newState);

    // 第一次文件写入仍挂起时，第二次应排队而不是并行启动。
    expect(fsState.writes).toHaveLength(1);
    fsState.writes[0].finish();
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(2));
    fsState.writes[1].finish();
    await vi.waitFor(() => {
      const payload = fsState.fileContents.get("auto");
      expect(payload && JSON.parse(payload).player.money).toBe(222);
    });
  });

  it("删除槽位会排在进行中的镜像写入后，不会被旧快照复活", async () => {
    const state = createInitialState(53);
    state.player.money = 333;
    await saveGame("auto", state);
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(1));

    const deleting = deleteSave("auto");
    expect(localStorage.getItem("urban_life_save_auto")).toBeNull();
    fsState.writes[0].finish();
    await deleting;

    expect(fsState.fileContents.has("auto")).toBe(false);
    expect(localStorage.getItem("urban_life_save_auto")).toBeNull();
  });
});
