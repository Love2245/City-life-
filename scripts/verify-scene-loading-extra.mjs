/** Real UI continuation checks: railway and the loading cover inside the mobile app shell. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'docs/scene-loading-20261021/game-proof');
const url=process.env.URBAN_LIFE_QA_URL??'http://127.0.0.1:1445/';
await fs.mkdir(output,{recursive:true});
const selected=new Set((process.env.QA_EXTRA_CASES??'train,mobile').split(','));
const report={url,method:'Isolated fresh browser contexts; normal new-game and gameplay UI only. State module imports are read-only.',scenarios:[],errors:[],nativeDeviceChecks:false};
const browser=await playwright.chromium.launch({executablePath:process.env.URBAN_LIFE_QA_CHROME??'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});

async function observe(page){return page.evaluate(async()=>{
  const {gameState}=await import('/src/stores/gameStore.svelte.ts');
  const {uiState}=await import('/src/stores/uiStore.svelte.ts');
  const {sceneLoading}=await import('/src/stores/sceneLoading.svelte.ts');
  const task=sceneLoading.current;
  return {location:gameState.locationId,region:gameState.region,money:gameState.player.money,time:{...gameState.time},mode:uiState.gameMode,modal:uiState.modal,
    loading:task?{id:task.id,key:task.sceneKey,region:task.regionId,phase:task.phase}:null};
});}
async function idle(page){await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:120000});await page.waitForTimeout(300);}
async function pin(page,id){await idle(page);const target=page.locator(`.map-pin[data-location-id="${id}"]`).last();await target.waitFor({state:'visible',timeout:15000});await target.scrollIntoViewIfNeeded();await target.click();await page.waitForTimeout(150);}
async function setup(page,mobile=false){
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator(mobile?'.device-choice.phone':'.device-choice.computer').click({timeout:120000});
  await page.locator('.device-choice').filter({hasText:'3D 模型'}).click();
  await page.locator('#version-announcement-dialog').getByRole('button',{name:'开始体验',exact:true}).click();
  await page.locator('[data-menu-background="new"]').click();
  const plus=page.locator('.alloc-row').filter({hasText:'金钱'}).getByRole('button',{name:'+',exact:true});
  for(let i=0;i<10;i++)await plus.click();
  await page.getByRole('button',{name:'下一步：确认 →',exact:true}).click();
  await page.getByRole('button',{name:'🌆 开始生活',exact:true}).click();
  await page.locator('.scene-body').waitFor({state:'visible',timeout:120000});await idle(page);
  await page.locator('.exit-chip').last().click();await idle(page);
}
async function scenario(name,viewport,mobile,run){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:mobile});
  const page=await context.newPage();page.setDefaultTimeout(7000);
  const entry={name,viewport,errors:[]};report.scenarios.push(entry);
  page.on('pageerror',error=>entry.errors.push(String(error)));
  try{
    await setup(page,mobile);entry.initial=await observe(page);
    await run(page,entry);
    entry.final=await observe(page);assert.deepEqual(entry.errors,[]);entry.passed=true;
  }catch(error){
    entry.passed=false;entry.failure=String(error);
    try{entry.final=await observe(page);entry.buttons=await page.getByRole('button').allTextContents();await page.screenshot({path:path.join(output,`${name}-failure.png`)});}catch{}
    report.errors.push(`${name}: ${error}`);
  }finally{await context.close();}
  console.log(JSON.stringify(entry));
}

try{
  if(selected.has('train'))await scenario('13-railway',{width:1440,height:900},false,async(page,entry)=>{
    await page.locator('.crumb').filter({hasText:'树堰区'}).last().click();await idle(page);
    await pin(page,'downtown_station');await pin(page,'high_speed_rail');
    await page.getByRole('button',{name:/购买\/乘坐城际火车/}).click();
    await page.locator('.destination').filter({hasText:'紫羊区火车站'}).click();
    entry.before=await observe(page);
    entry.fare=Number((await page.locator('.route-card .fare').innerText()).replace(/[^\d.]/g,''));
    await page.locator('.transit-modal .primary').click();
    await page.locator('[data-scene-loading-overlay]').waitFor({state:'visible',timeout:45000});
    entry.cover=await observe(page);assert.equal(entry.cover.loading.region,'suburb');
    await page.screenshot({path:path.join(output,'13-railway-loading.png')});
    await idle(page);entry.after=await observe(page);
    assert.equal(entry.after.location,'suburb_train_station');assert.equal(entry.before.money-entry.after.money,entry.fare);
    assert.equal(entry.after.modal,null);assert.equal(entry.after.loading,null);
    await page.screenshot({path:path.join(output,'13-railway-arrived.png')});
  });
  if(selected.has('mobile'))await scenario('14-mobile-app-cover',{width:844,height:390},true,async(page,entry)=>{
    assert.equal(entry.initial.mode,'pe');
    let release;const barrier=new Promise(resolve=>{release=resolve;});let held=true,count=0;
    await page.route('**/assets/scenes/convenience-store/**',async route=>{
      if(held&&route.request().resourceType()!=='script'){count++;await barrier;}
      try{await route.continue();}catch{}
    });
    try{
      const started=Date.now();await pin(page,'convenience_store');entry.clickFinishedMs=Date.now()-started;
      await page.locator('[data-scene-loading-overlay]').waitFor({state:'visible',timeout:45000});
      entry.coverObservedMs=Date.now()-started;await page.waitForTimeout(400);entry.waiting=await observe(page);
      const layout=()=>page.evaluate(()=>{
        const overlay=document.querySelector('[data-scene-loading-overlay]'),r=overlay.getBoundingClientRect();
        return {viewport:[innerWidth,innerHeight],cover:[r.x,r.y,r.width,r.height],inert:document.querySelector('.app-zoom').inert,
          background:getComputedStyle(overlay).backgroundColor,transform:getComputedStyle(overlay.querySelector('.loading-orbit')).transform};
      });
      entry.landscape=await layout();assert.deepEqual(entry.landscape.cover,[0,0,844,390]);assert.equal(entry.landscape.inert,true);
      await page.screenshot({path:path.join(output,'14-mobile-landscape-loading.png')});
      await page.keyboard.press('Escape');await page.mouse.click(15,15);
      const guarded=await observe(page);assert.equal(guarded.loading.id,entry.waiting.loading.id);assert.equal(guarded.modal,entry.waiting.modal);
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
      entry.portrait=await layout();assert.deepEqual(entry.portrait.cover,[0,0,390,844]);assert.equal(entry.portrait.inert,true);
      await page.screenshot({path:path.join(output,'14-mobile-portrait-loading.png')});
      entry.stillWaiting=await observe(page);assert.equal(entry.stillWaiting.money,entry.waiting.money);assert.deepEqual(entry.stillWaiting.time,entry.waiting.time);
      assert.ok(count>0,'The mobile test did not hold actual model resources');entry.delayedResources=count;
      held=false;release();await idle(page);
      assert.ok(await page.locator('[data-store-ready="true"]').count());
      const oldFrames=await page.locator('.store-world').getAttribute('data-store-frames');
      await page.setViewportSize({width:844,height:390});
      await page.waitForFunction(previous=>{
        const host=document.querySelector('.store-world');if(!host)return false;
        const camera=JSON.parse(host.dataset.storeCamera??'null');
        return camera&&Number.isFinite(camera.zoom)&&camera.zoom>0&&camera.eye.every(Number.isFinite)&&camera.target.every(Number.isFinite)
          &&Number(host.dataset.storeFrames)>Number(previous)&&document.querySelectorAll('[data-store-facility]').length>0;
      },oldFrames,{timeout:45000});
      entry.restoredScene=await page.locator('.store-world').evaluate(host=>({camera:JSON.parse(host.dataset.storeCamera),frames:host.dataset.storeFrames,visibleLabels:document.querySelectorAll('[data-store-facility]').length}));
      await page.waitForTimeout(300);
      await page.screenshot({path:path.join(output,'14-mobile-landscape-ready.png')});
    }finally{held=false;release();}
  });
  report.passed=report.scenarios.every(s=>s.passed);
}finally{
  report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(output,'extra-report.json'),JSON.stringify(report,null,2));await browser.close();
}
if(!report.passed)process.exitCode=1;
