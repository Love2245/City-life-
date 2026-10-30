import { describe, expect, it } from "vitest";
import { ARCHIVE_ONLY_SAVE_FAILURE, saveFailureCopy } from "../src/lib/saveStatus";

describe("保存状态提示", () => {
  it("游戏进度已落盘时指出待重试的是永久图鉴", () => {
    expect(saveFailureCopy(ARCHIVE_ONLY_SAVE_FAILURE)).toEqual({
      label: "图鉴待保存 · 查看原因",
      headline: "当前生活已保存，永久图鉴待重试",
    });
    expect(saveFailureCopy("永久图鉴保存失败，请返回游戏后重试").headline).toBe("当前生活已保存，永久图鉴待重试");
  });

  it("主存档写入失败时仍明确提示最新进度未保存", () => {
    expect(saveFailureCopy("存档写入失败：配额已满")).toEqual({
      label: "保存失败 · 查看原因",
      headline: "最新进度尚未保存到本机",
    });
  });
});
