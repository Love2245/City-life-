/** 校验发布版单文件 HTML（file://）在 iPhone 15 Pro 横屏下的手游模式右栏手机修复 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = fs.readFileSync(path.join(PROJECT_ROOT, "src/version.ts"), "utf8").match(/export const VERSION\s*=\s*["']([^"']+)["']/)?.[1];
if (!VERSION) throw new Error("无法从 src/version.ts 读取版本号");
const FILE = process.argv[2] || path.join(PROJECT_ROOT, `发布物/都市生活_v${VERSION}.html`);
const url = pathToFileURL(FILE).href;

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const context = await browser.newContext({
  viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
try { const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 20, right: 59, bottom: 20, left: 59 } }); } catch { }
await page.addInitScript(() => { localStorage.clear(); });

console.log("loading release html (290MB) ...");
await page.goto(url, { waitUntil: "load", timeout: 180000 });
await page.waitForTimeout(3000);

async function clickFirst(locator, timeout = 10000) {
  try { await locator.first().waitFor({ state: "visible", timeout }); } catch { return false; }
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) { const el = locator.nth(i); try { if (!(await el.isVisible())) continue; await el.click({ timeout: 4000 }); return true; } catch { } }
  return false;
}

// 设置 → PE 模式（手机） → 返回 → 开始新生活 → 下一步 → 开始生活
await clickFirst(page.locator("button").filter({ hasText: "设置" }));
await page.waitForTimeout(800);
await clickFirst(page.locator("button").filter({ hasText: "PE 模式（手机）" }));
await page.waitForTimeout(500);
const mode = await page.evaluate(() => document.documentElement.dataset.gameMode);
console.log("gameMode =", mode);
await clickFirst(page.locator("button").filter({ hasText: "返回" }));
await page.waitForTimeout(800);
await clickFirst(page.locator("button").filter({ hasText: "开始新生活" }));
await page.waitForTimeout(1000);
await clickFirst(page.locator("button").filter({ hasText: "下一步" }));
await page.waitForTimeout(1000);
await clickFirst(page.locator("button").filter({ hasText: "开始生活" }));
await page.waitForTimeout(2500);

// PE 模式默认收起右侧手机栏；先验证边缘把手存在，再展开验证展开态布局。
const collapsedHandle = page.locator(".quest-side .mobile-handle.visible");
const collapsedHandleVisible = await collapsedHandle.first().isVisible().catch(() => false);
if (collapsedHandleVisible) {
  await collapsedHandle.first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
}

const check = await page.evaluate(() => {
  const $ = (s) => document.querySelector(s);
  const r = (s) => { const el = $(s); if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  return {
    gameMode: document.documentElement.dataset.gameMode,
    cols: { main: r(".main"), sidebar: r(".sidebar"), scene: r(".scene"), questSide: r(".quest-side"), phoneHost: r(".phone-host"), phone: r(".quest-side .phone"), mobileHandle: r(".quest-side .mobile-handle") },
    handleDisplay: $(`.quest-side .mobile-handle`) ? getComputedStyle($(`.quest-side .mobile-handle`)).display : null,
    overlap: (() => { const a = $(".scene")?.getBoundingClientRect(), b = $(".quest-side .phone")?.getBoundingClientRect(); return a && b ? Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))) : -1; })(),
  };
});
console.log(JSON.stringify({ collapsedHandleVisible, ...check }, null, 1));
await page.screenshot({ path: "qa-shots/release-verify.png" });
await browser.close();
const ok = check.gameMode === "mobile"
  && collapsedHandleVisible
  && check.cols?.phone
  && check.cols.phone[2] > 100
  && check.cols.phone[3] > 200
  && check.overlap === 0;
console.log(ok ? "RELEASE VERIFY: PASS ✓" : "RELEASE VERIFY: FAIL ✗");
