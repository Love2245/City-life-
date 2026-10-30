// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProfile } from "../src/game/core/profile";
import { saveProfile } from "../src/lib/profile";

const fsState = vi.hoisted(() => ({
  writes: [] as Array<{ payload: string; finish: () => void }>,
  fileContents: "",
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: "AppData" },
  mkdir: vi.fn(async () => {}),
  writeTextFile: vi.fn((_path: string, payload: string) => new Promise<void>((resolve) => {
    fsState.writes.push({
      payload,
      finish: () => {
        fsState.fileContents = payload;
        resolve();
      },
    });
  })),
}));

describe("Profile 持久化", () => {
  beforeEach(() => {
    localStorage.clear();
    fsState.writes.length = 0;
    fsState.fileContents = "";
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("localStorage 写入失败会明确返回失败并保留之前的档案", async () => {
    const previous = { ...emptyProfile(), fatePoints: 12 };
    const next = { ...emptyProfile(), fatePoints: 20 };
    localStorage.setItem("urban_life_profile", JSON.stringify(previous));
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
      if (key === "urban_life_profile") throw new Error("quota");
      return original.call(this, key, value);
    });

    await expect(saveProfile(next)).resolves.toBe(false);
    expect(JSON.parse(localStorage.getItem("urban_life_profile")!).fatePoints).toBe(12);
    expect(fsState.writes).toHaveLength(0);
  });

  it("桌面档案镜像串行落盘，较慢的旧快照不会覆盖新快照", async () => {
    const older = { ...emptyProfile(), fatePoints: 31 };
    const newer = { ...emptyProfile(), fatePoints: 47 };

    await expect(saveProfile(older)).resolves.toBe(true);
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(1));
    await expect(saveProfile(newer)).resolves.toBe(true);
    // 旧原生写入超过界面读取的 3 秒上限，也不能提前释放写入队列。
    await new Promise(resolve => setTimeout(resolve, 3050));
    expect(fsState.writes).toHaveLength(1);

    fsState.writes[0].finish();
    await vi.waitFor(() => expect(fsState.writes).toHaveLength(2));
    fsState.writes[1].finish();
    await vi.waitFor(() => expect(JSON.parse(fsState.fileContents).fatePoints).toBe(47));
    expect(JSON.parse(localStorage.getItem("urban_life_profile")!).fatePoints).toBe(47);
  });
});
