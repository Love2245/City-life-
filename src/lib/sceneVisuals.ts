import type { ActionDef, WeatherId } from "../game/types";
import { themeOfHour } from "../game/timeOfDay";
import { facilityBackgroundUrl, hasFacilityLighting } from './facilityVisuals';

/** 场景背景和 UI 纹理共用的时段类型。 */
export type SceneTheme = "day" | "dusk" | "night";

/** 动作卡/分组卡使用的语义纹理分类。 */
export type ActionVisualKey =
  | "rest"
  | "desk"
  | "food"
  | "wash"
  | "exercise"
  | "market"
  | "transit"
  | "medical"
  | "work"
  | "street"
  | "housing"
  | "general";

type AssetModuleMap = Record<string, string>;

const sceneModules = import.meta.glob("/src/assets/bg/v1.4/**/*.webp", {
  eager: true,
  import: "default",
}) as AssetModuleMap;

/** v1.48 新区与泊月场景；有独立时段图时按游戏时钟切换。 */
const developmentScenes = import.meta.glob("/src/assets/bg/v1.48/scenes/*.webp", {
  eager: true,
  import: "default",
}) as AssetModuleMap;
const developmentSceneMap: Record<string, string> = {};
for (const [path, url] of Object.entries(developmentScenes)) {
  const id = path.match(/\/scenes\/([^/]+)\.webp$/)?.[1];
  if (id) developmentSceneMap[id] = url;
}

/** 新区和泊月的独立住宿内景；与 v1.46 的市中心房间资产分开打包。 */
const developmentHousing = import.meta.glob("/src/assets/bg/v1.48/housing/**/*.webp", {
  eager: true,
  import: "default",
}) as AssetModuleMap;

export function developmentHousingBackgroundUrl(key: string, theme: SceneTheme): string | undefined {
  return developmentHousing[`/src/assets/bg/v1.48/housing/${key}/${theme}.webp`];
}

/** 这些地点的介绍卡和未入住到店场景也展示对应房间。 */
const NEW_RESIDENCE_SCENE_IDS = new Set([
  "hotel_boyue_quick",
  "hotel_boyu_nightmarket",
  "dev_incubator",
  "boyue_talent_apartment",
]);

/** These two Boyue food streets have their own cloudy-day and rainy period art. */
const WEATHER_SCENE_IDS = new Set(["boyue_food_street", "boyue_snack_street", "dev_food_street"]);

function sceneWeatherFor(weather: WeatherId): "sunny" | "cloudy" | "rain" {
  if (weather === "rain" || weather === "snow") return "rain";
  if (weather === "cloudy" || weather === "coldwave") return "cloudy";
  return "sunny";
}

// 人才公寓先展示已有普通公寓室内，复用视觉不会接入租住或居家功能。
const reusedApartmentScenes = import.meta.glob("/src/assets/bg/v1.46/housing/rental_apartment/*.webp", {
  eager: true,
  import: "default",
}) as AssetModuleMap;

const actionTextureModules = import.meta.glob("/src/assets/ui/v1.4/action-textures/*.webp", {
  eager: true,
  import: "default",
}) as AssetModuleMap;

const sceneMap: Record<string, Partial<Record<SceneTheme, string>>> = {};
for (const [path, url] of Object.entries(sceneModules)) {
  const match = path.match(/bg\/v1\.4\/([^/]+)\/(day|dusk|night)\.webp$/);
  if (!match) continue;
  const [, locationId, theme] = match;
  (sceneMap[locationId] ??= {})[theme as SceneTheme] = url;
}

/**
 * 临街平价店沿用旧版临街服装店的同构背景，避免新地点在旧素材包中出现空白。
 * 商场内的精品店仍然使用各自独立的地点背景。
 */
const SCENE_BACKGROUND_ALIASES: Record<string, string> = {
  budget_clothing_store: "clothing_store",
  worker_dormitory: "hostel",
  npc_guest_room: "minsu",
  hotel_boyue_quick: "hotel_boyue_quick",
  hotel_boyu_nightmarket: "hotel_boyu_nightmarket",
  boyue_talent_apartment: "boyue_talent_apartment",
  boyue_internet_cafe: "internet_cafe",
  boyue_cafe: "cafe",
  boyue_convenience_store: "convenience_store",
  commercial_convenience_store: "convenience_store",
  boyue_fast_food: "fast_food",
  boyue_gym: "gym",
  boyue_western_restaurant: "western_restaurant",
  boyue_bathhouse: "bathhouse",
};

function scenePeriodFor(hour: number): SceneTheme {
  return themeOfHour(hour);
}

function hasDistrictPeriodArt(locationId: string, period: SceneTheme): boolean {
  if (period === "day") return false;
  const alias = SCENE_BACKGROUND_ALIASES[locationId];
  return !!developmentSceneMap[`${locationId}_${period}`]
    || (!!alias && !!developmentSceneMap[`${alias}_${period}`]);
}

