import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const {chromium}=playwright;

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'docs/scene-loading-20261021/game-proof');
const url=process.env.URBAN_LIFE_QA_URL??'http://127.0.0.1:1445/';
await fs.mkdir(out,{recursive:true});
const report={url,startedAt:new Date().toISOString(),method:'Fresh isolated headless Chrome context. All gameplay state changes through normal UI. Vite module imports are read-only observations.',journeys:[],pageErrors:[],consoleErrors:[],requestsFailed:[],uncovered:[],nativeDeviceChecks:false,softwareRequested:process.env.QA_SOFTWARE==='1'};
const replay=process.env.QA_REPLAY==='1';
if(replay){try{const previous=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));if(previous.journeys.some(j=>j.name==='03-store-first-delayed')){await fs.writeFile(path.join(out,'store-report.json'),JSON.stringify(previous,null,2));report.priorStoreEvidence={file:'store-report.json',journeys:previous.journeys.filter(j=>j.status==='passed').map(j=>({name:j.name,status:j.status,softwareWebGL:true}))};}}catch{}}
const browser=await chromium.launch({executablePath:process.env.URBAN_LIFE_QA_CHROME??'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist',...(report.softwareRequested?['--use-angle=swiftshader']:[]),'--disable-gpu-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
const page=await context.newPage();
page.setDefaultTimeout(6000);
page.on('pageerror',error=>report.pageErrors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')report.consoleErrors.push(msg.text());});
page.on('requestfailed',request=>report.requestsFailed.push({url:request.url(),error:request.failure()?.errorText}));

async function state(){return page.evaluate(async()=>{
  const {gameState,currentView}=await import('/src/stores/gameStore.svelte.ts');
  const {uiState}=await import('/src/stores/uiStore.svelte.ts');
  const {sceneLoading}=await import('/src/stores/sceneLoading.svelte.ts');
  return {locationId:gameState.locationId,region:gameState.region,navStack:[...gameState.navStack],money:gameState.player.money,time:{...gameState.time},living:JSON.parse(JSON.stringify(gameState.living)),view:currentView.name,modal:uiState.modal,sceneMode:uiState.sceneMode,loading:sceneLoading.current?{id:sceneLoading.current.id,key:sceneLoading.current.sceneKey,phase:sceneLoading.current.phase,region:sceneLoading.current.regionId,slow:sceneLoading.current.slow}:null};
});}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});}
async function dump(name){await fs.writeFile(path.join(out,name+'.json'),JSON.stringify({state:await state(),buttons:await page.getByRole('button').allTextContents(),body:(await page.locator('body').innerText()).slice(0,18000)},null,2));}
async function idle(){await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:120000});await page.waitForTimeout(400);}
async function clickPin(id){await idle();const pin=page.locator(`.map-pin[data-location-id="${id}"]`).last();await pin.waitFor({state:'visible',timeout:20000});await pin.scrollIntoViewIfNeeded();await pin.click();await page.waitForTimeout(200);}
function assert(ok,message){if(!ok)throw Error(message);}
async function traceStart(){await page.evaluate(()=>{
  window.__loadingQA={started:performance.now(),samples:[],frameGaps:[],lastFrame:0,active:true};
  const sample=()=>{const q=window.__loadingQA;if(!q?.active)return;const overlay=document.querySelector('[data-scene-loading-overlay]'),scene=[...document.querySelectorAll('.scene-body')].at(-1),canvas=scene?.querySelector('[data-store-ready],[data-cafe-ready],[data-home-ready]');
    const animation=overlay?.querySelector('.loading-orbit');q.samples.push({at:performance.now()-q.started,phase:overlay?.getAttribute('data-loading-phase')??null,region:overlay?.getAttribute('data-loading-region')??null,opacity:overlay?getComputedStyle(overlay).opacity:null,inert:document.querySelector('.app-zoom')?.inert??false,ready:canvas?.getAttribute('data-store-ready')??canvas?.getAttribute('data-cafe-ready')??canvas?.getAttribute('data-home-ready')??null,animation:animation?getComputedStyle(animation).transform:null});};
  sample();window.__loadingQA.timer=setInterval(sample,100);
  const frame=t=>{const q=window.__loadingQA;if(!q?.active)return;if(q.lastFrame)q.frameGaps.push(t-q.lastFrame);q.lastFrame=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
});}
async function traceEnd(){return page.evaluate(()=>{const q=window.__loadingQA;q.active=false;clearInterval(q.timer);const visible=q.samples.filter(s=>s.phase),first=visible[0],leaving=visible.find(s=>s.phase==='leaving'),last=visible.at(-1),ready=visible.find(s=>s.ready==='true');return{firstAtMs:first?.at,leavingAtMs:leaving?.at,visibleMs:first&&last?last.at-first.at+100:0,readyAtMs:ready?.at,visibleSamples:visible.length,inputBlocked:visible.filter(s=>s.phase!=='leaving').every(s=>s.inert),animationStates:new Set(visible.map(s=>s.animation).filter(Boolean)).size,maxFrameGapMs:Math.max(0,...q.frameGaps),samples:q.samples};});}
async function measure(name,action,extra={}){const item={name,before:await state(),...extra};await traceStart();console.log('journey',name);try{await action(item);await idle();item.after=await state();item.trace=await traceEnd();item.status='passed';}catch(error){item.status='failed';item.error=String(error);try{item.after=await state();item.trace=await traceEnd();}catch{}await dump(name+'-failure');await shot(name+'-failure');report.journeys.push(item);throw error;}report.journeys.push(item);await shot(name);console.log('passed',name,JSON.stringify({state:item.after,visibleMs:item.trace.visibleMs,readyAtMs:item.trace.readyAtMs}));return item;}
async function topDistrict(name){await idle();await page.locator('.crumb').filter({hasText:name}).last().click();await idle();}
async function closeResult(){const close=page.locator('.r-continue');if(await close.count()){await close.click();await page.waitForTimeout(250);}}
async function exitHome(){await page.locator('.home-tools > button').filter({hasText:'出门'}).click();await idle();}
async function renderer(){return page.evaluate(()=>{const canvas=[...document.querySelectorAll('canvas')].find(c=>c.getAttribute('data-home-webgl')!==null||c.closest('.store-world,.cafe-world'));const gl=canvas?.getContext('webgl2');if(!gl)return null;const info=gl.getExtension('WEBGL_debug_renderer_info');return info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});}

try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator('.device-choice.computer').click({timeout:120000});
  await page.locator('.device-choice').filter({hasText:'3D 模型'}).click();
  await page.locator('#version-announcement-dialog').getByRole('button',{name:'开始体验',exact:true}).click();
  console.log('setup complete');
  await page.locator('[data-menu-background="new"]').click();
  const moneyPlus=page.locator('.alloc-row').filter({hasText:'金钱'}).getByRole('button',{name:'+',exact:true});
  for(let i=0;i<10;i++)await moneyPlus.click();
  await page.getByRole('button',{name:'下一步：确认 →',exact:true}).click();
  await page.getByRole('button',{name:'🌆 开始生活',exact:true}).click();
  await page.locator('.scene-body').waitFor({state:'visible',timeout:120000});await idle();
  report.newGame=await state();await dump('01-new-game');await shot('01-new-game');
  console.log('new game',JSON.stringify(report.newGame));
  await page.locator('.exit-chip').last().click();await idle();await dump('02-street-map');await shot('02-street-map');
  if(!replay){let releaseModels;const heldModels=new Promise(done=>releaseModels=done);let holdModels=true;const delayed=[];
  await page.route('**/assets/scenes/convenience-store/**',async route=>{
    const request=route.request();if(holdModels&&request.resourceType()!=='script'){delayed.push(request.url());await heldModels;}
    await route.continue();
  });
  await measure('03-store-first-delayed',async item=>{
    await clickPin('convenience_store');await page.locator('[data-scene-loading-overlay]').waitFor({state:'visible'});item.waitingStart=await state();await shot('03-store-loading');
    await page.waitForTimeout(3000);assert(await page.locator('[data-scene-loading-overlay]').isVisible(),'Store loading cover ended while model requests were held');item.visibleAfter3s=true;
    await page.waitForTimeout(12400);await page.getByText('加载时间较长，请稍候',{exact:true}).waitFor({state:'visible'});item.slowShown=true;await shot('03-store-slow');item.waitingEnd=await state();
    assert(item.waitingStart.money===item.waitingEnd.money&&JSON.stringify(item.waitingStart.time)===JSON.stringify(item.waitingEnd.time),'Waiting changed game money/time');
    item.delayedResources=delayed.length;assert(delayed.length>0,'No model resource was actually delayed');holdModels=false;releaseModels();
    await idle();assert(await page.locator('[data-store-ready="true"]').count()>0,'Store target first frame is not ready');
  });
  await page.locator('[data-store-exit]').click();await idle();
  await measure('04-store-repeat',async()=>{await clickPin('convenience_store');await idle();assert(await page.locator('[data-store-ready="true"]').count()>0,'Repeated store did not render');});
  await page.locator('[data-store-exit]').click();await idle();
  }
  await page.getByRole('button',{name:'等 2 小时',exact:true}).last().click();await idle();await closeResult();
  await measure('05-cafe-first',async()=>{await clickPin('cafe');await idle();assert(await page.locator('[data-cafe-ready="true"]').count()>0,'Cafe target first frame is not ready');});
  report.renderer=await renderer();
  await page.locator('[data-cafe-exit]').click();await idle();
  await clickPin('minsu');await idle();await dump('06-minsu-before-registration');
  await measure('06-minsu-registered',async item=>{await page.getByRole('button',{name:/入住民宿/}).last().click();await idle();await closeResult();item.registered=await state();assert(item.registered.living.awayNight?.lodgingId==='minsu'||item.registered.living.nightly?.lodgingId==='minsu','Normal guest registration did not select minsu');assert(await page.locator('[data-home-id="minsu"][data-home-mode="3d"] [data-home-ready="true"]').count()>0,'Registered guest room did not reach its rendered first frame');});
  await exitHome();await topDistrict('树堰区');await clickPin('downtown_center');await idle();await clickPin('housing_agency');await idle();await dump('07-agency');
  await page.getByRole('button',{name:/签约普通出租屋/}).last().click();await page.waitForTimeout(300);await closeResult();await idle();report.lease=await state();
  assert(report.lease.living.mode==='lease','Normal agency action did not sign lease');
  await page.locator('.exit-chip').last().click();await idle();await topDistrict('树堰区');await clickPin('downtown_residential');await idle();
  await measure('08-rented-home',async()=>{await clickPin('old_apartment');await idle();assert(await page.locator('[data-home-id="old_apartment"][data-home-mode="3d"] [data-home-ready="true"]').count()>0,'Rented home did not reach its rendered first frame');});
  await exitHome();await topDistrict('树堰区');await clickPin('downtown_station');await idle();await clickPin('bus_station');await idle();
  await page.getByRole('button',{name:/购买\/乘坐城际巴士/}).click();await page.locator('.destination').filter({hasText:'伯月新区巴士站'}).click();await dump('09-bus-ticket');
  await measure('09-bus-cross-district',async item=>{await page.locator('.transit-modal .primary').click();await idle();item.arrived=await state();assert(item.arrived.locationId==='development_bus_station','Bus did not reach the selected destination');assert(item.before.money-item.arrived.money===8,'Bus fare was not charged exactly once');});
  await page.locator('.exit-chip').last().click();await idle();await topDistrict('伯月新区');
  await measure('10-boyue-first-map',async()=>{await clickPin('boyue');await idle();assert((await state()).region==='boyue','Free district border did not reach boyue map');});
  await measure('11-development-map',async()=>{await clickPin('development');await idle();assert((await state()).region==='development','Return border did not reach development map');});
  await measure('12-boyue-repeat-map',async()=>{await clickPin('boyue');await idle();assert((await state()).region==='boyue','Repeated border did not reach boyue map');});
  report.uncovered.push('Native Tauri window, physical Android devices and store packages are not tested by this browser script.');
  report.result='passed';
}catch(error){report.failure=String(error);try{await dump('failure');await shot('failure');}catch{}report.result='failed';}
finally{report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({result:report.result,failure:report.failure,journeys:report.journeys.map(j=>({name:j.name,status:j.status,error:j.error,visibleMs:j.trace?.visibleMs})),pageErrors:report.pageErrors,consoleErrors:report.consoleErrors.slice(-5),output:out},null,2));
if(report.result==='failed')process.exitCode=1;
