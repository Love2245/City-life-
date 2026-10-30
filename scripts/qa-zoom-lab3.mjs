/** 终版链路实验：% 链（app-zoom 100% + view-fade 补偿）在 PC/手游两分支下逐层验证 */
import { pathToFileURL } from "node:url";
const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
const page = await ctx.newPage();
await page.goto("about:blank");
const r = await page.evaluate(() => {
  const out = [];
  const test = (label, Z, RS) => {
    const host = document.body;
    host.style.cssText = "margin:0;width:852px;height:393px;overflow:hidden";
    const appZoom = document.createElement("div");
    appZoom.style.cssText = `zoom:${Z};width:100%;height:100%`;
    const viewFade = document.createElement("div");
    viewFade.style.cssText = `width:calc(100%/${Z});height:calc(100%/${Z})`;
    appZoom.appendChild(viewFade);
    // 手游分支：zoom-wrapper 自带 zoom RS，game-root 按 1/RS 补偿
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `zoom:${RS};width:100%;height:100%`;
    const gameRoot = document.createElement("div");
    gameRoot.style.cssText = `width:calc(100%/${RS});height:calc(100%/${RS});background:green`;
    wrapper.appendChild(gameRoot);
    viewFade.appendChild(wrapper);
    host.appendChild(appZoom);
    const vb = (el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}@(${Math.round(b.left)},${Math.round(b.top)})`; };
    out.push(`${label}  appZoom视觉=${vb(appZoom)} viewFade视觉=${vb(viewFade)} wrapper视觉=${vb(wrapper)} gameRoot视觉=${vb(gameRoot)}`);
    appZoom.remove();
  };
  test("Z=1    RS=1  ", 1, 1);
  test("Z=0.5  RS=1  ", 0.5, 1);
  test("Z=0.7  RS=0.6", 0.7, 0.6);
  test("Z=1.3  RS=1  ", 1.3, 1);
  return out;
});
console.log(r.join("\n"));
await browser.close();
