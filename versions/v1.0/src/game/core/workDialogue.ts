/**
 * 工作负责人对话系统（v0.965）。
 * 按工作质量（小游戏得分 / 迟到表现）生成负责人点评：
 * - great：干得好 → 夸奖
 * - good：中规中矩 → 褒贬不一
 * - ok：勉强 → 略有微词
 * - bad：干得差 → 批评
 * 纯逻辑层，数据在 workDialogues.json（按场景分组，负责人身份各不同）。
 */
import dialogueData from "../data/workDialogues.json";
import type { RngState } from "../types";
import { nextRandom } from "../rng";

export type WorkQuality = "great" | "good" | "ok" | "bad";

export interface DialogueSpeaker {
  name: string;
  role: string;
  icon: string;
}

export interface WorkDialogue {
  speaker: DialogueSpeaker;
  text: string;
  quality: WorkQuality;
}

interface SceneDef {
  speaker: DialogueSpeaker;
  texts: Record<string, string[] | Record<string, string[]>>;
}

const DATA = dialogueData as unknown as {
  scenes: Record<string, SceneDef>;
  jobs: Record<string, string>;
};

/** 得分比例 → 质量档位 */
export function qualityOf(ratio: number): WorkQuality {
  if (ratio >= 0.85) return "great";
  if (ratio >= 0.6) return "good";
  if (ratio >= 0.3) return "ok";
  return "bad";
}

/** 质量档位中文名（结算窗角标用） */
export const QUALITY_LABEL: Record<WorkQuality, string> = {
  great: "备受夸赞",
  good: "表现不错",
  ok: "中规中矩",
  bad: "挨了批评",
};

/**
 * 场景内的「变体子集」：同一负责人在不同活动下换一套说辞。
 * key = 行动 id，value = scene.texts 下的子集名。
 */
const SCENE_VARIANT: Record<string, string> = {
  stall_street_night: "_stall",
};

/**
 * 按工作/行动 id 生成负责人对话（无配置返回 null，不弹）。
 * @param rng 传入则用可播种 PRNG（保证存档可复现），缺省回退 Math.random
 */
export function workDialogue(key: string, ratio: number, rng?: RngState): WorkDialogue | null {
  const sceneId = DATA.jobs[key];
  if (!sceneId) return null;
  const scene = DATA.scenes[sceneId];
  if (!scene) return null;
  const q = qualityOf(ratio);
  // 变体子集（如摆摊用 street 场景下的 _stall 专属文案），取不到再回落主文案
  const variant = SCENE_VARIANT[key];
  const variantPool = variant ? (scene.texts[variant] as Record<string, string[]> | undefined) : undefined;
  const texts = (variantPool?.[q] as string[] | undefined) ?? (scene.texts[q] as string[] | undefined);
  if (!Array.isArray(texts) || texts.length === 0) return null;
  const roll = rng ? nextRandom(rng) : Math.random();
  const text = texts[Math.floor(roll * texts.length)] ?? texts[0];
  return { speaker: scene.speaker, text, quality: q };
}
