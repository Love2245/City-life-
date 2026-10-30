import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/financial-risk-1497-20261028'),portable=process.env.QA_PORTABLE==='1',out=join(audit,portable?'display-portable':'display-source');mkdirSync(out,{recursive:true});
const url=portable?pathToFileURL(join(root,'1.49.7.html')).href:'http://127.0.0.1:1443/';
const ssr=await createServer({root,configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});let api;try{api=await ssr.ssrLoadModule('/src/game/core/state.ts');}finally{await ssr.close();}
function fixture(location){const s=api.createInitialState(14972851);s.mode='eternal';s.time.hour=12;s.player.money=100000;s.player.skills.programming=s.player.skills.design=10;s.developmentHistory.total=100;s.tutorial={done:['eat','work','sleep'],activeStep:-1};s.locationId=location;s.region=s.area=location==='old_apartment'?'downtown_residential':'downtown_commercial';s.navStack=['map',s.region];if(location==='old_apartment'){s.living.mode='lease';s.living.lease={housingId:'old_apartment',rent:1000,rentGrowthCount:0};}return s;}
const transportHashes=['src/assets/sfx/场景细化/列车_828151.mp3','src/assets/sfx/场景细化/公交发车_607820.mp3','src/assets/sfx/场景细化/汽车启动_138099.mp3','src/assets/sfx/场景细化/自行车铃_378911.mp3','src/assets/sfx/日常交互/脚步_813622.mp3'].map(file=>{let h=2166136261;for(const b of readFileSync(join(root,file)))h=Math.imul(h^b,16777619);return h>>>0;});
let server;if(!portable){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1443,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required','--mute-audio']});
const selected=process.env.QA_CASES?.split(','),previous=selected?JSON.parse(readFileSync(join(out,'report.json'),'utf8')):null;
const report={startedAt:new Date().toISOString(),url,portable,passed:false,fixtureBoundary:'Isolated controlled saves. Real settings/UI, render buffers and native audio nodes; no player save is read or changed. Software-rendered browser does not benchmark physical GPU performance.',scenarios:previous?previous.scenarios.filter(s=>!selected.includes(s.id)):[]};
async function run(id,save,kind,fn,{dpr=2}={}){
  if(selected&&!selected.includes(id))return;
  console.log('START '+id);const result={id,passed:false,checks:[],screenshots:[],errors:[],external:[]};report.scenarios.push(result);
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:dpr});if(portable)await context.route(/^https?:/,route=>route.abort());const page=await context.newPage();page.setDefaultTimeout(90000);
  page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});page.on('request',r=>{if(portable&&(/^https?:/.test(r.url())||r.url().startsWith('file:')&&r.url()!==url))result.external.push(r.url());});
  await page.addInitScript(({save,kind,transportHashes})=>{
    if(!sessionStorage.getItem('display-qa-seeded')){localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':'pc','urban-life-ui-zoom':'1','urban-life-scene-mode':kind==='navigation'?'2d':'3d','urban-life-scene-mode-v2':'1','urban-life-render-resolution':'auto','urban-life-render-scale':'1','urban_life_audio_muted':'0','urban_life_audio_bgm_enabled':'0','urban_life_audio_sfx_volume':'50','urban_life_audio_default_volume_migration_v1':'1','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(k,v);sessionStorage.setItem('display-qa-seeded','1');}
    window.__travelQA={starts:[],decoded:[]};const buffers=new WeakMap(),p=AudioContext.prototype,decode=p.decodeAudioData,create=p.createBufferSource;
    p.decodeAudioData=function(data,...rest){let h=2166136261;for(const b of new Uint8Array(data))h=Math.imul(h^b,16777619);return decode.call(this,data,...rest).then(buffer=>{buffers.set(buffer,h>>>0);if(transportHashes.includes(h>>>0))window.__travelQA.decoded.push(h>>>0);return buffer;});};
    p.createBufferSource=function(){const source=create.call(this),start=source.start;source.start=function(...args){if(transportHashes.includes(buffers.get(source.buffer)))window.__travelQA.starts.push(buffers.get(source.buffer));return start.apply(this,args);};return source;};
  },{save,kind,transportHashes});
  const shot=async label=>{const file=id+'-'+label+'.png';await page.screenshot({path:join(out,file),timeout:120000});result.screenshots.push(file);};
  try{await page.goto(url,{waitUntil:'load',timeout:300000});const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:240000});await fn(page,result,shot);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.passed=true;console.log('PASS '+id);}catch(e){result.failure=e.stack;await shot('failure').catch(()=>{});throw e;}finally{await context.close();}
}
const selectors={home:'[data-home-quality]',office:'[data-office-quality]',cafe:'[data-cafe-quality]',store:'[data-store-quality]'};
async function resolutionCheck(page,result,shot,kind){
  const host=page.locator(selectors[kind]);await host.waitFor({timeout:90000});await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
  const geometry=()=>page.evaluate(()=>({zoom:getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'),mode:document.documentElement.dataset.gameMode,buttons:[...document.querySelectorAll('.view-controls button,.display-trigger')].filter(n=>n.getBoundingClientRect().width>0).map(n=>{const r=n.getBoundingClientRect();return{text:n.textContent,x:r.x,y:r.y,w:r.width,h:r.height,font:getComputedStyle(n).fontSize};})}));
  const initial=await geometry(),before=await host.evaluate(n=>({width:n.querySelector('canvas').width,height:n.querySelector('canvas').height}));await shot('auto');
  await page.getByRole('button',{name:'画面设置',exact:true}).click();await page.getByRole('combobox',{name:'3D 渲染分辨率模式',exact:true}).selectOption('100');if(kind==='office')await shot('resolution-settings');await page.getByRole('button',{name:'关闭画面设置',exact:true}).click();
  await page.waitForFunction(selector=>{const n=document.querySelector(selector);return n&&JSON.parse(n.dataset[Object.keys(n.dataset).find(k=>/Quality$/.test(k))]).resolution==='100';},selectors[kind],{timeout:90000});
  const native=await host.evaluate(n=>{const c=n.querySelector('canvas'),r=n.getBoundingClientRect();return{buffer:[c.width,c.height],display:[r.width,r.height],dpr:devicePixelRatio};});
  assert(Math.abs(native.buffer[0]-native.display[0]*native.dpr)<=3);assert(Math.abs(native.buffer[1]-native.display[1]*native.dpr)<=3);assert(native.buffer[0]*native.buffer[1]>before.width*before.height);assert.deepEqual(await geometry(),initial);await shot('native-100');
  await page.getByRole('button',{name:'画面设置',exact:true}).click();await page.getByRole('combobox',{name:'3D 渲染分辨率模式',exact:true}).selectOption('75');await page.getByRole('button',{name:'关闭画面设置',exact:true}).click();
  await page.waitForFunction(({selector,width})=>document.querySelector(selector).querySelector('canvas').width<width,{selector:selectors[kind],width:native.buffer[0]},{timeout:90000});assert.deepEqual(await geometry(),initial);
  const scaled=await host.evaluate(n=>({buffer:[n.querySelector('canvas').width,n.querySelector('canvas').height]}));assert(Math.abs(scaled.buffer[0]/native.buffer[0]-.75)<.002);assert.equal(await page.evaluate(()=>localStorage.getItem('urban-life-render-resolution')),'75');
  await page.setViewportSize({width:1600,height:950});await page.waitForFunction(({selector,width})=>document.querySelector(selector).querySelector('canvas').width!==width,{selector:selectors[kind],width:scaled.buffer[0]},{timeout:90000});
  const resized=await host.evaluate(n=>{const c=n.querySelector('canvas'),r=n.getBoundingClientRect();return{buffer:[c.width,c.height],display:[r.width,r.height],dpr:devicePixelRatio};});assert(Math.abs(resized.buffer[0]-resized.display[0]*resized.dpr*.75)<=3);assert(Math.abs(resized.buffer[1]-resized.display[1]*resized.dpr*.75)<=3);
  result.checks.push({autoBuffer:before,native,scaled75:scaled,resized,uiGeometryAndFontsUnchanged:true,preferencePersisted:true,windowResizeTracksScreenPixels:true});
}
try{
  if(!portable){
    await run('home-high-dpi-resolution',fixture('old_apartment'),'home',async(p,r,s)=>resolutionCheck(p,r,s,'home'));
    await run('office-high-dpi-resolution',fixture('municipal_hall'),'office',async(page,result,shot)=>{
      const office=await page.evaluate(async()=>{const {gameState:s}=await import('/src/stores/gameStore.svelte.ts'),api=await import('/src/game/core/company.ts'),cfg=await import('/src/game/core/companyConfig.ts');s.locationId='municipal_hall';s.time.hour=12;s.player.money=100000;s.player.skills.programming=s.player.skills.design=10;s.developmentHistory={total:100,byType:{personal_programming_order:100},migrated:true};const registered=api.registerCompany(s,'清晰度测试',2);if(!registered.ok)throw Error(registered.reason);s.locationId=cfg.companyStage(2).location;s.area=s.region=cfg.companyStage(2).region;s.navStack=['map',s.region];(await import('/src/lib/save.ts')).saveGameImmediately('auto',s);return JSON.parse(JSON.stringify(s));});writeFileSync(join(audit,'display-office-fixture.json'),JSON.stringify(office,null,2));await page.reload({waitUntil:'load',timeout:300000});await page.getByRole('button',{name:/继续生活/}).click();await resolutionCheck(page,result,shot,'office');
    });
    for(const [kind,location]of [['cafe','cafe'],['store','convenience_store']])await run(kind+'-high-dpi-resolution',fixture(location),kind,(p,r,s)=>resolutionCheck(p,r,s,kind));
  }else{
    await run('home-high-dpi-resolution',fixture('old_apartment'),'home',async(page,result,shot)=>{await resolutionCheck(page,result,shot,'home');await page.reload({waitUntil:'load',timeout:300000});await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:240000});const state=await page.locator('[data-home-quality]').getAttribute('data-home-quality');assert.equal(JSON.parse(state).resolution,'75');result.checks.push({actualReloadPreservesResolution:true});});
    await run('office-high-dpi-resolution',JSON.parse(readFileSync(join(audit,'display-office-fixture.json'),'utf8')),'office',(p,r,s)=>resolutionCheck(p,r,s,'office'));
  }
  const map=fixture('map');map.region='downtown';map.area='downtown_residential';map.navStack=['map','downtown'];
  await run('quiet-map-navigation',map,'navigation',async(page,result,shot)=>{
    const pin=page.locator('[data-location-id="downtown_center"]');await pin.waitFor();await page.waitForFunction(hashes=>hashes.every(h=>window.__travelQA.decoded.includes(h)),transportHashes,{timeout:60000});
    await pin.click();await page.locator('.map-board[data-map-id="downtown_center"]').waitFor({timeout:120000});await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
    await page.locator('[data-location-id="downtown_commercial"]').click();await page.locator('.map-board[data-map-id="downtown_commercial"]').waitFor({timeout:120000});await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
    await page.locator('[data-location-id="cafe"]').click();await page.locator('[data-cafe-exit]').waitFor({timeout:180000});await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});await page.waitForTimeout(200);const audio=await page.evaluate(()=>window.__travelQA);assert.deepEqual(audio.starts,[]);await shot('cafe-after-region-travel');result.checks.push({actualRegionAndFacilityClicks:true,allFiveTransportEffectsDecoded:true,vehicleAndFootstepStarts:0});
  },{dpr:1});
  report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e);}finally{writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await server?.close();}
console.log(JSON.stringify({passed:report.passed,scenarios:report.scenarios.map(x=>({id:x.id,passed:x.passed,errors:x.errors,failure:x.failure}))}));
