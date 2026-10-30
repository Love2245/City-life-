/** 第二轮反馈验证 @852×393：地图缩放110-160/单行工具条/等待集成侧栏/睡觉弹窗一屏/全部小游戏一屏体检 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "qa-shots", "iphone15pro-round2");
mkdirSync(OUT, { recursive: true });

const DEVICE = {
  viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
const SAFE = { top: 20, right: 59, bottom: 20, left: 59 };

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const context = await browser.newContext(DEVICE);
const page = await context.newPage();
try { const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE }); } catch { }
await page.addInitScript(() => { try { localStorage.clear(); } catch { } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

async function clickFirst(locator, timeout = 7000) {
  try { await locator.first().waitFor({ state: "visible", timeout }); } catch { return false; }
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) { const el = locator.nth(i); try { if (!(await el.isVisible())) continue; await el.click({ timeout: 3500 }); return true; } catch { } }
  return false;
}
const results = {};
async function snap(name) { await page.waitForTimeout(400); await page.screenshot({ path: join(OUT, `${name}.png`) }); }
async function evalJson(fn) { try { return await page.evaluate(fn); } catch (e) { return { error: String(e) }; } }
async function step(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name} — ${String(e).slice(0, 160)}`); try { await page.screenshot({ path: join(OUT, `${name}-ERROR.png`) }); } catch { } }
}
async function clearOverlays() {
  for (let k = 0; k < 4; k++) {
    const has = await page.evaluate(() => !!document.querySelector(".overlay")).catch(() => false);
    if (!has) break;
    const closed = await clickFirst(page.locator(".overlay button").filter({ hasText: /确定|确认|关闭|继续|收下|跳过|知道了/ }), 2000);
    if (!closed) { await page.keyboard.press("Escape"); await page.waitForTimeout(350); }
    await page.waitForTimeout(250);
  }
}

/* boot：手游 + 独立小游戏模式 */
await step("boot", async () => {
  await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await clickFirst(page.locator("button").filter({ hasText: "设置" }));
  await page.waitForTimeout(600);
  await clickFirst(page.locator("button").filter({ hasText: "手游模式" }));
  await page.waitForTimeout(300);
  const sw = page.locator(".row").filter({ hasText: "独立小游戏模式" }).locator("button.switch");
  if (!(await sw.first().isVisible().catch(() => false))) throw new Error("找不到独立小游戏开关");
  const wasOn = (await sw.first().textContent())?.includes("开");
  if (!wasOn) await sw.first().click({ timeout: 3000 });
  await page.waitForTimeout(300);
  const mode = await page.evaluate(() => ({ m: document.documentElement.dataset.gameMode, a: localStorage.getItem("urban-life-arcade-mode") }));
  results.boot = mode;
  await clickFirst(page.locator("button").filter({ hasText: "返回" }));
  await page.waitForTimeout(600);
});

