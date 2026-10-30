/** 战斗界面安全区诊断 */
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
await page.waitForTimeout(400);
await page.locator("button").filter({ hasText: "返回" }).first().click();
await page.waitForTimeout(600);
await page.locator("button").filter({ hasText: "喵喵对决" }).first().click();
await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const ov = document.querySelector(".overlay.hud-scope");
  const cs = ov ? getComputedStyle(ov) : null;
  const rootStyle = getComputedStyle(document.documentElement);
  return {
    overlayClass: ov?.className,
    padding: cs ? cs.padding : null,
    boxSizing: cs ? cs.boxSizing : null,
    sai: { top: rootStyle.getPropertyValue("--sai-top"), right: rootStyle.getPropertyValue("--sai-right"), bottom: rootStyle.getPropertyValue("--sai-bottom"), left: rootStyle.getPropertyValue("--sai-left") },
    env: { top: rootStyle.getPropertyValue("--sai-top-debug") ?? null },
    battleRect: (() => { const b = document.querySelector(".battle"); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })(),
    hudClose: (() => { const h = document.querySelector(".hud-close"); if (!h) return null; const r = h.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })(),
    injectedStyle: [...document.querySelectorAll("style")].some((s) => s.textContent.includes("--sai-left:59px")),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
