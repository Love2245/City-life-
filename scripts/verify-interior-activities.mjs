import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const {chromium}=playwright;

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mobile=process.env.QA_MOBILE==='1';
const out=path.join(root,'docs/facility-activities-20261021',mobile?'mobile-proof':'game-proof');
const url=process.env.URBAN_LIFE_QA_URL??'http://127.0.0.1:1445/';
await fs.mkdir(out,{recursive:true});
const report={url,startedAt:new Date().toISOString(),method:'Fresh isolated headless Chrome context. All gameplay state changes through normal UI. Vite module imports are read-only observations.',journeys:[],pageErrors:[],consoleErrors:[],requestsFailed:[],uncovered:[],nativeDeviceChecks:false,softwareRequested:process.env.QA_SOFTWARE==='1'};
const replay=process.env.QA_REPLAY==='1';
if(replay){try{const previous=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));if(previous.journeys.some(j=>j.name==='03-store-first-delayed')){await fs.writeFile(path.join(out,'store-report.json'),JSON.stringify(previous,null,2));report.priorStoreEvidence={file:'store-report.json',journeys:previous.journeys.filter(j=>j.status==='passed').map(j=>({name:j.name,status:j.status,softwareWebGL:true}))};}}catch{}}
const browser=await chromium.launch({executablePath:process.env.URBAN_LIFE_QA_CHROME??'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--ignore-gpu-blocklist',...(report.softwareRequested?['--use-angle=swiftshader']:[]),'--disable-gpu-sandbox']});
const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
const page=await context.newPage();
page.setDefaultTimeout(45000);
page.on('pageerror',error=>report.pageErrors.push(String(error)));
page.on('console',msg=>{if(msg.type()==='error')report.consoleErrors.push(msg.text());});
page.on('requestfailed',request=>report.requestsFailed.push({url:request.url(),error:request.failure()?.errorText}));

async function state(){return page.evaluate(async()=>{
  const {gameState,currentView}=await import('/src/stores/gameStore.svelte.ts');
  const {uiState}=await import('/src/stores/uiStore.svelte.ts');
  const {sceneLoading}=await import('/src/stores/sceneLoading.svelte.ts');
  return {locationId:gameState.locationId,region:gameState.region,navStack:[...gameState.navStack],money:gameState.player.money,attrs:{...gameState.player.attrs},inventory:{...gameState.inventory},time:{...gameState.time},living:JSON.parse(JSON.stringify(gameState.living)),view:currentView.name,modal:uiState.modal,sceneMode:uiState.sceneMode,loading:sceneLoading.current?{id:sceneLoading.current.id,key:sceneLoading.current.sceneKey,phase:sceneLoading.current.phase,region:sceneLoading.current.regionId,slow:sceneLoading.current.slow,minimumMs:sceneLoading.current.minimumMs}:null};
});}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:false,timeout:45000,animations:'disabled'});}
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
let exitNumber=0;
async function shortReturn(action){return measure('return-from-3d-'+(++exitNumber),async item=>{await action();await page.locator('[data-scene-loading-overlay]').waitFor({state:'visible',timeout:45000});item.cover=await state();assert(item.cover.loading?.minimumMs===500,'3D exit did not request short presentation');await idle();const after=await state();assert(after.locationId==='map','3D exit did not reach map');assert(after.money===item.before.money&&JSON.stringify(after.time)===JSON.stringify(item.before.time),'3D exit changed money or time');});}
async function topDistrict(name){await idle();if(mobile)await page.getByRole('button',{name:new RegExp('回'+name)}).last().click();else await page.locator('.crumb').filter({hasText:name}).last().click();await idle();}
async function closeResult(){const close=page.locator('.r-continue');if(await close.count()){await close.click();await page.waitForTimeout(250);}}
async function exitHome(){await shortReturn(()=>page.locator('.home-tools > button').filter({hasText:'出门'}).click());}
async function renderer(){return page.evaluate(()=>{const canvas=[...document.querySelectorAll('canvas')].find(c=>c.getAttribute('data-home-webgl')!==null||c.closest('.store-world,.cafe-world'));const gl=canvas?.getContext('webgl2');if(!gl)return null;const info=gl.getExtension('WEBGL_debug_renderer_info');return info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});}

