/**
 * 一次性探针：在 iPhone 17 横屏下打开地图，dump 关键元素的 rect 与计算样式。
 * 用法：node scripts/qa-probe-map.mjs
 */
import { pathToFileURL } from "node:url";
const pwMod = await import(pathToFileURL(process.env.QA_PW).href);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;

const browser = await chromium.launch({ executablePath: process.env.QA_CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 874, height: 402 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Emulation.setSafeAreaInsetsOverride", {
  insets: { top: 20, left: 62, bottom: 20, right: 62 },
});
const fx = (await import("node:fs")).readFileSync("qa-fixtures/base.json", "utf8");
await page.addInitScript(([f]) => {
  localStorage.setItem("urban-life-ui-gamemode", "mobile");
  localStorage.setItem("universal", "");
  localStorage.setItem("urban_life_save_auto", f);
}, [fx]);

await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByText(/继续生活|继续游戏/).first().click();
await page.waitForTimeout(1800);
// 进入地图
const mapBtn = page.locator("button").filter({ hasText: /出门|回主地图/ }).first();
if (await mapBtn.count()) await mapBtn.click();
await page.waitForTimeout(1800);

const out = await page.evaluate(() => {
  const dump = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      sel,
      found: true,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      display: cs.display,
      position: cs.position,
      width: cs.width,
      borderRadius: cs.borderRadius,
      background: cs.backgroundColor,
      justifyContent: cs.justifyContent,
    };
  };
  const sels = [
    ".game-root",
    ".topbar",
    ".map-survival-strip",
    ".map-survival-strip .ms-item",
    ".main",
    ".scene",
    ".sidebar",
    ".quest-side",
    ".stat-bar",
    ".region-view",
  ];
  const found = sels.map(dump);
  // 统计页面上所有「饱食」文本出现在哪些容器里
  const hits = [];
  for (const el of document.querySelectorAll("body *")) {
    const t = (el.textContent || "").trim();
    if (t.startsWith("饱食") && el.children.length <= 3) {
      const r = el.getBoundingClientRect();
      hits.push({
        cls: typeof el.className === "string" ? el.className.slice(0, 60) : "",
        tag: el.tagName,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        text: t.slice(0, 24),
      });
    }
  }
  return { found, satietyHits: hits };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
