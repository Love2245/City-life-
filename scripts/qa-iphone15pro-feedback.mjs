/** 手游反馈 7 项修复的 852×393 实测：默认收起右栏 / 平板手机 / 地图缩放与工具条 / 象棋 / 收银 / chip 居中 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "qa-shots", "iphone15pro-feedback");
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
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

async function clickFirst(locator, timeout = 7000) {
  try { await locator.first().waitFor({ state: "visible", timeout }); } catch { return false; }
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) { const el = locator.nth(i); try { if (!(await el.isVisible())) continue; await el.click({ timeout: 3500 }); return true; } catch { } }
  return false;
}
const results = {};
async function snap(name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}
async function evalJson(fn) { try { return await page.evaluate(fn); } catch (e) { return { error: String(e) }; } }
async function step(name, fn) {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { console.log(`✗ ${name} — ${String(e).slice(0, 180)}`); try { await page.screenshot({ path: join(OUT, `${name}-ERROR.png`) }); } catch { } }
}

/* 进入游戏（手游模式） */
await step("boot", async () => {
  await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await clickFirst(page.locator("button").filter({ hasText: "设置" }));
  await page.waitForTimeout(600);
  await clickFirst(page.locator("button").filter({ hasText: "手游模式" }));
  await page.waitForTimeout(400);
  if ((await page.evaluate(() => document.documentElement.dataset.gameMode)) !== "mobile") throw new Error("手游模式未生效");
  await clickFirst(page.locator("button").filter({ hasText: "返回" }));
  await page.waitForTimeout(600);
  await clickFirst(page.locator("button").filter({ hasText: "开始新生活" }));
  await page.waitForTimeout(800);
  await clickFirst(page.locator("button").filter({ hasText: "下一步" }));
  await page.waitForTimeout(800);
  await clickFirst(page.locator("button").filter({ hasText: "开始生活" }));
  await page.waitForTimeout(2200);
});

/* P2a：右栏默认收起，中央更宽 */
await step("p2-default-collapsed", async () => {
  const r = await evalJson(() => {
    const $ = (s) => document.querySelector(s);
    const g = (s) => { const b = $(s)?.getBoundingClientRect(); return b ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : null; };
    return { questSide: g(".quest-side"), scene: g(".scene"), collapsed: !!$(".quest-side.collapsed"), handle: !!$(".quest-side .mobile-handle") };
  });
  results.p2 = r;
  if (!r.collapsed) throw new Error("手游下右栏未默认收起");
  await snap("p2-home-collapsed");
});

/* P2c：顶栏 📱 打开平板式全屏手机 */
await step("p2-tablet-phone", async () => {
  if (!(await clickFirst(page.locator(".topbar .phone-btn").first(), 5000))) throw new Error("顶栏无手机按钮");
  await page.waitForTimeout(1100);
  results.p2c = await evalJson(() => {
    const b = document.querySelector(".overlay .phone:not(.panel)")?.getBoundingClientRect();
    return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null;
  });
  await snap("p2c-tablet-phone");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
});

/* P1/P3/P4：出门 → 地图：等待条消失、工具条紧凑、可缩到 50% 且居中 */
await step("p3-map-zoom", async () => {
  if (!(await clickFirst(page.locator("button").filter({ hasText: /出门|回主地图/ }), 6000))) throw new Error("找不到出门");
  await page.waitForTimeout(1600);
  const waitBar = await page.evaluate(() => { const el = document.querySelector(".atlas-wait"); return el ? getComputedStyle(el).display : "absent"; });
  results.p1_waitBarDisplay = waitBar;
  // 缩到下限
  for (let i = 0; i < 6; i++) { await clickFirst(page.locator(".zoom-button[aria-label='缩小地图']"), 1500); await page.waitForTimeout(120); }
  results.p3 = await evalJson(() => {
    const vp = document.querySelector(".map-viewport")?.getBoundingClientRect();
    const b = document.querySelector(".map-board")?.getBoundingClientRect();
    const zv = document.querySelector(".zoom-value")?.textContent?.trim();
    return vp && b ? { viewport: [Math.round(vp.width), Math.round(vp.height)], board: [Math.round(b.width), Math.round(b.height)], fits: b.width <= vp.width + 2 && b.height <= vp.height + 2, centeredX: Math.abs((b.left + b.right) / 2 - (vp.left + vp.right) / 2) < 4, zoom: zv } : null;
  });
  await snap("p3-map-min-zoom");
  // 恢复 100%
  await clickFirst(page.locator(".zoom-reset"), 2000);
  await page.waitForTimeout(300);
});

