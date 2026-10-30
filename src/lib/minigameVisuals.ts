/**
 * v1.42 小游戏场景贴图解析器。
 *
 * 使用显式的 eager URL manifest：便携单文件不会留下动态 import chunk，
 * 但只有当前小游戏的 CSS background 会真正解码/绘制。加载失败时由
 * MiniGameHost 的 CSS 渐变继续承载交互，因此贴图属于增强而不是玩法依赖。
 */
import { deliveryRoadPreview } from './deliveryRoadPreview';
import { checkoutScenePreview } from './checkoutArt';
import gameConfigs from '../game/data/minigames.json';
import type { MiniGameConfig } from '../game/core/minigame';
const sceneModules = import.meta.glob("/src/assets/ui/v1.42/minigame-scenes/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const SPECIAL_NAMES: Record<string, string> = {
  amusement_bowling: "amusement-bowling",
  amusement_dart: "amusement-darts",
  amusement_ringtoss: "amusement-ringtoss",
  /** 小吃街复用周末集市摆摊配置，共用同一张场景图。 */
  stall_snack_street: "stall_market_fair",
  /** v1.42 AI 场景图：按工作内容拆分，列表预览与实际小游戏共用。 */
  job_waiter_west: "job_waiter_west",
  job_waiter_fast: "job_waiter_fast",
  job_delivery: "job_delivery",
  job_delivery_fulltime: "job_delivery",
  job_express: "job_express",
  job_ride_hailing: "job_ride_hailing",
  job_taxi: "job_taxi",
  job_driving_tutor: "job_driving_tutor",
  job_market_cleaner: "job_market_cleaner",
  job_loading: "job_loading",
  job_farm_hand: "job_farm_hand",
  job_pasture_milk: "job_pasture_milk",
  job_orchard_pick: "job_orchard_pick",
  temple_volunteer: "temple_volunteer",
};

/** v1.42 首发 38 款工作/游乐场 + 4 款手机小游戏的背景 key 清单。 */
export const MINIGAME_SCENE_KEYS = [
  "job_factory_line", "job_sorting", "job_convenience_day", "job_convenience_clerk", "job_cafe_staff",
  "job_market_cleaner", "job_delivery", "job_express", "job_loading", "job_warehouse", "job_office_assistant",
  "job_security", "job_sales", "job_factory_qc", "job_factory_tech", "job_driving_tutor", "job_ride_hailing",
  "job_taxi", "job_waiter_west", "job_waiter_fast", "exercise_gym", "exercise_home_equip", "street_perform",
  "park_chess", "stall_street_night", "job_farm_hand", "job_pasture_milk", "job_orchard_pick", "temple_volunteer",
  "job_training_assistant", "job_school_tutor", "job_delivery_fulltime", "job_netbar_admin", "internet_night_job",
  "stall_market_fair", "amusement_bowling", "amusement_dart", "amusement_ringtoss",
  "phone-snake", "phone-sokoban", "phone-minesweeper", "phone-2048",
] as const;

function scenePath(key: string): string {
  const name = SPECIAL_NAMES[key] ?? key.replace(/[^a-z0-9_-]/gi, "-");
  return `/src/assets/ui/v1.42/minigame-scenes/${name}.webp`;
}

/** 按小游戏 key 解析场景 URL；浏览器仍只在选中小游戏时应用该背景。 */
export async function loadMiniGameSceneUrl(key: string | undefined): Promise<string | undefined> {
  if (!key) return undefined;
  const cfg=(gameConfigs.games as Record<string,unknown>)[key] as MiniGameConfig | undefined;
  if(cfg?.type==='delivery'){
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(deliveryRoadPreview(key,cfg.mode))}`;
  }
  if(cfg?.type==='checkout') return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(checkoutScenePreview(key==='job_convenience_clerk'))}`;
  return sceneModules[scenePath(key)];
}

/** 发布前预算探针与独立小游戏列表共用的 key 规范化。 */
export function minigameSceneName(key: string): string {
  return SPECIAL_NAMES[key] ?? key.replace(/[^a-z0-9_-]/gi, "-");
}
