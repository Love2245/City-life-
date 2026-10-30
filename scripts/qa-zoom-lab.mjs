/** zoom 补偿模型实验：zoom + 百分比宽度在不同 Chrome 下的真实视觉宽度 */
import { pathToFileURL } from "node:url";
const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } });
const page = await ctx.newPage();
await page.goto("about:blank");
const r = await page.evaluate(() => {
  const host = document.body;
  host.style.cssText = "margin:0;width:852px;height:393px;overflow:hidden";
  const mk = (css) => {
    const d = document.createElement("div");
    d.style.cssText = css + ";height:10px;background:red";
    host.appendChild(d);
    const b = d.getBoundingClientRect();
    return { css, visual: Math.round(b.width) };
  };
  return [
    mk("width:100%"),
    mk("zoom:0.5;width:100%"),
    mk("zoom:0.5;width:200%"),
    mk("zoom:0.5;width:calc(100%/0.5)"),
    mk("zoom:2;width:100%"),
    mk("zoom:2;width:50%"),
    mk("zoom:0.5;width:1704px"),
  ];
});
for (const x of r) console.log(`${x.css}  -> 视觉宽 ${x.visual}px`);
await browser.close();
