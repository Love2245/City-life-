/** 设置页开关底部越界核查：滚动到底后测量 */
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
await page.addInitScript(() => {
  const apply = () => {
    const st = document.createElement("style");
    st.textContent = `:root[data-game-mode="mobile"]{--sai-top:20px;--sai-right:59px;--sai-bottom:20px;--sai-left:59px;}`;
    document.documentElement.appendChild(st);
  };
  if (document.documentElement) apply(); else document.addEventListener("DOMContentLoaded", apply, { once: true });
});
await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.locator("button").filter({ hasText: "设置" }).first().click();
await page.waitForTimeout(600);
await page.locator("button").filter({ hasText: "手游模式" }).first().click();
await page.waitForTimeout(600);
// 把 .page 滚动到底
await page.evaluate(() => { document.querySelectorAll(".page").forEach((el) => (el.scrollTop = el.scrollHeight)); });
await page.waitForTimeout(500);
const r = await page.evaluate(() => {
  const sw = [...document.querySelectorAll("button.switch")].pop();
  const b = sw?.getBoundingClientRect();
  const pageEl = document.querySelector(".page");
  return {
    switchBottom: b ? Math.round(b.bottom) : null,
    vh: window.innerHeight,
    scrolledBottom: pageEl ? Math.abs(pageEl.scrollTop + pageEl.clientHeight - pageEl.scrollHeight) < 3 : null,
    pagePadBottom: pageEl ? getComputedStyle(pageEl).paddingBottom : null,
  };
});
console.log(JSON.stringify(r));
await browser.close();
