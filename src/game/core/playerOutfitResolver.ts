import { playerOutfitSet } from "./playerOutfitSets";
import type { ClothingOccasion, GameState } from "../types";
import type { ClothingSlot } from "./clothingConstants";
import { getItem } from "./items";
import { equippedClothing } from "./clothing";

export type PlayerOutfit = Record<ClothingSlot, string | undefined>;

export const CLOTHING_OCCASION_LABELS: Record<ClothingOccasion, string> = {
  interview: "面试",
  work: "上班",
  date: "约会",
  daily: "日常",
  casual: "休闲",
};

const DEFAULT_CLOTHING_OCCASIONS: ClothingOccasion[] = ["daily", "casual"];

export interface OutfitOccasionFit {
  occasion: ClothingOccasion;
  score: number;
  bonus: number;
  matched: boolean;
  label: string;
}

function occasionsOf(itemId: string | undefined): ClothingOccasion[] {
  const item = itemId ? getItem(itemId) : undefined;
  return item?.occasion?.length ? item.occasion : DEFAULT_CLOTHING_OCCASIONS;
}

/** 计算一套实际穿搭在指定场合的适配度；帽子未佩戴时不计入缺失惩罚。 */
export function outfitOccasionFit(
  outfit: PlayerOutfit,
  occasion: ClothingOccasion,
  carriedItemIds: readonly string[] = [],
): OutfitOccasionFit {
  let score = 0;
  let considered = 0;
  for (const slot of ["clothes", "underlayer", "pants", "hat"] as const) {
    const itemId = outfit[slot];
    if (!itemId) continue;
    considered += 1;
    score += occasionsOf(itemId).includes(occasion) ? 1 : -1;
  }

  // 名表、名牌包等不占服装槽：持有时作为随身配饰参与同一 occasion 评分；
  // 不给不匹配场合施加惩罚，也不把同一件物品按库存数量重复计分。
  for (const itemId of new Set(carriedItemIds)) {
    const item = getItem(itemId);
    if (!item?.luxury || item.slot || !item.occasion?.includes(occasion)) continue;
    considered += 1;
    score += 1;
  }

  const normalizedScore = considered === 0 ? 0 : score;
  const bonus = Math.max(-2, Math.min(6, normalizedScore * 2));
  return {
    occasion,
    score: normalizedScore,
    bonus,
    matched: normalizedScore > 0,
    label: CLOTHING_OCCASION_LABELS[occasion],
  };
}

export function outfitOccasionFitForState(state: GameState, occasion: ClothingOccasion): OutfitOccasionFit {
  const carriedLuxury = Object.entries(state.inventory ?? {})
    .filter(([itemId, qty]) => qty > 0 && getItem(itemId)?.luxury && !getItem(itemId)?.slot)
    .map(([itemId]) => itemId);
  return outfitOccasionFit(equippedClothing(state), occasion, carriedLuxury);
}

export function clothingOccasionTags(itemId: string | undefined): string[] {
  return occasionsOf(itemId).map((occasion) => CLOTHING_OCCASION_LABELS[occasion]);
}

