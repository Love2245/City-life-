// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, tick, unmount } from "svelte";
import MapAtlas from "../src/components/layout/MapAtlas.svelte";
import RegionMapView from "../src/components/layout/RegionMapView.svelte";
import CityMapView from "../src/components/layout/CityMapView.svelte";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { createInitialState } from "../src/game/core/state";

vi.mock("../src/lib/mapVisuals", () => ({
  atlasLevelOf: () => "first",
  atlasTimeOfHour: () => "day",
  atlasWeatherOf: () => "sunny",
  atlasVisualFor: (id: string) => ({ url: `/${id}-primary.webp`, time: "day", weather: "sunny", weatherId: "sunny", nativeLighting: true, assetSource: "first-level" }),
  atlasBackgroundCandidatesFor: (id: string) => [`/${id}-primary.webp`, `/${id}-fallback.webp`],
}));

const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "decode");
let imageComplete = false;
let imageWidth = 1200;
let viewportWidth = 860;
let decode = vi.fn<() => Promise<void>>();
let nextFrame = 0;
let frames = new Map<number, FrameRequestCallback>();
let resizeCallbacks: Array<() => void> = [];
const mounted: Array<ReturnType<typeof mount>> = [];

beforeEach(() => {
  replaceState(createInitialState());
  imageComplete = false;
  imageWidth = 1200;
  viewportWidth = 860;
  nextFrame = 0;
  frames = new Map();
  resizeCallbacks = [];
  decode = vi.fn(() => Promise.resolve());
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(() => imageComplete);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockImplementation(() => imageWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => viewportWidth);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(480);
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: () => decode() });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = ++nextFrame; frames.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { this.callback = callback; resizeCallbacks.push(callback); }
    callback: () => void;
    observe() { this.callback(); }
    disconnect() { resizeCallbacks = resizeCallbacks.filter(callback => callback !== this.callback); }
  });
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, "decode", originalDecode);
  else delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
});

function atlas(onReady = vi.fn()) {
  const component = mount(MapAtlas, { target: document.body, props: { mapId: "downtown", title: "地图", subtitle: "", items: [], onSelect: () => {}, onReady } });
  mounted.push(component);
  flushSync();
  return onReady;
}

async function settle() {
  await tick();
  flushSync();
  for (let round = 0; round < 3; round++) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(round * 16);
    await tick();
    flushSync();
  }
}

function imageEvent(name: "load" | "error") {
  document.querySelector(".map-image")!.dispatchEvent(new Event(name));
  flushSync();
}

describe("map first-paint readiness", () => {
  it("waits for cached image decoding and a nonzero viewport", async () => {
    imageComplete = true;
    viewportWidth = 0;
    let finishDecode!: () => void;
    decode.mockImplementation(() => new Promise<void>(resolve => { finishDecode = resolve; }));
    const ready = atlas();
    await settle();
    expect(decode).toHaveBeenCalledOnce();
    expect(ready).not.toHaveBeenCalled();
    finishDecode();
    await settle();
    expect(ready).not.toHaveBeenCalled();
    viewportWidth = 860;
    for (const callback of [...resizeCallbacks]) callback();
    await settle();
    expect(ready).toHaveBeenCalledOnce();
  });

  it("does not reveal a successfully loaded image until decode completes", async () => {
    let finishDecode!: () => void;
    decode.mockImplementation(() => new Promise<void>(resolve => { finishDecode = resolve; }));
    const ready = atlas();
    imageEvent("load");
    await settle();
    expect(ready).not.toHaveBeenCalled();
    finishDecode();
    await settle();
    expect(ready).toHaveBeenCalledOnce();
    imageEvent("load");
    await settle();
    expect(ready).toHaveBeenCalledOnce();
  });

  it("tries the next background after a failed decode", async () => {
    decode.mockRejectedValueOnce(new Error("image decode failed"));
    const ready = atlas();
    imageEvent("load");
    await settle();
    expect(document.querySelector(".map-image")?.getAttribute("src")).toBe("/downtown-fallback.webp");
    expect(ready).not.toHaveBeenCalled();
    imageEvent("load");
    await settle();
    expect(ready).toHaveBeenCalledOnce();
  });

  it("reveals the usable place list when every image candidate fails", async () => {
    const ready = atlas();
    imageEvent("error");
    await settle();
    expect(ready).not.toHaveBeenCalled();
    imageEvent("error");
    await settle();
    expect(document.querySelector(".map-image")).toBeNull();
    expect(document.querySelector(".atlas-list")).not.toBeNull();
    expect(ready).toHaveBeenCalledOnce();
  });

  it("ignores a previous image decode after changing maps", async () => {
    let finishOldDecode!: () => void;
    decode.mockImplementationOnce(() => new Promise<void>(resolve => { finishOldDecode = resolve; }));
    const ready = vi.fn();
    gameState.region = "downtown";
    const props = { get mapId() { return gameState.region ?? "downtown"; }, title: "地图", subtitle: "", items: [], onSelect: () => {}, onReady: ready };
    mounted.push(mount(MapAtlas, { target: document.body, props }));
    flushSync();
    imageEvent("load");
    gameState.region = "suburb";
    flushSync();
    finishOldDecode();
    await settle();
    expect(ready).not.toHaveBeenCalled();
    imageEvent("load");
    await settle();
    expect(ready).toHaveBeenCalledOnce();
  });

  it("cancels callbacks when the map is unmounted during decoding", async () => {
    let finishDecode!: () => void;
    decode.mockImplementation(() => new Promise<void>(resolve => { finishDecode = resolve; }));
    const ready = atlas();
    imageEvent("load");
    const component = mounted.pop()!;
    await unmount(component);
    finishDecode();
    await settle();
    expect(ready).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("forwards region and city ready callbacks from their actual atlas", async () => {
    imageComplete = true;
    const regionReady = vi.fn();
    const cityReady = vi.fn();
    mounted.push(mount(RegionMapView, { target: document.body, props: { parentRegionId: "downtown", onSelect: () => {}, onReady: regionReady } }));
    mounted.push(mount(CityMapView, { target: document.body, props: { regionId: "downtown_center", items: [], onSelect: () => {}, onReady: cityReady } }));
    flushSync();
    await settle();
    expect(regionReady).toHaveBeenCalledOnce();
    expect(cityReady).toHaveBeenCalledOnce();
  });
});
