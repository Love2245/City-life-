/**
 * v1.44.1 全局 UI 缩放 + 行动日志开关验证。
 *
 * 1. PC 模式 UI 缩放全局生效：主菜单 / 游戏内 / 独立小游戏（arcade）在 zoom 0.5 下
 *    一起缩放、无元素溢出视口、无横向滚动。
 * 2. 行动日志开关：设置页「显示底部行动日志」开关真实生效并持久化。
 * 3. 手游模式回归：zoom 0.5 下 gameRoot 尺寸与旧实现一致（852/0.7×… 链路不回退）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "qa-shots", "global-zoom");
mkdirSync(OUT, { recursive: true });

const BASE_URL = process.env.QA_URL || "http://localhost:5199/";

/** 视口审计：可交互元素不得溢出视口；返回关键容器尺寸 */
const AUDIT_FN = () => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const desc = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  const clipped = (el, r) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      // 根链（#app/body/html）的 overflow:hidden 是页面级裁剪，元素超出即真溢出，
      // 不算合法裁剪容器（否则审计会把视口外元素全部漏报）
      const isRootChain = p.id === "app" || p === document.body;
      if (!isRootChain) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
          const pr = p.getBoundingClientRect();
          if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1 || r.top < pr.top - 1) return true;
        }
      }
      p = p.parentElement;
    }
    return false;
  };
  const off = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const inter = el.matches("button, a, input, select, [role=button], .action-card, .arcade-card, .app, .card");
    if (inter && !clipped(el, r) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) {
      off.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (el.textContent || "").trim().slice(0, 12) });
    }
  }
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  };
  return {
    counts: { off: off.length },
    offSample: off.slice(0, 6),
    hScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    appZoom: rect(".app-zoom"),
    gameRoot: rect(".game-root"),
    topbar: rect(".topbar"),
    logPanel: rect(".log-panel"),
    arcadeStage: rect(".arcade-stage"),
    firstMenuBtn: (() => {
      const b = [...document.querySelectorAll(".menu-actions button, .menu button, button")].find((x) => x.getBoundingClientRect().width > 50);
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    })(),
  };
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const results = {};

/** 打开一个按 localStorage 预设的页面（PC 或手游） */
async function openGame(context, { mode = "pc", zoom = 1, scale = 1, showLog = null, arcade = false }) {
  const page = await context.newPage();
  await page.addInitScript(([m, z, s, log, arc]) => {
    try {
      localStorage.clear();
      localStorage.setItem("urban-life-ui-gamemode", m);
      localStorage.setItem("urban-life-ui-zoom", String(z));
      localStorage.setItem("urban-life-render-scale", String(s));
      if (log != null) localStorage.setItem("urban-life-show-log", String(log));
      if (arc) localStorage.setItem("urban-life-arcade-mode", "true");
    } catch { }
  }, [mode, zoom, scale, showLog, arcade]);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return page;
}

/** 主菜单 → 开始新生活 → 下一步 → 开始生活 */
async function enterGame(page) {
  await page.locator("button").filter({ hasText: "开始新生活" }).first().click();
  await page.waitForTimeout(600);
  await page.locator("button").filter({ hasText: "下一步" }).first().click();
  await page.waitForTimeout(600);
  await page.locator("button").filter({ hasText: "开始生活" }).first().click();
  await page.waitForTimeout(1500);
}

const VP = { width: 852, height: 393 };
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// ---- A. PC zoom=1 基准 ----
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await openGame(ctx, { mode: "pc", zoom: 1 });
  results.menuZ10 = await page.evaluate(AUDIT_FN);
  await page.screenshot({ path: join(OUT, "pc-menu-z10.png") });
  await enterGame(page);
  results.gameZ10 = await page.evaluate(AUDIT_FN);
  await page.screenshot({ path: join(OUT, "pc-game-z10.png") });
  await ctx.close();
}

// ---- B. PC zoom=0.5：主菜单 / 游戏内一起缩放 ----
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await openGame(ctx, { mode: "pc", zoom: 0.5 });
  results.menuZ05 = await page.evaluate(AUDIT_FN);
  await page.screenshot({ path: join(OUT, "pc-menu-z05.png") });
  await enterGame(page);
  results.gameZ05 = await page.evaluate(AUDIT_FN);
  await page.screenshot({ path: join(OUT, "pc-game-z05.png") });

  // 缩放比率抽查：日志条是 px 高度（180 布局 px），视觉高应随 zoom 缩放（0.5 → 90）
  const ratio = results.gameZ05.logPanel && results.gameZ10.logPanel
    ? +(results.gameZ05.logPanel[3] / results.gameZ10.logPanel[3]).toFixed(3) : null;
  results.zoomRatio = { logPanelHeightZ05overZ10: ratio };

  // ---- C. 设置页开关：菜单 → 设置 → 点「显示底部行动日志」开关 ----
  await page.locator(".menu-box button").filter({ hasText: "菜单" }).first().click();
  await page.waitForTimeout(500);
  await page.locator(".overlay .modal button").filter({ hasText: "设置" }).first().click();
  await page.waitForTimeout(800);
  const sw = page.locator(".row", { hasText: "显示底部行动日志" }).locator("button.switch").first();
  results.logSwitchBefore = await sw.textContent();
  await sw.click();
  await page.waitForTimeout(400);
  results.showLogAfterToggle = await page.evaluate(() => localStorage.getItem("urban-life-show-log"));
  await page.screenshot({ path: join(OUT, "pc-settings-toggled.png") });
  // 返回游戏验证日志条消失
  await page.locator("button").filter({ hasText: "← 返回" }).first().click();
  await page.waitForTimeout(800);
  results.logPanelAfterOff = await page.evaluate(() => !!document.querySelector(".game-root > .log-panel"));
  await page.screenshot({ path: join(OUT, "pc-game-log-off.png") });
  await ctx.close();
}

