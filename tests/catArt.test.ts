/**
 * v1.34 猫咪战斗立绘：映射完整性回归。
 * 立绘是对决界面的主视觉——任何一个对手 / 猫种取不到图，界面就会露出 emoji 占位，
 * 所以这里强制「全部对手 + 全部猫种都必须有立绘」。
 */
import { describe, it, expect } from "vitest";
import { opponentArt, playerArt, hasOpponentArt, hasPlayerArt, poseOfAnim, OPPONENT_ART_KEYS, PLAYER_ART_KEYS } from "../src/lib/catArt";
import catBattles from "../src/game/data/catBattles.json";
import catsData from "../src/game/data/cats.json";

const opponents = (catBattles as { opponents: Array<{ id: string; name: string }>; boss: { id: string } }).opponents;
const boss = (catBattles as { boss: { id: string } }).boss;
const cats = ((catsData as { cats?: Array<{ id: string }> }).cats ?? (catsData as Array<{ id: string }>)) as Array<{ id: string }>;

describe("v1.34 猫咪立绘映射", () => {
  it("素材已接入（对手 / 玩家都有立绘组）", () => {
    expect(OPPONENT_ART_KEYS.length, "对手立绘组不应为空").toBeGreaterThan(0);
    expect(PLAYER_ART_KEYS.length, "玩家立绘组不应为空").toBeGreaterThan(0);
  });

  it("每个对手都能取到 idle 立绘", () => {
    const missing = opponents.filter((o) => !hasOpponentArt(o.id)).map((o) => `${o.id}(${o.name})`);
    expect(missing, `以下对手缺少立绘：${missing.join("、")}`).toEqual([]);
  });

  it("最终 Boss 有立绘（圆头猫咪）", () => {
    expect(hasOpponentArt(boss.id), `${boss.id} 缺少立绘`).toBe(true);
  });

  it("每个猫种都能取到 idle 立绘", () => {
    const missing = cats.filter((c) => !hasPlayerArt(c.id)).map((c) => c.id);
    expect(missing, `以下猫种缺少立绘：${missing.join("、")}`).toEqual([]);
  });

  it("四姿态都能取到图（attack / hurt / enter 缺则回退 idle，不返回空）", () => {
    for (const o of opponents.slice(0, 8)) {
      for (const pose of ["idle", "attack", "hurt", "enter"] as const) {
        expect(opponentArt(o.id, pose), `${o.id} 的 ${pose} 姿态取不到图`).toBeTruthy();
      }
    }
    for (const c of cats.slice(0, 5)) {
      for (const pose of ["idle", "attack", "hurt", "enter"] as const) {
        expect(playerArt(c.id, pose), `${c.id} 的 ${pose} 姿态取不到图`).toBeTruthy();
      }
    }
  });

  it("战斗动画状态归并到立绘姿态", () => {
    expect(poseOfAnim("attack")).toBe("attack");
    expect(poseOfAnim("hurt")).toBe("hurt");
    expect(poseOfAnim("enter")).toBe("enter");
    // defend / heal / dodge 等没有专属立绘，统一回 idle
    expect(poseOfAnim("defend")).toBe("idle");
    expect(poseOfAnim("heal")).toBe("idle");
    expect(poseOfAnim("dodge")).toBe("idle");
  });
});
