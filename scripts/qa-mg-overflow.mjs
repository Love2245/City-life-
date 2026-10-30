/**
 * iPhone 15 Pro 横屏（852×393）小游戏 / 喵喵对决 溢出诊断与截图。
 *
 * 用法：
 *   QA_PW=<playwright-core 绝对路径> node scripts/qa-mg-overflow.mjs --tag before
 * 前置：dev server 已在 http://localhost:5199/ 运行（vite 只监听 localhost/IPv6，别用 127.0.0.1）
 * 产物：qa-shots/<tag>/*.png + qa-shots/<tag>/report.json
 *
 * 与既有脚本的差别：除了截图，还 dump 目标元素的**祖先 zoom 链**与 scroll/client 尺寸 ——
 * 「画面被撑出屏幕」这类问题的根因几乎总是祖先 zoom 与反向抵消值不一致，
 * 只看截图看不出是 1.4 倍还是 2 倍。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
if (!chromium) throw new Error("无法解析 playwright-core 的 chromium 导出");

const tag = (() => {
  const i = process.argv.indexOf("--tag");
  return i >= 0 ? process.argv[i + 1] : "mg-overflow";
})();
/** --mode pc：跑端游基线，确认移动端改动没有把桌面布局带坏（本 skill 的硬要求）。 */
const MODE = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "pe";
const ROOT = resolve(process.cwd());
const OUT = join(ROOT, "qa-shots", tag);
mkdirSync(OUT, { recursive: true });

// iPhone 15 Pro：CSS 视口 393 × 852（竖屏），DPR 3，物理 1179 × 2556。
// 横屏 = 852 × 393；动态岛横屏 insets ≈ top 20 / right 59 / bottom 20 / left 59（沿用本仓既有基线值）。
const vpArg = process.argv.includes("--vp") ? process.argv[process.argv.indexOf("--vp") + 1] : null;
const [vpW, vpH] = vpArg ? vpArg.split("x").map(Number) : [852, 393];
const DEVICE = {
  viewport: { width: vpW, height: vpH },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};
// iPhone 15 Pro 安全区随方向变化：横屏是左右 59（灵动岛），竖屏是上 59 / 下 34（手势条）。
// 写死一组会让另一个方向量错 —— 之前只跑横屏所以没暴露。
const SAFE = vpH > vpW
  ? { top: 59, right: 0, bottom: 34, left: 0 }
  : { top: 20, right: 59, bottom: 20, left: 59 };

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.QA_CHROME || undefined,
});
const context = await browser.newContext(DEVICE);
const page = await context.newPage();

// env() 在仿真下不一定生效 → 同时用 CDP 覆盖 + 注入 --sai-* 令牌（项目移动层读的就是令牌）
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE });
} catch {
  /* 老版 Chromium 无此方法，退回令牌注入 */
}
await page.addInitScript(({ mode, top, right, bottom, left }) => {
  try {
    localStorage.clear();
    // 注意：addInitScript 在**每次**导航都会执行，所以每次重载都要重新写全所需状态，
    // 否则第二轮场景会退回默认 PC 模式 —— 那样测出来的布局与目标场景无关。
    localStorage.setItem("urban-life-arcade-mode", "true"); // 解锁主菜单小游戏入口
    localStorage.setItem("urban-life-ui-gamemode", mode);   // pe = 手机预设；pc = 端游基线
    localStorage.setItem("urban-life-ui-zoom", mode === "pe" ? "0.5" : "1");
  } catch { /* ignore */ }
  const apply = () => {
    const st = document.createElement("style");
    const [t, r, b, l] = [top, right, bottom, left];
    if ([t, r, b, l].some((v) => typeof v !== "number")) {
      throw new Error("安全区注入值非法（键名与 SAFE 不匹配会注出 undefinedpx）");
    }
    const decl = `--sai-top:${t}px;--sai-right:${r}px;--sai-bottom:${b}px;--sai-left:${l}px;`;
    st.textContent = `:root{${decl}}:root[data-game-mode="mobile"]{${decl}}`;
    document.documentElement.appendChild(st);
  };
  if (document.documentElement) apply();
  else document.addEventListener("DOMContentLoaded", apply, { once: true });
}, { mode: MODE, ...SAFE });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

