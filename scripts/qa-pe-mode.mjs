/**
 * v1.44.2 PC/PE 模式预设 + 立绘/小游戏反向 zoom 验证 @852×393。
 *
 * 1. PE 预设：50% UI 缩放 + 隐藏日志条 + 顶栏 📜 入口；设置页点击真实生效并持久化。
 * 2. 立绘不随缩放：PE(0.5) 下 NPC 立绘视觉高度 ≈ PC(1.0)（半身照构图不变）。
 * 3. 小游戏不随缩放：.mg-card.fs / .arcade-stage 在 PE 下视觉尺寸 ≈ PC（占满整屏）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PW_SPEC = process.env.QA_PW ? pathToFileURL(process.env.QA_PW).href : "playwright-core";
const pwMod = await import(PW_SPEC);
const chromium = pwMod.chromium ?? pwMod.default?.chromium;
const OUT = join(resolve(process.cwd()), "qa-shots", "pe-mode");
mkdirSync(OUT, { recursive: true });
const BASE_URL = process.env.QA_URL || "http://localhost:5199/";

const VP = { width: 852, height: 393 };

/** page.evaluate 里用的带 rect 助手的包裹器（evaluate 内无法访问 Node 侧函数） */
const withRect = (body) => `(() => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  };
  return (${body});
})()`;

const MEASURE = withRect(`({
  topbar: rect(".topbar"),
  logPanel: rect(".game-root > .log-panel"),
  logBtn: !!document.querySelector('.menu-box button[title="行动日志"]'),
})`);

const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME || undefined });
const results = {};

async function newPage({ mode, zoom, showLog, arcade = true }) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.__consoleErrors = consoleErrors;
  await page.addInitScript(([m, z, log, arc]) => {
    try {
      localStorage.clear();
      localStorage.setItem("urban-life-ui-gamemode", m);
      localStorage.setItem("urban-life-ui-zoom", String(z));
      if (log != null) localStorage.setItem("urban-life-show-log", String(log));
      if (arc) localStorage.setItem("urban-life-arcade-mode", "true");
    } catch { }
  }, [mode, zoom, showLog, arcade]);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return { ctx, page };
}

async function enterGame(page) {
  await page.locator("button").filter({ hasText: "开始新生活" }).first().click();
  await page.waitForTimeout(500);
  await page.locator("button").filter({ hasText: "下一步" }).first().click();
  await page.waitForTimeout(500);
  await page.locator("button").filter({ hasText: "开始生活" }).first().click();
  await page.waitForTimeout(1200);
}

/** 在真实游戏里打开一个 NPC 对话（npcPresenceAt 遍历日程，改地点/日期/小时直到立绘出现） */
async function openAnyNpc(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const stores = await import("/src/stores/uiStore.svelte.ts");
    const gstore = await import("/src/stores/gameStore.svelte.ts");
    const npcsMod = await import("/src/game/core/npcs.ts");
    const cal = await import("/src/game/core/calendar.ts");
    const talk = await import("/src/game/core/npcTalk.ts");
    const defs = npcsMod.allNpcs();
    const gs = gstore.gameState;
    const reasons = [];
    let presenceHits = 0, beginOk = 0;
    for (const def of defs) {
      for (let day = 1; day <= 7; day++) {
        gs.time.day = day;
        const weekday = cal.weekdayOf(gs.time);
        for (let hour = 7; hour <= 23; hour++) {
          const presence = npcsMod.npcPresenceAt(def, { weekday, hour, minute: 0 });
          if (!presence || !presence.locationId) continue;
          presenceHits++;
          gs.locationId = presence.locationId;
          gs.time.hour = hour;
          const begin = talk.beginNpcConversation(gs, def.id, "meet");
          if (!begin.ok) {
            if (reasons.length < 3) reasons.push(`${def.id}@${presence.locationId}h${hour}: ${begin.reason}`);
            continue;
          }
          beginOk++;
          stores.uiState.npcTalk = { npcId: def.id, entry: "meet" };
          await sleep(250);
          const overlay = !!document.querySelector(".npc-overlay");
          const img = !!document.querySelector(".npc-portrait-image");
          if (overlay) return { ok: overlay && img, npcId: def.id, loc: presence.locationId, day, hour, overlay, img, presenceHits, beginOk };
          stores.uiState.npcTalk = null;
        }
      }
    }
    return { ok: false, reason: "no npc dialog opened", reasons, presenceHits, beginOk, defCount: defs.length };
  });
}

