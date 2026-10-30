/** 永恒模式独立挑战目标。
 * 规则与普通模式的每日目标分开，按 7 天赛季轮换，避免永恒模式只剩物价倍率。
 */
import type { GameState } from "../types";
import { gameDay } from "./calendar";

export interface EternalChallenge {
  id: string;
  title: string;
  hint: string;
  progress: number;
  target: number;
  complete: boolean;
}

const CHALLENGES = [
  {
    id: "reserve",
    title: "现金缓冲",
    hint: "把现金储备提高到 1000 元",
    target: 1000,
    progress: (s: GameState) => Math.max(0, Math.floor(s.player.money)),
  },
  {
    id: "work",
    title: "持续出勤",
    hint: "累计完成 8 次工作",
    target: 8,
    progress: (s: GameState) => typeof s.flags.jobs_done_count === "number" ? s.flags.jobs_done_count : 0,
  },
  {
    id: "social",
    title: "城市支点",
    hint: "认识 3 位联系人或 NPC",
    target: 3,
    progress: (s: GameState) => (s.relationships?.length ?? 0) + (s.contacts?.length ?? 0),
  },
  {
    id: "cat",
    title: "共同生活",
    hint: "养成一只猫咪并保持陪伴",
    target: 1,
    progress: (s: GameState) => s.pets?.length ?? 0,
  },
] as const;

/** 当前永恒赛季目标；普通模式返回 null。 */
export function eternalChallengeOf(state: GameState): EternalChallenge | null {
  if (state.mode !== "eternal") return null;
  const season = Math.floor(Math.max(0, gameDay(state.time)) / 7);
  const def = CHALLENGES[season % CHALLENGES.length];
  const progress = Math.max(0, Math.min(def.target, Math.floor(def.progress(state))));
  return {
    id: def.id,
    title: def.title,
    hint: def.hint,
    progress,
    target: def.target,
    complete: progress >= def.target,
  };
}

export function eternalChallengePool(): ReadonlyArray<{ id: string; title: string; hint: string }> {
  return CHALLENGES.map(({ id, title, hint }) => ({ id, title, hint }));
}