async function clickText(text, timeout = 8000) {
  const loc = page.locator("button").filter({ hasText: text }).first();
  try { await loc.waitFor({ state: "visible", timeout }); } catch { return false; }
  await loc.click({ timeout });
  return true;
}

/** 页面内探测：祖先 zoom 链 + 尺寸 + 全页横向溢出 + 越界/触控审计 */
async function probe(selectors) {
  return page.evaluate((sels) => {
    const root = document.documentElement;
    const rs = getComputedStyle(root);
    const zoomChain = (el) => {
      const out = [];
      for (let p = el; p && p !== root.parentElement; p = p.parentElement) {
        const z = getComputedStyle(p).zoom;
        if (z && z !== "1" && z !== "normal") {
          const cls = (p.className || "").toString().trim().split(/\s+/)[0] || "";
          out.push(`${p.tagName.toLowerCase()}${cls ? "." + cls : ""}=${z}`);
        }
      }
      return out;
    };
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        client: [el.clientWidth, el.clientHeight],
        scroll: [el.scrollWidth, el.scrollHeight],
        zoom: getComputedStyle(el).zoom,
        padding: getComputedStyle(el).padding,
        margin: getComputedStyle(el).margin,
        chain: zoomChain(el),
      };
    };

    const vw = window.innerWidth, vh = window.innerHeight;
    const clipped = (el, r) => {
      let p = el.parentElement;
      while (p && p !== root) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
          const pr = p.getBoundingClientRect();
          if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1 || r.top < pr.top - 1) return true;
        }
        p = p.parentElement;
      }
      return false;
    };
    const overflow = [];
    let offViewport = 0, touchSmall = 0, touchSevere = 0;
    const smallTargets = [];
    for (const el of document.querySelectorAll("button,[role='button'],input,a")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1) {
        if (!clipped(el, r)) {
          offViewport += 1;
          if (overflow.length < 8) {
            overflow.push(
              `${el.tagName.toLowerCase()}.${(el.className || "").toString().trim().split(/\s+/)[0]} ` +
              `[${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}]`,
            );
          }
        }
      }
      if (r.height < 44) {
        touchSmall += 1;
        if (r.height < 32) touchSevere += 1;
        if (smallTargets.length < 12) {
          smallTargets.push({
            element: `${el.tagName.toLowerCase()}.${(el.className || "").toString().trim().split(/\s+/)[0]}`,
            text: (el.getAttribute("aria-label") || el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80),
            rect: [r.x, r.y, r.width, r.height].map((value) => Math.round(value * 10) / 10),
          });
        }
      }
    }

    return {
      viewport: [vw, vh],
      docScroll: [root.scrollWidth, root.scrollHeight],
      tokens: {
        uiZoom: rs.getPropertyValue("--ui-zoom").trim(),
        mUiZoom: rs.getPropertyValue("--m-ui-zoom").trim(),
        renderScale: rs.getPropertyValue("--render-scale").trim(),
        effZoom: rs.getPropertyValue("--eff-zoom").trim() || "(未定义)",
        saiTop: rs.getPropertyValue("--sai-top").trim() || "(未定义)",
        saiT: rs.getPropertyValue("--sai-t").trim() || "(未定义)",
        mPad: rs.getPropertyValue("--m-pad").trim() || "(未定义)",
        envTop: (() => {
          const d = document.createElement("div");
          d.style.cssText = "position:absolute;height:env(safe-area-inset-top,0px)";
          document.body.appendChild(d);
          const v = d.getBoundingClientRect().height;
          d.remove();
          return v;
        })(),
      },
      gameMode: root.dataset.gameMode,
      boxes: Object.fromEntries(sels.map((s) => [s, box(s)])),
      audit: { offViewport, touchSmall, touchSevere, samples: overflow, smallTargets },
    };
  }, selectors);
}

