/**
 * iPhone 17 横屏设备仿真 QA 脚本（Playwright，非游戏运行时依赖）。
 *
 * 设备真值（来源：Apple 官方规格 + ios-resolution / useyourloaf 验证）：
 *   iPhone 17 (2025) — 逻辑视口 402 × 874 pt，DPR 3，物理 1206 × 2622，19.5:9
 *   横屏 safe-area insets：top 20 / right 62 / bottom 20 / left 62
 *   → 横屏可视区 874 × 402，扣除安全区后可用 750 × 362
 *
 * 用法：
 *   node scripts/qa-device-shot.mjs --tag baseline
 * 产物：qa-shots/<tag>/*.png + qa-shots/<tag>/audit.json
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * playwright-core 安装在 WorkBuddy 隔离工作区（不污染项目 node_modules）。
 * ESM 不认 NODE_PATH，因此用 QA_PW 传绝对路径动态加载。
 */
const PW_SPEC = process.env.QA_PW
  ? pathToFileURL(process.env.QA_PW).href
  : "playwright-core";
const pwMod = await import(PW_SPEC);
// CJS 互操作：直接 import 绝对路径的 index.js 时入口挂在 default 上
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
if (!chromium) throw new Error("无法从 playwright-core 解析 chromium 导出");

const ROOT = resolve(process.cwd());
const argOf = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};

const TAG = argOf("tag", "baseline");
const URL_BASE = argOf("url", "http://127.0.0.1:1420/");
const MODE = argOf("mode", "mobile"); // mobile | pc
const OUT = join(ROOT, "qa-shots", TAG);
const FIXTURE = argOf("fixture", join(ROOT, "qa-fixtures", "base.json"));
const VIEWPORT_ARG = argOf("viewport", null);

mkdirSync(OUT, { recursive: true });

/** iPhone 17 横屏 */
const DEVICE =
  MODE === "pc"
    ? {
        viewport: parseViewport(VIEWPORT_ARG ?? "1600x900"),
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      }
    : {
        viewport: parseViewport(VIEWPORT_ARG ?? "874x402"),
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      };
/** 桌面/端游模式无刘海，安全区按 0 处理 */
const SAFE_AREA = MODE === "pc" ? { top: 0, right: 0, bottom: 0, left: 0 } : { top: 20, right: 62, bottom: 20, left: 62 };

