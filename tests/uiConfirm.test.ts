// @vitest-environment jsdom
/**
 * v1.43.1 应用内确认弹窗回归。
 * 背景：Tauri/WebView2 不支持 window.confirm —— 不弹框且静默返回 false，
 * 使 `if (!confirm(...)) return;` 无条件命中取消分支（覆盖/删除存档、返回主菜单全部失效）。
 * 这里锁住替代方案的可用性：弹层出现、确认返回 true、取消返回 false、重复发起不悬挂。
 */
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import ConfirmDialog from "../src/components/layout/ConfirmDialog.svelte";
import { uiConfirm, resolveConfirm, uiState } from "../src/stores/uiStore.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function setup(): HTMLElement {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const component = mount(ConfirmDialog, { target });
  mounted.push({ component, target });
  flushSync();
  return target;
}

afterEach(() => {
  resolveConfirm(false);
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
});

describe("v1.43.1 应用内确认弹窗", () => {
  it("发起确认时出现弹层，点击确认按钮 resolve(true)", async () => {
    const target = setup();
    expect(target.querySelector(".confirm-overlay")).toBeNull();

    const promise = uiConfirm("确定删除存档位 1？此操作不可恢复。", { confirmLabel: "删除", danger: true });
    flushSync();
    expect(target.querySelector(".confirm-overlay")).not.toBeNull();
    expect(target.textContent).toContain("确定删除存档位 1？");
    expect(target.querySelector(".confirm-btn.primary.danger")).not.toBeNull();

    target.querySelector<HTMLButtonElement>(".confirm-btn.primary")!.click();
    flushSync();

    await expect(promise).resolves.toBe(true);
    expect(uiState.confirmRequest).toBeNull();
    expect(target.querySelector(".confirm-overlay")).toBeNull();
  });

  it("点击取消按钮 resolve(false)，弹层关闭", async () => {
    const target = setup();
    const promise = uiConfirm("确定覆盖存档位 2？", { confirmLabel: "覆盖保存" });
    flushSync();

    target.querySelector<HTMLButtonElement>(".confirm-btn:not(.primary)")!.click();
    flushSync();

    await expect(promise).resolves.toBe(false);
    expect(uiState.confirmRequest).toBeNull();
  });

  it("重复发起时旧请求按取消收束（不会留下悬挂的 Promise）", async () => {
    setup();
    const first = uiConfirm("第一次确认");
    flushSync();
    const second = uiConfirm("第二次确认");
    flushSync();

    await expect(first).resolves.toBe(false);
    resolveConfirm(true);
    await expect(second).resolves.toBe(true);
  });
});
