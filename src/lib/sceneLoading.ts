import type { WeatherId } from '../game/types';

export type LoadingTime = 'day' | 'dusk' | 'night' | 'late-night';
export interface LoadingRequest {
  sceneKey: string;
  regionId: string;
  label: string;
  kind: 'map' | '3d';
  time: LoadingTime;
  weather: WeatherId;
  /** Short presentation for returning from an already displayed 3D interior. */
  minimumMs?: number;
  retry?: () => void;
  fallback?: () => void;
}
export interface LoadingView extends LoadingRequest {
  id: number;
  phase: 'loading' | 'failed' | 'leaving';
  slow: boolean;
  error?: string;
}
export interface LoadingHandle {
  id: number;
  /** False means the owner was cancelled before the cover was painted. */
  covered: Promise<boolean>;
  active(): boolean;
  ready(): void;
  fail(error: unknown): void;
  cancel(): void;
}

/** Presentation only: never owns travel, money, game time or persisted state. */
export function createSceneLoading(publish: (view: LoadingView | null) => void) {
  const visited = new Set<string>();
  let sequence = 0;
  let current: { view: LoadingView; handle: LoadingHandle; paintedAt?: number;
    resolveCover: (covered: boolean) => void; complete: boolean;
    timers: ReturnType<typeof setTimeout>[] } | undefined;
  const clearTimers = () => {
    current?.timers.forEach(clearTimeout);
    if (current) current.timers = [];
  };
  function cancel() {
    if (!current) return;
    clearTimers();
    current.resolveCover(false);
    current = undefined;
    publish(null);
  }
  function reveal() {
    const task = current;
    if (!task || !task.complete || task.paintedAt === undefined || task.view.phase !== 'loading') return;
    clearTimers();
    const wait = Math.max(0, (task.view.minimumMs ?? (visited.has(task.view.sceneKey) ? 500 : 2500)) - (Date.now() - task.paintedAt));
    task.timers.push(setTimeout(() => {
      if (current !== task || task.view.phase !== 'loading') return;
      task.view = { ...task.view, phase: 'leaving', slow: false };
      publish(task.view);
      task.timers.push(setTimeout(() => {
        if (current !== task) return;
        visited.add(task.view.sceneKey);
        cancel();
      }, 250));
    }, wait));
  }
  function begin(request: LoadingRequest, restart = false): LoadingHandle {
    if (!restart && current?.view.sceneKey === request.sceneKey && current.view.phase === 'loading') {
      current.view = { ...current.view, ...request };
      publish(current.view);
      return current.handle;
    }
    cancel();
    const id = ++sequence;
    let resolveCover!: (covered: boolean) => void;
    const covered = new Promise<boolean>(resolve => { resolveCover = resolve; });
    const active = () => current?.view.id === id;
    const handle: LoadingHandle = {
      id, covered, active,
      ready() { if (active()) { current!.complete = true; reveal(); } },
      fail(error) {
        if (!active()) return;
        clearTimers();
        current!.complete = false;
        current!.view = { ...current!.view, phase: 'failed', error: error instanceof Error ? error.message : String(error) };
        publish(current!.view);
      },
      cancel() { if (active()) cancel(); },
    };
    current = { view: { ...request, id, phase: 'loading', slow: false }, handle,
      resolveCover, complete: false, timers: [] };
    publish(current.view);
    return handle;
  }
  function markCovered(id: number) {
    const task = current;
    if (!task || task.view.id !== id || task.paintedAt !== undefined) return;
    task.paintedAt = Date.now();
    task.resolveCover(true);
    task.timers.push(setTimeout(() => {
      if (current !== task || task.view.phase !== 'loading' || task.complete) return;
      task.view = { ...task.view, slow: true };
      publish(task.view);
    }, 12000));
    reveal();
  }
  return { begin, markCovered, cancel, get current() { return current?.view ?? null; } };
}