function parseViewport(s) {
  const m = /^(\d+)x(\d+)$/.exec(String(s));
  if (!m) throw new Error(`--viewport 需形如 874x402，收到：${s}`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

const CHROME_EXE = process.env.QA_CHROME || null;

/** 在页面内运行的布局审计：溢出 / 越界 / 过小触控目标 / 安全区侵占 */
const AUDIT_FN = (safeArea) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safe = {
    left: safeArea.left,
    right: vw - safeArea.right,
    top: safeArea.top,
    bottom: vh - safeArea.bottom,
  };
  const docOverflowX = document.documentElement.scrollWidth - vw;
  const docOverflowY = document.documentElement.scrollHeight - vh;

  const desc = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const unclipped = [];
  const offscreen = [];
  const tinyTargets = [];
  const subOptimal = [];
  const safeAreaViolations = [];
  const scrollBelowFold = [];
  const clippedText = [];

  /** 元素是否存在「还有剩余内容可滚」的滚动祖先——这类越界属于正常滚动，不算缺陷 */
  const hasScrollableAncestorWithMore = (el) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
        if (p.scrollHeight - p.clientHeight > 2 || p.scrollWidth - p.clientWidth > 2) return true;
      }
      p = p.parentElement;
    }
    return false;
  };
  const clippedByAncestor = (el, r) => {
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1 || r.top < pr.top - 1) {
          return true;
        }
      }
      p = p.parentElement;
    }
    return false;
  };

  const all = document.querySelectorAll("body *");
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    // 1) 横向溢出：元素自身产生横向滚动条
    if (el.scrollWidth - el.clientWidth > 2 && el.clientWidth > 0) {
      const ox = getComputedStyle(el).overflowX;
      if (ox !== "auto" && ox !== "scroll" && ox !== "hidden") {
        unclipped.push({ el: desc(el), scrollW: el.scrollWidth, clientW: el.clientWidth, delta: el.scrollWidth - el.clientWidth });
      }
    }

    // 2) 越界：可见交互元素超出视口（排除滚动容器内的正常滚动内容）
    const interactive = el.matches("button, a, input, select, [role=button], .action-card, .app, .card, .crumb, .loc-chip, .district");
    if (interactive && !clippedByAncestor(el, r) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) {
      offscreen.push({ el: desc(el), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
    }

    // 3) 触控目标过小（仅交互元素）
    if (interactive) {
      const isInlineLink = el.tagName === "A";
      if (!isInlineLink) {
        const h = Math.round(r.height);
        const w = Math.round(r.width);
        if (h < 32 || w < 20) {
          tinyTargets.push({ el: desc(el), w, h, text: (el.textContent || "").trim().slice(0, 18) });
        } else if (h < 44) {
          subOptimal.push({ el: desc(el), w, h, text: (el.textContent || "").trim().slice(0, 18) });
        }
      }
    }

    // 4) 安全区侵占：可读/可点的内容落进刘海或手势条区域
    if (interactive || el.matches("h1,h2,h3,p,span,div.brand,.money-box,.clock")) {
      const intersects =
        r.left < safe.left - 1 || r.right > safe.right + 1 || r.top < safe.top - 1 || r.bottom > safe.bottom + 1;
      const meaningfullyInside =
        r.width > 6 && r.height > 6 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
      if (intersects && meaningfullyInside) {
        const item = {
          el: desc(el),
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        };
        const scrollable = !clippedByAncestor(el, r) && hasScrollableAncestorWithMore(el);
        if (scrollable) scrollBelowFold.push(item);
        else if (!clippedByAncestor(el, r)) safeAreaViolations.push(item);
      }
    }
  }

  // 文字被裁切（overflow: hidden 且内容高度超出）
  for (const el of document.querySelectorAll("button, .action-card, .app, .card, .district, .crumb, .loc-chip, .title, .name")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (cs.overflow !== "hidden" && cs.overflowY !== "hidden") continue;
    if (el.clientHeight > 0 && el.scrollHeight - el.clientHeight > 3) {
      clippedText.push({ el: desc(el), clientH: el.clientHeight, scrollH: el.scrollHeight, text: (el.textContent || "").trim().slice(0, 24) });
    }
  }

  // 关键栅格列宽
  const cols = {};
  for (const sel of [".main", ".sidebar", ".scene", ".quest-side", ".topbar", ".game-root", ".zoom-wrapper"]) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      cols[sel] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    }
  }

  const dedupe = (arr, key = "el") => {
    const seen = new Set();
    return arr.filter((x) => {
      const k = JSON.stringify([x[key], x.rect ?? x.w ?? ""]);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  return {
    viewport: { vw, vh },
    safeArea,
    docOverflowX,
    docOverflowY,
    gridColumns: cols,
    unclippedOverflow: dedupe(unclipped).slice(0, 25),
    offscreenInteractive: dedupe(offscreen).slice(0, 25),
    tinyTargets: dedupe(tinyTargets).slice(0, 25),
    subOptimalTargets: dedupe(subOptimal).slice(0, 25),
    clippedText: dedupe(clippedText).slice(0, 25),
    safeAreaViolations: dedupe(safeAreaViolations).slice(0, 25),
    scrollBelowFold: dedupe(scrollBelowFold).slice(0, 25),
    counts: {
      unclipped: unclipped.length,
      offscreen: offscreen.length,
      tiny: tinyTargets.length,
      subOptimal: subOptimal.length,
      clipped: clippedText.length,
      safeArea: safeAreaViolations.length,
      scrollBelowFold: scrollBelowFold.length,
    },
  };
};

const fixtureRaw = existsSync(FIXTURE) ? readFileSync(FIXTURE, "utf8") : null;

const launchOpts = { args: ["--enable-features=CSSSafeAreaInsets"], headless: true };
if (CHROME_EXE) launchOpts.executablePath = CHROME_EXE;

const browser = await chromium.launch(launchOpts);
const context = await browser.newContext(DEVICE);

// 尝试用 CDP 注入真实安全区；不支持时降级为 CSS 变量覆盖
const page = await context.newPage();
let cdpSafeArea = "unsupported";
try {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: SAFE_AREA.top, left: SAFE_AREA.left, bottom: SAFE_AREA.bottom, right: SAFE_AREA.right },
  });
  cdpSafeArea = "cdp";
} catch (e) {
  cdpSafeArea = "css-var-fallback";
}

// 注入 localStorage：手游模式 + 存档
await page.addInitScript(
  ([fx, useCssVarFallback, mode]) => {
    localStorage.setItem("urban-life-ui-gamemode", mode);
    localStorage.setItem("urban-life-ui-zoom", "1");
    if (fx) localStorage.setItem("urban_life_save_auto", fx);
    // 兜底：把安全区数值挂到 :root，供实现层（--sai-* 令牌）读取
    if (useCssVarFallback) {
      const s = document.createElement("style");
      s.textContent = `:root{--sai-top:20px;--sai-right:62px;--sai-bottom:20px;--sai-left:62px;}`;
      document.documentElement.appendChild(s);
    }
  },
  [fixtureRaw, cdpSafeArea !== "cdp", MODE],
);