const report = { device: DEVICE, safe: SAFE, scenes: {} };
const SELS = [
  ".app-zoom",
  ".overlay",
  ".mg-card",
  ".mg-card.fs",
  ".mg-stage.fs",
  ".mgh-game",
  ".rg-main",
  ".battle",
  ".arena",
  ".combatants",
  ".combatant.player",
  ".combatant.enemy",
  ".hand-zone",
  ".hand",
  ".control-bar",
  ".menu-root",
  ".menu-panel",
  ".menu-panel .title",
  ".menu-panel .subtitle",
  ".menu-btns",
];

await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// 进入 PE 模式 + 解锁独立小游戏入口。
// 注意：模式按钮文案是「PE 模式（手机）」，不是「手游模式」；小游戏开关的按钮文本是「开/关」，
// 标签在兄弟 span 里，所以必须按 .row 定位再点其中的 button.switch。两者点错都会**静默无效**，
// 于是整轮 QA 实际跑在 PC 模式下、结论完全错误 —— 因此下面每步都做断言，失败即中止。
if (!(await clickText("设置"))) throw new Error("找不到「设置」入口");
await page.waitForTimeout(600);
if (MODE !== "pc" && !(await clickText("PE 模式"))) throw new Error("找不到「PE 模式（手机）」按钮");
await page.waitForTimeout(500);

const modeState = await page.evaluate(() => ({
  gameMode: document.documentElement.dataset.gameMode,
  uiZoom: getComputedStyle(document.documentElement).getPropertyValue("--ui-zoom").trim(),
  effZoom: getComputedStyle(document.documentElement).getPropertyValue("--eff-zoom").trim(),
}));
report.modeState = modeState;
const wantMode = MODE === "pc" ? "pc" : "mobile";
if (modeState.gameMode !== wantMode) {
  throw new Error(`布局模式未生效：data-game-mode=${modeState.gameMode}（应为 ${wantMode}）。整轮结论无效，中止。`);
}

if (!(await clickText("返回"))) throw new Error("设置页找不到「返回」");
await page.waitForTimeout(900);
await page.screenshot({ path: join(OUT, "menu.png") });
report.menu = await probe(SELS);

async function scene(name, shot, run) {
  const rec = { ok: false };
  try {
    await run();
    rec.data = await probe(SELS);
    await page.screenshot({ path: join(OUT, `${shot}.png`) });
    rec.ok = true;
  } catch (e) {
    rec.error = String(e).slice(0, 300);
  }
  report.scenes[name] = rec;
  return rec;
}

// ---- 场景 A：喵喵对决（主菜单直达，无需存档）----
await scene("battle", "battle", async () => {
  if (!(await clickText("喵喵对决"))) throw new Error("找不到「喵喵对决」入口");
  await page.waitForTimeout(2200);
});

// ---- 场景 B：独立小游戏 → 咖啡师出杯（餐饮引擎，最宽的固定栅格）----
// 战斗页只有 ✕ 没有「返回」，靠点击回主菜单不可靠 → 直接重新加载回到主菜单
// （arcadeMode 走 localStorage，重载后仍在）。
await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await scene("restaurant", "restaurant", async () => {
  if (!(await clickText("小游戏"))) throw new Error("找不到「小游戏」入口（arcadeMode 未开？）");
  await page.waitForTimeout(1400);
  if (!(await clickText("咖啡"))) throw new Error("小游戏列表里找不到「咖啡」");
  await page.waitForTimeout(2200);
});

report.pageErrors = errors;
writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1), "utf8");
console.log(JSON.stringify(report, null, 1));
await browser.close();
