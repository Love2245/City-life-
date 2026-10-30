// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PhoneSnake from "../src/components/layout/minigames/PhoneSnake.svelte";
import Phone2048 from "../src/components/layout/minigames/Phone2048.svelte";
import PhoneSokoban from "../src/components/layout/minigames/PhoneSokoban.svelte";

describe("phone minigame keyboard controls", () => {
  it.each([
    ["snake", PhoneSnake],
    ["2048", Phone2048],
    ["sokoban", PhoneSokoban],
  ])("consumes arrow keys in %s instead of scrolling the app", (_name, Game) => {
    const target = document.createElement("div");
    document.body.append(target);
    const component = mount(Game, { target });
    flushSync();

    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented, `${key} should be consumed`).toBe(true);
    }

    unmount(component);
    target.remove();
  });
});
