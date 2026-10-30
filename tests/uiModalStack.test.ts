// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { uiState, pushModal, closeModal } from "../src/stores/uiStore.svelte";

describe("嵌套弹窗返回", () => {
  beforeEach(() => {
    uiState.modal = null;
    uiState.modalStack = [];
    uiState.eventPayload = null;
    uiState.storyCardPayload = null;
  });

  it("从手机打开工作小游戏后关闭返回手机", () => {
    uiState.modal = "phone";
    pushModal("minigame");
    expect(uiState.modal).toBe("minigame");
    expect(uiState.modalStack.map((frame) => frame.modal)).toEqual(["phone"]);

    closeModal();
    expect(uiState.modal).toBe("phone");
    expect(uiState.modalStack).toEqual([]);
  });

  it("关闭结算弹窗后恢复事件弹窗内容", () => {
    const event = { id: "event_test", text: "待恢复的事件" };
    uiState.modal = "event";
    uiState.eventPayload = event;
    pushModal("result", { actionId: "test_action" });

    closeModal();

    expect(uiState.modal).toBe("event");
    expect(uiState.eventPayload).toEqual(event);
    expect(uiState.resultPayload).toBeNull();
  });

  it("背包里的衣柜可以返回背包，且栈按后进先出收起", () => {
    uiState.modal = "inventory";
    pushModal("wardrobe");
    pushModal("confirm");
    closeModal();
    expect(uiState.modal).toBe("wardrobe");
    closeModal();
    expect(uiState.modal).toBe("inventory");
    closeModal();
    expect(uiState.modal).toBeNull();
  });
});
