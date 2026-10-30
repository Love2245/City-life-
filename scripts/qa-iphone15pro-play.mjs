/**
 * iPhone 15 Pro 横屏（852×393）深度游玩排查：
 * 睡觉跨天 → 次日布局 → 手机内小游戏 / 设置 App → 背包 → 行动日志弹层。
 * 前置：手游模式已通过设置页真实开启（复用 qa-iphone15pro.mjs 的流程）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
if (!chromium) throw new Error("无法从 playwright-core 解析 chromium 导出");

const ROOT = resolve(process.cwd());
const argOf = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const TAG = argOf("tag", "iphone15pro-play");
const URL_BASE = argOf("url", "http://localhost:5199/");
const OUT = join(ROOT, "qa-shots", TAG);
mkdirSync(OUT, { recursive: true });

const DEVICE = {
  viewport: { width: 852, height: 393 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
const SAFE_AREA = { top: 20, right: 59, bottom: 20, left: 59 };

const AUDIT_FN = (safeArea) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const safe = { left: safeArea.left, right: vw - safeArea.right, top: safeArea.top, bottom: vh - safeArea.bottom };
  const desc = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  const clipped = (el, r) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1 || r.top < pr.top - 1) return true;
      }
      p = p.parentElement;
    }
    return false;
  };
  const off = [], tiny = [], safeVio = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const inter = el.matches("button, a, input, select, [role=button], .action-card, .app, .card, .crumb, .loc-chip, .district");
    if (inter && !clipped(el, r) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) off.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (el.textContent || "").trim().slice(0, 14) });
    if (inter) { const h = Math.round(r.height); if (h < 32) tiny.push({ el: desc(el), h, text: (el.textContent || "").trim().slice(0, 14) }); }
    if ((inter || el.matches(".money-box,.clock")) && !clipped(el, r)) {
      if (r.left < safe.left - 1 || r.right > safe.right + 1 || r.top < safe.top - 1 || r.bottom > safe.bottom + 1) safeVio.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
    }
  }
  const scene = document.querySelector(".scene")?.getBoundingClientRect();
  const phone = document.querySelector(".quest-side .phone")?.getBoundingClientRect();
  const overlap = scene && phone ? Math.max(0, Math.min(scene.right, phone.right) - Math.max(scene.left, phone.left)) : 0;
  return { vw, vh, docOverflowX: document.documentElement.scrollWidth - vw, scenePhoneOverlapPx: Math.round(overlap), counts: { off: off.length, tiny: tiny.length, safe: safeVio.length }, offSample: off.slice(0, 10), tinySample: tiny.slice(0, 6), safeSample: safeVio.slice(0, 10) };
};

const browser = await chromium.launch({ headless: true, ...(process.env.QA_CHROME ? { executablePath: process.env.QA_CHROME } : {}) });
const context = await browser.newContext(DEVICE);
const page = await context.newPage();
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE_AREA });
} catch { }
await page.addInitScript(() => { localStorage.clear(); });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

async function clickFirst(locator, timeout = 7000) {
  try { await locator.first().waitFor({ state: "visible", timeout }); } catch { return false; }
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i);
    try { if (!(await el.isVisible())) continue; await el.click({ timeout: 3500 }); return true; } catch { }
  }
  return false;
}
const results = {};
async function snap(name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  try { results[name] = await page.evaluate(AUDIT_FN, SAFE_AREA); } catch (e) { results[name] = { error: String(e) }; }
}
async function step(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name} — ${String(e).slice(0, 160)}`); try { await page.screenshot({ path: join(OUT, `${name}-ERROR.png`) }); } catch { } }
}

/* 进入游戏（设置开手游 → 新档） */
await step("boot", async () => {
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await clickFirst(page.locator("button").filter({ hasText: "设置" }));
  await page.waitForTimeout(600);
  await clickFirst(page.locator("button").filter({ hasText: "手游模式" }));
  await page.waitForTimeout(400);
  const mode = await page.evaluate(() => document.documentElement.dataset.gameMode);
  if (mode !== "mobile") throw new Error("手游模式未生效");
  await clickFirst(page.locator("button").filter({ hasText: "返回" }));
  await page.waitForTimeout(600);
  await clickFirst(page.locator("button").filter({ hasText: "开始新生活" }));
  await page.waitForTimeout(800);
  await clickFirst(page.locator("button").filter({ hasText: "下一步" }));
  await page.waitForTimeout(800);
  await clickFirst(page.locator("button").filter({ hasText: "开始生活" }));
  await page.waitForTimeout(2000);
});

