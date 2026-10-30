import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const playwrightModule = await import(pathToFileURL(process.env.QA_PW).href);
const chromium = playwrightModule.chromium ?? playwrightModule.default?.chromium;
if (!chromium) throw new Error("Unable to resolve Playwright chromium export");
const out = resolve('qa-shots/map-renewal');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROME });
const page = await browser.newPage({ viewport: { width: 1442, height: 986 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`console:${message.type()}:${message.text()}`);
});
page.on('response', response => {
  if (response.status() >= 400) errors.push(`response:${response.status()}:${response.url()}`);
});
page.on('requestfailed', request => errors.push(`request:${request.url()}:${request.failure()?.errorText ?? 'failed'}`));
await page.goto('http://127.0.0.1:1421/', { waitUntil: 'networkidle', timeout: 120000 });
async function ensureGame() {
  const menuStart = page.getByRole('button', { name: /开始新生活/ });
  if (await menuStart.count()) {
    await menuStart.click();
    await page.getByRole('button', { name: /下一步：确认/ }).click();
    await page.getByRole('button', { name: /开始生活/ }).click();
  }
  await page.locator('.scene').waitFor({ timeout: 30000 });
  const exit = page.getByRole('button', { name: /出门/ });
  if (await exit.count()) {
    await exit.first().click();
    await page.locator('.map-image').last().waitFor({ timeout: 30000 });
  }
  const back = page.getByRole('button', { name: /返回上一级/ });
  if (await back.count()) {
    await back.first().click();
    await page.locator('.map-image').last().waitFor({ timeout: 30000 });
  }
  // 三级地点地图才带有「等待」按钮，作为后续精确设置时间的 staging 页。
  await clickPin('市中心');
}
async function waitMap() {
  await page.locator('.map-image').last().waitFor({ timeout: 30000 });
  // 地图跨层会播放约 1.8s 的过场；不等遮罩退场，Playwright 会把地图按钮判定为被 overlay 拦截。
  await page.waitForTimeout(2200);
}
async function clickPin(text) {
  const pin = page.locator('.map-pin').filter({ hasText: text }).first();
  if (!(await pin.count())) return false;
  await pin.click();
  await waitMap();
  return true;
}
async function clickNav(text) {
  const button = page.getByRole('button', { name: text }).first();
  if (!(await button.count())) return false;
  try {
    await button.click();
  } catch (error) {
    console.error('qa overlays', await page.locator('.overlay').allTextContents());
    throw error;
  }
  await waitMap();
  return true;
}
async function navigateToAtlas(id) {
  if (id === 'downtown') {
    // 点击一次商场再返回市区，既校验真实导航，也让时段修改经过 Svelte 事件刷新。
    await clickNav(/返回上一级/);
    if (await clickPin('商场')) await clickNav(/返回上一级/);
    return;
  }
  if (id === 'downtown_mall') {
    if (await clickNav(/商场出口/)) return;
    await clickPin('商场');
    return;
  }
  if (id === 'mall_interior') {
    if (await clickPin('商场主入口')) return;
    if (await clickPin('商场')) await clickPin('商场主入口');
  }
}
let qaHour = 7;
async function setHourUi(target) {
  let delta = (target - qaHour + 24) % 24;
  for (const hours of [12, 6, 3, 2, 1]) {
    while (delta >= hours) {
      const button = page.getByRole('button', { name: `等 ${hours} 小时` }).first();
      await button.waitFor({ timeout: 30000 });
      await button.click({ force: true });
      await waitMap();
      const resultModal = page.locator('.result-modal').last();
      if (await resultModal.count() && await resultModal.isVisible().catch(() => false)) {
        await resultModal.getByRole('button', { name: /继续/ }).click({ force: true });
        await page.waitForTimeout(250);
      }
      delta -= hours;
      qaHour = (qaHour + hours) % 24;
    }
  }
  if (delta === 0.5) {
    const button = page.getByRole('button', { name: '等 30 分钟' }).first();
    await button.waitFor({ timeout: 30000 });
    await button.click({ force: true });
    await waitMap();
    const resultModal = page.locator('.result-modal').last();
    if (await resultModal.count() && await resultModal.isVisible().catch(() => false)) {
      await resultModal.getByRole('button', { name: /继续/ }).click({ force: true });
      await page.waitForTimeout(250);
    }
    qaHour = (qaHour + 0.5) % 24;
  }
  if (delta !== 0) throw new Error(`Unable to set QA hour from ${qaHour} to ${target}`);
}
async function scene(id, hour = 21) {
  await setHourUi(hour);
  await navigateToAtlas(id);
  try {
    await page.locator('.map-image').last().waitFor({ timeout: 30000 });
  } catch (error) {
    await page.screenshot({ path: `${out}/failure-${id}.png`, fullPage: true });
    writeFileSync(`${out}/failure-${id}.html`, await page.content());
    console.error(`scene ${id} failed`, await page.locator('body').innerText().catch(() => ''));
    throw error;
  }
  await page.evaluate(async () => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
  await page.waitForTimeout(750);
}
await ensureGame();
const report = [];
for (const id of ['downtown', 'downtown_mall', 'mall_interior']) {
  await scene(id);
  await page.screenshot({ path: `${out}/${id}-night.png` });
  report.push(await page.locator('.map-board').evaluate(el => ({
    period: el.dataset.period, src: el.querySelector('img')?.getAttribute('src'),
    pins: [...el.querySelectorAll('button')].map(b => ({ text: b.innerText, disabled: b.disabled })),
    filter: getComputedStyle(el.querySelector('img')).filter,
  })));
}
await scene('downtown_mall', 14);
await page.getByRole('button', { name: /商场主入口/ }).click();
await page.getByRole('heading', { name: '商场内部', exact: true }).waitFor();
await page.getByRole('button', { name: /街角衣橱/ }).first().click();
await page.getByRole('button', { name: /试穿|挑选服装|选购服装/ }).first().click();
await page.locator('.store-modal').waitFor();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/fashion-store.png` });
report.push({ store: await page.locator('.store-modal').innerText() });
await page.locator('.store-modal').getByRole('button', { name: '取消试穿' }).last().click({ force: true });
await page.waitForTimeout(1000);
await page.setViewportSize({ width: 932, height: 430 });
await page.evaluate(() => localStorage.setItem('urban-life-ui-gamemode', 'pe'));
await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
await page.getByRole('button', { name: /继续生活/ }).click();
await page.locator('.scene').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: /出门/ }).click();
await waitMap();
await page.screenshot({ path: `${out}/mall-interior-mobile.png` });
report.push({ mobile: await page.evaluate(() => ({
  rects: Object.fromEntries(
    ['.scene-body', '.region-view', '.atlas', '.map-viewport', '.map-board', '.atlas-header', '.atlas-wait', '.atlas-caption', '.wait-bar']
      .map((selector) => {
        const el = document.querySelector(selector);
        if (!el) return [selector, null];
        const r = el.getBoundingClientRect();
        return [selector, { x: r.x, y: r.y, width: r.width, height: r.height, display: getComputedStyle(el).display, minHeight: getComputedStyle(el).minHeight, flex: getComputedStyle(el).flex }];
      }),
  ),
  mode: document.documentElement.dataset.gameMode,
  uiZoom: getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim(),
})) });
report.push({ brokenImages: await page.evaluate(() => [...document.images]
  .filter((image) => !image.complete || image.naturalWidth === 0)
  .map((image) => ({ src: image.currentSrc || image.src, alt: image.alt })) ) });
writeFileSync(`${out}/report.json`, JSON.stringify({ report, errors }, null, 2));
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log('Map and store browser QA complete', out);
