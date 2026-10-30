import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

// A separate Chromium profile and a virtual Vite entry keep this visual check
// away from the running game, the user's browser and real saves.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, process.env.LOADING_ART_OUTPUT_DIR || 'docs/scene-loading-20261021/art-preview');
const galleryFile = path.join(root, 'docs/scene-loading-20261021/loading-landmarks-gallery.html');
mkdirSync(output, { recursive: true });
const regions = ['downtown', 'suburb', 'development', 'boyue'];
const times = ['day', 'dusk', 'night', 'late-night'];
const weathers = ['sunny', 'cloudy', 'rain', 'snow', 'heatwave', 'coldwave'];
const virtualId = '\0loading-art-preview';
const previewModule = `
import {mount,flushSync} from 'svelte';
import Overlay from '/src/components/layout/TransitionOverlay.svelte';
import {sceneLoading} from '/src/stores/sceneLoading.svelte.ts';
const target=document.createElement('div');document.body.append(target);mount(Overlay,{target});
let next=1;window.artQA={callbacks:{retry:0,fallback:0},show(value){sceneLoading.current={
 id:next++,sceneKey:'art-preview',regionId:'downtown',label:'朝夕便利店',kind:'3d',time:'day',weather:'sunny',phase:'loading',slow:false,
 retry:()=>this.callbacks.retry++,fallback:()=>this.callbacks.fallback++,...value};flushSync();},clear(){sceneLoading.current=null;flushSync();}};
`;
const previewPlugin = {
  name: 'isolated-loading-art-preview',
  resolveId(id) { if (id === '/@loading-art-preview') return virtualId; },
  load(id) { if (id === virtualId) return previewModule; },
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/art-preview') return next();
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loading art verification</title><style>html,body{margin:0;height:100%;font-family:system-ui}</style><script type="module" src="/@loading-art-preview"></script></html>');
    });
  },
};
const server = await createServer({ root, configFile: false,
  plugins: [previewPlugin, svelte({ compilerOptions: { dev: false, hmr: false } })],
  server: { host: '127.0.0.1', port: Number(process.env.LOADING_ART_PORT || 1447), strictPort: true },
  optimizeDeps: { noDiscovery: true }, appType: 'custom' });
