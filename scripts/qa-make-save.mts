/**
 * QA 辅助脚本（非游戏运行时依赖）：
 * 用游戏自身的纯逻辑生成「结构合法」的存档 JSON，供设备仿真截图脚本注入 localStorage。
 * 用法：node_modules/.bin/vite-node scripts/qa-make-save.mts -- <variant> <outFile>
 * variant: base | map | region | facility
 */
import { writeFileSync } from "node:fs";
import { createInitialState } from "../src/game/engine";
import { applyNewGameSetup, emptyProfile } from "../src/game/core/profile";
import { SAVE_VERSION } from "../src/game/core/migrate";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const variant = args[0] ?? "base";
const out = args[1] ?? `qa-fixtures/${variant}.json`;

const s = createInitialState(20260801);
applyNewGameSetup(
  s,
  "ordinary",
  { money: 3, charm: 2, stamina: 3, intelligence: 2, items: 0 },
  [],
  emptyProfile(),
  "normal",
);

if (variant === "map") {
  s.locationId = "map";
}
if (variant === "region") {
  s.locationId = "map";
  // 进入一级地图后由 UI 决定层级；此处仅保证 locationId 为 map 的二级态
}

// 让状态更适合观察布局：中等金钱、有部分背包与状态
s.player.money = 1234;
s.rng = s.rng ?? 1;

// 预置若干行动日志：手游的行动日志改为按需弹层，需要有内容才能验证它真的渲染条目。
// 结构对齐 pushLog：{ icon, day, hour, period, text }
const LOG_SEED: Array<{ icon: string; text: string }> = [
  { icon: "🛏️", text: "在出租屋醒来，睡了个整觉" },
  { icon: "🍜", text: "吃了一碗泡面，饱腹 +18" },
  { icon: "💼", text: "前往便利店应聘店员，等待面试结果" },
  { icon: "🚌", text: "坐地铁从住宅区到工业园区（30 分钟，2 元）" },
  { icon: "💰", text: "今日工资到账 +160 元" },
  { icon: "📖", text: "在图书馆读书 2 小时，智力 +1" },
  { icon: "😴", text: "体力不支，提前回住处休息" },
  { icon: "🧹", text: "洗了个澡，卫生 +25" },
];
s.log = [
  ...LOG_SEED.map((e, i) => ({
    icon: e.icon,
    text: e.text,
    day: s.time.day,
    hour: Math.max(0, s.time.hour - LOG_SEED.length + i),
    period: "morning" as const,
  })),
  ...(s.log ?? []),
];

const payload = { ...s, savedAt: new Date().toISOString() };
if (payload.version !== SAVE_VERSION) {
  throw new Error(`版本不匹配: ${payload.version} != ${SAVE_VERSION}`);
}
writeFileSync(out, JSON.stringify(payload));
console.log(`[qa] wrote ${out} variant=${variant} version=${SAVE_VERSION} locationId=${s.locationId}`);