/** 通过 dev 模块直开一个小游戏全屏舞台 */
async function openAnyMinigame(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const stores = await import("/src/stores/uiStore.svelte.ts");
    const mg = await import("/src/game/core/minigame.ts");
    const keys = mg.configuredMiniGameKeys();
    if (!keys.length) return { ok: false, reason: "configuredMiniGameKeys empty" };
    for (const key of keys) {
      const cfg = mg.getMiniGameConfig(key);
      if (!cfg) continue;
      stores.uiState.minigamePayload = { key, title: "QA", icon: "🎮", config: cfg, todayPay: 100 };
      stores.uiState.modal = "minigame";
      await sleep(400);
      if (document.querySelector(".mg-card.fs")) return { ok: true, key };
      stores.uiState.modal = null;
      stores.uiState.minigamePayload = null;
    }
    return { ok: false, reason: `no stage opened (keys=${keys.length}, first=${keys[0]})` };
  });
}

const closeOverlays = (page) => page.evaluate(async () => {
  const stores = await import("/src/stores/uiStore.svelte.ts");
  stores.uiState.npcTalk = null;
  stores.uiState.modal = null;
  stores.uiState.minigamePayload = null;
  await new Promise((r) => setTimeout(r, 250));
});

// ---- A. PC zoom=1 基准 ----
{
  const { ctx, page } = await newPage({ mode: "pc", zoom: 1, showLog: null });
  await enterGame(page);
  results.pc = await page.evaluate(MEASURE);
  results.pcNpcOpen = await openAnyNpc(page);
  await page.waitForTimeout(600);
  results.pc.npc = await page.evaluate(withRect(`({ npcImg: rect(".npc-portrait-image"), npcOverlay: rect(".npc-overlay") })`));
  await page.screenshot({ path: join(OUT, "pc-npc.png") });
  await closeOverlays(page);
  results.pcMgOpen = await openAnyMinigame(page);
  await page.waitForTimeout(500);
  results.pc.mg = await page.evaluate(withRect(`({ mgCard: rect(".mg-card.fs") })`));
  results.pc.consoleErrors = page.__consoleErrors.slice(0, 6);
  await page.screenshot({ path: join(OUT, "pc-minigame.png") });
  await closeOverlays(page);
  await ctx.close();
}

// ---- B. PE 预设（zoom 0.5 + 无日志条）----
{
  const { ctx, page } = await newPage({ mode: "pe", zoom: 0.5, showLog: "false" });
  await enterGame(page);
  results.pe = await page.evaluate(MEASURE);
  await page.screenshot({ path: join(OUT, "pe-game.png") });
  results.peNpcOpen = await openAnyNpc(page);
  await page.waitForTimeout(600);
  results.pe.npc = await page.evaluate(withRect(`({ npcImg: rect(".npc-portrait-image"), npcOverlay: rect(".npc-overlay") })`));
  await page.screenshot({ path: join(OUT, "pe-npc.png") });
  await closeOverlays(page);
  results.peMgOpen = await openAnyMinigame(page);
  await page.waitForTimeout(500);
  results.pe.mg = await page.evaluate(withRect(`({ mgCard: rect(".mg-card.fs") })`));
  await page.screenshot({ path: join(OUT, "pe-minigame.png") });
  await closeOverlays(page);

  // 独立小游戏：arcade 舞台原生尺寸
  await page.evaluate(async () => {
    const gstore = await import("/src/stores/gameStore.svelte.ts");
    gstore.goto("menu");
    await new Promise((r) => setTimeout(r, 600));
    gstore.goto("arcade");
  });
  await page.waitForTimeout(800);
  const card = page.locator(".arcade-card").first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(1000);
    results.pe.arcade = await page.evaluate(withRect(`({ arcadeStage: rect(".arcade-stage") })`));
    await page.screenshot({ path: join(OUT, "pe-arcade.png") });
  } else {
    results.pe.arcadeDebug = (await page.evaluate(() => document.body.innerText)).slice(0, 300);
  }
  await ctx.close();
}