let browser;
const result = { combinations: 0, screenshots: [], layouts: [], motion: [], errors: [], callbacks: null };
try {
  await server.listen();
  const componentFile = path.join(root, 'src/components/layout/LoadingLandmark.svelte');
  const { default: Landmark } = await server.ssrLoadModule('/src/components/layout/LoadingLandmark.svelte');
  const { loadingArtStyle, LOADING_DISTRICTS } = await server.ssrLoadModule('/src/lib/loadingArt.ts');
  const css = compile(readFileSync(componentFile, 'utf8'), { filename: componentFile, generate: 'client' }).css.code;
  let gallery = '';
  for (const region of regions) {
    gallery += `<section id="gallery-${region}"><h2>${LOADING_DISTRICTS[region].name}</h2><div class="grid">`;
    for (const time of times) for (const weather of weathers) {
      const rendered = render(Landmark, { props: { regionId: region, time, weather }, idPrefix: `gallery${result.combinations++}` });
      gallery += `<article style="${loadingArtStyle(time, weather, region)}"><span>${time} / ${weather}</span>${rendered.body}</article>`;
    }
    gallery += '</div></section>';
  }
  const focusMarkup = render(Landmark, { props: { regionId: 'downtown', time: 'day', weather: 'sunny' }, idPrefix: 'focus' }).body;
  const galleryControls = '<section class="focus-stage"><div class="preview-controls"><label>地区 <select id="preview-region">' + regions.map(region => '<option value="' + region + '">' + LOADING_DISTRICTS[region].name + '</option>').join('') + '</select></label><label>时段 <select id="preview-time"><option value="day">白天</option><option value="dusk">黄昏</option><option value="night">夜晚</option><option value="late-night">深夜</option></select></label><label>天气 <select id="preview-weather"><option value="sunny">晴天</option><option value="cloudy">多云</option><option value="rain">雨天</option><option value="snow">雪天</option><option value="heatwave">热浪</option><option value="coldwave">寒潮</option></select></label><button id="preview-pause" type="button">暂停动画</button><span id="preview-status" role="status">正在循环播放</span></div><div id="focus-preview" style="' + loadingArtStyle('day', 'sunny', 'downtown') + '">' + focusMarkup + '</div></section>';
  const galleryBehavior = `<script>(()=>{const region=document.querySelector('#preview-region'),time=document.querySelector('#preview-time'),weather=document.querySelector('#preview-weather'),target=document.querySelector('#focus-preview'),button=document.querySelector('#preview-pause'),status=document.querySelector('#preview-status');const media=matchMedia('(prefers-reduced-motion: reduce)');let paused=false;function updateStatus(){button.disabled=media.matches;button.textContent=paused?'继续动画':'暂停动画';status.textContent=media.matches?'系统已开启减少动态效果，当前为静态预览':paused?'动画已暂停':'正在循环播放 · 云、水面和地标局部持续运动';}function update(){const original=document.querySelector('.grid [data-loading-landmark="'+region.value+'"][data-time="'+time.value+'"][data-weather="'+weather.value+'"]');const clone=original.cloneNode(true),ids=new Map();clone.querySelectorAll('[id]').forEach(node=>{ids.set(node.id,node.id+'-focus');node.id+='-focus';});clone.querySelectorAll('*').forEach(node=>{for(const attr of [...node.attributes]){let value=attr.value;ids.forEach((next,old)=>{value=value.split('url(#'+old+')').join('url(#'+next+')');});if(value!==attr.value)node.setAttribute(attr.name,value);}});target.style.cssText=original.getAttribute('style');target.replaceChildren(clone);}for(const select of [region,time,weather])select.addEventListener('change',update);button.addEventListener('click',()=>{paused=!paused;document.body.dataset.paused=String(paused);updateStatus();});media.addEventListener('change',updateStatus);updateStatus();})();</script>`;
  writeFileSync(galleryFile, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>统一地区加载动画 · 时段与天气验收</title><style>body{margin:0;padding:30px;background:#dddcd4;color:#344b4c;font:14px system-ui}h1{font-size:24px;font-weight:500}h2{margin:30px 0 12px;font-size:20px;font-weight:500}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}article{padding:10px 12px;background:var(--load-paper);border-radius:8px;overflow:hidden}article>span{color:var(--load-muted);font-size:11px}.focus-stage{margin:24px 0 40px;border-radius:12px;overflow:hidden;background:#f4f1e8}.preview-controls{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid #c7cfbf}.preview-controls label{display:flex;align-items:center;gap:6px}.preview-controls select,.preview-controls button{font:inherit;color:inherit;padding:7px 9px;border:1px solid #a8b3a4;border-radius:5px;background:#f4f1e8}.preview-controls span{font-size:12px;color:#657771}#focus-preview{background:var(--load-paper);padding:20px;display:flex;justify-content:center}#focus-preview .landmark-art{max-width:1100px}body[data-paused="true"] .landmark-art *{animation-play-state:paused!important}' + css + '@media(max-width:850px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:450px){.grid{grid-template-columns:1fr}body{padding:15px}.preview-controls{gap:10px;padding:12px}#focus-preview{padding:4px}}</style><h1>地区地标加载动画 · 96 种组合</h1><p>上方大图可切换四区、时段和天气；下方保留全部组合。无人 SVG 与持续循环动效。</p>' + galleryControls + gallery + galleryBehavior + '</html>');
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  const playwrightPath = process.env.PLAYWRIGHT_CORE_PATH || 'C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
  const playwright = await import(pathToFileURL(playwrightPath));
  const { chromium } = playwright.default ?? playwright;
  const executablePath = process.env.CHROMIUM_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync);
  if (!executablePath) throw Error('Set CHROMIUM_PATH to a Chromium browser executable.');
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', error => result.errors.push(String(error)));
  if (process.env.LOADING_ART_SKIP_LOCAL_GALLERY !== '1') {
  await page.goto(pathToFileURL(galleryFile).href);
  const galleryCheck = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.grid [data-loading-landmark]')];
    const ids = [...document.querySelectorAll('svg [id]')].map(item => item.id);
    return { count: items.length, uniqueIds: new Set(ids).size === ids.length,
      drawingsVisible: [...document.querySelectorAll('.drawing')].every(item => getComputedStyle(item).stroke !== 'none'),
      combinations: new Set(items.map(item => [item.dataset.loadingLandmark, item.dataset.time, item.dataset.weather].join(':'))).size };
  });
  if (galleryCheck.count !== 96 || galleryCheck.combinations !== 96 || !galleryCheck.uniqueIds || !galleryCheck.drawingsVisible) throw Error(`Invalid gallery: ${JSON.stringify(galleryCheck)}`);
  for (const region of regions) {
    const name = `${region}-24-combinations.png`;
    await page.locator(`#gallery-${region}`).screenshot({ path: path.join(output, name), animations: 'disabled' });
    result.screenshots.push(name);
  }
  }
  await page.goto(`${base}/art-preview`);
  await page.waitForFunction(() => Boolean(window.artQA));
  result.runtimeCombinations = await page.evaluate(({ regions, times, weathers }) => {
    let checked = 0;
    for (const regionId of regions) for (const time of times) for (const weather of weathers) {
      window.artQA.show({ regionId, time, weather });
      const root = document.querySelector('[data-loading-landmark]');
      const ids = [...root.querySelectorAll('[id]')].map(node => node.id);
      if (root.dataset.loadingLandmark !== regionId || root.dataset.time !== time || root.dataset.weather !== weather ||
          root.getBoundingClientRect().width < 1 || getComputedStyle(root.querySelector('.drawing')).stroke === 'none' ||
          ids.length !== new Set(ids).size) throw Error('Invalid runtime combination: ' + [regionId, time, weather].join('/'));
      checked++;
    }
    return checked;
  }, { regions, times, weathers });
  // Observe natural movement over time, rather than merely counting CSS animations.
  for (const region of regions) {
    await page.evaluate(value => { window.artQA.clear(); window.artQA.show(value); }, { regionId: region, time: 'day', weather: 'sunny' });
    await page.locator('.landmark-art.composited').waitFor();
    await page.waitForTimeout(150);
    const sample = () => page.locator('[data-loading-landmark]').evaluate(root => {
      const transform = selector => {
        const element = root.querySelector('.motion-layer'+selector) ?? root.querySelector(selector);
        if (!element) return null;
        const css = getComputedStyle(element);
        const matrix = new DOMMatrix(css.transform);
        return { x: matrix.e, y: matrix.f, a: matrix.a, b: matrix.b, animation:css.animationName, className:element.getAttribute('class'),
          dash: css.strokeDashoffset, opacity: css.opacity };
      };
      return { cloud: transform('.cloud-one'), water: transform('.waterlines'),
        wheel: transform('.wheel'), mist: transform('.mountain-mist'),
        fountain: transform('.fountain-jets'), ripple: transform('.ripple-layer'),
        scale: root.getBoundingClientRect().width / 1000,
        active: root.getAnimations({ subtree: true }).filter(item => item.playState === 'running').length };
    });
    const before = await sample();
    const firstImage = `${region}-motion-0.png`;
    await page.screenshot({ path: path.join(output, firstImage) });
    await page.waitForTimeout(1500);
    const after = await sample();
    result.motion.push({region,before,after});
    const cloudTravel = Math.abs(after.cloud.x - before.cloud.x) * after.scale;
    if (cloudTravel < 5 || !after.active) throw Error(`Motion is too subtle or stopped: ${region}, ${cloudTravel}px`);
    if (region !== 'boyue' && before.water.x === after.water.x && before.water.opacity === after.water.opacity) throw Error('Water stopped in '+region);
    if (region === 'suburb' && Math.hypot(after.wheel.a-before.wheel.a,after.wheel.b-before.wheel.b) < .1) throw Error('Ferris wheel stopped');
    if (region === 'development' && Math.abs(after.mist.x - before.mist.x) < 5) throw Error('Mountain mist stopped');
    const secondImage = `${region}-motion-1500.png`;
    await page.screenshot({ path: path.join(output, secondImage) });
    result.screenshots.push(firstImage, secondImage);
    result.motion[result.motion.length-1]={ region, intervalMs: 1500, cloudTravelPx: cloudTravel, before, after };
  }
  await page.evaluate(()=>{window.artQA.clear();window.artQA.show({regionId:'downtown',time:'day',weather:'sunny'});});
  await page.locator('.landmark-art.composited').waitFor();
  // Chrome delivers compositor frames over a separate channel while the page's JS is busy.
  const cdp=await context.newCDPSession(page),frames=[];
  cdp.on('Page.screencastFrame',frame=>{
    frames.push({at:frame.metadata.timestamp*1000,hash:createHash('sha256').update(frame.data).digest('hex'),data:frame.data});
    void cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});
  });
  await cdp.send('Page.startScreencast',{format:'png',maxWidth:1000,maxHeight:650,everyNthFrame:1});
  await page.waitForTimeout(350);
  const blocked=await page.evaluate(()=>{const start=Date.now();while(Date.now()-start<1200){}return{start,end:Date.now()};});
  await page.waitForTimeout(200);await cdp.send('Page.stopScreencast');await cdp.detach();
  const during=frames.filter(frame=>frame.at>blocked.start+100&&frame.at<blocked.end-100);
  result.busyMainThread={blockedMs:blocked.end-blocked.start,framesDuringBlock:during.length,uniqueFrames:new Set(during.map(frame=>frame.hash)).size};
  if(during.length<3||result.busyMainThread.uniqueFrames<3)throw Error('Loading animation froze while JS was busy: '+JSON.stringify(result.busyMainThread));
  for(const [index,frame]of [during[0],during.at(-1)].entries()){
    const name=`main-thread-busy-${index}.png`;writeFileSync(path.join(output,name),Buffer.from(frame.data,'base64'));result.screenshots.push(name);
  }
  await page.waitForFunction(()=>document.querySelector('[data-loading-tip]')?.getAttribute('data-loading-tip')==='1');
  await page.waitForFunction(()=>document.querySelector('[data-loading-tip]')?.getAttribute('data-loading-tip')==='2');
  await page.waitForFunction(()=>document.querySelector('[data-loading-tip]')?.getAttribute('data-loading-tip')==='feedback');
  result.tipFeedback=await page.locator('[data-loading-tip]').innerText();
  if(!result.tipFeedback.includes('1125965732'))throw Error('Loading feedback group is missing');
  await page.screenshot({path:path.join(output,'long-loading-feedback.png'),animations:'disabled'});result.screenshots.push('long-loading-feedback.png');
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'portrait', width: 390, height: 844 },
    { name: 'landscape', width: 844, height: 390 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (let i = 0; i < regions.length; i++) {
      await page.evaluate(value => window.artQA.show(value), { regionId: regions[i], time: times[i], weather: weathers[i], label: i === 2 ? '住宅' : '朝夕便利店' });
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => {
        const root = document.querySelector('[data-scene-loading-overlay]');
        const rect = root.getBoundingClientRect();
        const selectors = ['.loading-masthead', '.district-caption', '.loading-art-frame', '.loading-copy', '.loading-footer', '.loading-tip', '.loading-actions button'];
        const overflow = selectors.flatMap(selector => [...root.querySelectorAll(selector)].filter(el => getComputedStyle(el).display !== 'none').filter(el => {
          const box = el.getBoundingClientRect();
          return box.width && box.height && (box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1);
        }).map(el => el.className || el.tagName));
        return { viewport: [innerWidth, innerHeight], cover: [rect.width, rect.height], overflow,
          opaque: getComputedStyle(root).backgroundColor.startsWith('rgb('),
          animations: root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length };
      });
      result.layouts.push({ region: regions[i], viewport: viewport.name, ...layout });
      if (layout.overflow.length || !layout.opaque || layout.cover[0] !== viewport.width || layout.cover[1] !== viewport.height) throw Error(`Layout failure: ${JSON.stringify(result.layouts.at(-1))}`);
      const name = `${regions[i]}-${viewport.name}.png`;
      await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
      result.screenshots.push(name);
    }
  }
  for (const viewport of [viewports[1], viewports[2], { name: 'low-landscape', width: 740, height: 320 }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const phase of ['slow', 'failed']) {
      await page.evaluate(value => window.artQA.show(value), { regionId: 'boyue', time: 'night', weather: 'rain', phase: phase === 'failed' ? 'failed' : 'loading', slow: phase === 'slow', error: '场景资源暂时无法载入，请重新尝试。' });
      const controls = await page.locator('.loading-actions button').evaluateAll(buttons => buttons.map(button => { const rect = button.getBoundingClientRect(); return { text: button.textContent, visible: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth }; }));
      if (controls.length !== 2 || controls.some(button => !button.visible)) throw Error(`Recovery controls overflow: ${JSON.stringify({ viewport, controls })}`);
      await page.getByRole('button', { name: '重新载入' }).click();
      await page.getByRole('button', { name: '使用平面场景' }).click();
      const name = `${phase}-${viewport.name}.png`;
      await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
      result.screenshots.push(name);
    }
  }
  result.callbacks = await page.evaluate(() => window.artQA.callbacks);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.artQA.show({ regionId: 'suburb', weather: 'snow' }));
  const movingInReducedMode = await page.locator('[data-scene-loading-overlay]').evaluate(root => root.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);
  if (movingInReducedMode !== 0) throw Error(`Reduced-motion still runs ${movingInReducedMode} animations`);
  if (result.errors.length) throw Error(`Browser errors: ${result.errors.join('; ')}`);
  result.passed = true;
  writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: true, combinations: result.combinations, screenshots: result.screenshots.length, layouts: result.layouts.length, callbacks: result.callbacks, output }));
} catch (error) {
  result.errors.push(String(error));
  result.passed = false;
  writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2));
  throw error;
} finally { await browser?.close(); await server.close(); }
