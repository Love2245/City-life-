// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import ReaderModal from "../src/components/ReaderModal.svelte";
import { createInitialState } from "../src/game/core/state";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";

it("iPhone 15 Pro Max landscape PE reader fits a complete book spread and keeps page turns intact", () => {
  vi.useFakeTimers();
  const width = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
  const height = Object.getOwnPropertyDescriptor(window, "innerHeight")!;
  const pixelRatio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
  const oldScrollTo = HTMLElement.prototype.scrollTo;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 932 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 430 });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3 });
  HTMLElement.prototype.scrollTo = vi.fn();
  replaceState(createInitialState(932));
  uiState.gameMode = "pe";
  uiState.readerId = "book_programming";
  const before = { money: gameState.player.money, stamina: gameState.player.attrs.stamina };
  const target = document.createElement("div");
  document.body.appendChild(target);
  const reader = mount(ReaderModal, { target });
  try {
    flushSync();
    const next = () => [...target.querySelectorAll<HTMLButtonElement>(".nav-turn")]
      .find(button => button.textContent?.includes("下一页"))!;
    next().click(); flushSync();
    expect(target.querySelector(".reader-overlay.pe-fullscreen .reader-shell.pe-fullscreen")).not.toBeNull();
    expect(target.querySelector(".book-spread.single-page")).toBeNull();
    expect(target.querySelectorAll(".book-spread > .book-page")).toHaveLength(2);
    const stage = target.querySelector<HTMLElement>(".book-stage")!;
    const spreadWidth = parseFloat(stage.style.getPropertyValue("--stage-width"));
    const spreadHeight = parseFloat(stage.style.getPropertyValue("--stage-height"));
    expect(spreadWidth).toBeGreaterThan(400);
    expect(spreadWidth).toBeLessThanOrEqual(932);
    expect(spreadHeight).toBeLessThanOrEqual(430);
    expect(gameState.flags.reader_book_programming_page).toBe(1);
    next().click(); flushSync();
    expect(gameState.flags.reader_book_programming_page).toBe(1);
    vi.advanceTimersByTime(700); flushSync();
    next().click(); flushSync();
    expect(gameState.flags.reader_book_programming_page).toBe(3);
    expect([...target.querySelectorAll<HTMLElement>(".page-leaf .page-footer > span:nth-child(2)")]
      .map(label => label.textContent)).toEqual(["2", "3"]);
    expect({ money: gameState.player.money, stamina: gameState.player.attrs.stamina }).toEqual(before);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1292 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 910 });
    window.dispatchEvent(new Event("resize")); flushSync();
    expect(target.querySelector(".book-spread.single-page")).toBeNull();
    expect(gameState.flags.reader_book_programming_page).toBe(3);
  } finally {
    unmount(reader); target.remove(); uiState.readerId = null;
    uiState.gameMode = "pc";
    Object.defineProperty(window, "innerWidth", width);
    Object.defineProperty(window, "innerHeight", height);
    if (pixelRatio) Object.defineProperty(window, "devicePixelRatio", pixelRatio);
    else Reflect.deleteProperty(window, "devicePixelRatio");
    HTMLElement.prototype.scrollTo = oldScrollTo;
    vi.useRealTimers();
  }
});

it("PC mode keeps the existing one-page layout on a narrow portrait viewport", () => {
  const width = Object.getOwnPropertyDescriptor(window, "innerWidth")!;
  const height = Object.getOwnPropertyDescriptor(window, "innerHeight")!;
  const oldScrollTo = HTMLElement.prototype.scrollTo;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 393 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 852 });
  HTMLElement.prototype.scrollTo = vi.fn();
  replaceState(createInitialState(393));
  uiState.gameMode = "pc";
  uiState.readerId = "book_programming";
  uiState.modal = "reader";
  const target = document.createElement("div");
  document.body.appendChild(target);
  const reader = mount(ReaderModal, { target });
  try {
    flushSync();
    const stage = target.querySelector<HTMLElement>(".book-stage")!;
    expect(stage.classList.contains("single-page")).toBe(true);
    expect(parseFloat(stage.style.getPropertyValue("--stage-width"))).toBeGreaterThan(320);
    const next = [...target.querySelectorAll<HTMLButtonElement>(".nav-turn")]
      .find(button => button.textContent?.includes("下一页"))!;
    next.click(); flushSync();
    expect(target.querySelector(".book-spread.single-page .page-copy")).not.toBeNull();
    expect(target.querySelector(".book-spread.single-page .page-body")?.textContent?.trim().length).toBeGreaterThan(100);
  } finally {
    unmount(reader); target.remove(); uiState.readerId = null; uiState.modal = null;
    Object.defineProperty(window, "innerWidth", width);
    Object.defineProperty(window, "innerHeight", height);
    HTMLElement.prototype.scrollTo = oldScrollTo;
  }
});
