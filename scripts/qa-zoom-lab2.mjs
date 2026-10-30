/** zoom 嵌套补偿实验：确定 .app-zoom（vw 补偿）→ .zoom-wrapper（% 补偿）→ .game-root 链路公式 */
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
  const measure = (label, outerCss, innerCss) => {
    const host = document.body;
    host.style.cssText = "margin:0;width:852px;height:393px;overflow:hidden";
    const outer = document.createElement("div");
    outer.style.cssText = outerCss;
    const inner = document.createElement("div");
    inner.style.cssText = innerCss + ";background:blue";
    outer.appendChild(inner);
    host.appendChild(outer);
    const ob = outer.getBoundingClientRect();
    const ib = inner.getBoundingClientRect();
    out.push(`${label}\n    outer: 视觉 ${Math.round(ob.width)}x${Math.round(ob.height)}  inner: 视觉 ${Math.round(ib.width)}x${Math.round(ib.height)} @(${Math.round(ib.left)},${Math.round(ib.top)})`);
    outer.remove();
  };
  // 1. 当前实现（% 补偿在顶层）——复现 bug
  measure("A 顶层%补偿(bug复现): outer zoom.5 w:100%/.5 | inner w:100%",
    "zoom:0.5;width:calc(100%/0.5);height:calc(100%/0.5)", "width:100%;height:20px");
  // 2. 顶层 vw 补偿
  measure("B 顶层vw补偿: outer zoom.5 w:100vw/.5 | inner w:100%",
    "zoom:0.5;width:calc(100vw/0.5);height:calc(100vh/0.5)", "width:100%;height:20px");
  // 3. 嵌套：outer vw 补偿 zoom.5；inner zoom.6 + % 补偿（模拟 zoom-wrapper）
  measure("C app-zoom(vw)+zoom-wrapper(%): inner zoom.6 w:100%/.6 h:20px",
    "zoom:0.5;width:calc(100vw/0.5);height:calc(100vh/0.5)", "zoom:0.6;width:calc(100%/0.6);height:20px");
  // 4. 嵌套第三层 game-root 100%
  measure("D 三层链: +game-root w:100%",
    "zoom:0.5;width:calc(100vw/0.5);height:calc(100vh/0.5)",
    "zoom:0.6;width:calc(100%/0.6);height:calc(100%/0.6);background:green");
  // 5. vh 在 zoom 内的行为
  measure("E vh检查: outer zoom.5 w:100vw/.5 | inner h:100vh",
    "zoom:0.5;width:calc(100vw/0.5);height:calc(100vh/0.5)", "width:100%;height:100vh");
  return out;
});
console.log(r.join("\n"));
await browser.close();