// ---- C. 设置页点击 PE/PC 预设（真实点击链路）----
{
  const { ctx, page } = await newPage({ mode: "pc", zoom: 1, showLog: null });
  await page.locator("button").filter({ hasText: "设置" }).first().click();
  await page.waitForTimeout(800);
  const peBtn = page.locator("button").filter({ hasText: "PE 模式" }).first();
  if (!(await peBtn.count())) {
    console.error("DEBUG 未找到 PE 按钮，页面文本：", (await page.evaluate(() => document.body.innerText)).slice(0, 400));
  }
  await peBtn.click();
  await page.waitForTimeout(400);
  results.pePresetStored = await page.evaluate(() => ({
    mode: localStorage.getItem("urban-life-ui-gamemode"),
    zoom: localStorage.getItem("urban-life-ui-zoom"),
    log: localStorage.getItem("urban-life-show-log"),
  }));
  await page.locator("button").filter({ hasText: "PC 模式" }).first().click();
  await page.waitForTimeout(400);
  results.pcPresetStored = await page.evaluate(() => ({
    mode: localStorage.getItem("urban-life-ui-gamemode"),
    zoom: localStorage.getItem("urban-life-ui-zoom"),
    log: localStorage.getItem("urban-life-show-log"),
  }));
  await page.screenshot({ path: join(OUT, "settings-pc.png") });
  await ctx.close();
}

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));

// ---- 判定 ----
const problems = [];
const ratio = (a, b) => (a && b ? +(a / b).toFixed(3) : null);
if (!results.pcNpcOpen?.ok) problems.push(`PC 未打开 NPC 对话: ${JSON.stringify(results.pcNpcOpen)}`);
if (!results.peNpcOpen?.ok) problems.push(`PE 未打开 NPC 对话: ${JSON.stringify(results.peNpcOpen)}`);
if (!results.pcMgOpen?.ok) problems.push(`PC 未打开小游戏: ${JSON.stringify(results.pcMgOpen)}`);
if (!results.peMgOpen?.ok) problems.push(`PE 未打开小游戏: ${JSON.stringify(results.peMgOpen)}`);
const peNpc = results.pe?.npc?.npcImg, pcNpc = results.pc?.npc?.npcImg;
const npcRatio = ratio(peNpc?.[3], pcNpc?.[3]);
results.npcHeightRatio = npcRatio;
if (npcRatio == null || Math.abs(npcRatio - 1) > 0.08) problems.push(`立绘高度比率异常(应≈1): ${npcRatio} pc=${JSON.stringify(pcNpc)} pe=${JSON.stringify(peNpc)}`);
const peMg = results.pe?.mg?.mgCard, pcMg = results.pc?.mg?.mgCard;
const mgWRatio = ratio(peMg?.[2], pcMg?.[2]), mgHRatio = ratio(peMg?.[3], pcMg?.[3]);
results.mgRatio = { mgWRatio, mgHRatio };
if (mgWRatio == null || Math.abs(mgWRatio - 1) > 0.05) problems.push(`小游戏舞台宽比率异常(应≈1): ${mgWRatio} pc=${JSON.stringify(pcMg)} pe=${JSON.stringify(peMg)}`);
if (mgHRatio == null || Math.abs(mgHRatio - 1) > 0.05) problems.push(`小游戏舞台高比率异常(应≈1): ${mgHRatio}`);
if (results.pe?.logPanel != null) problems.push("PE 仍渲染常驻日志条");
if (!results.pe?.logBtn) problems.push("PE 顶栏缺少 📜 行动日志入口");
const peArc = results.pe?.arcade?.arcadeStage;
if (peArc == null || peArc[3] < 350) problems.push(`PE arcade 舞台高度不足(应原生≥350): ${JSON.stringify(peArc)}`);
if (results.pePresetStored?.mode !== "pe" || results.pePresetStored?.zoom !== "0.5" || results.pePresetStored?.log !== "false") {
  problems.push(`PE 预设未正确持久化: ${JSON.stringify(results.pePresetStored)}`);
}
if (results.pcPresetStored?.mode !== "pc" || results.pcPresetStored?.zoom !== "1" || results.pcPresetStored?.log !== "true") {
  problems.push(`PC 预设未正确持久化: ${JSON.stringify(results.pcPresetStored)}`);
}

console.log("== PC/PE 模式与反向 zoom 验证 ==");
console.log(JSON.stringify({ npcHeightRatio: results.npcHeightRatio, mgRatio: results.mgRatio, pcNpcOpen: results.pcNpcOpen, peNpcOpen: results.peNpcOpen, pcMgOpen: results.pcMgOpen, peMgOpen: results.peMgOpen, pc: results.pc, pe: results.pe }, null, 1).slice(0, 2000));
console.log(problems.length ? `FAIL (${problems.length}):\n- ${problems.join("\n- ")}` : "PASS: 全部通过");
writeFileSync(join(OUT, "verdict.txt"), problems.length ? `FAIL\n${problems.join("\n")}` : "PASS");
await browser.close();
process.exit(problems.length ? 1 : 0);
