/**
 * 数值平衡模拟：验证推荐等级下猫咪能否战胜对手（自动攻击策略）。
 * 运行：npx tsx scripts/balance_sim.ts
 */
import { createInitialState } from "../src/game/core/state";
import { adoptCat, gainCatExp, expToNext } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import { startBattle, playerCommand, getSkillDef, type BattleReward } from "../src/game/core/catBattle";
import type { BattleCommand } from "../src/game/types";

function levelUpTo(pet: { level: number; exp: number }, target: number): void {
  while (pet.level < target) {
    gainCatExp(pet, expToNext(pet.level));
  }
}

function simulate(catId: string, level: number, opponentId: string, seed: number): { won: boolean; turns: number } {
  const s = createInitialState(seed);
  adoptCat(s, catId);
  setActivePet(s, s.pets[0].uid);
  levelUpTo(s.pets[0], level);
  const r = startBattle(s, opponentId);
  if (!r.ok) return { won: false, turns: 0 };
  let turns = 0;
  let guard = 0;
  while (!s.catBattle?.finished && guard < 80) {
    const b = s.catBattle;
    if (!b) break;
    const skills = b.player.skills.map(getSkillDef).filter((x) => !!x);
    let cmd: BattleCommand = "attack";
    const heal = skills.find((x) => x!.kind === "heal");
    // 对手残血 → 优先收割，绝不防守
    const oppLow = b.opponent.hp <= b.opponent.attrs.hp * 0.25;
    if (!oppLow && b.player.hp < b.player.attrs.hp * 0.45 && heal && b.player.rage >= (heal?.rageCost ?? 99)) {
      cmd = { skill: heal!.id };
    } else if (!oppLow && b.player.hp < b.player.attrs.hp * 0.3) {
      cmd = "defend";
    } else {
      // 怒气够 → 用最强攻击技能
      const atk = skills.filter((x) => x!.kind === "attack" && b.player.rage >= (x?.rageCost ?? 99))
        .sort((a, b2) => (b2?.power ?? 0) - (a?.power ?? 0))[0];
      if (atk) cmd = { skill: atk!.id };
    }
    playerCommand(s, cmd);
    turns++;
    guard++;
  }
  return { won: s.catBattle?.won ?? false, turns };
}

function winRate(catId: string, level: number, opponentId: string, runs = 20): { wins: number; turns: number } {
  let wins = 0;
  let turns = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulate(catId, level, opponentId, 100 + i);
    if (r.won) wins++;
    turns += r.turns;
  }
  return { wins, turns: Math.round(turns / runs) };
}

const checks: Array<{ label: string; cat: string; level: number; opp: string; min: number }> = [
  { label: "新手 vs 流浪猫", cat: "orange", level: 2, opp: "wild_stray", min: 80 },
  { label: "新手 vs 巷口野猫", cat: "orange", level: 3, opp: "wild_alley", min: 60 },
  { label: "新手 vs 初级赛事首战", cat: "orange", level: 3, opp: "t1_rookie", min: 50 },
  { label: "中级 vs 中级赛事首战", cat: "mint", level: 8, opp: "t2_tech", min: 50 },
  { label: "高级 vs 高级赛事首战", cat: "android", level: 14, opp: "t3_legend", min: 50 },
  { label: "传说 vs 高级冠军", cat: "golden", level: 18, opp: "t3_king", min: 60 },
  { label: "传说 vs 圆头猫咪 Boss", cat: "golden", level: 22, opp: "roundhead", min: 40 },
];

console.log("=== 数值平衡模拟（自动攻击策略，20 次取胜率） ===");
for (const c of checks) {
  const { wins, turns } = winRate(c.cat, c.level, c.opp);
  const pass = wins * 100 >= c.min * 20;
  console.log(`${pass ? "✅" : "❌"} ${c.label}（Lv.${c.level} ${c.cat} vs ${c.opp}）: ${wins}/20 胜，均 ${turns} 回合`);
}
