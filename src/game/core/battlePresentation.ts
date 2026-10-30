import type { SoundId } from "../types";

export type CatBattleAnimation = "idle" | "attack" | "hurt" | "defend" | "heal" | "dodge" | "enter";
export interface BattleFloatText {
  text: string;
  side: "enemy" | "player";
  cls: "dmg" | "heal" | "block";
}
export interface BattleLineEffect {
  anim?: CatBattleAnimation;
  side?: "player" | "enemy";
  float?: BattleFloatText;
  sound?: SoundId;
}

/** Parse the existing battle log templates without matching names as substrings. */
export function classifyBattleLine(line: string, playerName: string, enemyName: string): BattleLineEffect | null {
  const player = playerName.trim();
  const enemy = enemyName.trim();
  const enemyAbility = !!enemy && ["😾", "🛡️", "🌀", "💗"].some((icon) => line.startsWith(`${icon} ${enemy} 使出了`));
  const damage = line.match(/造成 (\d+) 点伤害/);
  if (damage) {
    const text = `-${damage[1]}`;
    if (player && enemy && line.startsWith(`⚔️ ${player} 对 `) && line.includes(`对 ${enemy} 造成`)) {
      return { anim: "attack", side: "player", float: { text, side: "enemy", cls: "dmg" }, sound: "battle_attack" };
    }
    if (player && enemy && line.includes(`对 ${player} 造成`)
      && ((line.startsWith(`😾 ${enemy} `) && line.includes("使出")) || line.startsWith(`💥 ${enemy} 自爆了！`))) {
      return { anim: "hurt", side: "player", float: { text, side: "player", cls: "dmg" }, sound: "battle_hurt" };
    }
  }

  const heal = line.match(/恢复 (\d+) 点 HP/);
  if (heal) {
    const text = `+${heal[1]}`;
    if (player && line.startsWith(`💗 ${player} 恢复`)) {
      return { anim: "heal", side: "player", float: { text, side: "player", cls: "heal" }, sound: "battle_heal" };
    }
    if (enemy && (enemyAbility || line.startsWith(`🍔 ${enemy} 偷吃汉堡`))) {
      return { anim: "heal", side: "enemy", float: { text, side: "enemy", cls: "heal" }, sound: "battle_heal" };
    }
  }

  const block = line.match(/获得 (\d+) 点格挡/);
  if (block) {
    if (player && line.startsWith(`🛡️ ${player} 获得`)) return { anim: "defend", side: "player", sound: "battle_defend" };
    if (enemy && (line.startsWith(`🛡️ ${enemy} 使出了`) || line.startsWith(`😾 ${enemy} 使出了`))) return { anim: "defend", side: "enemy", sound: "battle_defend" };
  }
  if (line.includes("力量 +")) {
    return { anim: "heal", side: "player", float: { text: "💪", side: "player", cls: "block" }, sound: "battle_draw" };
  }
  if (line.includes("灵巧地躲开")) return { anim: "dodge", side: "player", sound: "battle_draw" };
  if (enemyAbility) {
    return { anim: "attack", side: "enemy", sound: "battle_intent" };
  }

  if (line.includes("中毒伤害") || line.includes("灼伤伤害")) {
    const playerSubject = !!player && (line.startsWith(`☠️ ${player} 受到`) || line.startsWith(`🔥 ${player} 受到`));
    const enemySubject = !!enemy && (line.startsWith(`☠️ ${enemy} 受到`) || line.startsWith(`🔥 ${enemy} 受到`));
    if (playerSubject === enemySubject) return null;
    const side = playerSubject ? "player" : "enemy";
    return { anim: "hurt", side, float: { text: "· · ·", side, cls: "dmg" }, sound: "battle_hurt" };
  }
  return null;
}
