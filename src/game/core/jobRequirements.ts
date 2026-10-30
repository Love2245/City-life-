import type { GameState, JobDef } from "../types";
import { ATTR_NAMES, SKILL_NAMES } from "../../lib/icons";
import { isReferred } from "./contacts";
import { jobRequirementBonus } from "./difficulty";

const FLAG_NAMES: Record<string, string> = {
  item_certificate: "技能证书",
  item_training_cert: "培训证书",
  item_driving_license: "驾驶证",
  item_car: "汽车",
  item_laptop: "电脑",
  item_student_pass:'学生通行证',
};

export interface JobRequirementResult {
  ok: boolean;
  intern: boolean;
  reason?: string;
}

function attributeValue(state: GameState, key: string): number {
  const attrs = state.player.attrs as unknown as Record<string, number>;
  const stats = state.player.stats as unknown as Record<string, number>;
  return attrs[key] ?? stats[key] ?? 0;
}

export function hasJobCertificate(state: GameState, flag: string): boolean {
  if (flag === 'item_laptop') return !!(state.flags.item_laptop || state.flags.item_laptop_mid || state.flags.item_laptop_pro);
  return !!state.flags[flag] || (flag === "item_certificate" && !!state.flags.item_training_cert);
}

/** Formal job requirements are checked once when the player applies. */
export function checkJobRequirements(state: GameState, job: JobDef): JobRequirementResult {
  const requirements = job.requirements;
  const bonus = jobRequirementBonus(state);
  const masterCertificate = requirements?.flag === "item_certificate" && !!state.flags.item_training_cert;

  if (requirements?.attr) {
    for (const [key, minimum] of Object.entries(requirements.attr)) {
      const threshold = (minimum ?? 0) + bonus;
      if (attributeValue(state, key) < threshold) {
        return { ok: false, intern: false, reason: `${ATTR_NAMES[key] ?? key}不足（需 ${threshold}）` };
      }
    }
  }

  if (requirements?.skill && !masterCertificate) {
    for (const [key, minimum] of Object.entries(requirements.skill)) {
      const threshold = (minimum ?? 0) + bonus;
      if ((state.player.skills[key as keyof typeof state.player.skills] ?? 0) < threshold) {
        return { ok: false, intern: false, reason: `${SKILL_NAMES[key] ?? key}技能不足（需 ${threshold} 级）` };
      }
    }
  }

  if (requirements?.flag && !masterCertificate && !hasJobCertificate(state, requirements.flag) && !isReferred(state, job.id)) {
    return {
      ok: false,
      intern: false,
      reason: `需要${FLAG_NAMES[requirements.flag] ?? "指定资质"}`,
    };
  }

  return { ok: true, intern: false };
}

/** The same thresholds shown by the recruiter, including the current difficulty bonus. */
export function describeJobRequirements(state: GameState, job: JobDef): string {
  const requirements = job.requirements;
  if (!requirements) return "岗位要求：无额外资质";

  const bonus = jobRequirementBonus(state);
  const masterCertificate = requirements.flag === "item_certificate" && !!state.flags.item_training_cert;
  const items: string[] = [];
  for (const [key, minimum] of Object.entries(requirements.attr ?? {})) {
    items.push(`${ATTR_NAMES[key] ?? key} ≥ ${(minimum ?? 0) + bonus}`);
  }
  if (!masterCertificate) {
    for (const [key, minimum] of Object.entries(requirements.skill ?? {})) {
      items.push(`${SKILL_NAMES[key] ?? key}技能 ≥ ${(minimum ?? 0) + bonus} 级`);
    }
  }
  if (requirements.flag) {
    if (masterCertificate) items.push("培训结业证书（可替代技能证书和技能要求）");
    else {
      const name = FLAG_NAMES[requirements.flag] ?? "指定资质";
      items.push(isReferred(state, job.id) && requirements.flag !== "item_training_cert" ? `${name}（内推可免）` : name);
    }
  }

  return items.length ? `岗位要求：${items.join("、")}` : "岗位要求：无额外资质";
}