/** True when the active dusk/night scene is a separately lit v1.48 image. */
export function sceneHasNativeLighting(locationId: string, hour: number): boolean {
  const period = scenePeriodFor(hour);
  return hasFacilityLighting(locationId, period) || hasDistrictPeriodArt(locationId, period);
}

const actionTextureMap: Partial<Record<ActionVisualKey, string>> = {};
for (const [path, url] of Object.entries(actionTextureModules)) {
  const match = path.match(/action-textures\/([^/]+)\.webp$/);
  if (!match) continue;
  actionTextureMap[match[1] as ActionVisualKey] = url;
}

/** 返回地点当前时段的全屏/地点介绍背景。 */
export function sceneBackgroundUrl(
  locationId: string,
  theme: SceneTheme,
  hour?: number,
  weather: WeatherId = "sunny",
): string | undefined {
  // 有游戏时钟时优先使用实际时段；无时钟的旧调用沿用传入主题。
  const period: SceneTheme = hour === undefined ? theme : scenePeriodFor(hour);
  const facility = facilityBackgroundUrl(locationId, period);
  if (facility) return facility;
  if (NEW_RESIDENCE_SCENE_IDS.has(locationId)) {
    const room = developmentHousingBackgroundUrl(locationId, period);
    if (room) return room;
  }
  if (WEATHER_SCENE_IDS.has(locationId)) {
    const visualWeather = sceneWeatherFor(weather);
    const weatherUrl = visualWeather === "sunny"
      ? undefined
      : developmentSceneMap[`${locationId}_${visualWeather}-${period}`];
    if (weatherUrl) return weatherUrl;
  }
  const alias = SCENE_BACKGROUND_ALIASES[locationId];
  return developmentSceneMap[`${locationId}_${period}`]
    ?? sceneMap[locationId]?.[period]
    ?? developmentSceneMap[locationId]
    ?? (alias && developmentSceneMap[`${alias}_${period}`])
    ?? (alias ? sceneMap[alias]?.[period] : undefined)
    ?? (alias ? developmentSceneMap[alias] : undefined)
    ?? (alias ? reusedApartmentScenes[`/src/assets/bg/v1.46/housing/${alias}/${period}.webp`] : undefined);
}

/** 返回动作纹理；缺少分类时稳定回退到通用纹理。 */
export function actionTextureUrl(key: ActionVisualKey): string | undefined {
  return actionTextureMap[key] ?? actionTextureMap.general;
}

const REST_ACTIONS = new Set(["sleep_home", "rest_ward", "stay_hotel", "temple_lodging"]);
const DESK_ACTIONS = new Set(["use_laptop_home", "study_library", "read_novel_library", "train_study_course"]);
const FOOD_ACTIONS = new Set([
  "eat_noodles_home",
  "cook_practice_home",
  "cook_dish_veg",
  "cook_dish_salad",
  "cook_dish_meat",
  "cook_full_meal",
  "cook_steak_home",
  "buy_lunch_convenience",
  "buy_drink_convenience",
  "buy_sandwich_convenience",
  "buy_salad_convenience",
  "buy_noodles_convenience",
  "eat_steak_western",
  "eat_burger_fastfood",
  "hotel_breakfast",
  "cat_feed",
  "small_pet_feed_bird",
  "small_pet_feed_goldfish",
  "snack_street_skewer",
  "snack_street_noodles",
  "snack_street_tofu",
]);
const WASH_ACTIONS = new Set(["shower_home", "shower_quick", "bath_massage", "bath_center", "cat_clean"]);
const EXERCISE_ACTIONS = new Set([
  "exercise_home_equip",
  "exercise_park",
  "exercise_gym",
  "book_sports",
  "cat_free_train",
  "cat_free_train_lake",
  "cat_train_atk",
  "cat_train_def",
  "cat_train_spd",
  "cat_train_hp",
  "cat_train_atk_lake",
  "cat_train_def_lake",
  "cat_train_spd_lake",
  "cat_train_hp_lake",
  "amusement_fun_match",
]);
const MARKET_ACTIONS = new Set([
  "buy_fruit_market",
  "buy_vegetable_market",
  "buy_meat_market",
  "buy_egg_market",
  "buy_milk_market",
  "cat_buy_cat_food_basic",
  "cat_buy_cat_food_good",
  "cat_buy_cat_food_lux",
  "cat_buy_cat_toy_basic",
  "cat_buy_cat_toy_good",
  "cat_buy_cat_toy_lux",
  "cat_buy_cat_bed_basic",
  "cat_buy_cat_bed_good",
  "cat_buy_cat_bed_lux",
  "cat_buy_cat_train_basic",
  "cat_buy_cat_train_good",
  "cat_buy_cat_train_lux",
  "pet_adopt",
  "buy_flower_flower_market",
  "buy_plant_flower_market",
  "small_pet_adopt_bird",
  "small_pet_adopt_goldfish",
  "small_pet_comfort",
  "cat_buy_acc_ac_bell",
  "cat_buy_acc_ac_collar",
  "cat_buy_acc_ac_charm",
  "cat_buy_acc_ac_band",
  "cat_buy_acc_ac_scarf",
  "cat_buy_acc_ac_medal",
  "cat_buy_acc_ac_crystal",
  "cat_buy_acc_ac_crown",
]);
const TRANSIT_ACTIONS = new Set([
  "station_intercity_bus",
  "station_intercity_train",
  "suburb_station_intercity_bus",
  "suburb_station_intercity_train",
]);
const MEDICAL_ACTIONS = new Set([
  "see_doctor_hospital",
  "treat_depression_hospital",
  "buy_medicine_clinic",
  "treat_hospital",
  "buy_medicine_hospital",
  "hospitalize",
  "rest_ward",
  "discharge",
  "cat_treat_injury",
  "cat_restore_hp",
  "cat_special_train",
  "cat_focus_train",
  "cat_buy_cat_potion",
  "cat_buy_cat_hp_potion",
  "cat_buy_cat_purifier",
  "cat_buy_cat_revive",
  "small_pet_checkup",
]);
const HOUSING_ACTIONS = new Set([
  "sign_lease",
  "sign_lease_apartment",
  "buy_old_unit",
  "buy_apartment",
  "buy_villa",
]);

