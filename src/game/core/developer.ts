/** 开发工具的事务边界：校验权限、复制状态、执行单项操作，失败不改原状态。 */
import type { GameState, RelationState, SkillKey, WeatherId, ItemSlot } from "../types";
import type { NpcTaskId } from "../npcTaskTypes";
import type { DeveloperAccess } from "../../lib/developerAccess";
import { createInitialState } from "./state";
import { ITEMS, addItem, getItem } from "./items";
import { developerItemMatchesCategory } from "./developerInventory";
import { changeGrowthStat, ensureBaseStats, refreshGrowthStats } from "./growthStats";
import { getMaxStamina } from "./stats";
import { allNpcs, npcPresenceAt } from "./npcs";
import { ensureRelationship, relationLevel, syncNpcPerks } from "./relationships";
import { maybeAddNpcContact } from "./contacts";
import { gameDay, weekdayOf, linearDay, fromLinearDay } from "./calendar";
import { advanceHours } from "./time";
import { tickNpcTasks } from "./npcTasks";
import { LOCATIONS } from "./actions";
import { REGIONS, getRegion, regionPathOf } from "./regions";
import { prepareDeveloperTask } from "./developerTasks";
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE } from "../data/npcIntroductionProgress";
import { VEHICLE_NAMES } from "./vehicle";
import { MEMBERSHIPS } from "./membership";
import { adoptCat, getCatDef, computeCatAttrs } from "./cat";
import { unequipItem, syncAutoHomeEquipment, isAutoHomeSlot } from "./equipment";
import { migrateSave, SAVE_VERSION } from "./migrate";
import { pushLog } from "../engine";
import { JOB_DEFS } from "./jobs";
import { hireJob, resignJob } from "./career";

export const DEVELOPER_ATTRS = { stamina: "体力", health: "健康", mood: "心情", hygiene: "卫生", satiety: "饱腹" } as const;
export const DEVELOPER_STATS = { intelligence: "智力", charm: "魅力", fitness: "体质", fame: "名望" } as const;
export const DEVELOPER_SKILLS: Record<SkillKey, string> = { programming: "编程", design: "设计", writing: "写作", operation: "运营", cooking: "烹饪", service: "服务", driving: "驾驶", management: "管理" };
export type DeveloperAction =
  | { type: "money"; mode: "set" | "add"; value: number }
  | { type: "player"; group: "attrs" | "stats" | "skills" | "other"; key: string; value: number }
  | { type: "recover" } | { type: "revive" } | { type: "cancelActivity" }
  | { type: "item"; id: string; mode: "set" | "add"; quantity: number }
  | { type: "itemBatch"; group: string; quantity: number }
  | { type: "npc"; id: string; affinity: number; relation: "auto" | RelationState; met: boolean }
  | { type: "npcAll"; affinity: number } | { type: "introductions" }
  | { type: "resetChats"; id?: string }
  | { type: "advance"; minutes: number }
  | { type: "date"; year: number; month: number; day: number; hour: number; minute: number }
  | { type: "teleport"; locationId: string; regionId: string }
  | { type: "findNpc"; id: string; next: boolean }
  | { type: "routes" }
  | { type: "task"; id: NpcTaskId; preset: string }
  | { type: "taskDeadline"; id: NpcTaskId; hours: number }
  | { type: "flag"; key: string; value: boolean | number | null }
  | { type: "weather"; id: WeatherId }
  | { type: "vehicle"; id: string; owned: boolean }
  | { type: "membership"; id: string; days: number }
  | { type: "job"; id: string | null }
  | { type: "cat"; id: string } | { type: "catLevel"; uid: string; level: number }
  | { type: "import"; json: string };
