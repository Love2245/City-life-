/** 全面自检：手游 852×393 全界面审计 + PC 1600×900 回归 + 运行时错误收集 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "qa-shots", "full-audit");
mkdirSync(OUT, { recursive: true });

const SAFE = { top: 20, right: 59, bottom: 20, left: 59 };
const PC_SAFE = { top: 0, right: 0, bottom: 0, left: 0 };

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
  const off = [], tiny = [], safeVio = [], scrollX = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (el.scrollWidth - el.clientWidth > 4 && el.clientWidth > 0 && !/(auto|scroll|hidden)/.test(cs.overflowX)) {
      scrollX.push({ el: desc(el), d: el.scrollWidth - el.clientWidth });
    }
    const inter = el.matches("button, a, input, select, [role=button], .action-card, .app, .card, .crumb, .loc-chip, .district, .atlas-crumb, .wait-chip");
    if (inter && !clipped(el, r) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) {
      off.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (el.textContent || "").trim().slice(0, 12) });
    }
    if (inter) { const h = Math.round(r.height), w = Math.round(r.width); if (h < 24 || w < 18) tiny.push({ el: desc(el), w, h, text: (el.textContent || "").trim().slice(0, 12) }); }
    if ((inter || el.matches(".money-box,.clock,h1,h2,h3")) && !clipped(el, r)) {
      if (r.left < safe.left - 1 || r.right > safe.right + 1 || r.top < safe.top - 1 || r.bottom > safe.bottom + 1) {
        safeVio.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
      }
    }
  }
  return {
    vw, vh,
    docOverflowX: document.documentElement.scrollWidth - vw,
    counts: { off: off.length, tiny: tiny.length, safe: safeVio.length, scrollX: scrollX.length },
    offSample: off.slice(0, 4), tinySample: tiny.slice(0, 4), safeSample: safeVio.slice(0, 4), scrollXSample: scrollX.slice(0, 4),
  };
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined, args: ["--enable-features=CSSSafeAreaInsets"] });

async function newSession(device, safeArea) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  try { const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: safeArea }); } catch { }
  await page.addInitScript(([s]) => {
    try { localStorage.clear(); } catch { }
    // 兜底：CDP 安全区注入在部分 Chrome 版本不生效，直接写 --sai-* 令牌
    // （选择器与 mobile.css 的 env() 定义同特异性，注入顺序靠后故胜出）
    const apply = () => {
      const st = document.createElement("style");
      st.textContent = `:root[data-game-mode="mobile"]{--sai-top:${s.top}px;--sai-right:${s.right}px;--sai-bottom:${s.bottom}px;--sai-left:${s.left}px;}`;
      document.documentElement.appendChild(st);
    };
    if (document.documentElement) apply();
    else document.addEventListener("DOMContentLoaded", apply, { once: true });
  }, [safeArea]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/favicon|net::|Failed to load resource/i.test(t)) errors.push(t.slice(0, 200)); } });
  return { context, page, errors };
}

const results = {};
let shotIdx = 0;
async function auditPage(page, safeArea) {
  try { return await page.evaluate(AUDIT_FN, safeArea); } catch (e) { return { error: String(e).slice(0, 120) }; }
}
async function auditShot(page, safeArea, name) {
  await page.waitForTimeout(450);
  const a = await auditPage(page, safeArea);
  results[name] = a;
  const bad = a && (a.counts.off > 0 || a.counts.safe > 0 || a.counts.scrollX > 0);
  if (bad || a.error) {
    shotIdx++;
    await page.screenshot({ path: join(OUT, `${String(shotIdx).padStart(2, "0")}-${name.replace(/[^\w-]/g, "")}.png`) });
  }
  const c = a?.counts;
  console.log(`${a?.error ? "✗" : bad ? "⚠" : "✓"} ${name}${c ? ` off=${c.off} tiny=${c.tiny} safe=${c.safe} ovX=${a.docOverflowX} hScroll=${c.scrollX}` : " " + (a?.error ?? "")}`);
  if (bad && c.off) console.log(`   off: ${JSON.stringify(a.offSample)}`);
  if (bad && c.safe) console.log(`   safe: ${JSON.stringify(a.safeSample)}`);
  if (bad && c.scrollX) console.log(`   hScroll: ${JSON.stringify(a.scrollXSample)}`);
}

/* ============ A. 手游 852×393 ============ */
const mCtx = await newSession({
  viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
}, SAFE);
const m = mCtx.page;

