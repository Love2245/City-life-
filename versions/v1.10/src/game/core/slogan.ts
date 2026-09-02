/**
 * 一句生活标语（v0.981）。
 * 事件结算时无专属「后来怎么样了」文案时，随机补一句收尾标语，
 * 用可播种 rng 保证存档可复现。
 */
import type { RngState } from "../types";
import { nextRandom } from "../rng";
import data from "../data/slogans.json";

const SLOGANS = data as string[];

export function randomSlogan(rng?: RngState): string {
  if (SLOGANS.length === 0) return "";
  const roll = rng ? nextRandom(rng) : Math.random();
  const idx = Math.floor(roll * SLOGANS.length) % SLOGANS.length;
  return SLOGANS[idx] ?? SLOGANS[0];
}
