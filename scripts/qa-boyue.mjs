/**
 * 四城区真实 UI 验收。仅启动前构造合法存档；运行中不写 gameState。
 * QA_URL=http://127.0.0.1:1431/ node scripts/qa-boyue.mjs
 * QA_FILE=都市生活_v1.48.html node scripts/qa-boyue.mjs
 * QA_PW / QA_CHROME / QA_TAG / QA_VIEWPORTS=pc,landscape,portrait / QA_SHOTS=0
 * QA_ENTRIES=new-game,old-save,midnight-bus,old-airport,night-boundaries
 * QA_PHASE=logic-precheck 表示素材完成前预检，不宣称最终视觉验收。
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.QA_FILE ? pathToFileURL(resolve(process.env.QA_FILE)).href : process.env.QA_URL || "http://127.0.0.1:1431/";
const tag = process.env.QA_TAG || (process.env.QA_FILE ? "boyue-offline" : "boyue-browser");
const output = join(root, "artifacts", "v1.48", tag);
mkdirSync(output, { recursive: true });
const shotsEnabled = process.env.QA_SHOTS !== "0";
const entries = new Set((process.env.QA_ENTRIES || "new-game,old-save,midnight-bus,old-airport,night-boundaries").split(","));
const logicPrecheck = process.env.QA_PHASE === "logic-precheck";
const displayNames = new Map([...JSON.parse(readFileSync(join(root, "src/game/data/regions.json"), "utf8")), ...JSON.parse(readFileSync(join(root, "src/game/data/locations.json"), "utf8"))].map(({ id, name }) => [id, name]));
const playwrightPath = process.env.QA_PW || "C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js";
const playwright = await import(existsSync(playwrightPath) ? pathToFileURL(playwrightPath).href : playwrightPath);
const chromium = playwright.chromium ?? playwright.default?.chromium;
assert(chromium, "无法加载 Playwright Chromium");
const chrome = [process.env.QA_CHROME, join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"), "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].filter(Boolean).find(existsSync);
assert(chrome, "找不到 Chrome；请设置 QA_CHROME");

const { createServer } = await import("vite");
const fixtureServer = await createServer({ root, configFile: false, cacheDir: join(output, "fixture-vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: "custom" });
let fixture, gameDay;
try {
  const { createInitialState } = await fixtureServer.ssrLoadModule("/src/game/core/state.ts");
  ({ gameDay } = await fixtureServer.ssrLoadModule("/src/game/core/calendar.ts"));
  fixture = createInitialState(20261005);
} finally { await fixtureServer.close(); }
fixture.version = 31;
fixture.player.money = 5000;
Object.assign(fixture.player.attrs, { stamina: 100, health: 100, mood: 100, hygiene: 100, satiety: 100 });
fixture.tutorial = { done: JSON.parse(readFileSync(join(root, "src/game/data/tutorial.json"), "utf8")).steps.map(({ id }) => id), activeStep: -1 };
fixture.savedAt = "2026-10-05T00:00:00.000Z";
function seed({ day = 8, hour = 7, minute = 0, locationId = "map", region = "downtown", area = "downtown_station", navStack = ["map", "downtown"] } = {}) {
  const save = structuredClone(fixture);
  save.time = { ...save.time, year: 2026, month: 8, day, hour, minute };
  Object.assign(save, { locationId, region, area, navStack });
  save.weather = { id: "sunny", lastRollDay: gameDay(save.time) };
  return save;
}
const developmentDistricts = [
  { id: "development_culture", title: "市三馆", facilities: ["dev_museum", "dev_science_museum", "dev_art_gallery", "development_bus_station"] },
  { id: "development_university", title: "大学城", facilities: ["dev_university", "dev_food_street", "dev_incubator"] },
  { id: "development_reserve", title: "自然保护区", facilities: ["moon_mountain", "treasure_lake", "camping_base"] },
];
const boyueDistricts = [
  { id: "boyue_university", title: "大学城", facilities: ["boyue_engineering_college", "boyue_food_street", "boyue_talent_apartment", "boyue_internet_cafe"] },
  { id: "boyue_mall", title: "商场", facilities: ["boyue_cafe", "boyue_convenience_store", "boyue_fast_food", "boyue_gym", "boyue_western_restaurant"] },
  { id: "boyue_olympic", title: "奥林匹克中心", facilities: ["boyue_swimming_pool", "boyue_football_field", "boyue_basketball_court", "boyue_sports_store"] },
  { id: "boyue_night_market", title: "泊月夜市", facilities: ["boyue_nightclub", "boyue_snack_street", "boyue_arcade", "boyue_bathhouse", "boyue_lounge_bar", "boyue_central_fountain", "boyue_texas_shop"] },
];
const ordinaryNightFacilities = ["boyue_snack_street", "boyue_arcade", "boyue_bathhouse", "boyue_central_fountain"];
const expectedBoyueFacilities = boyueDistricts.flatMap(({ facilities }) => facilities).sort();
const viewports = [
  { id: "pc", width: 1280, height: 800, mode: "pc" },
  { id: "landscape", width: 844, height: 390, mode: "pe" },
  { id: "portrait", width: 390, height: 844, mode: "pc" },
].filter(({ id }) => !process.env.QA_VIEWPORTS || process.env.QA_VIEWPORTS.split(",").includes(id));
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const report = { url, tag, phase: process.env.QA_PHASE || "final", visualAcceptance: false, chrome, browserVersion: browser.version(), generatedAt: new Date().toISOString(), policy: "Only startup localStorage fixtures; all gameplay actions use real UI mouse/touch/wait buttons.", expectedBoyueFacilities, scenarios: [], passed: false };
function minutesOf(state) { return Date.UTC(state.time.year, state.time.month - 1, state.time.day, state.time.hour, state.time.minute) / 60000; }

async function scenario(viewport, entry, initialSave, run) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, hasTouch: viewport.id !== "pc" });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const result = { viewport, entry, fixtureTime: initialSave.time, fixtureLocation: { locationId: initialSave.locationId, region: initialSave.region, area: initialSave.area }, clicks: [], visitedFacilities: [], checks: [], screenshots: [], errors: [], warnings: [], failedResources: [], passed: false };
  report.scenarios.push(result);
  writeFileSync(join(output, `${viewport.id}-${entry}-fixture.json`), JSON.stringify(initialSave, null, 2));
  page.on("pageerror", (error) => result.errors.push({ type: "runtime", text: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") result.errors.push({ type: "console", text: message.text(), location: message.location() });
    if (message.type() === "warning") result.warnings.push(message.text());
  });
  page.on("requestfailed", (request) => result.failedResources.push({ url: request.url(), type: request.resourceType(), reason: request.failure()?.errorText }));
  page.on("response", (response) => { if (response.status() >= 400) result.failedResources.push({ url: response.url(), type: response.request().resourceType(), status: response.status() }); });
  await page.addInitScript(({ mode, save, fresh }) => {
    if (localStorage.getItem("urban-life-qa-initialized") === "1") return;
    localStorage.clear(); localStorage.setItem("urban-life-qa-initialized", "1");
    localStorage.setItem("urban-life-device-setup-v1", "1"); localStorage.setItem("urban-life-ui-gamemode", mode);
    localStorage.setItem("urban-life-show-log", "false"); localStorage.setItem("urban-life-ui-zoom", "1");
    if (!fresh) localStorage.setItem("urban_life_save_auto", JSON.stringify(save));
  }, { mode: viewport.mode, save: initialSave, fresh: entry === "new-game" });
  const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem("urban_life_save_auto") || "null"));
  async function stateMatches(expected) {
    await page.waitForFunction((expected) => { const state = JSON.parse(localStorage.getItem("urban_life_save_auto") || "null"); return state && Object.entries(expected).every(([key, value]) => state[key] === value); }, expected);
    return readState();
  }
  async function idle() { await page.locator(".tr-overlay").waitFor({ state: "hidden" }); }
  async function shot(label) {
    await idle(); await page.evaluate(async () => Promise.all([...document.images].map((image) => image.decode().catch(() => {}))));
    const metrics = await page.evaluate(() => ({ innerWidth, pageWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
      brokenImages: [...document.images].filter((image) => image.complete && image.naturalWidth === 0 && image.currentSrc).map((image) => image.currentSrc),
      map: [...document.querySelectorAll(".map-board")].at(-1)?.dataset.mapId || null, mapSource: [...document.querySelectorAll(".map-board")].at(-1)?.dataset.assetSource || null,
      mapImage: [...document.querySelectorAll(".map-image")].at(-1)?.currentSrc || null, sceneImage: [...document.querySelectorAll(".scene-bg img")].at(-1)?.currentSrc || null, rotatePrompt: !!document.querySelector(".mobile-portrait-block"),
    }));
    for (const key of ["mapImage", "sceneImage"]) if (metrics[key]?.startsWith("data:")) metrics[key] = `${metrics[key].slice(0, 40)}...[${metrics[key].length} chars]`;
    result.checks.push({ label, ...metrics });
    assert(metrics.pageWidth <= metrics.innerWidth + 2, `${label} 水平溢出 ${metrics.pageWidth} > ${metrics.innerWidth}`);
    assert.equal(metrics.brokenImages.length, 0, `${label} 图像损坏`);
    if (!logicPrecheck && metrics.map && /^(development|boyue)/.test(metrics.map)) assert(metrics.mapImage, `${label} 新地图缺少背景`);
    if (!logicPrecheck && result.visitedFacilities.at(-1) && !metrics.map) assert(metrics.sceneImage, `${label} 设施缺少场景背景`);
    if (shotsEnabled) { const name = `${viewport.id}-${entry}-${String(result.screenshots.length + 1).padStart(3, "0")}-${label}.png`; await page.screenshot({ path: join(output, name), animations: "disabled" }); result.screenshots.push(name); }
  }
  async function click(locator, label) {
    let targetKind = "default";
    const id = await locator.getAttribute("data-location-id").catch(() => null);
    if (logicPrecheck && id && await page.locator(".map-image").count() === 0) {
      // 素材未落盘时游戏自动显示地点列表；使用其真实按钮继续逻辑预检。
      locator = page.locator(".atlas-list .list-item").filter({ has: page.locator("strong", { hasText: displayNames.get(id) }) }).first();
      targetKind = "list-fallback";
    }
    await idle(); await locator.waitFor({ state: "visible" }); assert(await locator.isEnabled(), `${label} 禁用`);
    for (let attempt = 0; ; attempt++) {
      try { await locator.scrollIntoViewIfNeeded(); break; }
      catch (error) { if (attempt >= 2 || !/not attached|detached/.test(error.message)) throw error; await locator.waitFor({ state: "visible" }); }
    }
    const rect = await locator.boundingBox(); assert(rect && rect.width >= 20 && rect.height >= 20, `${label} 点击目标过小`);
    const input = viewport.id === "pc" ? "mouse" : "touch"; result.clicks.push({ label, rect, input, targetKind });
    if (input === "touch") await locator.tap(); else await locator.click();
  }
  const pin = (id) => page.locator(".map-board").last().locator(`.map-pin[data-location-id="${id}"]`);
  async function atlas(id) { await page.locator(`.map-board[data-map-id="${id}"]`).last().waitFor({ state: "visible" }); await idle(); }
  async function exitFacility(region) { await click(page.getByRole("button", { name: /出门 \/ 回/ }).first(), `出门返回 ${region}`); await stateMatches({ locationId: "map", region }); await atlas(region); }
  async function overview(id) {
    const name = id === "development" ? "伯月新区" : id === "boyue" ? "泊月区" : "树堰区";
    await click(page.locator(".crumb, .atlas-crumb, .city-atlas-navigation button").filter({ hasText: new RegExp(`${name}$`) }).first(), `${name}面包屑`);
    await stateMatches({ locationId: "map", region: id }); await atlas(id);
  }
  async function visitFacility(id, district) { await click(pin(id), id); await stateMatches({ locationId: id, region: district }); result.visitedFacilities.push(id); await page.locator(".development-preview").waitFor(); await shot(id); await exitFacility(district); }
  async function listCheck(label, expectedNames = [], absentNames = []) {
    await click(page.getByRole("button", { name: "地点列表", exact: true }), "打开地点列表");
    const list = page.locator(".atlas-list"); await list.waitFor({ state: "visible" }); const text = await list.innerText();
    const names = await list.locator(".list-item strong").evaluateAll((elements) => elements.map((element) => [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("").trim()));
    for (const name of expectedNames) assert(names.includes(name), `${label}列表缺少 ${name}`);
    for (const name of absentNames) assert(!names.includes(name), `${label}列表错误显示 ${name}`);
    result.checks.push({ label, listText: text, itemNames: names }); await shot(label); await click(page.getByRole("button", { name: "收起列表", exact: true }), "收起地点列表");
    if (await page.locator(".map-image").count() > 0) await list.waitFor({ state: "hidden" });
    else { assert(logicPrecheck, "正式地图不应缺少背景而强制显示列表"); result.checks.push({ label: "temporary-map-list-fallback", map: await page.locator(".map-board").getAttribute("data-map-id") }); }
  }
  async function waitHours(hours) {
    const before = await readState(); const label = hours === 0.5 ? "等 30 分钟" : `等 ${hours} 小时`;
    const matches = page.getByRole("button", { name: label, exact: true }); let target;
    for (let i = 0; i < await matches.count(); i++) if (await matches.nth(i).isVisible()) { target = matches.nth(i); break; }
    if (!target && await page.getByRole("button", { name: "展开状态栏", exact: true }).isVisible().catch(() => false)) {
      await click(page.getByRole("button", { name: "展开状态栏", exact: true }), "展开状态栏等待操作");
      for (let i = 0; i < await matches.count(); i++) if (await matches.nth(i).isVisible()) { target = matches.nth(i); break; }
    }
    assert(target, `${label}没有可见入口`); await click(target, label);
    await page.waitForFunction((time) => { const save = JSON.parse(localStorage.getItem("urban_life_save_auto") || "null"); return save && JSON.stringify(save.time) !== time; }, JSON.stringify(before.time));
    const after = await readState(); assert.equal(minutesOf(after) - minutesOf(before), hours * 60, `${label} 时间推进`);
    await click(page.getByRole("button", { name: "继续 →", exact: true }), "确认等待结果");
    result.checks.push({ label: "ui-wait", minutes: hours * 60, before: before.time, after: after.time }); return after;
  }
  async function waitUntil18() {
    let save = await readState();
    const indoorWait = viewport.mode === "pe" && save.locationId === "map";
    if (indoorWait) {
      await click(pin("boyue_central_fountain"), "前往中央喷泉等候夜市开门");
      await stateMatches({ locationId: "boyue_central_fountain", region: "boyue_night_market" });
      await shot("central-fountain-waiting");
    }
    while (save.time.hour * 60 + save.time.minute < 1080) { const remaining = 1080 - (save.time.hour * 60 + save.time.minute); const minutes = [360, 180, 120, 60, 30].find((value) => value <= remaining); assert(minutes, "等待目标必须位于半小时边界"); save = await waitHours(minutes / 60); }
    assert.equal(save.time.hour, 18); assert.equal(save.time.minute, 0);
    if (indoorWait) await exitFacility("boyue_night_market");
  }
  async function marketState(texasVisible, venuesOpen) {
    await atlas("boyue_night_market"); assert.equal(await pin("boyue_texas_shop").count(), texasVisible ? 1 : 0, "德州地图入口可见性");
    for (const id of ["boyue_nightclub", "boyue_lounge_bar"]) assert.equal(await pin(id).isEnabled(), venuesOpen, `${id} 夜间营业状态`);
    for (const id of ordinaryNightFacilities) assert(await pin(id).isEnabled(), `${id} 应全天可进入`);
    await listCheck("market-list", texasVisible ? ["德州小店"] : [], texasVisible ? [] : ["德州小店"]);
    result.checks.push({ label: "market-availability", time: (await readState()).time, texasVisible, venuesOpen, ordinaryAlwaysOpen: ordinaryNightFacilities });
  }
  const qa = { page, result, readState, stateMatches, shot, click, pin, atlas, exitFacility, overview, visitFacility, listCheck, waitHours, waitUntil18, marketState };
  try {
    await page.goto(url, { waitUntil: "load", timeout: 180000 });
    if (entry !== "new-game") { await click(page.getByRole("button", { name: /继续生活/ }), "继续旧生活"); await stateMatches({ version: 32 }); }
    await run(qa); assert.equal(result.errors.length, 0, JSON.stringify(result.errors));
    assert.equal(result.warnings.filter((warning) => !warning.startsWith("持久化存储未获授权：")).length, 0, JSON.stringify(result.warnings));
    assert.equal(result.failedResources.filter(({ reason }) => reason !== "net::ERR_ABORTED").length, 0, JSON.stringify(result.failedResources)); result.passed = true;
  } catch (error) {
    result.failure = { message: error.message, stack: error.stack }; await page.screenshot({ path: join(output, `${viewport.id}-${entry}-failure.png`) }).catch(() => {});
    writeFileSync(join(output, `${viewport.id}-${entry}-failure.html`), (await page.content().catch(() => "")).replace(/data:image\/[^\s"')<>]+/g, "data:image/[omitted]")); console.error(`${viewport.id}/${entry}: ${error.message}`);
  } finally { writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2)); await context.close(); }
  console.log(`${viewport.id}/${entry}: ${result.passed ? "PASS" : "FAIL"}, ${result.clicks.length} UI actions`);
}

async function mainRoute(qa, fresh = false) {
  const { page, result, readState, stateMatches, shot, click, pin, atlas, exitFacility, overview, visitFacility, listCheck, waitUntil18, marketState } = qa;
  if (fresh) { await click(page.getByRole("button", { name: /开始新生活/ }), "开始新生活"); await click(page.getByRole("button", { name: /下一步：确认/ }), "下一步：确认"); await click(page.getByRole("button", { name: /开始生活/ }), "开始生活"); await page.locator(".scene").waitFor(); await exitFacility("downtown_residential"); await overview("downtown"); }
  await atlas("downtown"); await stateMatches({ locationId: "map", region: "downtown" }); await listCheck("four-district-names", ["紫羊区", "伯月新区", "泊月区"]); assert.match(await page.locator(".atlas-header").innerText(), /树堰区/);
  const industrialAnchor = await pin("downtown_industrial").evaluate((element) => ({ x: element.style.left, y: element.style.top, title: element.title }));
  result.checks.push({ label: "industrial-road-anchor", ...industrialAnchor }); await shot("downtown-industrial-road-anchor");
  await click(pin("downtown_industrial"), "工业园区路边入口"); await stateMatches({ locationId: "map", region: "downtown_industrial" }); await atlas("downtown_industrial"); await shot("industrial-entry"); await overview("downtown");
  const before = await readState(); for (const vehicle of ["car", "e_bike", "tricycle", "bicycle"]) assert(!before.flags[`item_${vehicle}`], "公共交通测试初态应无私人载具");
  assert.match(await pin("development").getAttribute("title"), /长途地铁|5.*元/); await click(pin("development"), "长途地铁进入伯月新区");
  const arrival = await stateMatches({ locationId: "map", region: "development" }); assert.equal(before.player.money - arrival.player.money, 5); assert.equal(minutesOf(arrival) - minutesOf(before), 60); assert.equal(arrival.version, 32);
  await atlas("development"); await shot("development-overview"); assert.equal(await pin("development_airport").count(), 0, "伯月新区不再放置机场入口");
  if (fresh) { result.checks.push({ label: "new-game-arrival", cost: 5, minutes: 60 }); return; }
  await listCheck("development-list", ["市三馆", "大学城", "自然保护区", "泊月区"], ["机场"]);
  const zoom = await page.locator(".zoom-value").innerText(); await click(page.getByRole("button", { name: "放大地图", exact: true }), "放大地图"); await page.waitForFunction((previous) => document.querySelector(".zoom-value")?.textContent !== previous, zoom);
  await click(page.getByRole("button", { name: "缩小地图", exact: true }), "缩小地图"); assert.equal(await page.locator(".zoom-value").innerText(), zoom); await click(page.getByRole("button", { name: "重置", exact: true }), "重置地图");
  for (const district of developmentDistricts) {
    await click(pin(district.id), district.title); await stateMatches({ locationId: "map", region: district.id }); await atlas(district.id); assert.deepEqual((await page.locator(`.map-board[data-map-id="${district.id}"]`).last().locator(".map-pin").evaluateAll((pins) => pins.map((pin) => pin.dataset.locationId))).sort(), district.facilities.slice().sort());
    await shot(district.id); for (const id of district.facilities) await visitFacility(id, district.id); await overview("development");
  }
  async function adjacent(target, source) {
    const before = await readState(); await click(pin(target), `${source}前往${target}`); const after = await stateMatches({ locationId: "map", region: target }); await atlas(target);
    assert.equal(before.player.money - after.player.money, 2, "相邻区使用城区地铁票价"); assert.equal(minutesOf(after) - minutesOf(before), 30, "相邻区使用城区地铁时长"); result.checks.push({ label: "adjacent-local-travel", source, target, cost: 2, minutes: 30 });
  }
  await adjacent("boyue", "development"); await shot("boyue-overview"); await adjacent("development", "boyue"); await adjacent("boyue", "development"); await listCheck("boyue-five-districts", ["大学城", "商场", "奥林匹克中心", "泊月夜市", "机场"]);
  for (const district of boyueDistricts) {
    await click(pin(district.id), district.title); await stateMatches({ locationId: "map", region: district.id }); await atlas(district.id);
    if (district.id === "boyue_night_market") { await marketState(false, false); await shot("night-market-day"); await waitUntil18(); await marketState(true, true); }
    assert.deepEqual((await page.locator(`.map-board[data-map-id="${district.id}"]`).last().locator(".map-pin").evaluateAll((pins) => pins.map((pin) => pin.dataset.locationId))).sort(), district.facilities.slice().sort()); await shot(district.id);
    for (const id of district.facilities) await visitFacility(id, district.id); await overview("boyue");
  }
  assert.deepEqual(result.visitedFacilities.filter((id) => id.startsWith("boyue_")).sort(), expectedBoyueFacilities);
  await click(pin("development_airport"), "泊月区机场直接进入"); await stateMatches({ locationId: "airport", region: "development_airport" }); result.visitedFacilities.push("airport");
  assert.equal(await page.locator('.map-board[data-map-id="development_airport"]').count(), 0); assert.match(await page.getByRole("button", { name: /出门 \/ 回/ }).first().innerText(), /泊月区/);
  await shot("airport-direct"); await exitFacility("boyue"); await shot("airport-return-boyue"); await adjacent("development", "boyue");
  await click(pin("development_culture"), "前往市三馆巴士站"); await atlas("development_culture"); await click(pin("development_bus_station"), "伯月新区巴士站"); await stateMatches({ locationId: "development_bus_station" });
  const outbound = await readState(); await shot("bus-to-city"); await click(page.locator(".development-bus-board"), "巴士返回树堰区"); const city = await stateMatches({ locationId: "bus_station", region: "downtown_station" });
  assert.equal(outbound.player.money - city.player.money, 10); assert.equal(minutesOf(city) - minutesOf(outbound), (60 - outbound.time.minute) % 60 + 30); await shot("bus-city-arrival");
  await click(page.locator(".development-bus-board"), "巴士前往伯月新区"); const back = await stateMatches({ locationId: "development_bus_station", region: "development_culture" }); assert.equal(city.player.money - back.player.money, 10); assert.equal(minutesOf(back) - minutesOf(city), (60 - city.time.minute) % 60 + 30); await shot("bus-development-arrival");
  result.checks.push({ label: "bus-both-directions", firstMinutes: minutesOf(city) - minutesOf(outbound), secondMinutes: minutesOf(back) - minutesOf(city), totalCost: 20 });
  if (result.viewport.id === "portrait") { await exitFacility("development_culture"); await page.evaluate(() => localStorage.setItem("urban-life-ui-gamemode", "pe")); await page.reload({ waitUntil: "load", timeout: 180000 }); await click(page.getByRole("button", { name: /继续生活/ }), "PE竖屏继续生活"); await page.locator(".mobile-portrait-block").waitFor(); await shot("portrait-mode-layout"); }
}
const nightCases = [
  { entry: "texas-fri18", day: 7, hour: 18, texas: false, venues: true },
  { entry: "texas-sat05", day: 8, hour: 5, texas: false, venues: true },
  { entry: "texas-sat12", day: 8, hour: 12, texas: false, venues: false },
  { entry: "texas-sat18", day: 8, hour: 18, texas: true, venues: true },
  { entry: "texas-sun05", day: 9, hour: 5, texas: true, venues: true },
  { entry: "texas-sun18", day: 9, hour: 18, texas: true, venues: true },
  { entry: "texas-mon05", day: 10, hour: 5, texas: true, venues: true },
  { entry: "texas-mon06", day: 10, hour: 6, texas: false, venues: false },
];
try {
  const pc = viewports.find(({ id }) => id === "pc");
  if (pc && entries.has("new-game")) await scenario(pc, "new-game", seed(), (qa) => mainRoute(qa, true));
  if (entries.has("old-save")) for (const viewport of viewports) await scenario(viewport, "old-save", seed(), mainRoute);
  if (pc && entries.has("midnight-bus")) await scenario(pc, "midnight-bus", seed({ day: 12, hour: 23, minute: 40, locationId: "bus_station", region: "downtown_station", navStack: ["map", "downtown", "downtown_station"] }), async (qa) => {
    const before = await qa.stateMatches({ locationId: "bus_station" }); await qa.page.locator(".development-bus-panel").waitFor(); const text = await qa.page.locator(".development-bus-panel").innerText(); assert.match(text, /次日 00:00/); assert.match(text, /次日 00:30/);
    await qa.shot("midnight-city-station"); await qa.click(qa.page.locator(".development-bus-board"), "午夜巴士前往伯月新区"); const arrival = await qa.stateMatches({ locationId: "development_bus_station", region: "development_culture" });
    assert.equal(arrival.time.day, 13); assert.equal(arrival.time.hour, 0); assert.equal(arrival.time.minute, 30); assert.equal(minutesOf(arrival) - minutesOf(before), 50); assert.equal(before.player.money - arrival.player.money, 10);
    await qa.shot("midnight-development-arrival"); await qa.click(qa.page.locator(".development-bus-board"), "凌晨巴士返回树堰区"); const back = await qa.stateMatches({ locationId: "bus_station", region: "downtown_station" });
    assert.equal(back.time.hour, 1); assert.equal(back.time.minute, 30); assert.equal(minutesOf(back) - minutesOf(arrival), 60); assert.equal(arrival.player.money - back.player.money, 10); await qa.shot("midnight-city-return");
  });
  if (entries.has("old-airport")) for (const viewport of viewports) await scenario(viewport, "old-airport", seed({ locationId: "airport", region: "development_airport", area: "development_airport", navStack: ["map", "development", "development_airport"] }), async (qa) => {
    const loaded = await qa.stateMatches({ locationId: "airport", region: "development_airport" }); assert.equal(loaded.version, 32); assert(!loaded.navStack.includes("development"), "机场旧档导航应迁移至泊月区"); assert(loaded.navStack.includes("boyue"));
    await qa.shot("old-airport-migrated"); await qa.page.reload({ waitUntil: "load", timeout: 180000 }); await qa.click(qa.page.getByRole("button", { name: /继续生活/ }), "重新加载机场旧档");
    const reloaded = await qa.stateMatches({ locationId: "airport", region: "development_airport" }); assert(reloaded.navStack.includes("boyue")); await qa.shot("old-airport-reloaded"); await qa.exitFacility("boyue"); await qa.shot("old-airport-return-boyue");
  });
  if (pc && entries.has("night-boundaries")) {
    for (const test of nightCases) await scenario(pc, test.entry, seed({ day: test.day, hour: test.hour, region: "boyue_night_market", area: "boyue_night_market", navStack: ["map", "boyue", "boyue_night_market"] }), async (qa) => {
      await qa.stateMatches({ locationId: "map", region: "boyue_night_market" }); await qa.marketState(test.texas, test.venues); await qa.shot("night-boundary"); for (const id of ordinaryNightFacilities) await qa.visitFacility(id, "boyue_night_market"); if (test.texas) await qa.visitFacility("boyue_texas_shop", "boyue_night_market");
    });
    await scenario(pc, "texas-sat-opening-wait", seed({ day: 8, hour: 17, minute: 30, region: "boyue_night_market", area: "boyue_night_market", navStack: ["map", "boyue", "boyue_night_market"] }), async (qa) => { await qa.marketState(false, false); await qa.waitHours(0.5); await qa.marketState(true, true); await qa.visitFacility("boyue_texas_shop", "boyue_night_market"); await qa.shot("opened-at18"); });
    await scenario(pc, "texas-mon-closing-wait", seed({ day: 10, hour: 5, minute: 30, locationId: "boyue_texas_shop", region: "boyue_night_market", area: "boyue_night_market", navStack: ["map", "boyue", "boyue_night_market"] }), async (qa) => { await qa.stateMatches({ locationId: "boyue_texas_shop" }); await qa.shot("texas-before-close"); await qa.waitHours(0.5); await qa.stateMatches({ locationId: "map", region: "boyue_night_market" }); await qa.marketState(false, false); await qa.shot("closed-at06-auto-exit"); });
  }
  report.passed = report.scenarios.length > 0 && report.scenarios.every(({ passed }) => passed);
  report.visualAcceptance = report.passed && !logicPrecheck && shotsEnabled;
  report.coverage = {
    boyueFacilitiesByViewport: Object.fromEntries(report.scenarios.filter(({ entry }) => entry === "old-save").map(({ viewport, visitedFacilities }) => [viewport.id, [...new Set(visitedFacilities.filter((id) => id.startsWith("boyue_")))].sort()])),
    nightAvailability: report.scenarios.flatMap(({ entry, checks }) => checks.filter(({ label }) => label === "market-availability").map((check) => ({ entry, ...check }))),
    oldAirportReloadViewports: report.scenarios.filter(({ entry, passed }) => entry === "old-airport" && passed).map(({ viewport }) => viewport.id),
    allActionsUseMouseOrTouch: report.scenarios.every(({ clicks }) => clicks.every(({ input }) => input === "mouse" || input === "touch")),
  };
  report.totals = { scenarios: report.scenarios.length, actions: report.scenarios.reduce((sum, scenario) => sum + scenario.clicks.length, 0), screenshots: report.scenarios.reduce((sum, scenario) => sum + scenario.screenshots.length, 0), errors: report.scenarios.reduce((sum, scenario) => sum + scenario.errors.length, 0), failedResources: report.scenarios.reduce((sum, scenario) => sum + scenario.failedResources.filter(({ reason }) => reason !== "net::ERR_ABORTED").length, 0) };
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
} finally { await browser.close(); }
console.log(`Boyue QA ${report.passed ? "PASS" : "FAIL"}: ${output}`);
if (!report.passed) process.exitCode = 1;