/* 全部小游戏一屏体检（arcade） */
await step("arcade-sweep", async () => {
  if (!(await clickFirst(page.locator("button").filter({ hasText: /小游戏/ }), 6000))) throw new Error("主菜单找不到小游戏入口");
  await page.waitForTimeout(1200);
  const cards = page.locator(".arcade-card");
  const total = await cards.count();
  const report = [];
  for (let i = 0; i < total; i++) {
    const name = (await cards.nth(i).locator(".arcade-card-name").textContent().catch(() => ""))?.trim() ?? `#${i}`;
    try {
      await cards.nth(i).click({ timeout: 3500 });
      await page.waitForTimeout(1500);
      const m = await evalJson(() => {
        const stage = document.querySelector(".arcade-stage");
        if (!stage) return null;
        const inner = stage.querySelector(":scope > *");
        const shrunk = [...stage.querySelectorAll("*")].some((el) => el.scrollHeight - el.clientHeight > 6 && getComputedStyle(el).overflowY === "auto" && el.clientHeight > 40);
        return {
          stage: [Math.round(stage.clientWidth), Math.round(stage.clientHeight)],
          innerH: inner ? Math.round(inner.scrollHeight) : null,
          stageScrolls: stage.scrollHeight - stage.clientHeight > 6,
          innerScrolls: !!inner && inner.scrollHeight - inner.clientHeight > 6,
          anyAutoScroll: shrunk,
        };
      });
      const bad = m && (m.stageScrolls || m.innerScrolls);
      report.push({ name, ...m, bad });
      if (bad) await page.screenshot({ path: join(OUT, `arcade-BAD-${String(i).padStart(2, "0")}-${name}.png`).replace(/[:?|"*]/g, "") });
      await clickFirst(page.locator("button").filter({ hasText: "返回列表" }), 4000);
      await page.waitForTimeout(500);
    } catch (e) {
      report.push({ name, error: String(e).slice(0, 100) });
      await clickFirst(page.locator("button").filter({ hasText: "返回列表" }), 3000).catch(() => { });
    }
  }
  results.arcade = report;
  const badOnes = report.filter((r) => r.bad || r.error);
  console.log(`arcade: ${report.length} 款，异常 ${badOnes.length}`);
  for (const b of badOnes) console.log(`  ✗ ${b.name}: ${b.error ?? `stage=${b.stage} innerH=${b.innerH}`}`);
  await snap("arcade-list");
});

/* 新档：主界面/地图/睡觉 验证 */
await step("ingame", async () => {
  await clickFirst(page.locator("button").filter({ hasText: "← 主菜单" }), 4000);
  await page.waitForTimeout(600);
  if (!(await clickFirst(page.locator("button").filter({ hasText: "开始新生活" }), 6000))) throw new Error("找不到开始新生活");
  await page.waitForTimeout(800);
  if (!(await clickFirst(page.locator("button").filter({ hasText: "下一步" }), 6000))) throw new Error("找不到下一步");
  await page.waitForTimeout(800);
  if (!(await clickFirst(page.locator("button").filter({ hasText: "开始生活" }), 6000))) throw new Error("找不到开始生活");
  await page.waitForTimeout(2200);
  const inGame = await page.evaluate(() => !!document.querySelector(".sidebar") && !!document.querySelector(".topbar"));
  if (!inGame) throw new Error("未进入游戏主界面");
});

/* 侧栏等待 + 场景无等待条/悬浮开关 */
await step("sidebar-wait", async () => {
  const r = await evalJson(() => {
    const $ = (s) => document.querySelector(s);
    const chips = [...document.querySelectorAll(".sidebar .wait-chip")].map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height) }));
    return {
      waitSection: !!$(".sidebar .wait-section"),
      chips,
      sceneToggle: !!$(".mobile-wait-toggle"),
      sceneWaitBar: !!$(".scene-body > .wait-bar, .scene .wait-bar"),
    };
  });
  results.sidebarWait = r;
  if (!r.waitSection) throw new Error("侧栏没有等待区");
  if (r.sceneToggle || r.sceneWaitBar) throw new Error("场景里仍有等待 UI 残留");
  await snap("r2-home-sidebar-wait");
  // 点一个等待档位验证功能（等 1 小时）
  const before = await page.evaluate(() => document.querySelector(".topbar .clock-time")?.textContent ?? document.querySelector(".clock-time")?.textContent ?? "");
  await clickFirst(page.locator(".sidebar .wait-chip").filter({ hasText: /1 小时|1小时/ }).last(), 4000);
  await page.waitForTimeout(1800);
  const after = await page.evaluate(() => document.querySelector(".clock-time")?.textContent ?? "");
  results.waitWorks = { before, after, changed: before !== after };
  await snap("r2-after-wait");
});

/* 睡觉弹窗一屏（在家先测，再出门测地图） */
await step("sleep-modal-fit", async () => {
  await clearOverlays();
  if (!(await clickFirst(page.locator(".action-card, button").filter({ hasText: "睡觉" }), 5000))) throw new Error("找不到睡觉卡");
  await page.waitForTimeout(1200);
  const m = await evalJson(() => {
    const modal = document.querySelector(".overlay .modal");
    if (!modal) return null;
    const b = modal.getBoundingClientRect();
    return { h: Math.round(b.height), vh: window.innerHeight, fits: b.bottom <= window.innerHeight - 12 && b.top >= 12, scrolls: modal.scrollHeight - modal.clientHeight > 4 };
  });
  results.sleepModal = m;
  if (!m?.fits) throw new Error(`睡觉弹窗未一屏放下：${JSON.stringify(m)}`);
  await snap("r2-sleep-fit");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
});

