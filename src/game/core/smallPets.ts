/**
 * v1.4 花鸟市场轻量小宠物。
 *
 * 这里刻意不复用猫咪 PetState：鸟和金鱼只有饥饿、心情两个状态，
 * 不参与猫咪的等级、生命值、卡牌、战斗或疾病系统。
 */
import type { GameState, ResultDelta, SmallPetState } from "../types";
import { gameDay } from "./calendar";
import { recordMoney } from "./weekly";

export const SMALL_PET_PRICE: Record<SmallPetState["kind"], number> = {
  bird: 80,
  goldfish: 30,
};

export const SMALL_PET_FEED_PRICE: Record<SmallPetState["kind"], number> = {
  bird: 5,
  goldfish: 3,
};

export const SMALL_PET_DAILY_HUNGER = 15;
export const SMALL_PET_DAILY_MOOD = 8;
export const SMALL_PET_FEED_HUNGER = 25;
export const SMALL_PET_FEED_MOOD = 2;
export const SMALL_PET_COMFORT_MOOD = 8;
export const SMALL_PET_CHECKUP_PRICE = 20;
export const SMALL_PET_CHECKUP_HUNGER = 20;
export const SMALL_PET_CHECKUP_MOOD = 15;

export interface SmallPetOperation {
  ok: boolean;
  reason?: string;
  pet?: SmallPetState;
  deltas: ResultDelta[];
  message?: string;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function moneyDelta(value: number): ResultDelta[] {
  return value === 0 ? [] : [{ key: "money", label: "金钱", value }];
}

function petName(kind: SmallPetState["kind"], index: number): string {
  return kind === "bird" ? `小鸟${index > 1 ? index : ""}` : `金鱼${index > 1 ? index : ""}`;
}

export function smallPetOf(state: GameState, uid?: string): SmallPetState | undefined {
  if (uid) return state.smallPets.find((pet) => pet.uid === uid);
  return state.smallPets[0];
}

export function adoptSmallPet(
  state: GameState,
  kind: SmallPetState["kind"],
  price = SMALL_PET_PRICE[kind],
  name?: string,
): SmallPetOperation {
  if (state.player.money < price) {
    return { ok: false, reason: `金钱不足（需要 ${price} 元）`, deltas: [] };
  }
  const count = state.smallPets.filter((pet) => pet.kind === kind).length + 1;
  const pet: SmallPetState = {
    uid: `small_${kind}_${gameDay(state.time)}_${state.smallPets.length + 1}`,
    kind,
    name: name?.trim() || petName(kind, count),
    hunger: 20,
    mood: 80,
    acquiredDay: gameDay(state.time),
  };
  state.player.money -= price;
  recordMoney(state, -price);
  state.smallPets.push(pet);
  return {
    ok: true,
    pet,
    deltas: moneyDelta(-price),
    message: `带${kind === "bird" ? "小鸟" : "金鱼"}回家了，记得照料它`,
  };
}

export function feedSmallPet(
  state: GameState,
  uid: string | undefined,
  price?: number,
): SmallPetOperation {
  const pet = smallPetOf(state, uid);
  if (!pet) return { ok: false, reason: "还没有可照料的小宠物", deltas: [] };
  const cost = price ?? SMALL_PET_FEED_PRICE[pet.kind];
  if (state.player.money < cost) {
    return { ok: false, reason: `金钱不足（需要 ${cost} 元）`, deltas: [] };
  }
  state.player.money -= cost;
  recordMoney(state, -cost);
  pet.hunger = clamp(pet.hunger - SMALL_PET_FEED_HUNGER);
  pet.mood = clamp(pet.mood + SMALL_PET_FEED_MOOD);
  return {
    ok: true,
    pet,
    deltas: [
      ...moneyDelta(-cost),
      { key: "smallPetHunger", label: "饥饿", value: -SMALL_PET_FEED_HUNGER },
      { key: "smallPetMood", label: "心情", value: SMALL_PET_FEED_MOOD },
    ],
    message: `给「${pet.name}」喂了食，状态好多了`,
  };
}

export function comfortSmallPet(state: GameState, uid?: string): SmallPetOperation {
  const pet = smallPetOf(state, uid);
  if (!pet) return { ok: false, reason: "还没有可安抚的小宠物", deltas: [] };
  pet.mood = clamp(pet.mood + SMALL_PET_COMFORT_MOOD);
  return {
    ok: true,
    pet,
    deltas: [{ key: "smallPetMood", label: "心情", value: SMALL_PET_COMFORT_MOOD }],
    message: `陪「${pet.name}」待了一会儿，它看起来开心多了`,
  };
}

export function checkupSmallPet(
  state: GameState,
  uid?: string,
  price = SMALL_PET_CHECKUP_PRICE,
): SmallPetOperation {
  const pet = smallPetOf(state, uid);
  if (!pet) return { ok: false, reason: "还没有可体检的小宠物", deltas: [] };
  if (state.player.money < price) {
    return { ok: false, reason: `金钱不足（需要 ${price} 元）`, deltas: [] };
  }
  state.player.money -= price;
  recordMoney(state, -price);
  pet.hunger = clamp(pet.hunger - SMALL_PET_CHECKUP_HUNGER);
  pet.mood = clamp(pet.mood + SMALL_PET_CHECKUP_MOOD);
  return {
    ok: true,
    pet,
    deltas: [
      ...moneyDelta(-price),
      { key: "smallPetHunger", label: "饥饿", value: -SMALL_PET_CHECKUP_HUNGER },
      { key: "smallPetMood", label: "心情", value: SMALL_PET_CHECKUP_MOOD },
    ],
    message: `「${pet.name}」体检完成，饥饿和心情都恢复了一些`,
  };
}

/** 跨天衰减；由时间系统在日期进位时调用。 */
export function tickSmallPetsDaily(state: GameState): string[] {
  if (!Array.isArray(state.smallPets) || state.smallPets.length === 0) return [];
  const messages: string[] = [];
  for (const pet of state.smallPets) {
    pet.hunger = clamp(pet.hunger + SMALL_PET_DAILY_HUNGER);
    pet.mood = clamp(pet.mood - SMALL_PET_DAILY_MOOD);
    if (pet.hunger >= 80) {
      messages.push(`「${pet.name}」有些饿了，去花鸟市场喂喂它吧`);
    } else if (pet.mood <= 30) {
      messages.push(`「${pet.name}」今天有点闷闷不乐，记得陪它待一会儿`);
    }
  }
  return messages;
}
