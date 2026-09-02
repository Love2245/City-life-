/**
 * 三级地图导航 · 区域系统纯逻辑。
 * 提供区域数据查询与导航栈操作（enterRegion/exitRegion/goToMap）。
 * 避免与 actions.ts 循环依赖：所有 LOCATIONS 访问通过参数注入或顶层 import；
 * actions.ts 在文件顶部 import 本模块的 enterRegion/exitRegion/goToMap。
 */
import type { GameState, LocationDef, Region } from "../types";
import { LOCATIONS } from "./actions";
import regionsData from "../data/regions.json";

export const REGIONS: Region[] = regionsData as Region[];

const regionMap = new Map(REGIONS.map((r) => [r.id, r]));

/** 查区域 */
export function getRegion(id: string): Region | undefined {
  return regionMap.get(id);
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

/** 从 locationId 反推所属区域（取第一个归属区域） */
export function inferRegionOfLocation(locationId: string): string | undefined {
  if (locationId === "map") return undefined;
  const loc = LOCATIONS.find((l) => l.id === locationId);
  return loc?.regions?.[0];
}

/** 进入区域视图：压栈 + locationId="map" + region=regionId */
export function enterRegion(state: GameState, regionId: string): { ok: boolean; reason?: string } {
  const r = getRegion(regionId);
  if (!r) return { ok: false, reason: "未知区域" };
  if (r.locked) return { ok: false, reason: "该区域暂未开放，下次更新推出" };
  const path = regionPathOf(regionId);
  // 栈底恒为 map 哨兵
  state.navStack = ["map", ...path];
  state.region = regionId;
  state.locationId = "map";
  return { ok: true };
}

/** 退出当前区域视图：出栈 + 同步 region */
export function exitRegion(state: GameState): void {
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

/** 跳到主地图（L1）：栈复位 */
export function goToMap(state: GameState): void {
  state.navStack = ["map"];
  state.region = undefined;
  state.locationId = "map";
}

/** 面包屑回退到第 i 层（0=主地图，1=downtown，L3=...） */
export function crumbTo(state: GameState, i: number): void {
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