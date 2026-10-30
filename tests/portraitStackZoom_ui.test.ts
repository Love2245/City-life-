// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PortraitStack from "../src/components/layout/PortraitStack.svelte";

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
});

function wheel(target: HTMLElement, deltaY: number): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
  target.dispatchEvent(event);
  flushSync();
  return event;
}

describe("character portrait zoom", () => {
  it("zooms NPC/player layered portraits with the wheel and resets on double click", () => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(PortraitStack, {
      target,
      props: {
        portrait: { layers: ["/base.webp", "/hair.webp"], variant: "default" } as never,
        className: "portrait-image",
        alt: "角色立绘",
        zoomable: true,
      },
    });
    flushSync();
    const stack = target.querySelector<HTMLElement>(".portrait-stack")!;
    const firstWheel = wheel(stack, -1);
    expect(firstWheel.defaultPrevented).toBe(true);
    expect(stack.style.getPropertyValue("--portrait-zoom")).toBe("1.15");
    expect(target.textContent).toContain("115%");
    for (let i = 0; i < 12; i++) wheel(stack, -1);
    expect(stack.style.getPropertyValue("--portrait-zoom")).toBe("2.5");
    stack.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    flushSync();
    expect(stack.style.getPropertyValue("--portrait-zoom")).toBe("1");
    expect(target.querySelector(".portrait-zoom-indicator")).toBeNull();
  });

  it("leaves small portraits unchanged unless a caller opts in", () => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(PortraitStack, {
      target,
      props: { portrait: { source: "/npc.webp", variant: "default" } as never, alt: "NPC" },
    });
    flushSync();
    const stack = target.querySelector<HTMLElement>(".portrait-stack")!;
    expect(wheel(stack, -1).defaultPrevented).toBe(false);
    expect(stack.style.getPropertyValue("--portrait-zoom")).toBe("1");
  });
});