/* P5：城市 → 市区 → 住宅区 → 街心公园 → 下象棋 */
await step("p5-chess", async () => {
  await clickFirst(page.locator(".map-pin").filter({ hasText: "市区" }), 5000);
  await page.waitForTimeout(1400);
  await clickFirst(page.locator(".map-pin").filter({ hasText: "住宅区" }), 5000);
  await page.waitForTimeout(1400);
  // 标牌可能被右上工具条遮挡：先常规点，失败则点标牌左下角可见区域
  const parkPin = page.locator(".map-pin").filter({ hasText: "街心公园" });
  let ok = await clickFirst(parkPin, 5000);
  if (!ok) {
    try { await parkPin.first().click({ position: { x: 12, y: 34 }, timeout: 4000 }); ok = true; } catch { }
  }
  if (!ok) throw new Error("找不到街心公园");
  await page.waitForTimeout(1500);
  if (!(await clickFirst(page.locator(".action-card, button").filter({ hasText: "下象棋" }), 6000))) throw new Error("找不到下象棋入口");
  await page.waitForTimeout(2200);
  results.p5 = await evalJson(() => {
    const b = document.querySelector(".mg-card .board")?.getBoundingClientRect();
    const card = document.querySelector(".mg-card")?.getBoundingClientRect();
    const disc = document.querySelector(".mg-card .disc");
    return b && card ? { board: [Math.round(b.width), Math.round(b.height)], card: [Math.round(card.width), Math.round(card.height)], fillsHeight: b.height > card.height * 0.55, discFont: disc ? getComputedStyle(disc).fontSize : null } : null;
  });
  await snap("p5-chess");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
});

