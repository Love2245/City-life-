/** 探针：.app-zoom 的 computed zoom / 尺寸 / --ui-zoom 变量到底生效没有 */
import { pathToFileURL } from "node:url";
const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const BASE_URL = process.env.QA_URL || "http://localhost:5199/";

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
for (const mode of ["pc", "mobile"]) {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(([m]) => {
    try {
      localStorage.clear();
      localStorage.setItem("urban-life-ui-gamemode", m);
      localStorage.setItem("urban-life-ui-zoom", "0.5");
    } catch { }
  }, mode);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const az = document.querySelector(".app-zoom");
    const cs = az ? getComputedStyle(az) : null;
    const rules = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const r of sheet.cssRules) {
          if (r.selectorText && r.selectorText.includes("app-zoom") && r.style && (r.style.zoom || r.style.width)) {
            rules.push(`${r.selectorText} { zoom: ${r.style.zoom}; width: ${r.style.width} }`);
          }
        }
      } catch { }
    }
    return {
      exists: !!az,
      inlineVar: getComputedStyle(document.documentElement).getPropertyValue("--ui-zoom").trim(),
      dataMode: document.documentElement.dataset.gameMode,
      computedZoom: cs ? cs.zoom : null,
      computedWidth: cs ? cs.width : null,
      rect: az ? (r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)])(az.getBoundingClientRect()) : null,
      offsetW: az ? az.offsetWidth : null,
      rules,
      chromeVer: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0],
    };
  });
  console.log(mode, JSON.stringify(info, null, 1));
  await ctx.close();
}
await browser.close();
