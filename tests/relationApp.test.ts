// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import RelationApp from "../src/components/RelationApp.svelte";
import { createInitialState } from "../src/game/core/state";
import { gameDay } from "../src/game/core/calendar";
import { ensureRelationship } from "../src/game/core/relationships";
import { replaceState } from "../src/stores/gameStore.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
  replaceState(createInitialState(1));
});

describe("关系 App 借款显示", () => {
  it("显示当前存活日减去借款时存活日，而不是借款日的绝对值", () => {
    const state = createInitialState(701);
    state.time.day = 11;
    const today = gameDay(state.time);
    const rel = ensureRelationship(state, "npc_zhao_gang");
    rel.loan = { amount: 200, since: today - 6 };
    replaceState(state);

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(RelationApp, {
      target,
      props: { onClose: () => {}, onResult: () => {} },
    });
    mounted.push({ component, target });
    flushSync();

    target.querySelector<HTMLButtonElement>(".rel-row")!.click();
    flushSync();

    const loanText = target.querySelector(".rel-loan")?.textContent ?? "";
    expect(loanText).toContain("已借 6 天");
    expect(loanText).not.toContain(`已借 ${rel.loan?.since} 天`);
  });
});
