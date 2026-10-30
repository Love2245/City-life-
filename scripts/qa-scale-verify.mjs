/** 缩放/分辨率旋钮验证 @852×393：ui-zoom 0.7/1.3 与 render-scale 0.6 下的布局与安全区 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "qa-shots", "scale-verify");
mkdirSync(OUT, { recursive: true });

const SAFE = { top: 20, right: 59, bottom: 20, left: 59 };

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
  const off = [], safeVio = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const inter = el.matches("button, a, input, select, [role=button], .action-card, .app, .card, .crumb, .loc-chip, .district, .atlas-crumb, .wait-chip");
    if (inter && !clipped(el, r) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) {
      off.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (el.textContent || "").trim().slice(0, 12) });
    }
    if ((inter || el.matches(".money-box,.clock")) && !clipped(el, r)) {
      if (r.left < safe.left - 1 || r.right > safe.right + 1 || r.top < safe.top - 1 || r.bottom > safe.bottom + 1) {
        safeVio.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
      }
    }
  }
  const wrapper = document.querySelector(".zoom-wrapper")?.getBoundingClientRect();
  const root = document.querySelector(".game-root")?.getBoundingClientRect();
  return {
    wrapper: wrapper ? [Math.round(wrapper.width), Math.round(wrapper.height)] : null,
    gameRoot: root ? [Math.round(root.width), Math.round(root.height)] : null,
    counts: { off: off.length, safe: safeVio.length },
    offSample: off.slice(0, 5), safeSample: safeVio.slice(0, 5),
  };
};

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const results = {};

for (const [tag, zoom, scale] of [["z10-s10", 1, 1], ["z13-s10", 1.3, 1], ["z07-s10", 0.7, 1], ["z05-s10", 0.5, 1], ["z10-s06", 1, 0.6], ["z13-s06", 1.3, 0.6], ["z05-s06", 0.5, 0.6]]) {
  const context = await browser.newContext({
    viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const page = await context.newPage();
  try { const cdp = await context.newCDPSession(page); await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE }); } catch { }
  await page.addInitScript(([z, s]) => {
    try {
      localStorage.clear();
      localStorage.setItem("urban-life-ui-gamemode", "mobile");
      localStorage.setItem("urban-life-ui-zoom", String(z));
      localStorage.setItem("urban-life-render-scale", String(s));
    } catch { }
    const apply = () => {
      const st = document.createElement("style");
      st.textContent = `:root[data-game-mode="mobile"]{--sai-top:20px;--sai-right:59px;--sai-bottom:20px;--sai-left:59px;}`;
      document.documentElement.appendChild(st);
    };
    if (document.documentElement) apply(); else document.addEventListener("DOMContentLoaded", apply, { once: true });
  }, [zoom, scale]);

  await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator("button").filter({ hasText: "开始新生活" }).first().click();
  await page.waitForTimeout(700);
  await page.locator("button").filter({ hasText: "下一步" }).first().click();
  await page.waitForTimeout(700);
  await page.locator("button").filter({ hasText: "开始生活" }).first().click();
  await page.waitForTimeout(2000);

  const r = await page.evaluate(AUDIT_FN, SAFE);
  results[tag] = r;
  await page.screenshot({ path: join(OUT, `${tag}.png`) });
  console.log(`${tag}: wrapper=${JSON.stringify(r.wrapper)} gameRoot=${JSON.stringify(r.gameRoot)} off=${r.counts.off} safe=${r.counts.safe}${r.counts.off ? " " + JSON.stringify(r.offSample) : ""}${r.counts.safe ? " " + JSON.stringify(r.safeSample) : ""}`);
  await context.close();
}

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
await browser.close();
console.log(`[scale-verify] out=${OUT}`);
