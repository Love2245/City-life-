/** Formal game routes, startup save fixtures only, real clicks and GPU instrumentation. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,statSync,createReadStream} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,process.env.QA_OUT||'docs/mobile-stills-company-return-1497-20261024/venues');mkdirSync(out,{recursive:true});
const fixtureServer=await createServer({root,configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;try{api=Object.assign({},...await Promise.all(['/src/game/core/state.ts','/src/game/core/calendar.ts'].map(file=>fixtureServer.ssrLoadModule(file))));}finally{await fixtureServer.close();}
let server,browser;
const report={startedAt:new Date().toISOString(),url:process.env.QA_URL||'http://127.0.0.1:1432/',policy:'Startup save fixtures only; production components, real UI clicks. Every canvas getContext call is recorded from document start. No live state injection.',resources:{},scenarios:[],passed:false};
const reportFile=join(out,'verification.json'),saveReport=()=>writeFileSync(reportFile,JSON.stringify(report,null,2));
const hashFile=async path=>{const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');};
if(report.url.startsWith('file:')){const path=fileURLToPath(report.url);report.artifact={path,bytes:statSync(path).size,sha256:await hashFile(path)};}
const manifest=JSON.parse(readFileSync(join(root,'src/assets/mobile-stills/venues/manifest.json'),'utf8'));
report.resources={files:Object.values(manifest.views).length,bytes:Object.values(manifest.views).reduce((sum,view)=>sum+statSync(join(root,'src/assets/mobile-stills/venues',view.file)).size,0),sha256:Object.fromEntries(Object.values(manifest.views).map(view=>[view.file,createHash('sha256').update(readFileSync(join(root,'src/assets/mobile-stills/venues',view.file))).digest('hex')]))};
function fixture(spec){const s=api.createInitialState(149724);s.mode='eternal';s.player.money=100000;s.tutorial={done:['eat','work','sleep'],activeStep:-1};while(api.weekdayOf(s.time)!==0)s.time.day++;s.time.hour=spec.hour;s.time.minute=0;Object.assign(s,{locationId:spec.venue==='store'?'convenience_store':'cafe',region:'downtown_residential',area:'downtown_residential',navStack:['map','downtown','downtown_residential']});Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,hygiene:100,satiety:100});return s;}
try{
  if(!process.env.QA_URL){server=await createServer({root,configLoader:'runner',server:{host:'127.0.0.1',port:1432,strictPort:true}});await server.listen();}
  const pw=await import(pathToFileURL('C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js').href),chromium=pw.chromium??pw.default.chromium;
  browser=await chromium.launch({executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
  report.browser=browser.version();
  const cases=[{id:'store-day',venue:'store',hour:12},{id:'store-night',venue:'store',hour:23},{id:'cafe-lin',venue:'cafe',hour:8},{id:'cafe-night',venue:'cafe',hour:18}];
  for(const spec of cases){
    if(process.env.QA_CASES&&!process.env.QA_CASES.split(',').includes(spec.id))continue;
    const result={...spec,checks:[],screenshots:[],errors:[],failedRequests:[],modelRequests:[],threeRequests:[],httpRequests:[],externalFileRequests:[],passed:false};report.scenarios.push(result);saveReport();
    const context=await browser.newContext({viewport:{width:852,height:393},hasTouch:true,deviceScaleFactor:1});
    if(report.url.startsWith('file:'))await context.route(/^https?:\/\//,route=>route.abort('blockedbyclient'));
    const page=await context.newPage();page.setDefaultTimeout(45000);
    page.on('pageerror',error=>result.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
    page.on('requestfailed',request=>result.failedRequests.push({url:request.url().startsWith('data:')?'data:'+request.resourceType():request.url(),error:request.failure()?.errorText}));
    page.on('request',request=>{const u=request.url();if(/^https?:/.test(u))result.httpRequests.push(u);else if(u.startsWith('file:')&&new URL(u).href!==new URL(report.url).href)result.externalFileRequests.push(u);if(/\.(glb|gltf)(?:[?#]|$)/i.test(u))result.modelRequests.push(u);if(/node_modules\/(?:\.vite\/deps\/three|\.pnpm\/three|three)/.test(u))result.threeRequests.push(u);});
    await page.addInitScript(({save})=>{window.__sceneContexts=[];const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){window.__sceneContexts.push(type);return original.call(this,type,...args);};if(sessionStorage.getItem('venue-still-qa'))return;sessionStorage.setItem('venue-still-qa','1');localStorage.clear();for(const[key,value]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':'pe','urban-life-pe-zoom-v3':'1','urban-life-ui-zoom':'.7','urban-life-show-log':'false','urban-life-scene-mode':'3d','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(key,value);},{save:fixture(spec)});
    const host=page.locator(`.${spec.venue}-world`),photo=host.locator('canvas[data-still-scene]');
    const screenshot=async label=>{const file=`${spec.id}-${label}.png`;await page.screenshot({path:join(out,file),animations:'disabled'});result.screenshots.push(file);};
    const state=()=>host.evaluate(node=>JSON.parse(node.dataset.venueStill));
    const waitAngle=angle=>page.waitForFunction(({venue,angle})=>{const value=document.querySelector(`.${venue}-world`)?.dataset.venueStill;return value&&JSON.parse(value).angle===angle;},{venue:spec.venue,angle});
    try{
      await page.goto(report.url,{waitUntil:'load',timeout:240000});const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();await page.getByRole('button',{name:/继续生活/}).click();await photo.waitFor();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:120000});await waitAngle(0);
      const expected=spec.venue==='store'?['fresh','drinks','noodles','seasoning','checkout','seating','blindbox','door']:['counter','coffee','lounge','books',...(spec.id==='cafe-lin'?['lin']:[]),'door'];
      const hashes=[];
      for(let angle=0;angle<4;angle++){
        await waitAngle(angle);assert.deepEqual((await state()).angle,angle);assert.equal(await photo.count(),1);
        const hash=createHash('sha256').update(await photo.screenshot()).digest('hex');hashes.push(hash);await screenshot(`angle-${angle}`);
        const clean=`${spec.id}-angle-${angle}-clean.png`;await photo.screenshot({path:join(out,clean)});result.screenshots.push(clean);
        for(const id of expected){await page.locator(`[data-${spec.venue}-facility="${id}"]`).click();await page.locator(`[data-${spec.venue}-selected="${id}"]`).waitFor();const bounds=await page.locator(`[data-${spec.venue}-selected]`).evaluate(node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};});assert(bounds.x>=-1&&bounds.y>=-1&&bounds.right<=853&&bounds.bottom<=394,`${spec.id} ${id} outside viewport: ${JSON.stringify(bounds)}`);await page.getByRole('button',{name:'收起设施操作',exact:true}).click();}
        result.checks.push({angle,facilities:expected,photoHash:hash});if(angle<3)await page.getByRole('button',{name:spec.venue==='store'?'便利店向右旋转':'咖啡厅向右旋转',exact:true}).click();
      }
      assert.equal(new Set(hashes).size,4,'Four views must show different photographs');
      await page.locator(`[data-${spec.venue}-facility="door"]`).click();const door=page.locator(`[data-${spec.venue}-door]`);await door.click();await page.waitForFunction(venue=>JSON.parse(document.querySelector(`.${venue}-world`).dataset.venueStill).doorOpen,spec.venue);await screenshot('door-open');await door.click();await page.waitForFunction(venue=>!JSON.parse(document.querySelector(`.${venue}-world`).dataset.venueStill).doorOpen,spec.venue);await page.getByRole('button',{name:'收起设施操作',exact:true}).click();
      await page.getByRole('button',{name:'画面设置',exact:true}).click();assert.equal(await page.getByLabel(/画质/).count(),0);await page.getByRole('button',{name:'关闭画面设置',exact:true}).click();
      if(spec.id==='cafe-lin'){
        const before=createHash('sha256').update(await photo.screenshot()).digest('hex');
        for(let cup=0;cup<2;cup++){await page.locator('[data-cafe-facility="counter"]').click();await page.locator('[data-cafe-order]').click();await page.locator('.result-modal .r-continue').click();}
        await page.waitForFunction(()=>!JSON.parse(document.querySelector('.cafe-world').dataset.venueStill).linPresent);
        assert.equal(await page.locator('[data-cafe-facility="lin"]').count(),0);
        const after=createHash('sha256').update(await photo.screenshot()).digest('hex');assert.notEqual(after,before,'Lin departure must replace the sprite with her empty stool');
        await page.locator('.result-modal').waitFor({state:'hidden'});
        const decline=page.getByRole('button',{name:'把机会留给别人',exact:true});if(await decline.waitFor({state:'visible',timeout:3000}).then(()=>true).catch(()=>false)){await decline.click();await page.locator('.event-modal .e-done').click();await page.locator('.event-modal').waitFor({state:'hidden'});result.checks.push({normalEventChoice:'把机会留给别人'});}
        await page.getByRole('button',{name:'打开菜单与存档',exact:true}).click();await page.getByRole('button',{name:/快速存档（自动槽）/}).click();
        const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));assert.equal(save.time.hour,9);assert.equal(save.time.minute,0);assert.equal(save.player.money,99950);assert.equal(save.locationId,'cafe');
        result.checks.push({realDrinkJourney:{cups:2,hour:9,money:99950,linDeparted:true,spriteChanged:true}});await screenshot('lin-departed-at-nine');
      }
      result.contexts=await page.evaluate(()=>window.__sceneContexts);assert.equal(result.contexts.filter(type=>/webgl/i.test(type)).length,0);assert.equal(result.modelRequests.length,0);assert.equal(result.threeRequests.length,0);assert.equal(result.errors.length,0,result.errors.join('\n'));assert.equal(result.failedRequests.length,0,JSON.stringify(result.failedRequests));
      if(report.url.startsWith('file:')){assert.equal(result.httpRequests.length,0);assert.equal(result.externalFileRequests.length,0);}
      result.checks.push({doorOpenClose:true,allFacilitiesClickable:true,noWebGL:true,noModelRequests:true,noThreeModuleRequests:true,phoneQualityHidden:true});result.passed=true;console.log(`${spec.id}: passed`);
    }catch(error){result.failure=error.stack;await screenshot('failure').catch(()=>{});throw error;}
    finally{saveReport();await context.close();}
  }
  report.passed=report.scenarios.length>0&&report.scenarios.every(result=>result.passed);assert(report.passed);
  if(report.artifact){report.artifact.unchangedAfterVerification=report.artifact.sha256===await hashFile(report.artifact.path);assert(report.artifact.unchangedAfterVerification);}
}finally{await browser?.close();await server?.close();saveReport();}
