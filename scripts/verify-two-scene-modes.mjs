/** Production UI QA: two renderer choices, isolated startup saves, no live state mutation. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,process.env.QA_OUT??'docs/two-scene-modes-1497-20261024/browser');mkdirSync(out,{recursive:true});
const write=()=>writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));
const fixtureServer=await createServer({root,configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;
try{api=Object.assign({},...await Promise.all(['/src/game/core/state.ts','/src/game/core/company.ts','/src/game/core/housing.ts'].map(file=>fixtureServer.ssrLoadModule(file))));}finally{await fixtureServer.close();}
function fixture(scene){const state=api.createInitialState(14972425);state.mode='eternal';state.player.money=100000;state.time.hour=10;state.tutorial={done:['eat','work','sleep'],activeStep:-1};state.flags.item_laptop_mid=true;
  Object.assign(state.player.attrs,{stamina:100,health:100,mood:100,hygiene:100,satiety:100});
  if(scene==='company'){state.locationId='municipal_hall';state.developmentHistory.total=10;assert(api.registerCompany(state,'双模式验收公司',2).ok);state.locationId='electronics_store';assert(api.buyCompanyComputers(state,'mid',3).ok);state.locationId='company_office_single';assert(api.assignCompanyComputer(state,state.company.computers[0].id,'founder').ok);assert(api.interviewCompany(state).ok);assert(api.hireCompanyEmployee(state,state.company.candidates[0].id).ok);state.region=state.area='downtown_commercial';}
  else if(scene==='home'){assert(api.signLease(state,'old_apartment').ok);state.locationId='old_apartment';state.region=state.area='downtown_residential';}
  else{state.locationId='convenience_store';state.region=state.area='downtown_center';}
  state.navStack=['map',state.region];return state;
}
const playwright=await import(pathToFileURL('C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js').href),chromium=playwright.chromium??playwright.default.chromium;
const url=process.env.QA_URL??'http://127.0.0.1:1427/';
const browser=await chromium.launch({headless:true,executablePath:join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
const report={url,browser:browser.version(),policy:'Startup fixtures only; every mode selection and facility operation uses real production controls. Desktop defaults to real 3D, phone to photograph 2D. No legacy pure-flat mode.',scenarios:[],passed:false};
const cases=['home','company','store'].flatMap(scene=>['pc','pe'].map(mode=>({id:`${mode}-${scene}`,mode,scene,width:mode==='pc'?1440:852,height:mode==='pc'?900:393})));
cases.push({id:'pc-home-legacy-flat',mode:'pc',scene:'home',width:1440,height:900,legacy:'flat'},
  {id:'pe-company-legacy-pseudo3d',mode:'pe',scene:'company',width:852,height:393,legacy:'3d'});
try{for(const spec of cases){if(process.env.QA_CASES&&!process.env.QA_CASES.split(',').includes(spec.id))continue;
  const result={...spec,checks:[],screenshots:[],errors:[],failedRequests:[],modelRequests:[],httpRequests:[],externalFileRequests:[],passed:false};report.scenarios.push(result);write();
  const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},hasTouch:spec.mode==='pe'});if(url.startsWith('file:'))await context.route(/^https?:/,route=>route.abort('blockedbyclient'));
  const page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',error=>result.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});page.on('requestfailed',request=>result.failedRequests.push(request.url().startsWith('data:')?'data:resource':request.url()));
  page.on('request',request=>{const href=request.url();if(/\.(?:glb|gltf)(?:\?|$)/.test(href))result.modelRequests.push(href);if(/^https?:/.test(href))result.httpRequests.push(href);if(href.startsWith('file:')&&href!==url)result.externalFileRequests.push(href);});
  await page.addInitScript(({save,spec})=>{window.__sceneContexts=[];const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){window.__sceneContexts.push(kind);return original.call(this,kind,...args);};
    if(sessionStorage.getItem('two-scene-modes-qa'))return;sessionStorage.setItem('two-scene-modes-qa','1');localStorage.clear();for(const[key,value]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':spec.mode,'urban-life-pe-zoom-v3':'1','urban-life-ui-zoom':spec.mode==='pe'?'.7':'1','urban-life-show-log':'false','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(key,value);if(spec.legacy)localStorage.setItem('urban-life-scene-mode',spec.legacy);
  },{save:fixture(spec.scene),spec});
  const rootSelector=spec.scene==='home'?'.home-interior':spec.scene==='company'?'[data-company-office]':'[data-store-interior]';
  const wait=async()=>{await page.locator(rootSelector).first().waitFor();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});await page.waitForFunction(selector=>document.querySelectorAll(selector).length===1,rootSelector);};
  const screen=async label=>{const file=`${spec.id}-${label}.png`;await page.screenshot({path:join(out,file),animations:'disabled'});result.screenshots.push(file);};
  const getContexts=()=>page.evaluate(()=>window.__sceneContexts);
  const choose=async mode=>{await page.getByRole('button',{name:'画面设置',exact:true}).click();const select=page.getByLabel('场景显示',{exact:true});assert.deepEqual(await select.locator('option').evaluateAll(nodes=>nodes.map(node=>node.value)),['3d','2d']);await select.selectOption(mode);await wait();const close=page.getByRole('button',{name:'关闭画面设置',exact:true});if(await close.isVisible().catch(()=>false))await close.click();};
  const stored=async()=>{await page.getByRole('button',{name:'打开菜单与存档',exact:true}).click();await page.getByRole('button',{name:/快速存档（自动槽）/}).click();await page.getByRole('button',{name:/快速存档（自动槽）/}).waitFor({state:'hidden'});return page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));};
  const assertRenderer=async mode=>{assert.equal(await page.locator(`${rootSelector} canvas`).count(),1);assert.equal(await page.locator(`${rootSelector} canvas[data-still-scene]`).count(),mode==='2d'?1:0);assert.equal(await page.locator('.loc-card,.flat-plan,svg.home-fallback').count(),0,'废弃纯平面场景不应再挂载');};
  try{await page.goto(url,{waitUntil:'load',timeout:240000});const notice=page.getByRole('button',{name:'关闭公告',exact:true});if(await notice.isVisible().catch(()=>false))await notice.click();await page.getByRole('button',{name:/继续生活/}).click();await wait();const initial=spec.legacy?'2d':spec.mode==='pc'?'3d':'2d';await assertRenderer(initial);await screen(`default-${initial}`);const before=await stored();if(spec.legacy)result.checks.push({legacyStored:spec.legacy,migratedToPhotograph2d:true});
    if(spec.mode==='pe'){assert.equal((await getContexts()).filter(kind=>/webgl/i.test(kind)).length,0);assert.equal(result.modelRequests.length,0);result.checks.push({phoneDefault2dNoWebgl:true});}
    const modes=spec.mode==='pc'?['2d','3d','2d']:['3d','2d'];
    for(const mode of modes){const gpuBefore=(await getContexts()).filter(kind=>/webgl/i.test(kind)).length;await choose(mode);await assertRenderer(mode);const gpuAfter=(await getContexts()).filter(kind=>/webgl/i.test(kind)).length;if(mode==='2d')assert.equal(gpuAfter,gpuBefore);else assert(gpuAfter>gpuBefore,'选择3D必须实际创建模型renderer');await screen(`selected-${mode}-${result.screenshots.length}`);result.checks.push({mode,actualRenderer:true,noThirdMode:true,contexts:(await getContexts()).slice(-3)});}
    // The photograph still exposes the same business/home/store controls.
    const facility=spec.scene==='company'?'[data-office-seat="0"]':spec.scene==='home'?'[data-home-object="bed"]':'[data-store-facility="checkout"]';await page.locator(facility).click();if(spec.scene==='company')await page.getByRole('button',{name:'关闭公司经营面板',exact:true}).click();else await page.keyboard.press('Escape');
    const after=await stored();assert.deepEqual(after.time,before.time);assert.equal(after.player.money,before.player.money);assert.deepEqual(after.company,before.company);assert.equal(await page.evaluate(()=>localStorage.getItem('urban-life-scene-mode')),'2d');
    await page.reload({waitUntil:'load',timeout:240000});const againNotice=page.getByRole('button',{name:'关闭公告',exact:true});if(await againNotice.isVisible().catch(()=>false))await againNotice.click();await page.getByRole('button',{name:/继续生活/}).click();await wait();await assertRenderer('2d');await screen('reloaded-2d');result.checks.push({choicePersistsAfterReload:true,gameplayUnchanged:true});
    if(url.startsWith('file:')){assert.equal(result.httpRequests.length,0);assert.equal(result.externalFileRequests.length,0);}assert.equal(result.errors.length,0,result.errors.join('\n'));assert.equal(result.failedRequests.length,0);result.passed=true;console.log(`${spec.id}: passed`);
  }catch(error){result.failure=error.stack;await screen('failure').catch(()=>{});throw error;}finally{write();await context.close();}
}report.passed=report.scenarios.length>0&&report.scenarios.every(result=>result.passed);assert(report.passed);}finally{await browser.close();write();}
