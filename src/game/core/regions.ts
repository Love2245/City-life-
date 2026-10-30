/**
 * 三级地图导航 · 区域系统纯逻辑。
 * 提供区域数据查询与导航栈操作（enterRegion/exitRegion/goToMap）。
 * 避免与 actions.ts 循环依赖：所有 LOCATIONS 访问通过参数注入或顶层 import；
 * actions.ts 在文件顶部 import 本模块的 enterRegion/exitRegion/goToMap。
 */
import type { GameState, LocationDef, Region } from "../types";
import { LOCATIONS } from "./actions";
import regionsData from "../data/regions.json";
import { linearDay } from "./calendar";

export const REGIONS: Region[] = regionsData as Region[];

const regionMap = new Map(REGIONS.map((r) => [r.id, r]));

/** 查区域 */
export function getRegion(id: string): Region | undefined {
  return regionMap.get(id);
}

/** 路线是否已经解锁。锁定区域保留在地图上，但满足路线 flag 后可进入。 */
export function isRegionUnlocked(state: GameState, region: Region | undefined): boolean {
  if (!region) return true;
  if (region.openFrom && linearDay(state.time) < linearDay(region.openFrom)) return false;
  if (region.locked && (!region.unlockFlag || state.flags[region.unlockFlag] !== true)) return false;
  return !region.parent || isRegionUnlocked(state, getRegion(region.parent));
}

export function regionLockReason(state: GameState, region: Region | undefined): string {
  if (!region) return "未知区域";
  if (region.openFrom && linearDay(state.time) < linearDay(region.openFrom)) {
    const d = region.openFrom;
    return `${region.name}将于${d.year}年${d.month}月${d.day}日正式开放`;
  }
  if (region.parent && !isRegionUnlocked(state, getRegion(region.parent))) return regionLockReason(state, getRegion(region.parent));
  return region.unlockFlag==='item_student_pass'?'需要学生通行证':region.unlockFlag ? "路线尚未解锁，请先办理城市通行证" : "尚未开放";
}

/** 查某一级区域下的子区域（如 downtown → 5 个子区） */
export function childrenOf(parentId: string): Region[] {
  return REGIONS.filter((r) => r.parent === parentId);
}

/** 查区域下的所有地点（含同 id 跨多区归属） */
export function locationsOfRegion(regionId: string): LocationDef[] {
  return LOCATIONS.filter((l) => !l.regions || l.regions.length === 0
    ? false
    : l.regions.includes(regionId));
}

/** 从区域 id 追溯到一级区域（含自身） */
export function regionPathOf(regionId: string): string[] {
  const out: string[] = [];
  let cur = regionMap.get(regionId);
  while (cur) {
    out.unshift(cur.id);
    cur = cur.parent ? regionMap.get(cur.parent) : undefined;
  }
  return out;
}

/** 取某区域所属的一级区域 id（自身是一级区时返回自身） */
export function topRegionOf(regionId: string): string | undefined {
  const path = regionPathOf(regionId);
  return path[0];
}

/** 仅在穿越一级区域边界时播放长途场景过场；同城子区与地点间移动保持即时切换。 */
export function crossesTopLevelRegion(fromRegionId: string | undefined, toRegionId: string | undefined): boolean {
  if (!fromRegionId || !toRegionId) return false;
  const fromTop = topRegionOf(fromRegionId);
  const toTop = topRegionOf(toRegionId);
  return !!fromTop && !!toTop && fromTop !== toTop;
}

/** 从 locationId 反推所属区域（取第一个归属区域） */
export function inferRegionOfLocation(locationId: string): string | undefined {
  if (locationId === "map") return undefined;
  const loc = LOCATIONS.find((l) => l.id === locationId);
  return loc?.regions?.[0];
}

/** 进入区域视图：压栈 + locationId="map" + region=regionId */
export function enterRegion(state: GameState, regionId: string): { ok: boolean; reason?: string } {
  if ((state.districtLeisure?.active || state.fishing?.active)) return { ok: false, reason: "请先收竿或完成当前娱乐活动" };
  if (state.flags["hospitalized"]) return { ok: false, reason: "正在住院，请先在医院办理出院" };
  const r = getRegion(regionId);
  if (!r) return { ok: false, reason: "未知区域" };
  if (!isRegionUnlocked(state, r)) {
    return { ok: false, reason: regionLockReason(state, r) };
  }
  const path = regionPathOf(regionId);
  // 栈底恒为 map 哨兵
  state.navStack = ["map", ...path];
  state.region = regionId;
  state.locationId = "map";
  return { ok: true };
}

/** 退出当前区域视图：出栈 + 同步 region */
export function exitRegion(state: GameState): void {
  if ((state.districtLeisure?.active || state.fishing?.active)) return;
  if (state.flags["hospitalized"]) return;
  if (state.navStack.length <= 1) {
    state.navStack = ["map"];
    state.region = undefined;
    state.locationId = "map";
    return;
  }
  state.navStack.pop();
  const top = state.navStack[state.navStack.length - 1];
  state.region = top === "map" ? undefined : top;
  state.locationId = "map";
}

/**
 * 回到一级菜单（市区 / 郊区总览）。
 *
 * v1.43 修复（死档级）：一级菜单必须回到**玩家当前所在的城市**。
 * 旧实现把 `region` 清成 `undefined`，而 ScenePanel 在 `region` 为空时会改用「住处」
 * （`currentRegion`）去推断要显示哪个城市 —— 于是「坐巴士到郊区 → 点回主地图」会被丢回市区：
 * 市区里每个郊区区域都判定为跨城（要求先去车站买票），而市区的「郊区」快捷入口又需要私人载具，
 * 两边都进不去，直接死档。
 *
 * 城市归属按「当前二级区域 → 当前地点所属区域 → 最近所在的二级区域」依次推断；
 * 三者都拿不到时退回旧行为（由住处推断），只是极少见的兜底。
 */
export function goToMap(state: GameState): void {
  if ((state.districtLeisure?.active || state.fishing?.active)) return;
  if (state.flags["hospitalized"]) return;
  const anchor = state.locationId === "airport" ? inferRegionOfLocation(state.locationId)
    : state.region ?? inferRegionOfLocation(state.locationId) ?? state.area;
  const top = anchor ? topRegionOf(anchor) : undefined;
  state.navStack = top ? ["map", top] : ["map"];
  state.region = top;
  state.locationId = "map";
}

/** 面包屑回退到第 i 层（0=主地图，1=downtown，L3=...） */
export function crumbTo(state: GameState, i: number): void {
  if ((state.districtLeisure?.active || state.fishing?.active)) return;
  if (i <= 0) {
    goToMap(state);
    return;
  }
  const stack = state.navStack.slice(0, i + 1);
  state.navStack = stack;
  const top = stack[stack.length - 1];
  state.region = top === "map" ? undefined : top;
  state.locationId = "map";
}
