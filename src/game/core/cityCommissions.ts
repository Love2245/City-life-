/** 旧城市占位委托已全部移除。仅保留旧调用/存档的惰性清理接口，无任务目录或领奖路径。 */
import type { CityCommissionDef, CityCommissionState, CityCommissionStep, GameState } from "../types";
import { gameDay } from "./calendar";
import { emptyCityCommissionState, removeRetiredNpcTasks } from "./npcTaskAvailability";

export const CITY_COMMISSIONS: readonly CityCommissionDef[] = [];
export interface CommissionProgressSignal { locationId?: string; actionId?: string; deliver?: boolean }
export interface CommissionOperation { ok: boolean; reason?: string; completed?: boolean; nextStep?: CityCommissionStep }
const removed = (): CommissionOperation => ({ ok: false, reason: "旧版城市占位委托已移除" });

export function weekIndexOf(state: GameState): number { return Math.floor((gameDay(state.time) - 1) / 7); }
export function initialCityCommissionState(): CityCommissionState { return emptyCityCommissionState(); }
export function getCityCommission(_id: string): CityCommissionDef | undefined { return undefined; }
export function canAccessCityCommission(_state: GameState, _def: CityCommissionDef): boolean { return false; }
export function offeredCityCommissions(_state: GameState): CityCommissionDef[] { return []; }
export function cityCommissionOfferForNpc(_state: GameState, _npcId: string): CityCommissionDef | undefined { return undefined; }
export function cityCommissionDeliveryForNpc(_state: GameState, _npcId: string, _locationId: string): undefined { return undefined; }
export function acceptCityCommission(_state: GameState, _id: string): CommissionOperation { return removed(); }
export function progressCityCommission(_state: GameState, _signal: CommissionProgressSignal): CommissionOperation { return removed(); }
export function markCityCommissionLocation(_state: GameState, _locationId: string): CommissionOperation { return removed(); }
export function markCityCommissionAction(_state: GameState, _locationId: string, _actionId: string): CommissionOperation { return removed(); }
export function deliverCityCommissionStep(_state: GameState): CommissionOperation { return removed(); }
export function refreshCityCommissionOffers(state: GameState): string[] { removeRetiredNpcTasks(state); return []; }
export function tickCityCommissions(state: GameState): void { removeRetiredNpcTasks(state); }
