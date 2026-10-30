import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { adoptCat } from "../src/game/core/cat";
import { setActivePet } from "../src/game/core/catCare";
import { buyAccessory, equipAccessory } from "../src/game/core/catAccessory";
import { startBattle, allOpponents } from "../src/game/core/catBattle";
import { ensureCardPack } from "../src/game/core/cardPack";

describe("v1.38 饰品链路冒烟", () => {
  it("买饰品→佩戴记录保留，新版竞技不叠加饰品倍率", () => {
    const s = createInitialState(7);
    s.player.money = 100000;
    adoptCat(s, "orange");
    const pet = s.pets[0];
    setActivePet(s, pet.uid);
    ensureCardPack(pet);

    const buy = buyAccessory(s, "ac_crown");
    expect(buy.ok).toBe(true);
    expect(s.ownedAccessories["ac_crown"]).toBe(1);

    const eq = equipAccessory(s, pet.uid, "ac_crown");
    expect(eq.ok).toBe(true);
    expect(pet.accessory).toBe("ac_crown");

    const opp = allOpponents().find((o) => (o.minLevel ?? 1) <= pet.level && !o.id.startsWith("t"));
    expect(opp).toBeTruthy();
    const r = startBattle(s, opp!.id);
    if (!r.ok) console.log("STARTBATTLE_FAIL", JSON.stringify({ reason: r.reason, petLevel: pet.level, oppMin: opp!.minLevel, oppId: opp!.id, money: s.player.money, deck: ensureCardPack(pet).length }));
    expect(r.ok, r.reason).toBe(true);
    expect(s.catBattle).toBeTruthy();
    // 王者之冠：startStrength 4 / startBlock 8 / drawBonus 1
    expect(s.catBattle!.playerStrength).toBe(0);
    expect(s.catBattle!.playerBlock).toBe(0);
    expect(s.catBattle!.player.hp).toBe(80);expect(s.catBattle!.playerHand).toHaveLength(5);expect(pet.accessory).toBe("ac_crown");
  });

  it("生病猫咪无法开战", () => {
    const s = createInitialState(7);
    adoptCat(s, "orange");
    const pet = s.pets[0];
    setActivePet(s, pet.uid);
    pet.sick = true;
    const opp = allOpponents()[0];
    const r = startBattle(s, opp.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("生病");
  });

  it("寄养期间不能更换猫咪饰品", () => {
    const s = createInitialState(8);
    adoptCat(s, "orange");
    const pet = s.pets[0];
    buyAccessory(s, "ac_crown");
    pet.fostered = true;

    expect(equipAccessory(s, pet.uid, "ac_crown").ok).toBe(false);
    expect(pet.accessory).toBeUndefined();
  });
});