/* P6：住宅区便利店 → 打工 → 职板抢活 → checkout 小游戏 */
await step("p6-checkout", async () => {
  // 从街心公园场景回到住宅区地图（面包屑/导航里的「住宅区」）
  // 先清掉可能残留的结算/弹窗浮层（Escape 后 chess 会出结算面板）
  for (let i = 0; i < 4; i++) {
    const hasOverlay = await page.evaluate(() => !!document.querySelector(".overlay")).catch(() => false);
    if (!hasOverlay) break;
    const closed = await clickFirst(page.locator(".overlay button").filter({ hasText: /确定|确认|关闭|继续|收下|跳过|知道了/ }), 2500);
    if (!closed) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
    await page.waitForTimeout(400);
  }
  await snap("p60-back-to-map");
  // checkout（收银找零）入口在劳务市场职板：回市区 → 劳务市场 → 抢活
  const crumbCity = page.locator(".crumb").filter({ hasText: "市区" });
  if (!(await clickFirst(crumbCity, 5000))) throw new Error("找不到市区面包屑");
  await page.waitForTimeout(1400);
  await snap("p6-pre-pin");
  // 劳务市场在工业区：用「地点列表」直达（标牌在小屏互相遮挡）
  if (!(await clickFirst(page.locator(".list-toggle"), 4000))) throw new Error("找不到地点列表按钮");
  await page.waitForTimeout(500);
  const listTexts = await page.evaluate(() => [...document.querySelectorAll(".list-item")].map((b) => b.textContent?.trim().slice(0, 24)));
  console.log("p6 list:", JSON.stringify(listTexts));
  if (!(await clickFirst(page.locator(".list-item").filter({ hasText: "工业园" }), 5000))) throw new Error("列表里找不到工业园");
  await page.waitForTimeout(1200);
  // 进入园区后列表会收起，改点标牌
  if (!(await clickFirst(page.locator(".map-pin").filter({ hasText: "劳务市场" }), 6000))) throw new Error("找不到劳务市场标牌");
  await page.waitForTimeout(1500);
  await snap("p6a-jobboard");
  await page.evaluate(() => { document.querySelectorAll(".scene-body, .scene, main").forEach((el) => { el.scrollTop = el.scrollHeight; }); }).catch(() => { });
  await page.waitForTimeout(400);
  // 定向抢「便利店日结」（岗位按天随机；没有就重开一局再找，最多 3 局）
  let grabbed = false;
  for (let attempt = 0; attempt < 6 && !grabbed; attempt++) {
    const convCard = page.locator(".job-card").filter({ hasText: "便利店日结" });
    try {
      await convCard.first().waitFor({ state: "visible", timeout: 5000 });
      await convCard.first().scrollIntoViewIfNeeded();
      await convCard.first().getByRole("button", { name: "抢活" }).click({ timeout: 4000 });
      grabbed = true;
      console.log("p6: 便利店日结已接下");
      break;
    } catch {
      console.log(`p6: 第${attempt + 1}局未刷出便利店日结，重开`);
      await snap(`p6-retry-${attempt + 1}`);
    }
    // 重开一局刷新岗位
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    for (let k = 0; k < 4; k++) {
      const hasOverlay = await page.evaluate(() => !!document.querySelector(".overlay")).catch(() => false);
      if (!hasOverlay) break;
      const closed = await clickFirst(page.locator(".overlay button").filter({ hasText: /确定|确认|关闭|继续|收下|跳过|知道了/ }), 2500);
      if (!closed) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
      await page.waitForTimeout(300);
    }
    if (!(await clickFirst(page.locator(".topbar .menu-box > .btn:last-child, .topbar button[aria-label*='设置'], .topbar button:has-text('⚙')"), 4000))) {
      // 兜底：直接刷新页面重进（手游模式存于 localStorage）
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await clickFirst(page.locator("button").filter({ hasText: "开始新生活" }), 8000);
      await page.waitForTimeout(800);
      await clickFirst(page.locator("button").filter({ hasText: "下一步" }), 6000);
      await page.waitForTimeout(800);
      await clickFirst(page.locator("button").filter({ hasText: "开始生活" }), 6000);
      await page.waitForTimeout(2200);
    } else {
      await clickFirst(page.locator("button").filter({ hasText: "返回主菜单" }), 5000);
      await page.waitForTimeout(1200);
      await clickFirst(page.locator("button").filter({ hasText: "开始新生活" }), 6000);
      await page.waitForTimeout(800);
      await clickFirst(page.locator("button").filter({ hasText: "下一步" }), 6000);
      await page.waitForTimeout(800);
      await clickFirst(page.locator("button").filter({ hasText: "开始生活" }), 6000);
      await page.waitForTimeout(2200);
    }
    // 回劳务市场
    if (!(await clickFirst(page.locator("button").filter({ hasText: /出门|回主地图/ }), 6000))) continue;
    await page.waitForTimeout(1500);
    await clickFirst(page.locator(".map-pin").filter({ hasText: "市区" }), 5000);
    await page.waitForTimeout(1400);
    await clickFirst(page.locator(".list-toggle"), 4000);
    await page.waitForTimeout(500);
    await clickFirst(page.locator(".list-item").filter({ hasText: "工业园" }), 5000);
    await page.waitForTimeout(1200);
    await clickFirst(page.locator(".map-pin").filter({ hasText: "劳务市场" }), 6000);
    await page.waitForTimeout(1500);
  }
  // 抢活 = 接下任务（9:00 到岗）。等时间到位后去便利店上班 → 弹收银小游戏
  if (grabbed) {
    await page.waitForTimeout(800);
    // 手游下等待条默认收起：先点「⏳ 等待」展开，再等 1 小时到 9 点后
    await clickFirst(page.locator(".mobile-wait-toggle"), 4000);
    await page.waitForTimeout(400);
    await clickFirst(page.locator(".wait-btn").filter({ hasText: /1 小时|1小时/ }), 4000);
    await page.waitForTimeout(2000);
    for (let k = 0; k < 3; k++) {
      const hasOverlay = await page.evaluate(() => !!document.querySelector(".overlay")).catch(() => false);
      if (!hasOverlay) break;
      const closed = await clickFirst(page.locator(".overlay button").filter({ hasText: /确定|确认|关闭|继续|收下|跳过|知道了/ }), 2500);
      if (!closed) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
      await page.waitForTimeout(300);
    }
    // 劳务市场（工业园）→ 市区 → 住宅区 → 便利店
    await clickFirst(page.locator(".crumb").filter({ hasText: "市区" }), 5000);
    await page.waitForTimeout(1400);
    await clickFirst(page.locator(".list-toggle"), 4000);
    await page.waitForTimeout(500);
    await clickFirst(page.locator(".list-item").filter({ hasText: "住宅区" }), 5000);
    await page.waitForTimeout(1400);
    await clickFirst(page.locator(".map-pin").filter({ hasText: "便利店" }), 6000);
    await page.waitForTimeout(1500);
    await snap("p6b-store-work");
    await clickFirst(page.locator(".action-card, button").filter({ hasText: /上班|打卡|开始工作|上岗/ }), 5000);
    await page.waitForTimeout(3000);
  }
  results.p6 = await evalJson(() => {
    const cg = document.querySelector(".cg")?.getBoundingClientRect();
    const key = document.querySelector(".cg-key")?.getBoundingClientRect();
    return cg ? { cg: [Math.round(cg.width), Math.round(cg.height)], keyH: key ? Math.round(key.height) : null } : null;
  });
  await snap("p6c-checkout");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
});

writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify(results, null, 1).slice(0, 1600));
if (errors.length) console.log(`⚠ 页面错误 ${errors.length}: ${errors.slice(0, 4).join(" | ")}`);
await browser.close();
