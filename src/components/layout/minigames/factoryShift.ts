import type { FactoryCfg } from "../../../game/core/minigame";
import { createRng, nextRandom } from "../../../game/rng";
import type { RngState } from "../../../game/types";

export type FactoryStage = "ready" | "docking" | "solder" | "welding" | "ship" | "shipping";
export type FactoryTheme = "assembly" | "sorting" | "steel" | "aluminum" | "glass";

export const FACTORY_DURATIONS = Object.freeze({ docking: 0.6, welding: 0.4, shipping: 0.45 });
export const FACTORY_POINTS = Object.freeze([
  { x: 141, y: 75 }, { x: 221, y: 75 }, { x: 221, y: 146 }, { x: 141, y: 146 },
]);
const STEEL_POINTS = Object.freeze([72,144,216,288].map(x=>({x,y:56})));
const ALUMINUM_POINTS = Object.freeze([72,144,216,288].map(x=>({x,y:75})));
const INDUSTRIAL_DURATIONS = {
  steel: { docking:1.05, welding:.45, shipping:.5 },
  aluminum: { docking:.9, welding:.45, shipping:.5 },
  glass: { docking:.75, welding:.5, shipping:.5 },
} as const;
export function factoryPoints(theme:FactoryTheme){return theme==='steel'?STEEL_POINTS:theme==='aluminum'?ALUMINUM_POINTS:FACTORY_POINTS;}

export interface FactorySnapshot {
  stage: FactoryStage;
  welded: boolean[];
  activePoint: number;
  animationProgress: number;
  completed: number;
  boardId: number;
  elapsed: number;
  timeLeft: number;
  target: number;
  paused: boolean;
  finished: boolean;
  ratio: number;
  material: { name: string; icon: string };
  destination: string;
}

export interface FactoryProgress {
  workshop?: FactoryCfg['workshop'];
  kind: "factory-shift";
  version: 1;
  stage: FactoryStage;
  welded: boolean[];
  animationTime: number;
  completed: number;
  elapsed: number;
  rng: RngState;
  material: { name: string; icon: string };
  destination: string;
  dragRatio: number;
}

export function factoryTheme(sceneKey = "", workshop?:FactoryCfg['workshop']): FactoryTheme {
  if(workshop)return workshop;
  if(sceneKey==='steel_shift')return 'steel';
  if(sceneKey==='aluminum_recycle_shift')return 'aluminum';
  if(sceneKey==='glass_quality_shift')return 'glass';
  return sceneKey === "job_sorting" || sceneKey === "job_warehouse" ? "sorting" : "assembly";
}

/** Port of the supplied SimpleFactoryGame. Every operation still needs a player action. */
export class FactoryShift {
  private stage: FactoryStage = "ready";
  private welded = [false, false, false, false];
  private animationTime = 0;
  private completed = 0;
  private elapsed = 0;
  private paused = false;
  private finished = false;
  private readonly target: number;
  private readonly timeLimit: number;
  private material: { name: string; icon: string };
  private destination: string;
  private rng: RngState;
  dragRatio = 0;

  constructor(private readonly cfg: FactoryCfg, seed?: number, initialProgress?: unknown) {
    this.target = Number.isFinite(cfg.productsToWin) ? Math.max(1, Math.floor(cfg.productsToWin!)) : 15;
    this.timeLimit = Number.isFinite(cfg.timeLimit) ? Math.max(0, cfg.timeLimit!) : 0;
    this.rng = createRng(seed);
    this.material = this.nextMaterial();
    this.destination = this.nextDestination();
    this.restore(initialProgress);
  }

  private nextMaterial() {
    const parts = this.cfg.parts;
    const part = parts[Math.min(parts.length - 1, Math.floor(nextRandom(this.rng) * parts.length))];
    return part ? { name: part.name, icon: part.icon } : { name: "标准板件", icon: "▣" };
  }

  private nextDestination() {
    return ["东区 01", "南区 02", "西区 03", "北区 04"][Math.min(3, Math.floor(nextRandom(this.rng) * 4))];
  }

  progress(): FactoryProgress {
    return {
      kind: "factory-shift", version: 1, workshop:this.cfg.workshop, stage: this.stage, welded: [...this.welded],
      animationTime: this.animationTime, completed: this.completed, elapsed: this.elapsed,
      rng: { ...this.rng }, material: { ...this.material }, destination: this.destination, dragRatio: this.dragRatio,
    };
  }