async function clickFirst(locator, timeout = 6000) {
  try { await locator.first().waitFor({ state: "visible", timeout }); } catch { return false; }
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) { const el = locator.nth(i); try { if (!(await el.isVisible())) continue; await el.click({ timeout: 3000 }); return true; } catch { } }
  return false;
}
async function clearOverlays(p) {
  for (let k = 0; k < 4; k++) {
    const has = await p.evaluate(() => !!document.querySelector(".overlay")).catch(() => false);
    if (!has) break;
    const closed = await clickFirst(p.locator(".overlay button").filter({ hasText: /确定|确认|关闭|继续|收下|跳过|知道了|返回列表/ }), 1800);
    if (!closed) { await p.keyboard.press("Escape"); await p.waitForTimeout(300); }
    await p.waitForTimeout(200);
  }
}

await m.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await m.waitForTimeout(1200);
await auditShot(m, PC_SAFE, "m-01-menu");

for (const [label, key] of [["存档 / 读档", "m-02-saveload"], ["回忆录", "m-03-memoir"], ["结局图鉴", "m-04-endings"], ["命运", "m-05-fate"]]) {
  // 此时尚为端游模式（手游在设置页才开启），按端游口径（无安全区）审计
  if (await clickFirst(m.locator("button").filter({ hasText: label }), 4000)) {
    await auditShot(m, PC_SAFE, key);
    await clickFirst(m.locator("button").filter({ hasText: /← 返回|返回/ }), 3000);
    await m.waitForTimeout(400);
  } else results[key] = { error: "入口未找到" };
}

if (await clickFirst(m.locator("button").filter({ hasText: "设置" }), 4000)) {
  await auditShot(m, PC_SAFE, "m-06-settings");
  await clickFirst(m.locator("button").filter({ hasText: "手游模式" }), 3000);
  await auditShot(m, SAFE, "m-07-settings-mobile");
  await clickFirst(m.locator("button").filter({ hasText: "返回" }), 3000);
  await m.waitForTimeout(500);
}

await clickFirst(m.locator("button").filter({ hasText: "开始新生活" }), 6000);
await m.waitForTimeout(800);
await auditShot(m, SAFE, "m-08-setup1");
await clickFirst(m.locator("button").filter({ hasText: "下一步" }), 5000);
await m.waitForTimeout(800);
await auditShot(m, SAFE, "m-09-setup2");
await clickFirst(m.locator("button").filter({ hasText: "开始生活" }), 5000);
await m.waitForTimeout(2200);
await auditShot(m, SAFE, "m-10-home");

if (await clickFirst(m.locator(".topbar .phone-btn").first(), 5000)) {
  await m.waitForTimeout(1000);
  await auditShot(m, SAFE, "m-11-phone-main");
  const apps = await m.locator(".overlay .phone:not(.panel) .apps .app").all();
  for (let i = 0; i < apps.length; i++) {
    const name = (await apps[i].textContent().catch(() => ""))?.trim().slice(0, 8) ?? `app${i}`;
    try {
      await apps[i].click({ timeout: 3000 });
      await m.waitForTimeout(1100);
      await auditShot(m, SAFE, `m-12-phone-app-${i}-${name}`);
      await clickFirst(m.locator(".overlay .phone:not(.panel) .p-dock button").first(), 3000);
      await m.waitForTimeout(400);
    } catch (e) { results[`m-12-phone-app-${i}`] = { error: String(e).slice(0, 80) }; }
  }
  await m.keyboard.press("Escape");
  await m.waitForTimeout(500);
}

if (await clickFirst(m.locator(".quest-side .mobile-handle"), 4000)) {
  await m.waitForTimeout(900);
  await auditShot(m, SAFE, "m-13-phone-panel");
  await clickFirst(m.locator(".quest-side .p-top button"), 4000);
  await m.waitForTimeout(600);
}

await m.evaluate(() => { document.querySelectorAll(".scene-body, .scene").forEach((el) => (el.scrollTop = el.scrollHeight)); }).catch(() => { });
await m.waitForTimeout(400);
await auditShot(m, SAFE, "m-14-home-scrolled");

if (await clickFirst(m.locator(".topbar .phone-btn").nth(1), 4000)) { await m.waitForTimeout(900); await auditShot(m, SAFE, "m-15-inventory"); await m.keyboard.press("Escape"); await m.waitForTimeout(400); }
if (await clickFirst(m.locator(".topbar .phone-btn").nth(2), 4000)) { await m.waitForTimeout(900); await auditShot(m, SAFE, "m-16-log"); await m.keyboard.press("Escape"); await m.waitForTimeout(400); }

if (await clickFirst(m.locator(".action-card, button").filter({ hasText: "睡觉" }), 4000)) {
  await m.waitForTimeout(1000);
  await auditShot(m, SAFE, "m-17-sleep");
  await m.keyboard.press("Escape");
  await m.waitForTimeout(400);
}

