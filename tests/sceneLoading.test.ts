import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSceneLoading, type LoadingRequest, type LoadingView } from "../src/lib/sceneLoading";

const request = (sceneKey = "3d:old_apartment"): LoadingRequest => ({
  sceneKey, regionId: "downtown", label: "旧公寓", kind: "3d", time: "day", weather: "sunny",
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

describe("scene loading controller", () => {
  it("keeps a first visit covered for 2500 ms, then fades for 250 ms", async () => {
    const publish = vi.fn<(view: LoadingView | null) => void>();
    const loading = createSceneLoading(publish);
    const handle = loading.begin(request());
    loading.markCovered(handle.id);
    expect(await handle.covered).toBe(true);
    handle.ready();
    vi.advanceTimersByTime(2499);
    expect(loading.current?.phase).toBe("loading");
    vi.advanceTimersByTime(1);
    expect(loading.current?.phase).toBe("leaving");
    expect(handle.active()).toBe(true);
    vi.advanceTimersByTime(249);
    expect(loading.current?.phase).toBe("leaving");
    vi.advanceTimersByTime(1);
    expect(loading.current).toBeNull();
    expect(handle.active()).toBe(false);
    expect(publish.mock.calls.map(([view]) => view?.phase ?? null)).toEqual(["loading", "leaving", null]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a short return cover even for the first map visit, but still waits for map readiness", () => {
    const loading=createSceneLoading(()=>{});
    const task=loading.begin({...request('map:downtown'),kind:'map',minimumMs:500});
    loading.markCovered(task.id);
    vi.advanceTimersByTime(600);
    expect(loading.current?.phase).toBe('loading');
    task.ready();vi.advanceTimersByTime(0);expect(loading.current?.phase).toBe('leaving');
    vi.advanceTimersByTime(250);expect(loading.current).toBeNull();
    const another=loading.begin({...request('map:suburb'),kind:'map',minimumMs:500});
    loading.markCovered(another.id);another.ready();vi.advanceTimersByTime(499);expect(loading.current?.phase).toBe('loading');
    vi.advanceTimersByTime(1);expect(loading.current?.phase).toBe('leaving');
  });

  it("uses 500 ms only after the same scene completed an earlier reveal", () => {
    const loading = createSceneLoading(() => {});
    const first = loading.begin(request());
    loading.markCovered(first.id);
    first.ready();
    vi.advanceTimersByTime(2750);
    const repeat = loading.begin(request());
    loading.markCovered(repeat.id);
    repeat.ready();
    vi.advanceTimersByTime(499);
    expect(loading.current?.phase).toBe("loading");
    vi.advanceTimersByTime(1);
    expect(loading.current?.phase).toBe("leaving");
    vi.advanceTimersByTime(250);
    expect(loading.current).toBeNull();
    const different = loading.begin(request("3d:rental_apartment"));
    loading.markCovered(different.id);
    different.ready();
    vi.advanceTimersByTime(500);
    expect(loading.current?.phase).toBe("loading");
    vi.advanceTimersByTime(2250);
    expect(loading.current).toBeNull();
  });

  it("starts the minimum duration when the cover was painted, even if ready arrived earlier", async () => {
    const loading = createSceneLoading(() => {});
    const handle = loading.begin(request());
    let covered: boolean | undefined;
    void handle.covered.then(value => { covered = value; });
    handle.ready();
    vi.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(covered).toBeUndefined();
    expect(loading.current?.phase).toBe("loading");
    loading.markCovered(handle.id);
    expect(await handle.covered).toBe(true);
    vi.advanceTimersByTime(2499);
    expect(loading.current?.phase).toBe("loading");
    loading.markCovered(handle.id);
    vi.advanceTimersByTime(1);
    expect(loading.current?.phase).toBe("leaving");
    vi.advanceTimersByTime(250);
    expect(loading.current).toBeNull();
  });

  it("keeps loading beyond the 12-second warning and reveals only after the scene becomes ready", () => {
    const loading = createSceneLoading(() => {});
    const handle = loading.begin(request());
    loading.markCovered(handle.id);
    vi.advanceTimersByTime(11999);
    expect(loading.current).toMatchObject({ phase: "loading", slow: false });
    vi.advanceTimersByTime(1);
    expect(loading.current).toMatchObject({ phase: "loading", slow: true });
    vi.advanceTimersByTime(30000);
    expect(loading.current).toMatchObject({ phase: "loading", slow: true });
    handle.ready();
    vi.advanceTimersByTime(0);
    expect(loading.current).toMatchObject({ phase: "leaving", slow: false });
    vi.advanceTimersByTime(250);
    expect(loading.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores the old handle's late ready, error, cancel, and paint callbacks", async () => {
    const loading = createSceneLoading(() => {});
    const old = loading.begin(request());
    const next = loading.begin(request("map:boyue"));
    expect(await old.covered).toBe(false);
    old.ready();
    old.fail(new Error("old image failed"));
    old.cancel();
    loading.markCovered(old.id);
    expect(old.active()).toBe(false);
    expect(next.active()).toBe(true);
    expect(loading.current).toMatchObject({ id: next.id, phase: "loading" });
    loading.markCovered(next.id);
    expect(await next.covered).toBe(true);
    next.ready();
    vi.advanceTimersByTime(2750);
    expect(loading.current).toBeNull();
  });

  it("coalesces the same active scene without resetting its cover or minimum duration", async () => {
    const loading = createSceneLoading(() => {});
    const first = loading.begin(request());
    loading.markCovered(first.id);
    vi.advanceTimersByTime(1000);
    const merged = loading.begin({ ...request(), label: "正在进入旧公寓", weather: "rain" });
    expect(merged).toBe(first);
    expect(await merged.covered).toBe(true);
    expect(loading.current).toMatchObject({ id: first.id, label: "正在进入旧公寓", weather: "rain" });
    merged.ready();
    vi.advanceTimersByTime(1499);
    expect(loading.current?.phase).toBe("loading");
    vi.advanceTimersByTime(1);
    expect(loading.current?.phase).toBe("leaving");
    vi.advanceTimersByTime(250);
    expect(loading.current).toBeNull();
  });

  it("does not mark a failed scene as visited and gives its retry the full first duration", () => {
    const retry = vi.fn();
    const fallback = vi.fn();
    const loading = createSceneLoading(() => {});
    const failed = loading.begin({ ...request(), retry, fallback });
    loading.markCovered(failed.id);
    failed.fail(new Error("model unavailable"));
    vi.advanceTimersByTime(60000);
    expect(loading.current).toMatchObject({ phase: "failed", error: "model unavailable", retry, fallback });
    expect(retry).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    const restarted = loading.begin(request(), true);
    expect(restarted.id).not.toBe(failed.id);
    loading.markCovered(restarted.id);
    restarted.ready();
    vi.advanceTimersByTime(500);
    expect(loading.current?.phase).toBe("loading");
    vi.advanceTimersByTime(2000);
    expect(loading.current?.phase).toBe("leaving");
    vi.advanceTimersByTime(250);
    expect(loading.current).toBeNull();
  });

  it("resolves an unpainted cancelled cover as false and clears every timer", async () => {
    const loading = createSceneLoading(() => {});
    const handle = loading.begin(request());
    handle.cancel();
    expect(await handle.covered).toBe(false);
    expect(handle.active()).toBe(false);
    expect(loading.current).toBeNull();
    loading.markCovered(handle.id);
    vi.advanceTimersByTime(30000);
    expect(loading.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not remember a scene cancelled during its leaving fade", () => {
    const loading = createSceneLoading(() => {});
    const interrupted = loading.begin(request());
    loading.markCovered(interrupted.id);
    interrupted.ready();
    vi.advanceTimersByTime(2500);
    expect(loading.current?.phase).toBe("leaving");
    interrupted.cancel();
    vi.advanceTimersByTime(1000);
    const next = loading.begin(request());
    loading.markCovered(next.id);
    next.ready();
    vi.advanceTimersByTime(500);
    expect(loading.current?.phase).toBe("loading");
    vi.advanceTimersByTime(2250);
    expect(loading.current).toBeNull();
  });
});
