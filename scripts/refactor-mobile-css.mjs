/**
 * 一次性重构脚本（非运行时依赖）：
 * 把 app.css 中 7 层相互覆盖的手游补丁块（手游 20:9 / v1.395b~f）整体剥离，
 * 为新的统一手游章节让位。保留 1~531 行（基础 + 端游响应式）与
 * v1.3b2 美化层 / prefers-reduced-motion（非手游专用）。
 *
 * 用法：node scripts/refactor-mobile-css.mjs
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CSS = resolve("src/styles/app.css");
const BAK = resolve("src/styles/app.css.pre-mobile-rework.bak");

if (!existsSync(BAK)) copyFileSync(CSS, BAK);

const src = readFileSync(CSS, "utf8");
const lines = src.split(/\r?\n/);

const find = (needle) => {
  const i = lines.findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`找不到标记：${needle}`);
  return i;
};

// 区间 A：手游 20:9 横屏 → 直到 v1.3b2 美化层之前
const aStart = find("============ 手游 20:9 横屏 ============");
const aEnd = find("============ v1.3b2 UI 美化层");
// 区间 B：v1.395c 起的全部手游补丁 → 文件末尾
const bStart = find("============ v1.395c 手游地图交互画布填充 ============");

if (!(aStart < aEnd && aEnd < bStart)) {
  throw new Error(`标记顺序异常：aStart=${aStart} aEnd=${aEnd} bStart=${bStart}`);
}

const removedA = aEnd - aStart;
const removedB = lines.length - bStart;

const kept = [...lines.slice(0, aStart), ...lines.slice(aEnd, bStart)];
while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();

const banner = [
  "",
  "/* ============================================================",
  "   手游（PE 移动端）横屏适配章节已迁移至文件末尾统一维护，",
  "   原 7 层相互覆盖的补丁块（手游 20:9 / v1.395b~f）已移除。",
  "   搜索 “手游 PE 横屏适配” 定位。",
  "   ============================================================ */",
  "",
];

writeFileSync(CSS, kept.join("\n") + "\n" + banner.join("\n"), "utf8");

console.log(`[refactor] 原始行数      ${lines.length}`);
console.log(`[refactor] 移除区间 A    ${aStart + 1}~${aEnd} (${removedA} 行)`);
console.log(`[refactor] 移除区间 B    ${bStart + 1}~${lines.length} (${removedB} 行)`);
console.log(`[refactor] 保留 + 写入   ${kept.length + banner.length} 行`);
console.log(`[refactor] 备份          ${BAK}`);
