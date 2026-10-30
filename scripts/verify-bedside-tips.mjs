import {createServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=process.cwd(),out=path.join(root,'docs/bedside-tips-20261021/home-browser-proof');
await fs.mkdir(out,{recursive:true});
const virtual='\0bedside-preview';
const entry=`
import {mount,flushSync} from 'svelte';
import '/src/styles/app.css';import '/src/styles/themes.css';import '/src/styles/mobile.css';
import Preview from '/docs/bedside-tips-20261021/BedsidePreview.svelte';
import {createInitialState} from '/src/game/core/state.ts';
import {signLease,selectLodging,buyProperty} from '/src/game/core/housing.ts';
import {residenceLocationId} from '/src/game/core/residence.ts';
import {replaceState,gameState} from '/src/stores/gameStore.svelte.ts';
import {uiState} from '/src/stores/uiStore.svelte.ts';
import {showCityTip} from '/src/lib/cityTips.ts';
import {LOADING_TIPS} from '/src/game/data/loadingTips.ts';
import {homePlanFor} from '/src/game/core/homeInterior.ts';
const params=new URLSearchParams(location.search),id=params.get('id')||'old_apartment';
const state=createInitialState();state.player.money=100000000;state.time.hour=10;
let result=id.startsWith('own_')?buyProperty(state,id):id==='minsu'||id==='hotel'?{ok:selectLodging(state,id)}:signLease(state,id);
if(!result.ok)throw new Error(JSON.stringify(result));
// Isolated rendering fixture: set the booked home's address without testing intercity travel.
state.locationId=residenceLocationId(state);replaceState(state);
uiState.gameMode=params.get('mobile')?'mobile':'pc';uiState.renderScale=.75;
document.documentElement.dataset.gameMode=uiState.gameMode;
mount(Preview,{target:document.getElementById('app')});flushSync();
window.bedsideQA={tips:LOADING_TIPS,plan:homePlanFor(id),snapshot:()=>JSON.stringify(gameState),show:()=>{showCityTip();uiState.cityTip=LOADING_TIPS.reduce((a,b)=>a.length>=b.length?a:b);flushSync();},mobile:()=>{uiState.gameMode='mobile';document.documentElement.dataset.gameMode='mobile';flushSync();}};
`;
const plugin={name:'bedside-preview',resolveId(id){if(id==='/@bedside-preview')return virtual;},load(id){if(id===virtual)return entry;},configureServer(server){server.middlewares.use((request,response,next)=>{if(!request.url?.startsWith('/bedside-preview'))return next();response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module" src="/@bedside-preview"></script>');});}};
const server=await createServer({root,configFile:false,plugins:[plugin,svelte({compilerOptions:{dev:false,hmr:false}})],server:{host:'127.0.0.1',port:1445,strictPort:true,watch:{ignored:['**/*']}},optimizeDeps:{noDiscovery:true},appType:'custom'});
const report={sourceComponentPreview:true,realWebGL:true,gameSavesTouched:false,normalPlayerJourney:false,errors:[],rooms:[],popups:[]};let browser;
try{
  await server.listen();browser=await playwright.chromium.launch({executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));
  for(const id of ['old_apartment','suburb_room','own_villa','minsu']){
    await page.goto('http://127.0.0.1:1445/bedside-preview?id='+id);await page.waitForFunction(()=>!!window.bedsideQA,{},{timeout:60000});
    await page.waitForSelector('[data-home-mode="3d"]',{timeout:60000});await page.waitForSelector('[data-scene-loading-overlay]',{state:'detached',timeout:90000});
    const canvas=page.locator('.home-world canvas');assert.equal(await canvas.count(),1);
    const bin=page.locator('[data-home-object="trash"]');await bin.waitFor({state:'visible',timeout:15000});
    const before=await page.evaluate(()=>window.bedsideQA.snapshot());
    await page.screenshot({path:path.join(out,id+'-room.png')});
    await bin.click();await page.locator('[data-city-tip]').waitFor();
    const first=await page.locator('[data-city-tip-text]').textContent();assert(await page.evaluate(tip=>window.bedsideQA.tips.includes(tip),first));
    await page.getByRole('button',{name:'再翻一条'}).click();const second=await page.locator('[data-city-tip-text]').textContent();assert.notEqual(first,second);
    await page.screenshot({path:path.join(out,id+'-paper.png')});
    await page.keyboard.press('Escape');await page.locator('[data-city-tip]').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.bedsideQA.snapshot()),before);
    const position=await page.evaluate(()=>window.bedsideQA.plan.anchors.trash.position);
    report.rooms.push({id,mode:'3d',position,binVisible:true,authorOnly:true,stateUnchanged:true,first,second});
  }
  await page.evaluate(()=>window.bedsideQA.mobile());
  for(const [name,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}],['small-portrait',{width:320,height:568}],['short-landscape',{width:640,height:320}]]){
    await page.setViewportSize(viewport);await page.evaluate(()=>window.bedsideQA.show());
    const bounds=await page.locator('[data-city-tip]').boundingBox();assert(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
    for(const button of await page.locator('[data-city-tip] button').all())assert(await button.isVisible());
    await page.screenshot({path:path.join(out,name+'-paper.png')});await page.getByRole('button',{name:'收起来'}).click();
    report.popups.push({name,viewport,bounds});
  }
  assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report,null,2));