try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  await page.locator(mobile?'.device-choice.phone':'.device-choice.computer').click({timeout:120000});
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
  await clickPin('convenience_store');await idle();
  const storeLabels=await page.locator('[data-store-facility]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-store-facility')));
  assert(!storeLabels.some(id=>['service','baskets','notice'].includes(id)),'Decorative store markers remain');assert(storeLabels.includes('seating'),'Dining table disappeared');
  await page.locator('[data-store-facility="seating"]').click();assert(await page.getByRole('button',{name:'打开背包，取用食品'}).count()===1,'Dining table no longer offers food');await shot('03-store-dining');report.storeLabels=storeLabels;
  await page.locator('[data-store-wait="2"]').click();await closeResult();await idle();
  await shortReturn(()=>page.locator('[data-store-exit]').click());
  await clickPin('cafe');await idle();report.renderer=await renderer();
  const cafeLabels=await page.locator('[data-cafe-facility]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-cafe-facility')));
  assert(!cafeLabels.some(id=>['service','notice','community','window'].includes(id)),'Decorative cafe markers remain');report.cafeLabels=cafeLabels;
  const read=async()=>{const s=await state();return s.time.hour*60+s.time.minute;};
  await page.locator('[data-cafe-facility="counter"]').click();await page.locator('[data-cafe-activity="cafe_buy_cafe_croissant"]').click();
  await dump('04-snack-choice');const packedBefore=await state();await page.getByRole('button',{name:/打包带走/}).click();await closeResult();
  const packedAfter=await state();assert(packedBefore.money-packedAfter.money===12,'Croissant price not settled once');assert(packedAfter.inventory.cafe_croissant===1,'Takeaway not in inventory');assert(JSON.stringify(packedAfter.time)===JSON.stringify(packedBefore.time),'Takeaway consumed time');report.snackPack={before:packedBefore,after:packedAfter};
  await page.locator('[data-cafe-facility="counter"]').click();await page.locator('[data-cafe-activity="cafe_buy_cafe_bagel"]').click();const eatenBefore=await state();await page.locator('.opts button.primary').click();await closeResult();const eatenAfter=await state();assert(eatenBefore.money-eatenAfter.money===15,'Bagel price wrong');assert(!eatenAfter.inventory.cafe_bagel,'Dine in added inventory');assert(eatenAfter.time.minute===30,'Dine in did not spend half hour');report.snackEat={before:eatenBefore,after:eatenAfter};
  for(const [key,hours] of [['relax',1],['nap',2]]){
    await page.locator('[data-cafe-facility="lounge"]').click();const before=await state();await shot('05-sofa-'+key);assert(await page.locator('[data-cafe-order]').count()===0,'Sofa duplicates ordering');await page.locator(`[data-cafe-activity="cafe_sofa_${key}"]`).click();await closeResult();const after=await state();assert(after.time.hour*60+after.time.minute-(before.time.hour*60+before.time.minute)===hours*60,'Sofa time wrong');assert(after.money===before.money,'Sofa charged money');report['sofa_'+key]={before,after};
  }
  await page.locator('[data-cafe-facility="books"]').click();const bookBefore=await read();await page.locator('[data-cafe-activity="cafe_read_magazine"]').click();await closeResult();assert(await read()-bookBefore===30,'Magazine time wrong');
  for(const [name,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
    await page.setViewportSize(viewport);await page.waitForTimeout(1000);if(mobile&&name==='portrait'){await page.getByText('请将手机横置',{exact:true}).waitFor({state:'visible'});await shot('06-cafe-'+name);report.mobilePortraitRotationGuard=true;continue;}await page.locator('[data-cafe-facility="counter"]').click();await shot('06-cafe-'+name);const bounds=await page.locator('[data-cafe-selected]').boundingBox();assert(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,'Cafe menu out of viewport');await page.getByRole('button',{name:'收起设施操作'}).click();
  }
  await page.setViewportSize(mobile?{width:844,height:390}:{width:1440,height:900});await shortReturn(()=>page.locator('[data-cafe-exit]').click());
  await topDistrict('树堰区');await clickPin('downtown_center');await idle();await clickPin('hotel');await idle();await page.getByRole('button',{name:/开房住宿（豪华间）/}).last().click();await idle();await closeResult();
  await page.locator('button[data-home-exterior]').click();await page.waitForTimeout(600);await page.locator('button[data-home-exterior]').click();await page.waitForTimeout(600);
  const stage=page.viewportSize();await page.mouse.move(stage.width*.55,stage.height*.55);await page.mouse.wheel(0,1600);await page.waitForTimeout(1500);
  for(let turn=0;turn<4&&!await page.locator('[data-home-object="sofa"]').count();turn++){await page.getByRole('button',{name:'向右旋转90度',exact:true}).click();await page.waitForTimeout(1500);}
  await page.locator('[data-home-object="sofa"]').click();await page.locator('.action-roots').getByRole('button',{name:/休息放松/}).click();await shot('07-home-sofa');const homeBefore=await state();await page.locator('[data-home-branch="use"]').getByRole('button',{name:/短暂小睡/}).click();await closeResult();const homeAfter=await state();assert(homeBefore.money===homeAfter.money,'Home sofa charged money');assert(homeAfter.time.hour*60+homeAfter.time.minute-(homeBefore.time.hour*60+homeBefore.time.minute)===120,'Home nap time wrong');report.homeNap={before:homeBefore,after:homeAfter};
  report.result='passed';
}catch(error){report.failure=String(error);try{await dump('failure');await shot('failure');}catch{}report.result='failed';}
finally{report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({result:report.result,failure:report.failure,storeLabels:report.storeLabels,cafeLabels:report.cafeLabels,pageErrors:report.pageErrors,consoleErrors:report.consoleErrors.slice(-5),output:out},null,2));
if(report.result==='failed')process.exitCode=1;
