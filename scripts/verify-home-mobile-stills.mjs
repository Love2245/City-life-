/** Isolated phone compositor + actual home UI QA. Never writes to player saves. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,process.env.QA_OUT??'docs/mobile-stills-company-return-1497-20261024/home-browser');mkdirSync(out,{recursive:true});
const server=await createServer({root,server:{port:1433,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/mobile-stills/**']}}});await server.listen();
const browser=await playwright.chromium.launch({executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
const report={passed:false,scope:'Four-direction photographs, current furniture layers and actual mobile HomeInterior UI; no physical-device FPS claim.',browser:browser.version(),compositions:[],journeys:[],errors:[]};
const instrument=()=>{
  window.__glAttempts=[];const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(kind,...args){if(['webgl','webgl2','experimental-webgl'].includes(kind)){window.__glAttempts.push(kind);throw Error('Phone must not create a WebGL context');}return original.call(this,kind,...args);};
};
const errors=page=>{page.on('pageerror',error=>report.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});};
try{
  const page=await browser.newPage({viewport:{width:1000,height:750}});await page.addInitScript(instrument);errors(page);
  const requested=[];page.on('request',request=>requested.push(request.url()));
  await page.route('**/__home-still-qa',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body style="margin:0"><div id="host" style="position:relative;width:100vw;height:100vh"></div><script type="module">
    import {createHomeStillView,homeStillResidenceIds,composeHomeStill} from '/src/lib/homeStillView.ts';
    import {homePreviewRoom} from '/src/lib/homeRoomState.ts';
    import {homePlanFor,HOME_FIXED_IDS} from '/src/game/core/homeInterior.ts';
    import {homeReferencePlan,homeReferenceState} from '/src/lib/homeReferencePlan.ts';
    let view;window.ids=homeStillResidenceIds;window.renderHome=async(id,tier='premium',pets=false)=>{view?.dispose();const plan=homeReferencePlan(homePlanFor(id));let state=homeReferenceState(homePreviewRoom(plan,true,12,'auto','sunny',tier),plan);if(pets&&!HOME_FIXED_IDS.has(id))state={...state,cats:[{uid:'mint',catId:'mint',name:'Mint'},{uid:'round',catId:'roundhead',name:'Round'}],catItems:[{kind:'bed',item:'cat_bed_lux'},{kind:'device',item:'cat_auto_feeder'}]};window.labels=[];view=createHomeStillView(document.querySelector('#host'),plan,labels=>window.labels=labels,()=>{});view.update(state);await view.ready;await new Promise(resolve=>requestAnimationFrame(resolve));window.currentState=state;window.plan=plan;return {fixed:HOME_FIXED_IDS.has(id),labels:window.labels.length,layers:document.querySelector('#host').dataset.homeLayerCount};};
    window.rotate=()=>view.rotate(Math.PI/2);window.ready=true;
  </script></body></html>`}));
  await page.goto('http://127.0.0.1:1433/__home-still-qa');await page.waitForFunction(()=>window.ready);
  const ids=await page.evaluate(()=>window.ids);
  for(const id of ids){const checks=[];const start=await page.evaluate(id=>window.renderHome(id,'premium',true),id);assert(start.labels>0,id+' missing labels');
    for(let angle=0;angle<4;angle++){
      await page.waitForFunction(angle=>document.querySelector('#host').dataset.homeView===String(angle),angle);
      const state=await page.evaluate(()=>({angle:document.querySelector('#host').dataset.homeView,layers:Number(document.querySelector('#host').dataset.homeLayerCount),gl:window.__glAttempts.length,visibleLabels:window.labels.filter(l=>l.visible).length,coordinates:window.labels.map(l=>({kind:l.kind,x:l.x,y:l.y}))}));assert.equal(state.gl,0);assert(state.visibleLabels>0,id+' no visible targets');checks.push(state);
      if(['old_apartment','own_villa','npc_guest_room','boyue_talent_apartment'].includes(id))await page.screenshot({path:join(out,`${id}-${angle}.png`)});
      if(angle<3)await page.evaluate(()=>window.rotate());
    }
    assert.notDeepEqual(checks[0].coordinates,checks[1].coordinates,id+' angle did not move targets');report.compositions.push({id,...start,angles:checks});
  }
  assert.equal(requested.filter(url=>/\.(?:glb|gltf)(?:\?|$)|three_(?:addons|examples)|\/three\.js/.test(url)).length,0);assert.equal(await page.evaluate(()=>window.__glAttempts.length),0);await page.close();
  // Fixtures are installed before entering the real app. Changes below use the UI.
  const api={...await server.ssrLoadModule('/src/game/core/state.ts'),...await server.ssrLoadModule('/src/game/core/housing.ts'),...await server.ssrLoadModule('/src/game/core/actions.ts'),...await server.ssrLoadModule('/src/game/core/items.ts')};
  const save=api.createInitialState(1497);save.mode='eternal';save.player.money=1e6;save.time.hour=12;assert(api.signLease(save,'old_apartment').ok);api.moveTo(save,'old_apartment');api.addItem(save,'bed_basic');save.tutorial={done:['eat','work','sleep'],activeStep:-1};Object.assign(save.player.attrs,{stamina:100,health:100,mood:100,hygiene:100,satiety:100});
  const context=await browser.newContext({viewport:{width:852,height:393},hasTouch:true,deviceScaleFactor:1});const game=await context.newPage();errors(game);const models=[];game.on('request',request=>{if(/\.(?:glb|gltf)(?:\?|$)/.test(request.url()))models.push(request.url());});await game.addInitScript(instrument);await game.addInitScript(save=>{localStorage.clear();localStorage.setItem('urban-life-device-setup-v1','1');localStorage.setItem('urban-life-ui-gamemode','pe');localStorage.setItem('urban-life-pe-zoom-v3','1');localStorage.setItem('urban-life-ui-zoom','.7');localStorage.setItem('urban-life-show-log','false');localStorage.setItem('urban-life-scene-mode','3d');localStorage.setItem('urban_life_save_auto',JSON.stringify(save));},save);
  await game.goto(process.env.QA_URL??'http://127.0.0.1:1433/',{timeout:120000});if(await game.getByRole('button',{name:'关闭公告',exact:true}).isVisible().catch(()=>false))await game.getByRole('button',{name:'关闭公告',exact:true}).click();await game.getByRole('button',{name:/继续生活/}).click();await game.locator('[data-home-mode="stills"]').waitFor();await game.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:60000});
  const metrics=()=>game.evaluate(()=>({angle:document.querySelector('[data-home-renderer="stills"]').dataset.homeView,labels:[...document.querySelectorAll('[data-home-object]')].map(n=>({kind:n.dataset.homeObject,left:n.style.left,top:n.style.top})),gl:window.__glAttempts.length,overflow:document.documentElement.scrollWidth-innerWidth}));
  const initial=await metrics();assert.equal(initial.gl,0);await game.screenshot({path:join(out,'phone-home-initial.png')});
  for(let angle=1;angle<4;angle++){await game.getByRole('button',{name:'向右旋转90度',exact:true}).click();await game.waitForFunction(angle=>document.querySelector('[data-home-renderer="stills"]').dataset.homeView===String(angle),angle);const next=await metrics();assert.equal(next.gl,0);assert(next.overflow<=2);assert.notDeepEqual(next.labels,initial.labels);await game.screenshot({path:join(out,`phone-home-${angle}.png`)});}
  await game.locator('[data-home-object="bed"]').click();await game.getByRole('button',{name:/布置与升级/}).click();await game.locator('[data-home-buy="bed_premium"]').click();await game.waitForFunction(()=>document.querySelector('[data-home-layer-count]')?.getAttribute('data-home-layer-count'));
  await game.locator('.result-modal .r-close').click();await game.locator('.result-modal').waitFor({state:'hidden'});await game.screenshot({path:join(out,'phone-home-bed-upgrade.png')});
  await game.getByRole('button',{name:'画面设置',exact:true}).click();assert.equal(await game.getByLabel('住宅画质',{exact:true}).count(),0);assert.equal(await game.getByLabel('住宅墙体显示',{exact:true}).count(),0);await game.getByRole('button',{name:'关闭画面设置',exact:true}).click();
  assert.equal(await game.evaluate(()=>window.__glAttempts.length),0);assert.equal(models.length,0);report.journeys.push({route:'actual-home',directions:4,bedUpgrade:true,mobileQualityHidden:true,webglAttempts:0,modelRequests:0});await context.close();
  for(const mode of ['pc','pe']){
    const tourContext=await browser.newContext({viewport:{width:mode==='pc'?1440:852,height:mode==='pc'?900:393},hasTouch:mode==='pe'});const tour=await tourContext.newPage();errors(tour);const requestedModels=[];tour.on('request',request=>{if(/\.(?:glb|gltf)(?:\?|$)/.test(request.url()))requestedModels.push(request.url());});
    if(mode==='pe')await tour.addInitScript(instrument);
    await tour.addInitScript(mode=>{localStorage.clear();localStorage.setItem('urban-life-device-setup-v1','1');localStorage.setItem('urban-life-ui-gamemode',mode);localStorage.setItem('urban-life-pe-zoom-v3','1');localStorage.setItem('urban-life-ui-zoom',mode==='pc'?'1':'.7');localStorage.setItem('urban-life-scene-mode','3d');},mode);
    await tour.goto('http://127.0.0.1:1433/',{timeout:120000});if(await tour.getByRole('button',{name:'关闭公告',exact:true}).isVisible().catch(()=>false))await tour.getByRole('button',{name:'关闭公告',exact:true}).click();await tour.locator('.arcade-option').click();await tour.locator('[data-tour-home="old_apartment"]').click();await tour.locator('.home-tour').waitFor();await tour.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:120000});await tour.locator('.tour-world canvas').waitFor();
    const before=await tour.locator('[data-tour-object="bed"]').getAttribute('style');await tour.getByRole('button',{name:'向右旋转90度',exact:true}).click();await tour.waitForFunction(before=>document.querySelector('[data-tour-object="bed"]').getAttribute('style')!==before,before);await tour.locator('[data-tour-object="bed"]').click();await tour.locator('.tour-object-info').waitFor();
    if(mode==='pe'){assert.equal(await tour.locator('.tour-world canvas[data-still-scene="true"]').count(),1);assert.equal(await tour.evaluate(()=>window.__glAttempts.length),0);assert.equal(requestedModels.length,0);assert.equal(await tour.locator('button[data-home-exterior]').count(),0);}
    else{assert.equal(await tour.locator('.tour-world canvas[data-still-scene="true"]').count(),0);assert(requestedModels.length>0);const beforeZoom=await tour.locator('.tour-world').getAttribute('data-home-camera-goal');await tour.locator('.tour-world canvas').hover();await tour.mouse.wheel(0,-180);await tour.waitForFunction(before=>document.querySelector('.tour-world').getAttribute('data-home-camera-goal')!==before,beforeZoom);await tour.locator('button[data-home-exterior]').click();await tour.waitForTimeout(350);}
    await tour.screenshot({path:join(out,`${mode}-home-tour.png`)});report.journeys.push({route:'actual-home-tour',mode,rotate:true,objectCallback:true,freeZoom:mode==='pc',exterior:mode==='pc',modelRequests:requestedModels.length,webglAttempts:mode==='pe'?0:'desktop permitted'});await tourContext.close();
  }
  assert.equal(report.errors.length,0,report.errors.join('\n'));report.passed=true;
}finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,homes:report.compositions.length,journeys:report.journeys.length,errors:report.errors.length}));