/** 一套衣服必须使用同一姿势；不把默认袖子叠到抱臂的身体上。 */
export function resolvePlayerOutfit(
  variant: string,
  outfit: PlayerOutfit,
  bases: Record<string, string>,
  layers: Record<string, string>,
  garmentLayers: Record<string, string>,
  masks: Record<string, string> = {},
): { variant: string; layers: string[]; layerTransforms?: string[]; layerMasks?: string[];layerRecipes?:Array<{matrix?:string;alphaCutoff?:number}> } | undefined {
  const root = "/src/assets/portraits/player";
  // Existing action garments contain baked-in shirts and blue trouser pieces.
  // Presence of all filenames is not proof of a compatible outfit. Until a
  // whole action set is verified, retain the worn clothes in the standing pose.
  // This coat's upper action cutouts are verified against the same standing
  // legs. Clip baked-in trousers and reuse the independently fitted black pair.
  const coatAction=outfit.clothes==='cyan_jacket'&&outfit.underlayer==='underlayer_white'&&outfit.pants==='black_pants';
  const actionMaskReady=['cyan_jacket_action','cyan_jacket_action_body','cyan_jacket_action_legs','cyan_jacket_action_pants'].every(mask=>masks[`${root}/masks/${mask}.svg`]);
  const poses=coatAction&&actionMaskReady&&variant!=='default'?[variant,'default']:['default'];
  for (const pose of poses) {
    const base = bases[`${root}/base/${pose}.png`];
    if (!base) continue;
    const resolved = [base];
    const layerMasks = [outfit.pants === "sports_shorts" ? masks[`${root}/masks/sports_shorts_base.svg`] ?? "" : ""];
    const transforms = [""];
    const recipes:Array<{matrix?:string;alphaCutoff?:number}>=[{alphaCutoff:.06}];
    const fittedHoodie=outfit.clothes==='navy_hoodie'&&!!layers[`${root}/layers/navy_hoodie_fit_v2/default.png`];
    const fittedJeans=outfit.pants==='jeans'&&!!layers[`${root}/layers/jeans_fit_v2/default.png`];
    const bodyMask=fittedHoodie&&fittedJeans?'navy_hoodie_jeans_body':fittedHoodie?'navy_hoodie_body':fittedJeans?'jeans_body':undefined;
    if(bodyMask)layerMasks[0]=masks[`${root}/masks/${bodyMask}.svg`]??'';
    if(coatAction&&pose!=='default'){
      layerMasks[0]=masks[`${root}/masks/cyan_jacket_action_body.svg`]??'';
      resolved.push(bases[`${root}/base/default.png`]);
      layerMasks.push(masks[`${root}/masks/cyan_jacket_action_legs.svg`]??'');
      transforms.push('');recipes.push({alphaCutoff:.06});
    }
    if (outfit.pants === "sports_shorts" && masks[`${root}/masks/sports_shorts_legs.svg`]) {
      resolved.push(masks[`${root}/masks/sports_shorts_legs.svg`]);
      layerMasks.push(""); transforms.push("");
      recipes.push({});
    }
    let hatTransform: string | undefined;
    let complete = true;
    for (const slot of ["pants", "underlayer", "clothes", "hat"] as const) {
      const id = outfit[slot];
      if (!id && slot === "hat") continue;
      const layerId = id ? garmentLayers[id] : undefined;
      const fitted=layerId&&['jeans','navy_hoodie'].includes(layerId)?layers[`${root}/layers/${layerId}_fit_v2/${pose}.png`]:undefined;
      const layerPose=coatAction&&pose!=='default'&&(slot==='pants'||slot==='hat')?'default':pose;
      const source = fitted??(layerId ? layers[`${root}/layers/${layerId}/${layerPose}.png`] : undefined);
      if (!source) { complete = false; break; }
      resolved.push(source);
      layerMasks.push(masks[`${root}/masks/${layerId}.png`] ?? masks[`${root}/masks/${layerId}.svg`] ?? "");
      if(slot==='pants'&&coatAction&&pose!=='default')layerMasks[layerMasks.length-1]=masks[`${root}/masks/cyan_jacket_action_pants.svg`]??'';
      if((slot==='clothes'||slot==='underlayer')&&coatAction&&pose!=='default')layerMasks[layerMasks.length-1]=masks[`${root}/masks/cyan_jacket_action.svg`]??'';
      if(slot==='underlayer'&&fittedHoodie)layerMasks[layerMasks.length-1]=masks[`${root}/masks/navy_hoodie_body.svg`]??'';
      recipes.push(fitted?{matrix:layerId==='jeans'?'matrix(.62 0 0 .635 186 541.5)':'matrix(.5 0 0 .54 236 100)',alphaCutoff:.06}:{});
      const sportsTransforms: Record<string, string> = {
        football_jersey: "translateX(-3.2%) translateY(2%) scale(0.795, 0.845)",
        basketball_jersey: "translateX(1.7%) translateY(6%) scale(0.78, 0.69)",
        sports_shorts: "translateY(5.1%) scale(0.83, 0.86)",
      };
      transforms.push(layerId === "service_apron" ? "translateY(3%) scale(0.8)" : sportsTransforms[layerId ?? ""] ?? "");
      // 帽子素材共用整个人物画布，只校准帽层，保持身体和服装层对齐。
      if (slot === "hat" && layerId === "baseball_cap") {
        hatTransform = "translateX(0.7%) scale(0.88, 0.98)";
      }
    }
    if (complete) return {
      variant: pose,
      layers: resolved,
      ...(hatTransform || transforms.some(Boolean) ? {
        layerTransforms: transforms.map((t, index) => hatTransform && index === resolved.length - 1 ? hatTransform : t),
      } : {}),
      ...(layerMasks.some(Boolean) ? { layerMasks } : {}),
      layerRecipes:recipes,
    };
  }
  return undefined;
}

/** One painted body per outfit. Only the independently fitted hat is overlaid. */
export function resolveWholePlayerOutfit(outfit: PlayerOutfit, sets: Record<string,string>, layers: Record<string,string>, garmentLayers: Record<string,string>) {
  const root = '/src/assets/portraits/player';
  const set = playerOutfitSet(outfit.clothes) ?? playerOutfitSet('white_vest')!;
  const body = sets[`${root}/outfit-sets-v1/${set.id}.png`];
  if (!body) return undefined;
  const resolved = [body];
  const transforms = [''];
  const recipes: { alphaCutoff?: number }[] = [{ alphaCutoff: .06 }];
  if (outfit.hat) {
    const hat = layers[`${root}/layers/${garmentLayers[outfit.hat]}/default.png`];
    if (hat) { resolved.push(hat); transforms.push(outfit.hat === 'baseball_cap' ? 'translateX(.7%) scale(.88,.98)' : ''); recipes.push({alphaCutoff:.06}); }
  }
  return { variant: 'default', layers: resolved, layerTransforms: transforms, layerRecipes: recipes };
}
