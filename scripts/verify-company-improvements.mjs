/** 本轮公司旅程：只在启动写入合法存档，之后以真实控件操作并经快速存档读取结果。 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const url = process.env.QA_URL || 'http://127.0.0.1:1427/';
const out = resolve(root, process.env.QA_OUT || 'docs/company-commute-headgear-1497-20261024/journeys');
mkdirSync(out, { recursive: true });
const reportFile = join(out, 'verification.json');
const report = { url, startedAt: new Date().toISOString(), policy: 'Startup fixture storage only; real UI clicks without force; current game state is read exclusively from localStorage after a successful menu quick-save. Core commute simulation runs outside Chrome against that saved initial state.', fixtureServerClosedBeforeBrowser: false, browser: '', scenarios: [], passed: false };
const writeReport = () => writeFileSync(reportFile, JSON.stringify(report, null, 2));
const clone = value => JSON.parse(JSON.stringify(value));
const fixtureServer = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let api;
try {
  api = Object.assign({}, ...await Promise.all([
    '/src/game/core/state.ts', '/src/game/core/company.ts', '/src/game/core/companyConfig.ts',
    '/src/game/core/companyCommute.ts', '/src/game/core/companyReturnHome.ts', '/src/game/core/actions.ts', '/src/game/core/housing.ts',
    '/src/game/core/calendar.ts', '/src/game/core/time.ts',
  ].map(file => fixtureServer.ssrLoadModule(file))));
} finally { await fixtureServer.close(); report.fixtureServerClosedBeforeBrowser = true; }

function applicant() {
  const state = api.createInitialState(149724); state.mode = 'eternal'; state.player.money = 100000;
  state.time.hour = 10; state.player.skills.programming = state.player.skills.design = 3;
  state.developmentHistory = { total: 25, byType: { home_design: 25 }, migrated: true };
  state.tutorial = { done: ['eat', 'work', 'sleep'], activeStep: -1 };
  Object.assign(state, { locationId: 'municipal_hall', region: 'downtown_commercial', area: 'downtown_commercial', navStack: ['map', 'downtown', 'downtown_commercial'] });
  Object.assign(state.player.attrs, { stamina: 100, health: 100, mood: 100, hygiene: 100, satiety: 100 });
  return state;
}
function resident() {
  const state = applicant(); assert(api.registerCompany(state, '头套创业工作室', 2).ok);
  state.locationId = 'electronics_store'; assert(api.buyCompanyComputers(state, 'mid', 4).ok);
  state.locationId = 'company_office_single'; assert(api.assignCompanyComputer(state, state.company.computers[0].id, 'founder').ok);
  assert(api.interviewCompany(state).ok);
  for (const candidate of state.company.candidates) assert(api.hireCompanyEmployee(state, candidate.id).ok);
  for (let index = 0; index < state.company.employees.length; index++) assert(api.assignCompanyEmployee(state, state.company.employees[index].id, ['programming', 'design', 'maintenance'][index]).ok);
  assert(api.startCompanyProject(state, 'programming', '工具软件', 'medium', true).ok);
  assert(api.startCompanyProject(state, 'design', '界面设计', 'medium', true).ok);
  state.company.royaltyCents = 200000;
  while (api.weekdayOf(state.time) >= 5 || state.time.hour !== 10) api.advanceHours(state, state.time.hour >= 10 ? 34 - state.time.hour : 10 - state.time.hour, false, true);
  assert(api.signLease(state, 'old_apartment').ok);
  assert(api.moveTo(state, 'old_apartment').ok);
  Object.assign(state.player.attrs, { stamina: 100, health: 100, mood: 100, hygiene: 100, satiety: 100 });
  assert.equal(state.locationId, 'old_apartment'); return state;
}
const runtime = process.env.QA_PW || 'C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const playwright = await import(pathToFileURL(runtime).href), chromium = playwright.chromium ?? playwright.default?.chromium;
const chrome = process.env.QA_CHROME || join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'); assert(existsSync(chrome));
const browser = await chromium.launch({ headless: process.env.QA_HEADLESS !== '0', executablePath: chrome, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] });
report.browser = browser.version(); writeReport();
const cases = [
  { id: 'registration-single', kind: 'registration', scene: 'flat', mode: 'pc', width: 1440, height: 900, zoom: 1 },
  { id: 'home-company-pc-3d', kind: 'commute', scene: '3d', mode: 'pc', width: 1440, height: 900, zoom: 1 },
  { id: 'home-company-pc-flat', kind: 'commute', scene: 'flat', mode: 'pc', width: 1440, height: 900, zoom: 1 },
  { id: 'home-company-phone-3d', kind: 'commute', scene: '3d', mode: 'pe', width: 852, height: 393, zoom: .7 },
];
try {
  for (const spec of cases) {
    if (process.env.QA_CASES && !process.env.QA_CASES.split(',').includes(spec.id)) continue;
    const scenario = { ...spec, checks: [], screenshots: [], errors: [], failedRequests: [], httpRequests: [], externalFileRequests: [], modelRequests:[], passed: false };
    report.scenarios.push(scenario); writeReport();
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.mode === 'pe', deviceScaleFactor: 1 });
    if (url.startsWith('file:')) await context.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', error => scenario.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') scenario.errors.push(message.text()); });
    page.on('requestfailed', request => scenario.failedRequests.push({ url: request.url().startsWith('data:') ? `data:${request.resourceType()}` : request.url(), error: request.failure()?.errorText }));
    page.on('request', request => { if (/^https?:/.test(request.url())) scenario.httpRequests.push(request.url()); else if (request.url().startsWith('file:') && request.url() !== url) scenario.externalFileRequests.push(request.url()); });
    page.on('request',request=>{if(/\.(?:glb|gltf)(?:\?|$)|\/(?:companyOffice3D|homeRoom3D|cafeRoom3D|convenienceStore3D|GLTFLoader)\./.test(request.url()))scenario.modelRequests.push(request.url());});
    await page.addInitScript(()=>{window.__sceneGpuRequests=[];const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/i.test(kind))window.__sceneGpuRequests.push(kind);return original.call(this,kind,...args);};});
    await page.addInitScript(({ save, spec }) => {
      if (sessionStorage.getItem('company-improvements-qa')) return;
      sessionStorage.setItem('company-improvements-qa', '1'); localStorage.clear();
      const settings = {
        'urban-life-device-setup-v1': '1', 'urban-life-ui-gamemode': spec.mode, 'urban-life-pe-zoom-v3': '1',
        'urban-life-ui-zoom': String(spec.zoom), 'urban-life-show-log': 'false', 'urban-life-scene-mode': spec.scene,
        'urban_life_audio_muted': '1', 'urban_life_audio_bgm_enabled': '0', 'urban_life_save_auto': JSON.stringify(save),
      };
      for (const [key, value] of Object.entries(settings)) localStorage.setItem(key, value);
    }, { save: spec.kind === 'registration' ? applicant() : resident(), spec });
    const screen = async label => { const file = `${spec.id}-${label}.png`; await page.screenshot({ path: join(out, file), animations: 'disabled' }); scenario.screenshots.push(file); };
    const clearLoading = () => page.locator('[data-scene-loading-overlay]').waitFor({ state: 'hidden', timeout: 120000 });
    const quickSave = async () => {
      await clearLoading();
      const quick = page.getByRole('button', { name: /快速存档（自动槽）/ });
      if (!await quick.isVisible().catch(() => false)) {
        const homeClock = page.getByRole('button', { name: '打开菜单与存档', exact: true });
        if (await homeClock.isVisible().catch(() => false)) await homeClock.click();
        else await page.getByRole('button', { name: '菜单与存档', exact: true }).click();
      }
      await quick.click(); await quick.waitFor({ state: 'hidden' });
      return page.evaluate(() => JSON.parse(localStorage.getItem('urban_life_save_auto')));
    };
    const bounds = async selector => {
      const metrics = await page.locator(selector).evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, pageOverflow: document.documentElement.scrollWidth - innerWidth }; });
      assert(metrics.x >= 0 && metrics.y >= 0 && metrics.right <= spec.width + 2 && metrics.bottom <= spec.height + 2, `${selector} 超出屏幕：${JSON.stringify(metrics)}`);
      assert(metrics.pageOverflow <= 2, '页面横向溢出'); return metrics;
    };
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 240000 });
      if (await page.getByRole('button', { name: '关闭公告', exact: true }).isVisible().catch(() => false)) await page.getByRole('button', { name: '关闭公告', exact: true }).click();
      await page.getByRole('button', { name: /继续生活/ }).click(); await clearLoading();
      if (spec.kind === 'registration') {
        const before = await quickSave(); assert.equal(before.company, null); assert.equal(before.locationId, 'municipal_hall');
        await page.getByRole('button', { name: '企业窗口', exact: true }).click();
        const window = page.locator('[aria-label="企业登记窗口"]'); await window.waitFor();
        await window.getByPlaceholder('填写公司名称').fill('单间起步验收公司');
        await window.locator('input[name="company-starting-office"][value="2"]').check();
        await window.getByRole('button', { name: '准备注册公司', exact: true }).click();
        assert.match(await window.locator('.confirm').innerText(), /入驻写字楼单间，支付 4000 元/);
        scenario.checks.push({ selectedStage: 2, quotedFee: 4000, confirmation: await window.locator('.confirm').innerText() }); await screen('confirm-4000');
        await window.getByRole('button', { name: '确认登记并付款', exact: true }).click();
        assert.match(await window.innerText(), /下一阶段：大办公室，需要总人数达到 6 人/); await screen('registered');
        await page.getByRole('button', { name: '关闭服务窗口', exact: true }).click();
        const after = await quickSave();
        assert.equal(after.company.stage, 2); assert.equal(after.company.name, '单间起步验收公司');
        assert.equal(after.company.depositCents, 200000); assert.equal(after.player.money, before.player.money - 4000);
        assert.equal(after.locationId, 'municipal_hall'); assert.deepEqual(after.time, before.time);
        assert.equal(api.companyExpansionQuote(after).next.requiredPeople, 6);
        scenario.checks.push({ actualSave: { stage: after.company.stage, moneyBefore: before.player.money, moneyAfter: after.player.money, location: after.locationId, timeUnchanged: true, nextExpansionPeople: 6 } });
      } else {
        await page.locator('[data-home-departure]').waitFor();
        if (spec.scene === '3d') await page.locator('.home-world canvas').waitFor();
        if(spec.mode==='pe'&&spec.scene==='3d'){
          for(let angle=0;angle<4;angle++){
            await page.waitForFunction(angle=>document.querySelector('[data-home-renderer="stills"]')?.dataset.homeView===String(angle),angle);
            await screen(`home-fixed-angle-${angle}`);
            if(angle<3)await page.getByRole('button',{name:'向右旋转90度',exact:true}).click();
          }
          scenario.checks.push({homeFourFixedAngles:true});
        }
        const before = await quickSave(); assert.equal(before.locationId, 'old_apartment');
        const expected = clone(before), quote = api.companyCommuteQuote(before), result = api.commuteToCompany(expected);
        assert(quote.ok, quote.reason); assert(result.ok, result.reason);
        await page.locator('[data-home-departure]').click();
        const commute = page.locator('[data-home-company-commute]'); await commute.waitFor(); assert(await commute.isEnabled());
        assert.match(await commute.innerText(), /去公司/); assert((await commute.innerText()).includes(quote.detail), `通勤报价应显示 ${quote.detail}`);
        scenario.checks.push({ departureBounds: await bounds('.departure-menu'), quote }); await screen('departure');
        await commute.click(); await page.locator('[data-company-office="2"]').waitFor(); await clearLoading();
        await page.waitForFunction(() => document.querySelectorAll('[data-company-office="2"]').length === 1);
        if (spec.scene === '3d') await page.locator('.office canvas').waitFor();
        await page.locator('[data-office-door]').waitFor(); await screen('office-headgear-door');
        let arrived = await quickSave();
        assert.deepEqual(arrived.time, expected.time); assert.equal(arrived.player.money, expected.player.money);
        assert.equal(arrived.locationId, expected.locationId); assert.equal(arrived.region, expected.region);
        assert.deepEqual(arrived.company, expected.company);
        scenario.checks.push({ actualCommute: { destination: arrived.locationId, region: arrived.region, time: arrived.time, moneyBefore: before.player.money, moneyAfter: arrived.player.money, hours: quote.hours, fare: quote.fare, matchesOrdinaryCoreRoute: true }, physicalDoorBounds: await bounds('[data-office-door]') });
        const returnExpected=clone(arrived),homeQuote=api.companyReturnHomeQuote(arrived);assert(homeQuote.ok,homeQuote.reason);assert(api.returnHomeFromCompany(returnExpected).ok);
        await page.locator('[data-office-door]').click();const homeButton=page.locator('[data-company-return-home]');await homeButton.waitFor();assert((await homeButton.innerText()).includes(homeQuote.detail));await screen('return-home-quote');
        await homeButton.click();await page.locator('[data-home-departure]').waitFor();await clearLoading();
        const returned=await quickSave();assert.equal(returned.locationId,returnExpected.locationId);assert.equal(returned.region,returnExpected.region);assert.deepEqual(returned.time,returnExpected.time);assert.equal(returned.player.money,returnExpected.player.money);assert.deepEqual(returned.company,returnExpected.company);await screen('home-after-company');
        scenario.checks.push({companyReturnHome:{quote:homeQuote,matchesOrdinaryCoreRoute:true,actualHome:returned.locationId}});
        const again=clone(returned);assert(api.commuteToCompany(again).ok);await page.locator('[data-home-departure]').click();await page.locator('[data-home-company-commute]').click();await page.locator('[data-company-office="2"]').waitFor();await clearLoading();arrived=await quickSave();assert.deepEqual(arrived.time,again.time);assert.equal(arrived.player.money,again.player.money);
        await page.locator('[data-office-door]').click();
        await page.locator('[data-company-normal-exit]').click(); await clearLoading();
        await page.waitForFunction(() => !document.querySelector('[data-company-office]'));
        const exited = await quickSave(); assert.equal(exited.locationId, 'map');
        assert.deepEqual(exited.company, arrived.company); assert.deepEqual(exited.time, arrived.time); assert.equal(exited.player.money, arrived.player.money);
        scenario.checks.push({ physicalDoorExitsToMap: true, noBusinessMutationOnExit: true, noExtraTimeOrFareOnOfficeExit: true }); await screen('map-after-door');
      }
      if (url.startsWith('file:')) { assert.equal(scenario.httpRequests.length, 0, '便携版有网络请求'); assert.equal(scenario.externalFileRequests.length, 0, '便携版依赖外部文件'); }
      if(spec.mode==='pe'){assert.deepEqual(await page.evaluate(()=>window.__sceneGpuRequests),[]);assert.deepEqual(scenario.modelRequests,[]);scenario.checks.push({phoneWebglRequests:0,phoneModelRequests:0});}
      assert.equal(scenario.failedRequests.length, 0, JSON.stringify(scenario.failedRequests));
      assert.equal(scenario.errors.length, 0, scenario.errors.join('\n')); scenario.passed = true;
      process.stdout.write(`${spec.id}: passed\n`);
    } catch (error) { scenario.failure = error.stack; await screen('failure').catch(() => {}); throw error; }
    finally { writeReport(); await context.close(); }
  }
  assert(report.scenarios.length > 0); report.passed = report.scenarios.every(scenario => scenario.passed);
} catch (error) { report.failure = error.stack; process.exitCode = 1; }
finally {
  try { await browser.close(); } catch (error) { report.cleanupError = String(error); report.passed = false; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); report.exitCodeAtCompletion = process.exitCode ?? 0; writeReport();
}
process.stdout.write(`Company improvements journeys: ${report.scenarios.filter(scenario => scenario.passed).length}/${report.scenarios.length} passed.\n`);
