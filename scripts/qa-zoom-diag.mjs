/** 地图缩放渲染诊断：对比 110% 与 160% 的 board/image 实际尺寸与截图 */
import { pathToFileURL } from "node:url";
const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const context = await browser.newContext({
  viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
try { const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 20, right: 59, bottom: 20, left: 59 } }); } catch { }
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem("urban-life-ui-gamemode", "mobile"); localStorage.setItem("urban-life-ui-zoom", "1"); } catch { } });

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
// 开新档进游戏
await page.locator("button").filter({ hasText: "开始新生活" }).first().click();
await page.waitForTimeout(800);
await page.locator("button").filter({ hasText: "下一步" }).first().click();
await page.waitForTimeout(800);
await page.locator("button").filter({ hasText: "开始生活" }).first().click();
await page.waitForTimeout(2000);
await page.locator("button").filter({ hasText: /出门|回主地图/ }).first().click();
await page.waitForTimeout(1000);
// 进住宅区 L2
await page.locator(".map-pin, .crumb, button").filter({ hasText: "市区" }).first().click().catch(() => { });
await page.waitForTimeout(1200);
await page.locator(".map-pin, .crumb, button").filter({ hasText: "住宅区" }).first().click().catch(() => { });
await page.waitForTimeout(1500);

async function zoomState(tag) {
  const s = await page.evaluate(() => {
    const vp = document.querySelector(".map-viewport")?.getBoundingClientRect();
    const board = document.querySelector(".map-board")?.getBoundingClientRect();
    const img = document.querySelector(".map-image");
    const ib = img?.getBoundingClientRect();
    const cs = img ? getComputedStyle(img) : null;
    return {
      zoom: document.querySelector(".zoom-value")?.textContent?.trim(),
      vp: vp ? [Math.round(vp.width), Math.round(vp.height)] : null,
      board: board ? [Math.round(board.width), Math.round(board.height)] : null,
      img: ib ? [Math.round(ib.width), Math.round(ib.height)] : null,
      imgStyle: cs ? { w: cs.width, h: cs.height, pos: cs.position, fit: cs.objectFit } : null,
      natural: img ? [img.naturalWidth, img.naturalHeight] : null,
      scroll: (() => { const el = document.querySelector(".map-viewport"); return el ? [Math.round(el.scrollLeft), Math.round(el.scrollTop), el.scrollWidth, el.scrollHeight] : null; })(),
    };
  });
  console.log(tag, JSON.stringify(s));
  await page.screenshot({ path: `qa-shots/zoom-diag-${tag}.png` });
}

await zoomState("110-default");
for (let i = 0; i < 5; i++) { await page.locator(".zoom-button[aria-label='放大地图']").click().catch(() => { }); await page.waitForTimeout(150); }
await zoomState("160-zoomed");
await browser.close();