/* 地图：等待行消失 + 缩放 110-160 + 工具条单行 */
await step("map-zoom-tools", async () => {
  await clearOverlays();
  if (!(await clickFirst(page.locator("button").filter({ hasText: /出门|回主地图/ }), 6000))) throw new Error("找不到出门按钮");
  await page.waitForTimeout(1800);
  const onMap = await page.evaluate(() => !!document.querySelector(".atlas-tools"));
  if (!onMap) throw new Error("出门后不在地图（无 atlas-tools）");
  const r = await evalJson(() => {
    const tools = document.querySelector(".atlas-tools")?.getBoundingClientRect();
    const rows = [...(document.querySelector(".atlas-tools")?.children ?? [])].map((c) => Math.round(c.getBoundingClientRect().top));
    const distictTops = new Set(rows.filter((t) => t > 0));
    const zv = document.querySelector(".zoom-value")?.textContent?.trim();
    const minusDisabled = document.querySelector(".zoom-button")?.disabled;
    const waitBar = !!document.querySelector(".wait-bar");
    const vp = document.querySelector(".map-viewport")?.getBoundingClientRect();
    const board = document.querySelector(".map-board")?.getBoundingClientRect();
    return { toolsH: tools ? Math.round(tools.height) : null, rowTops: [...distictTops].sort((a, b) => a - b), zoom: zv, minusDisabled, waitBar, vp: vp ? [Math.round(vp.width), Math.round(vp.height)] : null, board: board ? [Math.round(board.width), Math.round(board.height)] : null };
  });
  results.map = r;
  // 缩到最小再放大到最大验证范围
  for (let i = 0; i < 8; i++) await clickFirst(page.locator(".zoom-button[aria-label='缩小地图']"), 1200), await page.waitForTimeout(80);
  const minZoom = await page.evaluate(() => document.querySelector(".zoom-value")?.textContent?.trim());
  for (let i = 0; i < 8; i++) await clickFirst(page.locator(".zoom-button[aria-label='放大地图']"), 1200), await page.waitForTimeout(80);
  const maxZoom = await page.evaluate(() => document.querySelector(".zoom-value")?.textContent?.trim());
  results.map.zoomRange = { start: r.zoom, minZoom, maxZoom };
  await snap("r2-map");
});

/* 睡觉弹窗一屏 */
await step("sleep-modal-fit", async () => {
  // 回家：面包屑 住宅区 → 家 pin
  await clickFirst(page.locator(".city-atlas-navigation button, .crumb").filter({ hasText: "住宅区" }), 5000);
  await page.waitForTimeout(1200);
  await clickFirst(page.locator(".map-pin").filter({ hasText: /住宅|住宿|家/ }).first(), 5000);
  await page.waitForTimeout(1500);
  if (!(await clickFirst(page.locator(".action-card, button").filter({ hasText: "睡觉" }), 5000))) throw new Error("找不到睡觉卡");
  await page.waitForTimeout(1200);
  const m = await evalJson(() => {
    const modal = document.querySelector(".overlay .modal");
    if (!modal) return null;
    const b = modal.getBoundingClientRect();
    return { h: Math.round(b.height), vh: window.innerHeight, fits: b.bottom <= window.innerHeight - 16 && b.top >= 14, scrolls: modal.scrollHeight - modal.clientHeight > 4 };
  });
  results.sleepModal = m;
  if (!m?.fits) throw new Error(`睡觉弹窗未一屏放下：${JSON.stringify(m)}`);
  await snap("r2-sleep-fit");
  await page.keyboard.press("Escape");
});

writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, errors }, null, 2));
console.log("sidebarWait:", JSON.stringify(results.sidebarWait));
console.log("waitWorks:", JSON.stringify(results.waitWorks));
console.log("map:", JSON.stringify(results.map));
console.log("sleepModal:", JSON.stringify(results.sleepModal));
if (errors.length) console.log(`⚠ 页面错误 ${errors.length}: ${errors.slice(0, 4).join(" | ")}`);
await browser.close();