if (await clickFirst(m.locator(".action-card, button").filter({ hasText: "使用笔记本" }), 4000)) {
  await m.waitForTimeout(1500);
  await auditShot(m, SAFE, "m-18-laptop");
  await clearOverlays(m);
}

if (await clickFirst(m.locator("button").filter({ hasText: /出门|回主地图/ }), 5000)) {
  await m.waitForTimeout(1600);
  await auditShot(m, SAFE, "m-19-map-l1");
  await clickFirst(m.locator(".map-pin, .crumb, button").filter({ hasText: "市区" }).first(), 4000);
  await m.waitForTimeout(1300);
  await auditShot(m, SAFE, "m-20-map-l2");
  await clickFirst(m.locator(".map-pin, .crumb, button").filter({ hasText: "住宅区" }).first(), 4000);
  await m.waitForTimeout(1300);
  await auditShot(m, SAFE, "m-21-map-l3");
  if (await clickFirst(m.locator(".list-toggle"), 4000)) {
    await m.waitForTimeout(500);
    await auditShot(m, SAFE, "m-22-map-list");
    await clickFirst(m.locator(".list-toggle"), 3000);
  }
}

await clickFirst(m.locator(".map-pin").filter({ hasText: "便利店" }), 5000);
await m.waitForTimeout(1400);
if (await clickFirst(m.locator(".npc-row button, .npc-panel button").first(), 4000)) {
  await m.waitForTimeout(1500);
  await auditShot(m, SAFE, "m-23-npc-talk");
  await clearOverlays(m);
} else results["m-23-npc-talk"] = { error: "场景内无 NPC 或入口未找到" };

const mobileErrors = mCtx.errors;

/* ============ B. 喵喵对决（战斗界面） ============ */
await clearOverlays(m);
await clickFirst(m.locator(".topbar .menu-box > .btn:last-child, .topbar button").filter({ hasText: /⚙|设置/ }).last(), 3000).catch(() => { });
await clickFirst(m.locator("button").filter({ hasText: "返回主菜单" }), 4000);
await m.waitForTimeout(1000);
if (await clickFirst(m.locator("button").filter({ hasText: "喵喵对决" }), 5000)) {
  await m.waitForTimeout(1800);
  await auditShot(m, SAFE, "m-24-battle");
}

/* ============ C. PC 端游回归 1600×900 ============ */
const pCtx = await newSession({
  viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
}, PC_SAFE);
const p = pCtx.page;
await p.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await auditShot(p, PC_SAFE, "p-01-menu");
await p.locator("button").filter({ hasText: "开始新生活" }).first().click();
await p.waitForTimeout(800);
await p.locator("button").filter({ hasText: "下一步" }).first().click();
await p.waitForTimeout(800);
await p.locator("button").filter({ hasText: "开始生活" }).first().click();
await p.waitForTimeout(2200);
await auditShot(p, PC_SAFE, "p-02-home");
if (await clickFirst(p.locator("button").filter({ hasText: /出门|回主地图/ }), 5000)) {
  await p.waitForTimeout(1500);
  await auditShot(p, PC_SAFE, "p-03-map");
}
if (await clickFirst(p.locator(".topbar .phone-btn").first(), 4000)) {
  await p.waitForTimeout(1000);
  await auditShot(p, PC_SAFE, "p-04-phone");
}
const pcErrors = pCtx.errors;

/* ============ 汇总 ============ */
const problems = Object.entries(results).filter(([, a]) => a && (a.error || (a.counts && (a.counts.off > 0 || a.counts.safe > 0 || a.counts.scrollX > 0))));
console.log(`\n===== 汇总：${Object.keys(results).length} 屏，问题屏 ${problems.length} =====`);
for (const [k, a] of problems) {
  console.log(`⚠ ${k}: ${a.error ?? `off=${a.counts.off} safe=${a.counts.safe} hScroll=${a.counts.scrollX}`} ${JSON.stringify((a.offSample ?? []).concat(a.safeSample ?? [], a.scrollXSample ?? []).slice(0, 3))}`);
}
console.log(`\n手游运行时错误 ${mobileErrors.length} 条${mobileErrors.length ? ": " + mobileErrors.slice(0, 5).join(" | ") : ""}`);
console.log(`PC 运行时错误 ${pcErrors.length} 条${pcErrors.length ? ": " + pcErrors.slice(0, 5).join(" | ") : ""}`);
writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, mobileErrors, pcErrors }, null, 2));
await mCtx.context.close().catch(() => { });
await pCtx.context.close().catch(() => { });
await browser.close();
console.log(`\n[audit] out=${OUT}`);