export type DeveloperResult = { ok: true; state: GameState; message: string } | { ok: false; message: string };
export function cloneDeveloperState(state: GameState): GameState { return JSON.parse(JSON.stringify(state)); }
function number(value: number, min: number, max: number, integer = false): number {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`请输入${min}—${max}之间的${integer ? "整数" : "数值"}`);
  return value;
}
const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
function idle(state: GameState): void {
  if (state.work?.active || state.fishing?.active || state.districtLeisure?.active) throw new Error("正在进行工作、钓鱼或休闲活动，请先结束活动或使用“取消进行中的活动”");
}
function dateValid(t: { year: number; month: number; day: number; hour: number; minute: number }): void {
  number(t.year, 2026, 9999, true); number(t.month, 1, 12, true); number(t.day, 1, 30, true); number(t.hour, 0, 23, true); number(t.minute, 0, 59, true);
  if (linearDay(t) < linearDay({ year: 2026, month: 8, day: 1 })) throw new Error("日期不能早于游戏纪元2026年8月1日");
}
function teleport(s: GameState, locationId: string, regionId: string): void {
  if (!getRegion(regionId)) throw new Error("未知区域");
  const loc = LOCATIONS.find((entry) => entry.id === locationId);
  if (locationId !== "map" && (!loc || !loc.regions?.includes(regionId))) throw new Error("地点与区域不匹配");
  s.locationId = locationId; s.region = regionId; s.area = regionId; s.navStack = ["map", ...regionPathOf(regionId)];
}
function meet(s: GameState, id: string, affinity: number, relation: "auto" | RelationState = "auto", met = true): void {
  const def = allNpcs().find((npc) => npc.id === id);
  if (!def) throw new Error("未知人物");
  number(affinity, 0, 100, true);
  if (!met) {
    const existing = ensureRelationship(s, id); existing.affinity = 0; existing.state = "stranger"; syncNpcPerks(s, id);
    s.relationships = s.relationships.filter((r) => r.npcId !== id);
    s.contacts = s.contacts.filter((c) => c.npcId !== id);
    delete s.flags[`npc_contact_added_${id}`];
    return;
  }
  if (relation === "lover" && !def.romanceable) throw new Error("这个人物没有恋爱关系，不能设为恋人");
  if (!["auto", "stranger", "acquaintance", "friend", "close_friend", "lover", "blocked"].includes(relation)) throw new Error("未知关系状态");
  const r = ensureRelationship(s, id); r.affinity = affinity; r.state = relation === "auto" ? relationLevel(affinity) : relation;
  r.lastInteractionDay = gameDay(s.time);
  syncNpcPerks(s, id);
  if (met) maybeAddNpcContact(s, id);
}
function setItem(s: GameState, id: string, qty: number): void {
  if (!getItem(id)) throw new Error("未知物品");
  number(qty, 0, 99999, true);
  if (!qty) {
    for (const [slot, equipped] of Object.entries(s.equipped)) {
      if (equipped !== id) continue;
      const def = getItem(id);
      if (isAutoHomeSlot(def?.slot) || slot.startsWith("home_")) continue;
      const result = unequipItem(s, slot as ItemSlot);
      if (!result.ok && s.equipped[slot as ItemSlot] === id) throw new Error(result.reason ?? "请先更换这件装备");
    }
    if (Object.values(s.equipped).includes(id) && ["clothes", "underlayer", "pants"].some((slot) => s.equipped[slot as ItemSlot] === id)) throw new Error("当前基础衣物需要保留一件");
    delete s.inventory[id]; s.flags[`item_${id}`] = false;
    if (s.fridge?.tier && id === `fridge_${s.fridge.tier}`) s.fridge.tier = null;
  } else {
    const current = s.inventory[id] ?? 0;
    if (qty > current) addItem(s, id, qty - current); else s.inventory[id] = qty;
    s.flags[`item_${id}`] = true;
  }
  syncAutoHomeEquipment(s);
}
function jsonValues(value: unknown, depth = 0): void {
  if (depth > 80) throw new Error("JSON层级过深");
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("JSON包含无效数值");
  if (value && typeof value === "object") for (const [key, v] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("JSON包含保留字段");
    jsonValues(v, depth + 1);
  }
}
/** 要求完整存档形状，阻止残缺对象经宽松迁移后破坏运行态。 */
function shape(value: unknown, template: unknown, path = "state"): void {
  if (["state.region", "state.area"].includes(path) && value === undefined) return;
  if (template === null || template === undefined) return;
  if (Array.isArray(template)) { if (!Array.isArray(value)) throw new Error(`${path}必须为数组`); return; }
  if (typeof template === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}必须为对象`);
    if (["state.inventory", "state.flags", "state.equipped"].includes(path)) return;
    for (const [key, expected] of Object.entries(template)) shape((value as Record<string, unknown>)[key], expected, `${path}.${key}`);
  } else if (typeof value !== typeof template) throw new Error(`${path}类型不正确`);
}
export function importDeveloperJson(json: string): GameState {
  if (json.length > 4_000_000) throw new Error("JSON超过4MB，请使用正常存档页导入");
  const raw = JSON.parse(json); jsonValues(raw);
  const s = migrateSave(raw);
  shape(s, createInitialState()); dateValid(s.time);
  if (s.version !== SAVE_VERSION) throw new Error("存档迁移失败");
  for (const n of Object.values(s.player.attrs)) number(n, 0, 999);
  for (const n of Object.values(s.player.stats)) number(n, 0, 999);
  for (const n of Object.values(s.player.skills)) number(n, 0, 10);
  number(s.player.money, -1e9, 1e9);
  for (const n of Object.values(s.inventory)) number(n, 0, 99999, true);
  for (const value of Object.values(s.flags)) if (typeof value !== "boolean" && !(typeof value === "number" && Number.isFinite(value))) throw new Error("剧情标记仅支持布尔值和数值");
  for (const r of s.relationships) { if (!r || typeof r.npcId !== "string" || !["stranger", "acquaintance", "friend", "close_friend", "lover", "blocked"].includes(r.state)) throw new Error("人物关系格式错误"); number(r.affinity, 0, 100); }
  for (const [slot, id] of Object.entries(s.equipped)) if (id !== undefined && (typeof id !== "string" || !getItem(id) || !(s.inventory[id] > 0))) throw new Error(`装备${slot}缺少对应背包物品`);
  if (s.endingId !== null && typeof s.endingId !== "string") throw new Error("结局字段格式错误");
  if (s.career.jobId !== null && !JOB_DEFS.some((j) => j.id === s.career.jobId && j.kind === "formal")) throw new Error("正式职业格式错误");
  if (s.locationId !== "map" && !LOCATIONS.some((l) => l.id === s.locationId)) throw new Error("未知地点");
  if (s.region !== undefined && !getRegion(s.region)) throw new Error("未知区域");
  if (s.locationId !== "map" && !s.region) throw new Error("具体地点缺少所属区域");
  for (const pet of s.pets) { if (!pet || !getCatDef(pet.catId) || typeof pet.uid !== "string" || !pet.care || !pet.attrs) throw new Error("宠物数据格式错误"); number(pet.level, 1, 100, true); }
  for (const q of s.quests) {
    if (!q || typeof q.id !== "string" || !["pending", "active", "done", "failed", "missed"].includes(q.status)) throw new Error("任务记录格式错误");
    if (q.npcTask && (!q.npcTask.data || !["zhao_toy", "xiaoyu_print", "farmer_delivery", "zhao_staff"].includes(q.npcTask.taskId) || !Number.isFinite(q.npcTask.deadlineAt))) throw new Error("NPC任务进度格式错误");
  }
  return s;
}
export function executeDeveloperAction(source: GameState, access: DeveloperAccess, action: DeveloperAction): DeveloperResult {
  if (!access.unlocked || !access.enabled) return { ok: false, message: "请先解锁并在设置中手动开启超级开发者模式" };
  try {
    const s = action.type === "import" ? importDeveloperJson(action.json) : cloneDeveloperState(source);
    let message = "调试修改已应用";
    switch (action.type) {
      case "money": {
        number(action.value, -1e9, 1e9);
        s.player.money = number(Math.round((action.mode === "set" ? action.value : s.player.money + action.value) * 100) / 100, -1e9, 1e9);
        message = `现金已调为${s.player.money}元（调试修改不计入工资）`; break;
      }
      case "player": {
        const { group, key, value } = action;
        if (group === "attrs" && owns(DEVELOPER_ATTRS, key)) s.player.attrs[key as keyof typeof DEVELOPER_ATTRS] = number(value, 0, key === "stamina" ? getMaxStamina(s) : 100);
        else if (group === "stats" && owns(DEVELOPER_STATS, key)) { const base = ensureBaseStats(s); changeGrowthStat(s, key as keyof typeof DEVELOPER_STATS, number(value, 0, 100) - base[key as keyof typeof DEVELOPER_STATS]); }
        else if (group === "skills" && owns(DEVELOPER_SKILLS, key)) s.player.skills[key as SkillKey] = number(value, 0, 10);
        else if (group === "other" && key === "debt") s.player.debt = number(value, 0, 1e9);
        else if (group === "other" && key === "stress") s.player.stress = number(value, 0, 100);
        else throw new Error("未知的玩家属性");
        break;
      }
      case "recover": case "revive":
        Object.assign(s.player.attrs, { stamina: getMaxStamina(s), health: 100, mood: 100, hygiene: 100, satiety: 100 });
        s.player.stress = 0; s.statuses = [];
        for (const key of ["lowMoodStreak", "hungryStreak", "depressionStreak", "criticalHealthStreak", "negativeMoneyStreak"] as const) s.player[key] = 0;
        if (action.type === "revive") { s.endingId = null; delete s.flags.fate_settled; }
        message = action.type === "revive" ? "已清除本局结局并恢复状态；已写入个人档案的记录保留" : "五项状态已恢复，压力和异常状态已清除"; break;
      case "cancelActivity":
        if (s.work) delete s.work.active; if (s.fishing) { s.fishing.active = null; s.fishing.pendingCatch = null; } if (s.districtLeisure) s.districtLeisure.active = null;
        message = "进行中的工作、钓鱼和休闲已取消，不补发未结算奖励"; break;
      case "item": {
        const quantity = action.mode === "set" ? action.quantity : (s.inventory[action.id] ?? 0) + action.quantity;
        setItem(s, action.id, quantity); message = `${getItem(action.id)?.name ?? action.id}数量已设为${quantity}`; break;
      }
      case "itemBatch": {
        number(action.quantity, 1, 999, true);
        const items = ITEMS.filter((i) => developerItemMatchesCategory(i,action.group));
        if (!items.length) throw new Error("这个分类没有物品");
        for (const i of items) setItem(s, i.id, Math.min(99999, (s.inventory[i.id] ?? 0) + action.quantity));
        message = `已为${items.length}种物品各增加${action.quantity}件`; break;
      }
      case "npc": meet(s, action.id, action.affinity, action.relation, action.met); break;
      case "npcAll": for (const def of allNpcs()) meet(s, def.id, action.affinity); message = "已认识所有正式NPC并调整好感"; break;
      case "introductions": s.flags[INTRO_FIRST_COMPLETE] = true; s.flags[INTRO_SECOND_COMPLETE] = true; message = "泊月三人介绍事件已标记完成，可按正常日程出现"; break;
      case "resetChats": {
        let count = 0;
        for (const key of Object.keys(s.flags)) if (/^npc_(chat_day|chat_count|greet_day|greeting_day|dialogue_day)_/.test(key) && (!action.id || key.endsWith(action.id))) { delete s.flags[key]; count++; }
        message = `已清除${count}项NPC日常对话标记；任务记录保留`; break;
      }
      case "advance": idle(s); advanceHours(s, number(action.minutes, 1, 30 * 1440, true) / 60); tickNpcTasks(s); message = "已按正常引擎推进时间并处理日结与任务期限"; break;
      case "date": idle(s); dateValid(action); Object.assign(s.time, { year: action.year, month: action.month, day: action.day, hour: action.hour, minute: action.minute, stayedUp: false }); tickNpcTasks(s); message = "已直接定位日期并检查NPC任务期限；未模拟沿途日结"; break;
      case "teleport": idle(s); teleport(s, action.locationId, action.regionId); message = "已移动至指定地点（不消耗时间）"; break;
      case "findNpc": {
        idle(s); if (!allNpcs().some((npc) => npc.id === action.id)) throw new Error("未知人物");
        const now = linearDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute;
        let found = false;
        for (let offset = 0; offset <= (action.next ? 7 * 1440 : 0); offset += 15) {
          const minute = now + offset, date = fromLinearDay(Math.floor(minute / 1440));
          const t = { ...date, hour: Math.floor(minute % 1440 / 60), minute: minute % 60, weekday: weekdayOf(date), seed: s.rng.seed };
          const presence = npcPresenceAt(action.id, t);
          if (!presence) continue;
          const regionId = presence.regionId ?? LOCATIONS.find((l) => l.id === presence.locationId)?.regions?.[0];
          if (!regionId) continue;
          Object.assign(s.time, date, { hour: t.hour, minute: t.minute }); teleport(s, presence.locationId, regionId); tickNpcTasks(s); found = true; break;
        }
        if (!found) throw new Error(action.next ? "未来一周未查到该人物的在场日程" : "该人物当前不在任何可见地点");
        message = "已按人物实际排班定位；介绍事件、相识等条件仍需满足"; break;
      }
      case "routes": for (const r of REGIONS) if (r.unlockFlag) s.flags[r.unlockFlag] = true; message = "已解锁有通行标记的路线；日期开放条件仍按当前日期判断"; break;
      case "task": idle(s); message = prepareDeveloperTask(s, action.id, action.preset); tickNpcTasks(s); break;
      case "taskDeadline": {
        const q = s.quests.find((q) => q.npcTask?.taskId === action.id && q.status === "active");
        if (!q?.npcTask) throw new Error("没有进行中的这项任务");
        q.npcTask.deadlineAt = gameDay(s.time) * 1440 + s.time.hour * 60 + s.time.minute + number(action.hours, 1, 8760) * 60; q.npcTask.revision++;
        message = "已延长总期限；鲜货的装货与签收时段仍有效"; break;
      }
      case "flag": {
        if (!/^[A-Za-z0-9_:.\-]{1,160}$/.test(action.key) || ["__proto__", "constructor", "prototype"].includes(action.key)) throw new Error("标记名只支持字母、数字、下划线、点、冒号和短横线");
        if (action.value === null) delete s.flags[action.key];
        else { if (typeof action.value !== "boolean") number(action.value, -1e12, 1e12); s.flags[action.key] = action.value; }
        message = `标记${action.key}已${action.value === null ? "删除" : "更新"}`; break;
      }
      case "weather":
        if (!["sunny", "cloudy", "rain", "snow", "heatwave", "coldwave"].includes(action.id)) throw new Error("未知天气");
        s.weather = { id: action.id, lastRollDay: gameDay(s.time) }; break;
      case "vehicle":
        if (!owns(VEHICLE_NAMES, action.id)) throw new Error("未知载具");
        s.flags[`item_${action.id}`] = action.owned;
        if (action.owned) { const { year, month, day } = s.time; s.vehicles[action.id] = { year, month, day, owned: true }; }
        else { delete s.vehicles[action.id]; delete s.inventory[action.id]; }
        message = "已调整载具所有权，不办理押金退款"; break;
      case "membership": {
        const def = owns(MEMBERSHIPS, action.id) ? MEMBERSHIPS[action.id] : undefined; if (!def) throw new Error("未知会籍");
        const days = number(action.days, 0, 3600, true); s.flags[def.flag] = days > 0;
        if (days) { s.memberships[action.id] = fromLinearDay(linearDay(s.time) + days); s.inventory[def.itemId] = 1; }
        else { delete s.memberships[action.id]; delete s.inventory[def.itemId]; }
        message = days ? `会籍有效期已设为${days}天` : "会籍已移除"; break;
      }
      case "job": {
        idle(s);
        if (action.id === null) { const result = resignJob(s); if (!result.ok) throw new Error(result.text); message = result.text; }
        else {
          const job = JOB_DEFS.find((j) => j.id === action.id && j.kind === "formal");
          if (!job) throw new Error("请选择正式岗位");
          const result = hireJob(s, { ...job, requirements: undefined }, true);
          if (!result.ok) throw new Error(result.reason ?? "调试入职失败");
          message = `已调试入职${job.name}，排班与发薪仍按正式合同执行`;
        }
        break;
      }
      case "cat": if (!adoptCat(s, action.id)) throw new Error("此猫咪不能收养"); message = "猫咪已加入，获得正式宠物状态与初始卡包"; break;
      case "catLevel": {
        const pet = s.pets.find((p) => p.uid === action.uid), def = pet && getCatDef(pet.catId);
        if (!pet || !def) throw new Error("没有找到这只猫");
        pet.level = number(action.level, 1, 100, true); pet.exp = 0; pet.attrs = computeCatAttrs(def, pet.level, pet.personality, pet.trainBonus); pet.care = { satiety: 100, mood: 100, hygiene: 100 }; break;
      }
      case "import": message = "已导入完整游戏状态；开发者开关不随存档改变"; break;
      default: throw new Error("未知调试操作");
    }
    refreshGrowthStats(s);
    pushLog(s, "🛠️", `超级开发者：${message}`);
    return { ok: true, state: s, message };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "调试修改失败" }; }
}
