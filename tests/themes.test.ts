/**
 * v1.21-beta UI 皮肤：令牌完整性 + WCAG 2.1 AA 对比度回归测试。
 *
 * 目的：从源码层面锁死「白底白字 / 深影糊字」这类对比度缺陷，
 * 任何一套皮肤改色后若对比度不达标，CI 立即报错。
 *
 * 覆盖 5 套皮肤：
 *   - default（都市夜色）   → 取 app.css 的 :root 基色（皮肤不在此文件，零回归）
 *   - neon / porcelain / morandi / paper → 取 themes.css 的 :root[data-skin="x"] 块
 *
 * 注：测试在 node 环境运行，直接读源文件做静态解析，不依赖浏览器/Svelte 运行时。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");

const themesCss = readFileSync(join(root, "src/styles/themes.css"), "utf8");
const appCss = readFileSync(join(root, "src/styles/app.css"), "utf8");
const uiStore = readFileSync(join(root, "src/stores/uiStore.svelte.ts"), "utf8");

/* ===================== 颜色工具 ===================== */

/** 解析 #rgb / #rrggbb / rgb() / rgba() → [r,g,b]（忽略 alpha，alpha 仅用于叠加混合，不影响对比度下限） */
function parseColor(input: string): [number, number, number] {
  const s = input.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
    return [parts[0], parts[1], parts[2]];
  }
  throw new Error(`无法解析颜色值: ${input}`);
}

/** 相对亮度（WCAG 2.1） */
function relLum([r, g, b]: [number, number, number]): number {
  const a = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/** 两色对比度（≥ 4.5 满足正文 AA，≥ 3.0 满足大字号 / UI 组件 AA） */
function contrastRatio(fg: string, bg: string): number {
  const l1 = relLum(parseColor(fg));
  const l2 = relLum(parseColor(bg));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/* ===================== CSS 变量提取 ===================== */

/** 抽取 :root（default=无属性基色块）或 :root[data-skin="x"] 块内的所有 --var */
function extractRootVars(css: string, selector: string): Record<string, string> {
  const re =
    selector === "default"
      ? /:root\s*\{([^}]*)\}/
      : new RegExp(`:root\\[data-skin="${selector}"\\]\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`找不到 :root${selector === "default" ? "" : `[data-skin="${selector}"]`} 块`);
  const body = m[1];
  const vars: Record<string, string> = {};
  const vre = /--([\w-]+)\s*:\s*([^;]+);/g;
  let vm: RegExpExecArray | null;
  while ((vm = vre.exec(body))) vars["--" + vm[1]] = vm[2].trim();
  return vars;
}

/* ===================== 皮肤清单（以 uiStore 为单一来源） ===================== */

const skinIdLine = uiStore.match(/type SkinId = ([^\n]+)/);
const skinIds: string[] = skinIdLine
  ? [...skinIdLine[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
  : [];
const NON_DEFAULT = skinIds.filter((id) => id !== "default");

/** 每套皮肤都必须具备的关键令牌 */
const REQUIRED = [
  "--bg-deep",
  "--bg-card",
  "--text-main",
  "--accent",
  "--hud-text",
  "--hud-surface-solid",
];

/** WCAG AA 阈值 */
const AA = 4.5;
const AA_LARGE = 3.0;

describe("v1.21-beta UI 皮肤：清单一致性", () => {
  it("SkinId 含 5 套皮肤（default + 4 套新皮肤）", () => {
    expect(skinIds).toContain("default");
    expect(NON_DEFAULT.length).toBe(4);
    expect(new Set(skinIds).size).toBe(5);
  });

  it("themes.css 为每套非 default 皮肤都定义了选择器块", () => {
    for (const id of NON_DEFAULT) {
      expect(themesCss, `themes.css 缺少 [data-skin="${id}"] 选择器`).toContain(`[data-skin="${id}"]`);
    }
  });
});

describe("v1.21-beta UI 皮肤：default（都市夜色 · app.css 基色）", () => {
  const v = extractRootVars(appCss, "default");

  it("必备令牌齐全", () => {
    for (const t of REQUIRED) expect(v[t], `default 缺 ${t}`).toBeDefined();
  });
  it(`正文对比度 ≥ AA（text-main vs bg-card，实测 ${contrastRatio(v["--text-main"], v["--bg-card"]).toFixed(2)}）`, () => {
    expect(contrastRatio(v["--text-main"], v["--bg-card"])).toBeGreaterThanOrEqual(AA);
  });
  it(`辅助文字对比度 ≥ AA（text-dim vs bg-card，实测 ${contrastRatio(v["--text-dim"], v["--bg-card"]).toFixed(2)}）`, () => {
    expect(contrastRatio(v["--text-dim"], v["--bg-card"])).toBeGreaterThanOrEqual(AA);
  });
  it(`HUD 对比度 ≥ AA（hud-text vs hud-surface-solid，实测 ${contrastRatio(v["--hud-text"], v["--hud-surface-solid"]).toFixed(2)}）`, () => {
    expect(contrastRatio(v["--hud-text"], v["--hud-surface-solid"])).toBeGreaterThanOrEqual(AA);
  });
  it(`按钮文字对比度 ≥ 大字号 AA（accent-ink vs accent，实测 ${contrastRatio(v["--accent-ink"], v["--accent"]).toFixed(2)}）`, () => {
    expect(contrastRatio(v["--accent-ink"], v["--accent"])).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

for (const id of NON_DEFAULT) {
  describe(`v1.21-beta UI 皮肤：${id}`, () => {
    const v = extractRootVars(themesCss, id);

    it("必备令牌齐全", () => {
      for (const t of REQUIRED) expect(v[t], `${id} 缺 ${t}`).toBeDefined();
    });
    it(`正文对比度 ≥ AA（text-main vs bg-card，实测 ${contrastRatio(v["--text-main"], v["--bg-card"]).toFixed(2)}）`, () => {
      expect(contrastRatio(v["--text-main"], v["--bg-card"])).toBeGreaterThanOrEqual(AA);
    });
    it(`辅助文字对比度 ≥ AA（text-dim vs bg-card，实测 ${contrastRatio(v["--text-dim"], v["--bg-card"]).toFixed(2)}）`, () => {
      expect(contrastRatio(v["--text-dim"], v["--bg-card"])).toBeGreaterThanOrEqual(AA);
    });
    it(`HUD 对比度 ≥ AA（hud-text vs hud-surface-solid，实测 ${contrastRatio(v["--hud-text"], v["--hud-surface-solid"]).toFixed(2)}）`, () => {
      expect(contrastRatio(v["--hud-text"], v["--hud-surface-solid"])).toBeGreaterThanOrEqual(AA);
    });
    it(`按钮文字对比度 ≥ 大字号 AA（accent-ink vs accent，实测 ${contrastRatio(v["--accent-ink"], v["--accent"]).toFixed(2)}）`, () => {
      expect(contrastRatio(v["--accent-ink"], v["--accent"])).toBeGreaterThanOrEqual(AA_LARGE);
    });
  });
}