const LOCATION_VISUALS: Record<string, ActionVisualKey> = {
  library: "desk",
  training_school: "desk",
  cafe: "food",
  fast_food: "food",
  western_restaurant: "food",
  convenience_store: "market",
  market: "market",
  market_fair: "market",
  flower_market: "market",
  pet_store: "market",
  pet_hospital: "medical",
  hospital: "medical",
  clinic: "medical",
  bus_station: "transit",
  high_speed_rail: "transit",
  suburb_bus_station: "transit",
  suburb_train_station: "transit",
  gym: "exercise",
  park: "exercise",
  lake_park: "exercise",
  amusement_park: "street",
  snack_street: "food",
  street: "street",
  labor_market: "work",
  labor_company: "work",
  steel_factory: "work",
  glass_factory: "work",
  aluminum_factory: "work",
  electronics_factory: "work",
  school: "work",
  car_rental: "market",
  luxury_store: "market",
  furniture_store: "market",
  electronics_store: "desk",
  hotel: "rest",
  bathhouse: "wash",
  church: "street",
  temple: "street",
  farm: "market",
  pasture: "market",
  orchard: "market",
  housing_agency: "housing",
};

/** 将动作映射为语义纹理，不按具体区域复制素材。 */
export function visualKeyForAction(action: Pick<ActionDef, "id" | "locationId" | "group" | "handler">): ActionVisualKey {
  if (TRANSIT_ACTIONS.has(action.id) || action.handler === "intercity_station") return "transit";
  if (REST_ACTIONS.has(action.id) || action.handler === "sleep_modal" || action.handler === "stay_hotel") return "rest";
  if (DESK_ACTIONS.has(action.id) || action.handler === "use_laptop" || action.handler === "read_book" || action.handler === "train_study") return "desk";
  if (WASH_ACTIONS.has(action.id) || action.handler === "wash_center") return "wash";
  if (MEDICAL_ACTIONS.has(action.id) || action.handler === "hospitalize" || action.handler === "discharge" || action.handler === "treat_depression") return "medical";
  if (HOUSING_ACTIONS.has(action.id) || action.handler === "sign_lease" || action.handler === "buy_property") return "housing";
  if (FOOD_ACTIONS.has(action.id) || action.handler === "buy_food" || action.handler === "buy_fresh" || action.handler === "cook_item") return "food";
  if (EXERCISE_ACTIONS.has(action.id) || action.group === "cat_train" || action.handler === "cat_free_train" || action.handler === "fun_match") return "exercise";
  if (MARKET_ACTIONS.has(action.id) || action.handler === "buy_cat_item" || action.handler === "buy_accessory" || action.handler === "pet_adopt") return "market";
  if (action.locationId === "home" && action.group === "read") return "desk";
  return LOCATION_VISUALS[action.locationId] ?? "general";
}

/** 分组入口使用和组内动作一致的语义纹理。 */
export function visualKeyForGroup(groupId: string): ActionVisualKey {
  if (["cook", "market_stall"].includes(groupId)) return "food";
  if (groupId === "market_shop") return "market";
  if (["read", "dev"].includes(groupId)) return "desk";
  if (["cat_train", "pet_train", "hos_train"].includes(groupId)) return "exercise";
  if (["hos_treat", "hos_special"].includes(groupId)) return "medical";
  if (["cat", "pet_food", "pet_toy", "pet_bed", "pet_special", "pet_acc", "pet_adopt", "market_pet"].includes(groupId)) return "market";
  return "general";
}

/** 固定兼职和设施入口的语义分类。 */
export function visualKeyForLocation(locationId: string): ActionVisualKey {
  return LOCATION_VISUALS[locationId] ?? "general";
}

export const ACTION_VISUAL_KEYS: readonly ActionVisualKey[] = [
  "rest",
  "desk",
  "food",
  "wash",
  "exercise",
  "market",
  "transit",
  "medical",
  "work",
  "street",
  "housing",
  "general",
];