  private restore(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const p = value as Partial<FactoryProgress>;
    if(p.workshop!==this.cfg.workshop)return;
    if (p.kind !== "factory-shift" || p.version !== 1 || !["ready", "docking", "solder", "welding", "ship", "shipping"].includes(p.stage ?? "")) return;
    if (!Array.isArray(p.welded) || p.welded.length !== 4 || p.welded.some(v => typeof v !== "boolean")) return;
    const count = p.welded.filter(Boolean).length;
    if (p.welded.some((done, i) => done !== (i < count))) return;
    if ((p.stage === "ready" || p.stage === "docking") && count !== 0) return;
    if ((p.stage === "solder" || p.stage === "welding") && count === 4) return;
    if ((p.stage === "ship" || p.stage === "shipping") && count !== 4) return;
    const durations = this.cfg.workshop ? INDUSTRIAL_DURATIONS[this.cfg.workshop] : FACTORY_DURATIONS;
    const stageDuration = p.stage! in durations ? durations[p.stage as keyof typeof durations] : 0;
    if (!Number.isFinite(p.animationTime) || p.animationTime! < 0 || p.animationTime! > stageDuration) return;
    if (!Number.isInteger(p.completed) || p.completed! < 0 || p.completed! > this.target) return;
    if (!Number.isFinite(p.elapsed) || p.elapsed! < 0 || (this.timeLimit > 0 && p.elapsed! > this.timeLimit)) return;
    if (!p.rng || !Number.isFinite(p.rng.seed) || !Number.isInteger(p.rng.calls) || p.rng.calls < 0) return;
    if (!p.material || typeof p.material.name !== "string" || typeof p.material.icon !== "string" || typeof p.destination !== "string") return;
    this.stage = p.stage as FactoryStage;
    this.welded = [...p.welded];
    this.animationTime = p.animationTime!;
    this.completed = p.completed!;
    this.elapsed = p.elapsed!;
    this.rng = { ...p.rng };
    this.material = { ...p.material };
    this.destination = p.destination;
    this.dragRatio = Number.isFinite(p.dragRatio) ? Math.max(-0.1, Math.min(4, p.dragRatio!)) : 0;
    this.finished = this.completed >= this.target || (this.timeLimit > 0 && this.elapsed >= this.timeLimit);
  }

  snapshot(): FactorySnapshot {
    const durations=this.cfg.workshop?INDUSTRIAL_DURATIONS[this.cfg.workshop]:FACTORY_DURATIONS;
    const duration = this.stage in durations ? durations[this.stage as keyof typeof durations] : 0;
    return {
      stage: this.stage,
      welded: [...this.welded],
      activePoint: this.stage === "solder" || this.stage === "welding" ? this.welded.findIndex(done => !done) : -1,
      animationProgress: duration ? Math.min(1, this.animationTime / duration) : 0,
      completed: this.completed,
      boardId: this.completed + 1,
      elapsed: this.elapsed,
      timeLeft: Math.max(0, this.timeLimit - this.elapsed),
      target: this.target,
      paused: this.paused,
      finished: this.finished,
      ratio: Math.min(1, this.completed / this.target),
      material: { ...this.material },
      destination: this.destination,
    };
  }

  setPaused(value: boolean): void { this.paused = value; }

  dock(): boolean {
    if (this.paused || this.finished || this.stage !== "ready") return false;
    this.stage = "docking";
    this.animationTime = 0;
    return true;
  }

  solder(index: number): boolean {
    if (this.paused || this.finished || this.stage !== "solder" || index !== this.welded.findIndex(done => !done)) return false;
    this.stage = "welding";
    this.animationTime = 0;
    return true;
  }

  ship(): boolean {
    if (this.paused || this.finished || this.stage !== "ship") return false;
    this.stage = "shipping";
    this.animationTime = 0;
    return true;
  }

  tick(dt: number): boolean {
    if (this.paused || this.finished || !Number.isFinite(dt) || dt <= 0) return false;
    // At the deadline, count an item only if shipping actually completed before it.
    const activeDt = this.timeLimit > 0 ? Math.min(dt, Math.max(0, this.timeLimit - this.elapsed)) : dt;
    this.elapsed += activeDt;
    const durations=this.cfg.workshop?INDUSTRIAL_DURATIONS[this.cfg.workshop]:FACTORY_DURATIONS;
    const duration = this.stage in durations ? durations[this.stage as keyof typeof durations] : 0;
    if (duration) {
      this.animationTime += activeDt;
      if (this.animationTime + 1e-10 >= duration) {
        this.animationTime = 0;
        if (this.stage === "docking") this.stage = "solder";
        else if (this.stage === "welding") {
          this.welded[this.welded.findIndex(done => !done)] = true;
          this.stage = this.welded.every(Boolean) ? "ship" : "solder";
        } else {
          this.completed++;
          this.welded = [false, false, false, false];
          this.stage = "ready";
          this.dragRatio = 0;
          if (this.completed < this.target) {
            this.material = this.nextMaterial();
            this.destination = this.nextDestination();
          }
        }
      }
    }
    if (this.completed >= this.target || (this.timeLimit > 0 && this.elapsed + 1e-10 >= this.timeLimit)) this.finished = true;
    return true;
  }
}

export function factoryBoardGeometry(width: number, height: number, theme:FactoryTheme='assembly') {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  const safeHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
  // Fit to the measured Canvas, not to a desktop-specific 100 px floor offset.
  // Keep only the status/note gutters; the fixture and click targets move with the board.
  const top = Math.min(safeHeight * .2, safeHeight <= 200 ? 12 : Math.max(24, Math.min(52, safeHeight * .11)));
  const bottom = Math.min(safeHeight * .15, safeHeight <= 200 ? 10 : Math.max(14, Math.min(28, safeHeight * .08)));
  const availableHeight = Math.max(1, safeHeight - top - bottom);
  const aspect=theme==='steel'?1/3.2:theme==='aluminum'?150/360:.64;
  const industrial=theme==='steel'||theme==='aluminum';
  const w = Math.max(1, Math.min(industrial ? 520 : 400, safeWidth * (industrial ? .74 : .63), availableHeight / aspect));
  const h = w * aspect;
  return { x: safeWidth * 0.5 - w / 2, y: top + (availableHeight - h) / 2, w, h, scale: w / 360 };
}

export function factoryShipThreshold(boardWidth: number): number {
  return Math.min(100, Math.max(24, boardWidth * 0.3));
}
