/** 便携版验收：Vite SSR 仅用于生成合法初始存档，实际游戏通过 file:// 打开。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const portable = resolve(process.env.QA_PORTABLE || join(root, '1.49.7.html'));
const out = resolve(process.env.QA_OUT || join(root, 'docs/office-remaster-1497-20261024/portable'));
assert(existsSync(portable), `先构建便携 HTML，当前文件不存在：${portable}`);
mkdirSync(out, { recursive: true });
const reportPath = join(out, 'verification.json');
const fileUrl = pathToFileURL(portable).href;
const hash = createHash('sha256');
for await (const chunk of createReadStream(portable, { highWaterMark: 8 * 1024 * 1024 })) hash.update(chunk);
const report = {
  file: portable, url: fileUrl, bytes: statSync(portable).size, sha256: hash.digest('hex'),
  policy: 'Standalone file:// game; Vite SSR creates startup fixtures and closes before Chrome launches. Startup storage only; actual UI clicks; no live gameState injection. HTTP(S) requests are blocked and fail verification.',
  fixtureServerClosedBeforeBrowser: false, browser: null, renderer: 'Chrome headless with ANGLE SwiftShader; timings are software-renderer measurements, not device FPS claims.',
  startedAt: new Date().toISOString(), scenarios: [], passed: false,
};
const saveReport = () => writeFileSync(reportPath, JSON.stringify(report, null, 2));
saveReport();

const fixtureServer = await createServer({ root, configFile: false, server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
let save;
try {
  const api = {
    ...await fixtureServer.ssrLoadModule('/src/game/core/state.ts'),
    ...await fixtureServer.ssrLoadModule('/src/game/core/company.ts'),
  };
  save = api.createInitialState(1497); save.mode = 'eternal'; save.player.money = 100000;
  save.time.hour = 10; save.locationId = 'municipal_hall'; save.developmentHistory = { total: 10, byType: { home_design: 10 }, migrated: true };
  save.player.skills.programming = save.player.skills.design = 3;
  save.career.passiveIncome = 1200; save.flags.item_laptop_mid = true;
  save.tutorial = { done: ['eat', 'work', 'sleep'], activeStep: -1 };
  assert(api.registerCompany(save, '便携创业工作室').ok);
  save.locationId = 'electronics_store'; assert(api.buyCompanyComputers(save, 'mid', 3).ok);
  Object.assign(save, { locationId: 'dev_incubator', region: 'campus_teacher', area: 'campus_teacher', navStack: ['map', 'campus_teacher'] });
  assert(api.assignCompanyComputer(save, save.company.computers[0].id, 'founder').ok);
  assert(api.interviewCompany(save).ok);
  for (const candidate of save.company.candidates.slice(0, 2)) assert(api.hireCompanyEmployee(save, candidate.id).ok);
  assert(api.startCompanyProject(save, 'programming', '工具软件', 'small', true).ok);
  assert(api.startCompanyProject(save, 'design', '界面设计', 'small', true).ok);
  save.company.employees.forEach((employee, index) => assert(api.assignCompanyEmployee(save, employee.id, index ? 'design' : 'programming').ok));
  assert(api.transferCompanyMoney(save, 20000, 'deposit').ok);
  Object.assign(save.player.attrs, { stamina: 100, health: 100, mood: 100, hygiene: 100, satiety: 100 });
} finally {
  await fixtureServer.close(); report.fixtureServerClosedBeforeBrowser = true; saveReport();
}

const runtime = process.env.QA_PW || 'C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const playwright = await import(pathToFileURL(runtime).href);
const chromium = playwright.chromium ?? playwright.default?.chromium;
const chrome = process.env.QA_CHROME || join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe');
assert(existsSync(chrome), `Chrome 不存在：${chrome}`);
const browser = await chromium.launch({ executablePath: chrome, headless: process.env.QA_HEADLESS !== '0', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] });
report.browser = browser.version();

try {
  for (const scene of ['3d', 'flat']) {
    const scenario = { id: `file-${scene}`, scene, checks: [], screenshots: [], errors: [], warnings: [], httpRequests: [], externalFileRequests: [], failedRequests: [], timingsMs: {}, memory: {}, passed: false };
    report.scenarios.push(scenario); saveReport();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.route(/^https?:\/\//, route => route.abort('blockedbyclient'));
    const page = await context.newPage(); page.setDefaultTimeout(45000);
    page.on('pageerror', error => scenario.errors.push({ type: 'pageerror', message: error.message }));
    page.on('console', message => {
      if (message.type() === 'error') scenario.errors.push({ type: 'console', message: message.text() });
      else if (message.type() === 'warning') scenario.warnings.push(message.text());
    });
    page.on('request', request => {
      if (/^https?:/.test(request.url())) scenario.httpRequests.push(request.url());
      else if (request.url().startsWith('file:') && request.url() !== fileUrl) scenario.externalFileRequests.push(request.url());
    });
    page.on('requestfailed', request => scenario.failedRequests.push({ url: request.url().startsWith('data:') ? `data:${request.resourceType()}` : request.url(), error: request.failure()?.errorText }));
    await page.addInitScript(({ save, scene }) => {
      // PerformanceObserver 仅记录运行指标，不接触游戏状态或导入应用模块。
      window.__companyPortableQa = { longTasks: [] };
      try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (window.__companyPortableQa.longTasks.length < 2000) window.__companyPortableQa.longTasks.push({ startTime: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true }); } catch { /* 浏览器不支持时在报告中保持空列表 */ }
      if (sessionStorage.getItem('portable-company-qa')) return;
      sessionStorage.setItem('portable-company-qa', '1'); localStorage.clear();
      for (const [key, value] of Object.entries({
        'urban-life-device-setup-v1': '1', 'urban-life-ui-gamemode': 'pc', 'urban-life-pe-zoom-v3': '1',
        'urban-life-ui-zoom': '1', 'urban-life-show-log': 'false', 'urban-life-scene-mode': scene,
        'urban_life_audio_muted': '1', 'urban_life_audio_bgm_enabled': '0', 'urban_life_save_auto': JSON.stringify(save),
      })) localStorage.setItem(key, value);
    }, { save, scene });

    const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
    const memory = async label => {
      const metrics = await cdp.send('Performance.getMetrics');
      const names = ['JSHeapUsedSize', 'JSHeapTotalSize', 'Documents', 'Nodes', 'JSEventListeners'];
      scenario.memory[label] = Object.fromEntries(metrics.metrics.filter(metric => names.includes(metric.name)).map(metric => [metric.name, metric.value]));
    };
    const screen = async label => { const file = `${scenario.id}-${label}.png`; await page.screenshot({ path: join(out, file), animations: 'disabled' }); scenario.screenshots.push(file); };
    const waitOffice = async () => {
      // 实际读档时旧 GameView 会保留到退场动画完成；先等遮罩和退场结束再要求唯一场景。
      await page.locator('[data-company-office="1"]').first().waitFor();
      await page.locator('[data-scene-loading-overlay]').waitFor({ state: 'hidden', timeout: 120000 });
      await page.waitForFunction(() => document.querySelectorAll('[data-company-office="1"]').length === 1);
      if (scene === '3d') await page.locator('.office canvas').waitFor();
      else assert.equal(await page.locator('.flat-plan [data-office-seat]').count(), 3);
    };
    const stored = () => page.evaluate(() => {
      const current = JSON.parse(localStorage.getItem('urban_life_save_auto'));
      return { version: current.version, company: current.company, time: current.time, money: current.player.money };
    });
    const openMenu = async () => {
      // 从菜单进入存档页再读档会恢复原菜单；它已打开时直接使用可见控件。
      const quick = page.getByRole('button', { name: /快速存档（自动槽）/ });
      if (!await quick.isVisible().catch(() => false)) await page.getByRole('button', { name: '打开菜单与存档', exact: true }).click();
      await quick.waitFor();
    };
    const quickSave = async () => {
      const button = page.getByRole('button', { name: /快速存档（自动槽）/ });
      await button.click();
      // 正式快速存档成功后会关闭菜单；保存失败时菜单仍保留，不能把失败当作成功。
      await button.waitFor({ state: 'hidden' });
    };

    try {
      const bootStart = Date.now(); await page.goto(fileUrl, { waitUntil: 'load', timeout: 240000 });
      await page.locator('.title-footer .release-info').waitFor();
      assert.match(await page.locator('.title-footer .release-info').innerText(), /1\.49\.7/);
      scenario.timingsMs.fileToTitle = Date.now() - bootStart; scenario.checks.push({ titleVersion: '1.49.7', protocol: new URL(page.url()).protocol });
      await memory('title'); await screen('title');
      if (await page.getByRole('button', { name: '关闭公告', exact: true }).isVisible().catch(() => false)) await page.getByRole('button', { name: '关闭公告', exact: true }).click();
      const officeStart = Date.now(); await page.getByRole('button', { name: /继续生活/ }).click(); await waitOffice();
      scenario.timingsMs.continueToOffice = Date.now() - officeStart; await memory('office'); await screen('office');
      assert.equal(await page.locator('.office canvas').count(), scene === '3d' ? 1 : 0);
      scenario.checks.push({ companyRoute: 'dev_incubator', scene, canvasCount: await page.locator('.office canvas').count() });

      await page.locator('.office .manage').click(); const panel = page.locator('[aria-label="公司经营面板"]'); await panel.waitFor();
      for (const tab of ['概况', '项目', '员工', '面试', '设备', '财务']) {
        await panel.locator('nav').getByRole('button', { name: new RegExp(`^${tab}`) }).click();
        const bounds = await panel.evaluate(node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, horizontalOverflow: node.scrollWidth - node.clientWidth }; });
        assert(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= 1442 && bounds.bottom <= 902, `${tab}面板越界`); assert(bounds.horizontalOverflow <= 2, `${tab}面板横向溢出`);
        if (tab === '员工') { const text = await panel.innerText(); assert.match(text, /员工A/); assert.match(text, /员工B/); scenario.checks.push({ employeeLabels: ['员工A', '员工B'] }); }
        if (tab === '面试') assert.match(await panel.innerText(), /员工C/);
        scenario.checks.push({ tab, bounds }); await screen(tab);
      }
      await page.getByRole('button', { name: '关闭公司经营面板', exact: true }).click();
      await page.getByRole('button', { name: '打开手机', exact: true }).click(); await page.getByRole('button', { name: '关机并收起手机', exact: true }).waitFor();
      await screen('phone'); await page.getByRole('button', { name: '关机并收起手机', exact: true }).click(); scenario.checks.push({ phoneOpenedAndClosed: true });

      await openMenu(); await screen('menu'); await quickSave(); const before = await stored();
      assert.equal(before.version, 36); await openMenu();
      await page.getByRole('button', { name: /存档 \/ 读档/ }).click();
      const autoSlot = page.locator('.slot-card').filter({ has: page.locator('.slot-name', { hasText: '自动存档' }) });
      await autoSlot.getByRole('button', { name: '读档', exact: true }).click(); await waitOffice();
      await openMenu(); await quickSave(); const after = await stored(); assert.deepEqual(after, before, '通过实际存档页面读档后发生重复结算');
      scenario.checks.push({ actualUiSaveLoad: true, noDuplicateSettlement: true, currentVersion: 36 });
      scenario.longTasksBeforeReload = await page.evaluate(() => window.__companyPortableQa?.longTasks ?? []);
      await openMenu();
      await page.getByRole('button', { name: /返回主菜单/ }).click(); await page.locator('.title-footer .release-info').waitFor();
      const reloadStart = Date.now(); await page.reload({ waitUntil: 'load', timeout: 240000 });
      if (await page.getByRole('button', { name: '关闭公告', exact: true }).isVisible().catch(() => false)) await page.getByRole('button', { name: '关闭公告', exact: true }).click();
      await page.getByRole('button', { name: /继续生活/ }).click(); await waitOffice();
      assert.deepEqual(await stored(), after); scenario.timingsMs.reloadAndResume = Date.now() - reloadStart; scenario.checks.push({ fileReloadNoDuplicateSettlement: true });
      await memory('resumed');
      scenario.longTasks = await page.evaluate(() => window.__companyPortableQa?.longTasks ?? []);
      scenario.navigation = await page.evaluate(() => performance.getEntriesByType('navigation').map(entry => ({ startTime: entry.startTime, domContentLoadedEventEnd: entry.domContentLoadedEventEnd, loadEventEnd: entry.loadEventEnd, transferSize: entry.transferSize })));
      assert.equal(scenario.httpRequests.length, 0, `便携版尝试加载网络资源：${scenario.httpRequests.join(', ')}`);
      assert.equal(scenario.externalFileRequests.length, 0, `便携版仍依赖外部文件：${scenario.externalFileRequests.join(', ')}`);
      assert.equal(scenario.failedRequests.length, 0, JSON.stringify(scenario.failedRequests));
      assert.equal(scenario.errors.length, 0, JSON.stringify(scenario.errors));
      scenario.passed = true; process.stdout.write(`${scenario.id}: passed, file-to-title ${scenario.timingsMs.fileToTitle} ms, office ${scenario.timingsMs.continueToOffice} ms\n`);
    } catch (error) {
      scenario.failure = error.stack; await screen('failure').catch(() => {}); throw error;
    } finally { saveReport(); await context.close(); }
  }
  report.passed = report.scenarios.length === 2 && report.scenarios.every(scenario => scenario.passed); assert(report.passed);
} catch (error) {
  report.failure = error.stack; process.exitCode = 1;
} finally {
  try { await browser.close(); } catch (error) { report.cleanupError = String(error); report.passed = false; process.exitCode = 1; }
  report.finishedAt = new Date().toISOString(); report.exitCodeAtCompletion = process.exitCode ?? 0; saveReport();
}
process.stdout.write(`Portable verification ${report.passed ? 'passed' : 'FAILED'}: ${reportPath}\n`);