const runtimeErrors = [];
page.on("pageerror", (e) => runtimeErrors.push({ kind: "pageerror", msg: String(e).slice(0, 400) }));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    const t = m.text();
    // 忽略浏览器/沙箱噪声
    if (/favicon|Failed to load resource/i.test(t)) return;
    runtimeErrors.push({ kind: `console.${m.type()}`, msg: t.slice(0, 300) });
  }
});

/** 点击第一个可见的匹配元素（先等待出现，再逐个尝试，避免异步内容竞态） */
async function clickFirst(locator, timeout = 8000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
  } catch {
    return false;
  }
  const n = await locator.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i);
    try {
      if (!(await el.isVisible())) continue;
      await el.click({ timeout: 4000 });
      return true;
    } catch { /* try next */ }
  }
  return false;
}

const allScenarios = [
  {
    name: "01-menu",
    fn: async () => {
      await page.goto(URL_BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
    },
  },
  {
    name: "02-game-home",
    fn: async () => {
      const ok = await clickFirst(page.getByText(/继续生活|继续游戏/), 15000);
      if (!ok) throw new Error("未找到「继续生活」入口（自动槽可能为空）");
      await page.waitForTimeout(1800);
    },
  },
  {
    name: "03-map",
    fn: async () => {
      const ok = await clickFirst(page.locator("button").filter({ hasText: /出门|回主地图/ }), 8000);
      if (!ok) throw new Error("未找到「出门 / 回主地图」入口");
      await page.waitForTimeout(1800);
    },
  },
  {
    name: "04-phone-modal",
    // 手游专用场景：横屏下全屏手机改为铺满安全区的面板，需要逐屏复核
    mobileOnly: true,
    fn: async () => {
      const ok = await clickFirst(page.locator(".topbar .phone-btn"), 8000);
      if (!ok) throw new Error("未找到顶栏手机入口");
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "05-inventory",
    mobileOnly: true,
    fn: async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      const ok = await clickFirst(page.locator(".topbar .phone-btn").nth(1), 8000);
      if (!ok) throw new Error("未找到顶栏背包入口");
      await page.waitForTimeout(1200);
    },
  },
  {
    // v1.44 手游功能对等：行动日志由顶栏 📜 打开全屏弹层
    name: "06-log-modal",
    mobileOnly: true,
    fn: async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      const ok = await clickFirst(page.locator(".topbar .phone-btn").nth(2), 8000);
      if (!ok) throw new Error("未找到顶栏日志入口 📜");
      await page.waitForTimeout(1200);
    },
  },
  {
    // v1.44 手游功能对等：点时钟展开端游常驻的次要信息
    name: "07-topbar-info",
    mobileOnly: true,
    fn: async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      const ok = await clickFirst(page.locator(".topbar .clock"), 8000);
      if (!ok) throw new Error("未找到顶栏时钟（信息开关）");
      await page.waitForTimeout(900);
    },
  },
];

const scenarios = allScenarios.filter((s) => !s.mobileOnly || MODE === "mobile");

const results = [];
for (const sc of scenarios) {
  try {
    await sc.fn();
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(OUT, `${sc.name}.png`) });
    let audit = null;
    try {
      audit = await page.evaluate(AUDIT_FN, SAFE_AREA);
    } catch (e) {
      audit = { error: String(e) };
    }
    results.push({ scenario: sc.name, ok: true, audit });
  } catch (e) {
    results.push({ scenario: sc.name, ok: false, error: String(e).slice(0, 300) });
    try {
      await page.screenshot({ path: join(OUT, `${sc.name}-error.png`) });
    } catch { /* ignore */ }
  }
}

writeFileSync(
  join(OUT, "audit.json"),
  JSON.stringify({ tag: TAG, device: DEVICE, safeArea: SAFE_AREA, cdpSafeArea, results, runtimeErrors }, null, 2),
);

for (const r of results) {
  if (!r.ok) {
    console.log(`✗ ${r.scenario}: ${r.error}`);
    continue;
  }
  const a = r.audit ?? {};
  const c = a.counts ?? {};
  console.log(
    `✓ ${r.scenario}  ovX=${a.docOverflowX}  offscreen=${c.offscreen}  tiny=${c.tiny}  sub44=${c.subOptimal}  clipped=${c.clipped}  safeArea=${c.safeArea}  scrollFold=${c.scrollBelowFold}`,
  );
}
if (runtimeErrors.length) {
  console.log(`\n⚠ 运行时错误 ${runtimeErrors.length} 条：`);
  for (const e of runtimeErrors.slice(0, 12)) console.log(`   [${e.kind}] ${e.msg.replace(/\s+/g, " ").slice(0, 160)}`);
}

await browser.close();
console.log(`\n[qa] tag=${TAG} cdpSafeArea=${cdpSafeArea} out=${OUT}`);