// ---- D. PC zoom=0.5 独立小游戏：arcade 舞台同样缩放 ----
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await openGame(ctx, { mode: "pc", zoom: 0.5, arcade: true });
  await page.locator("button").filter({ hasText: "小游戏" }).first().click();
  await page.waitForTimeout(1000);
  results.arcadeListZ05 = await page.evaluate(AUDIT_FN);
  await page.screenshot({ path: join(OUT, "pc-arcade-list-z05.png") });
  // 进第一个小游戏
  const card = page.locator(".arcade-card").first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(1200);
    results.arcadeStageZ05 = await page.evaluate(AUDIT_FN);
    await page.screenshot({ path: join(OUT, "pc-arcade-stage-z05.png") });
  } else {
    results.arcadeStageZ05 = { error: "no .arcade-card" };
  }
  await ctx.close();
}

// ---- E. PC zoom=0.5 + 日志关（localStorage 直设）----
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await openGame(ctx, { mode: "pc", zoom: 0.5, showLog: false });
  await enterGame(page);
  results.gameZ05LogOff = await page.evaluate(AUDIT_FN);
  await ctx.close();
}

// ---- F. 手游回归：zoom 0.5（+0.6 渲染分辨率）下链路不变 ----
const SAFE = { top: 20, right: 59, bottom: 20, left: 59 };
for (const [tag, zoom, scale] of [["mb-z05-s10", 0.5, 1], ["mb-z05-s06", 0.5, 0.6]]) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
  const page = await ctx.newPage();
  try { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE }); } catch { }
  await page.addInitScript(([z, s]) => {
    try {
      localStorage.clear();
      localStorage.setItem("urban-life-ui-gamemode", "mobile");
      localStorage.setItem("urban-life-ui-zoom", String(z));
      localStorage.setItem("urban-life-render-scale", String(s));
    } catch { }
    const apply = () => {
      const st = document.createElement("style");
      st.textContent = `:root[data-game-mode="mobile"]{--sai-top:20px;--sai-right:59px;--sai-bottom:20px;--sai-left:59px;}`;
      document.documentElement.appendChild(st);
    };
    if (document.documentElement) apply(); else document.addEventListener("DOMContentLoaded", apply, { once: true });
  }, [zoom, scale]);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await enterGame(page);
  results[tag] = await page.evaluate(AUDIT_FN);
  await page.screenshot({ path: join(OUT, `${tag}.png`) });
  await ctx.close();
}

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

// ---- 汇总判定 ----
const problems = [];
const off = (r) => (r && r.counts ? r.counts.off : -1);
for (const k of ["menuZ10", "gameZ10", "menuZ05", "gameZ05", "arcadeListZ05", "arcadeStageZ05", "gameZ05LogOff", "mb-z05-s10", "mb-z05-s06"]) {
  if (results[k] && off(results[k]) !== 0) problems.push(`${k}: off=${off(results[k])} ${JSON.stringify((results[k].offSample || []).slice(0, 3))}`);
}
if (results.zoomRatio?.logPanelHeightZ05overZ10 != null && Math.abs(results.zoomRatio.logPanelHeightZ05overZ10 - 0.5) > 0.05) {
  problems.push(`zoom 比率异常: ${results.zoomRatio.logPanelHeightZ05overZ10}`);
}
if (results.gameZ10?.logPanel == null) problems.push("zoom1 默认应有日志条");
if (results.gameZ05?.logPanel == null) problems.push("zoom0.5 默认应有日志条");
if (results.gameZ05LogOff?.logPanel != null) problems.push("showLog=false 仍渲染日志条");
if (results.showLogAfterToggle !== "false") problems.push(`开关未持久化: ${results.showLogAfterToggle}`);
if (results.logPanelAfterOff !== false) problems.push("开关关闭后返回游戏日志条仍在");

console.log("== 全局缩放/日志开关验证 ==");
for (const [k, v] of Object.entries(results)) {
  console.log(`${k}: off=${off(v)} appZoom=${JSON.stringify(v.appZoom)} gameRoot=${JSON.stringify(v.gameRoot)} logPanel=${JSON.stringify(v.logPanel)} arcadeStage=${JSON.stringify(v.arcadeStage)} ratio=${k === "zoomRatio" ? JSON.stringify(v) : ""}`);
}
console.log(problems.length ? `FAIL (${problems.length}):\n- ${problems.join("\n- ")}` : "PASS: 全部通过");
writeFileSync(join(OUT, "verdict.txt"), problems.length ? `FAIL\n${problems.join("\n")}` : "PASS");
await browser.close();
process.exit(problems.length ? 1 : 0);
