// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import InventoryModal from "../src/components/InventoryModal.svelte";
import { createInitialState } from "../src/game/core/state";
import { residenceLocationId } from "../src/game/core/residence";
import { replaceState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";

let rendered: { component: ReturnType<typeof mount>; target: HTMLElement } | undefined;
beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
});
afterEach(() => {
  if (rendered) { unmount(rendered.component); rendered.target.remove(); rendered = undefined; }
  uiState.modal = null;
  replaceState(createInitialState(1));
});
function render(storage = false) {
  const target = document.createElement("div"); document.body.appendChild(target);
  rendered = { component: mount(InventoryModal, { target, props: { storage } }), target };
  flushSync(); return target;
}

describe("背包与住处收纳", () => {
  it("随身背包不混入衣服或家居，装备摘要折叠，证照仍可查看", () => {
    const state = createInitialState(813);
    state.inventory.bento = 1; state.inventory.shirt = 1; state.inventory.driving_license = 1;
    state.locationId = "street"; replaceState(state);
    const target = render();
    expect(target.querySelector(".equipment-overview")?.hasAttribute("open")).toBe(false);
    const names = [...target.querySelectorAll(".bag-grid .b-name")].map(e => e.textContent);
    expect(names).toContain("盒饭"); expect(names).not.toContain("衬衫");
    expect(target.querySelector(".credential-pocket")?.textContent).toContain("驾驶本");
    expect(target.querySelector(".slot-unequip")).toBeNull();
    expect(target.querySelector(".wardrobe-link")).toBeNull();
  });

  it("在当前合法住处可打开衣柜与家中收纳，设备不出现在背包中", () => {
    const state = createInitialState(814);
    state.locationId = residenceLocationId(state); replaceState(state);
    const target = render(true);
    expect(target.querySelector(".bag-title")?.textContent).toContain("家中收纳");
    expect(target.querySelector(".bag-grid")?.textContent).toContain("手机");
    const wardrobe = [...target.querySelectorAll<HTMLButtonElement>(".wardrobe-link")].find(b => b.textContent?.includes("衣柜"))!;
    wardrobe.click(); flushSync(); expect(uiState.modal).toBe("wardrobe");
  });
});