/* 1. 睡觉跨天：睡觉卡 → 弹窗选 8 小时 → 确认 → 次日早晨布局 */
await step("10-sleep-nextday", async () => {
  if (!(await clickFirst(page.locator(".action-card, button").filter({ hasText: "睡觉" }), 6000))) throw new Error("找不到睡觉卡");
  await page.waitForTimeout(1200);
  await snap("10a-sleep-modal");
  if (!(await clickFirst(page.locator("button").filter({ hasText: /8|睡到|入睡|开始睡/ }), 5000))) throw new Error("睡觉弹窗无确认项");
  await page.waitForTimeout(2500);
  await snap("10b-after-sleep");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
});

/* 2. 手机内「游戏」App：小游戏入口 */
await step("11-phone-minigame", async () => {
  if (!(await clickFirst(page.locator(".quest-side .app").filter({ hasText: "游戏" }), 5000))) throw new Error("右栏手机找不到游戏 App");
  await page.waitForTimeout(1200);
  await snap("11a-minigame-list");
  await clickFirst(page.locator(".quest-side button").filter({ hasText: /贪吃蛇|2048|推箱子/ }), 4000);
  await page.waitForTimeout(1200);
  await snap("11b-minigame-open");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await clickFirst(page.locator(".quest-side .p-dock button").first(), 3000);
});

/* 3. 手机内「设置」App：游戏模式切换面板布局 */
await step("12-phone-settings", async () => {
  if (!(await clickFirst(page.locator(".quest-side .app").filter({ hasText: "设置" }), 5000))) throw new Error("右栏手机找不到设置 App");
  await page.waitForTimeout(1000);
  await snap("12-phone-settings");
  await clickFirst(page.locator(".quest-side .p-dock button").first(), 3000);
  await page.waitForTimeout(400);
});

/* 4. 背包弹窗 */
await step("13-inventory", async () => {
  if (!(await clickFirst(page.locator(".topbar .phone-btn").nth(1), 5000))) throw new Error("找不到顶栏背包按钮");
  await page.waitForTimeout(1000);
  await snap("13-inventory");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
});

/* 5. 行动日志全屏弹层 */
await step("14-log-modal", async () => {
  if (!(await clickFirst(page.locator(".topbar .phone-btn").nth(2), 5000))) throw new Error("找不到顶栏日志按钮");
  await page.waitForTimeout(1000);
  await snap("14-log-modal");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
});

/* 6. 顶栏时钟信息展开 */
await step("15-topbar-info", async () => {
  await clickFirst(page.locator(".topbar .clock"), 4000);
  await page.waitForTimeout(800);
  await snap("15-topbar-info");
});

writeFileSync(join(OUT, "audit.json"), JSON.stringify({ tag: TAG, device: DEVICE, results, errors }, null, 2));
for (const [k, a] of Object.entries(results)) {
  if (!a || !a.counts) continue;
  console.log(`[${k}] ovX=${a.docOverflowX} off=${a.counts.off} tiny=${a.counts.tiny} safe=${a.counts.safe} overlap=${a.scenePhoneOverlapPx}${a.counts.off ? " " + JSON.stringify(a.offSample.slice(0, 3)) : ""}${a.counts.tiny ? " tiny:" + JSON.stringify(a.tinySample.slice(0, 3)) : ""}${a.counts.safe ? " safe:" + JSON.stringify(a.safeSample.slice(0, 3)) : ""}`);
}
if (errors.length) console.log(`⚠ 页面错误 ${errors.length}: ${errors.slice(0, 5).join(" | ")}`);
await browser.close();
console.log(`\n[qa] out=${OUT}`);
