/**
 * iPhone 15 Pro 横屏（852×393，DPR 3）真机规格仿真 QA：
 * 走真实流程——设置页开启手游模式 → 开新档 → 实际游玩若干动作 → 布局审计。
 *
 * iPhone 15 Pro 真值：物理 1179×2556，DPR 3，逻辑竖屏 393×852 → 横屏 852×393。
 * 横屏安全区 insets：top 20 / right 59 / bottom 20 / left 59（灵动岛/圆角与手势条让位）。
 *
 * 用法：node scripts/qa-iphone15pro.mjs --url http://127.0.0.1:5199/ --tag i15pro
 * 产物：qa-shots/<tag>/*.png + qa-shots/<tag>/audit.json
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
const TAG = argOf("tag", "iphone15pro");
const URL_BASE = argOf("url", "http://127.0.0.1:5199/");
const OUT = join(ROOT, "qa-shots", TAG);
mkdirSync(OUT, { recursive: true });

const DEVICE = {
  viewport: { width: 852, height: 393 }, // iPhone 15 Pro 横屏逻辑分辨率
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
const SAFE_AREA = { top: 20, right: 59, bottom: 20, left: 59 };

const CHROME_EXE = process.env.QA_CHROME || null;

/** 布局审计：横向溢出 / 越界 / 触控目标 / 安全区侵占 / 关键栅格 */
const AUDIT_FN = (safeArea) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safe = { left: safeArea.left, right: vw - safeArea.right, top: safeArea.top, bottom: vh - safeArea.bottom };
  const desc = (el) => {
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls}`;
  };
  const clippedByAncestor = (el, r) => {
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
  const offscreen = [];
  const tiny = [];
  const sub44 = [];
  const safeVio = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const interactive = el.matches("button, a, input, select, [role=button], .action-card, .app, .card, .crumb, .loc-chip, .district");
    if (interactive && !clippedByAncestor(el, r) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) {
      offscreen.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (el.textContent || "").trim().slice(0, 16) });
    }
    if (interactive) {
      const h = Math.round(r.height), w = Math.round(r.width);
      if (h < 32 || w < 20) tiny.push({ el: desc(el), w, h, text: (el.textContent || "").trim().slice(0, 16) });
      else if (h < 44) sub44.push({ el: desc(el), w, h, text: (el.textContent || "").trim().slice(0, 16) });
    }
    if (interactive || el.matches(".money-box,.clock,h1,h2,h3")) {
      const bad = r.left < safe.left - 1 || r.right > safe.right + 1 || r.top < safe.top - 1 || r.bottom > safe.bottom + 1;
      if (bad && r.width > 6 && r.height > 6 && !clippedByAncestor(el, r)) {
        safeVio.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
      }
    }
  }
  const cols = {};
  for (const sel of [".main", ".sidebar", ".scene", ".quest-side", ".phone-host", ".phone", ".topbar", ".game-root"]) {
    const el = document.querySelector(sel);
    if (el) { const r = el.getBoundingClientRect(); cols[sel] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }
  }
  // 中央场景与右栏手机的重叠检测（中央游玩画面不得被遮挡）
  const scene = document.querySelector(".scene")?.getBoundingClientRect();
  const phoneEl = document.querySelector(".quest-side .phone")?.getBoundingClientRect();
  const overlap = scene && phoneEl ? Math.max(0, Math.min(scene.right, phoneEl.right) - Math.max(scene.left, phoneEl.left)) : 0;
  return {
    viewport: { vw, vh }, safeArea,
    docOverflowX: document.documentElement.scrollWidth - vw,
    gridColumns: cols,
    scenePhoneOverlapPx: Math.round(overlap),
    counts: { offscreen: offscreen.length, tiny: tiny.length, sub44: sub44.length, safeArea: safeVio.length },
    offscreenSample: offscreen.slice(0, 12), tinySample: tiny.slice(0, 8), sub44Sample: sub44.slice(0, 8), safeVioSample: safeVio.slice(0, 12),
  };
};

const browser = await chromium.launch({ headless: true, ...(CHROME_EXE ? { executablePath: CHROME_EXE } : {}) });
const context = await browser.newContext(DEVICE);
const page = await context.newPage();
let cdpSafeArea = "unsupported";
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE_AREA });
  cdpSafeArea = "cdp";
} catch { cdpSafeArea = "css-var-fallback"; }

// 干净环境：不预置任何 localStorage —— 手游模式必须由设置页真实点击开启
await page.addInitScript(() => { localStorage.clear(); });

const errors = [];
page.on("pageerror", (e) => errors.push({ kind: "pageerror", msg: String(e).slice(0, 300) }));

async function clickFirst(locator, timeout = 8000) {
  try { await locator.first().waitFor({ state: "visible", timeout }); } catch { return false; }
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i);
    try { if (!(await el.isVisible())) continue; await el.click({ timeout: 4000 }); return true; } catch { }
  }
  return false;
}
async function shot(name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}
async function audit(name) {
  let a = null;
  try { a = await page.evaluate(AUDIT_FN, SAFE_AREA); } catch (e) { a = { error: String(e) }; }
  results[name] = a;
}

const results = {};
const flow = [];

async function step(name, fn) {
  try { await fn(); flow.push({ name, ok: true }); }
  catch (e) {
    flow.push({ name, ok: false, error: String(e).slice(0, 200) });
    try { await page.screenshot({ path: join(OUT, `${name}-ERROR.png`) }); } catch { }
  }
}

/* 1. 主菜单 */
await step("01-menu", async () => {
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot("01-menu"); await audit("01-menu");
});

/* 2. 设置页开启手游模式（真实点击） */
await step("02-settings-enable-mobile", async () => {
  if (!(await clickFirst(page.locator("button").filter({ hasText: "设置" }), 6000))) throw new Error("找不到设置入口");
  await page.waitForTimeout(800);
  await shot("02a-settings-before");
  if (!(await clickFirst(page.locator("button").filter({ hasText: "手游模式" }), 6000))) throw new Error("找不到手游模式按钮");
  await page.waitForTimeout(500);
  const mode = await page.evaluate(() => document.documentElement.dataset.gameMode ?? localStorage.getItem("urban-life-ui-gamemode"));
  if (mode !== "mobile") throw new Error(`手游模式未生效：${mode}`);
  await shot("02b-settings-after");
  if (!(await clickFirst(page.locator("button").filter({ hasText: "返回" }), 6000))) throw new Error("找不到返回按钮");
  await page.waitForTimeout(800);
});

/* 3. 开新档：开始新生活 → 下一步 → 开始生活 */
await step("03-new-game", async () => {
  if (!(await clickFirst(page.locator("button").filter({ hasText: "开始新生活" }), 8000))) throw new Error("找不到开始新生活");
  await page.waitForTimeout(900);
  await shot("03a-setup");
  if (!(await clickFirst(page.locator("button").filter({ hasText: "下一步" }), 8000))) throw new Error("找不到下一步");
  await page.waitForTimeout(900);
  await shot("03b-confirm");
  if (!(await clickFirst(page.locator("button").filter({ hasText: "开始生活" }), 8000))) throw new Error("找不到开始生活");
  await page.waitForTimeout(2200);
  await shot("03c-home"); await audit("03c-home");
});

/* 4. 实际游玩：洗澡 → 吃泡面 → 在家锻炼 → 睡觉到早上 */
await step("04-play-actions", async () => {
  for (const label of ["洗澡", "吃泡面", "在家锻炼"]) {
    if (await clickFirst(page.locator(".action-card, button").filter({ hasText: label }), 4000)) {
      await page.waitForTimeout(1500);
      await page.keyboard.press("Escape").catch(() => { });
      await page.waitForTimeout(600);
    }
  }
  await shot("04-after-actions"); await audit("04-after-actions");
});

/* 5. 右栏手机面板交互：点开一个 App（通信）→ 收起 → 把手展开 */
await step("05-phone-panel-toggle", async () => {
  // 打开手机内 App：右栏 panel 内点「通信」
  if (!(await clickFirst(page.locator(".quest-side .app").filter({ hasText: "通信" }), 5000))) throw new Error("右栏手机找不到通信 App");
  await page.waitForTimeout(1200);
  await shot("05a-phone-app"); await audit("05a-phone-app");
  // 返回主屏（dock 第一个按钮通常是主屏）
  await clickFirst(page.locator(".quest-side .p-dock button").first(), 3000);
  await page.waitForTimeout(600);
  // 收起手机：面板右上角电源键（onClose）
  if (!(await clickFirst(page.locator(".quest-side .p-top button"), 4000))) throw new Error("找不到手机收起按钮");
  await page.waitForTimeout(900);
  await shot("05b-phone-collapsed"); await audit("05b-phone-collapsed");
  const collapsed = await page.evaluate(() => {
    const qs = document.querySelector(".quest-side");
    return { cls: qs?.className, w: Math.round(qs?.getBoundingClientRect().width ?? -1), handle: !!qs?.querySelector(".mobile-handle") };
  });
  results["05b-collapsed-state"] = collapsed;
  // 点击把手重新展开
  if (!(await clickFirst(page.locator(".quest-side .mobile-handle"), 4000))) throw new Error("收起后找不到展开把手");
  await page.waitForTimeout(900);
  await shot("05c-phone-reexpanded");
  const host = await page.evaluate(() => {
    const h = document.querySelector(".quest-side .phone-host");
    return { w: Math.round(h?.getBoundingClientRect().width ?? -1), hh: Math.round(h?.getBoundingClientRect().height ?? -1) };
  });
  if (!host.w || host.hh < 100) throw new Error(`展开后手机容器异常：${JSON.stringify(host)}`);
});

/* 6. 出门 → 地图态：中央画布应独占，手机/侧栏不渲染 */
await step("06-map-mode", async () => {
  if (!(await clickFirst(page.locator("button").filter({ hasText: /出门|回主地图/ }), 6000))) throw new Error("找不到出门入口");
  await page.waitForTimeout(1800);
  await shot("06a-map"); await audit("06a-map");
});

/* 7. 地图选点 → 回到地点，三栏恢复 */
await step("07-back-to-location", async () => {
  const ok = await clickFirst(page.locator(".district, .loc-chip, button").filter({ hasText: /住宅区|老城区/ }), 6000);
  if (ok) { await page.waitForTimeout(1200); }
  await clickFirst(page.locator("button").filter({ hasText: /回家|宿舍|住处|政府免费宿舍/ }), 5000);
  await page.waitForTimeout(1500);
  await shot("07-location"); await audit("07-location");
});

/* 8. 顶栏全屏手机弹窗（横屏面板） */
await step("08-fullscreen-phone", async () => {
  if (!(await clickFirst(page.locator(".topbar .phone-btn").first(), 5000))) throw new Error("找不到顶栏手机按钮");
  await page.waitForTimeout(1200);
  await shot("08-fullscreen-phone"); await audit("08-fullscreen-phone");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
});

writeFileSync(join(OUT, "audit.json"), JSON.stringify({ tag: TAG, device: DEVICE, safeArea: SAFE_AREA, cdpSafeArea, flow, results, errors }, null, 2));

for (const f of flow) console.log(`${f.ok ? "✓" : "✗"} ${f.name}${f.ok ? "" : " — " + f.error}`);
for (const [k, a] of Object.entries(results)) {
  if (!a || !a.counts) continue;
  console.log(`[${k}] ovX=${a.docOverflowX} off=${a.counts.offscreen} tiny=${a.counts.tiny} sub44=${a.counts.sub44} safe=${a.counts.safeArea} overlap=${a.scenePhoneOverlapPx}`);
  if (a.gridColumns) console.log(`   cols: ${JSON.stringify(a.gridColumns)}`);
}
if (errors.length) { console.log(`⚠ 页面错误 ${errors.length}`); for (const e of errors.slice(0, 8)) console.log(`  [${e.kind}] ${e.msg.replace(/\s+/g, " ").slice(0, 160)}`); }
await browser.close();
console.log(`\n[qa] tag=${TAG} out=${OUT}`);
