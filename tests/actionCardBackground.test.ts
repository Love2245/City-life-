import { describe, expect, it } from "vitest";
import {
  setActionCardBackground,
  uiState,
  type ActionCardBackground,
} from "../src/stores/uiStore.svelte";

describe("v1.4 场景卡底纹设置", () => {
  it("默认使用经典半透明底纹，并可切换到抽象纹理", () => {
    expect(uiState.actionCardBackground).toBe("glass");
    setActionCardBackground("texture");
    expect(uiState.actionCardBackground).toBe("texture");
    setActionCardBackground("glass");
    expect(uiState.actionCardBackground).toBe("glass");
  });

  it("只接受定义中的两种底纹模式", () => {
    const modes: ActionCardBackground[] = ["texture", "glass"];
    for (const mode of modes) {
      setActionCardBackground(mode);
      expect(uiState.actionCardBackground).toBe(mode);
    }
    setActionCardBackground("glass");
  });
});
