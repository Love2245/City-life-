import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/office-layout-mobile-audio-1497-20261027');
const portable=process.env.QA_PORTABLE==='1',url=portable?pathToFileURL(join(root,'1.49.7.html')).href:'http://127.0.0.1:14635/';
const hashes=Object.fromEntries(Object.entries({cafe:'src/assets/music/场所氛围/咖啡馆_暖灯轻爵士_CoffeeHouseBump.mp3',morning:'src/assets/music/morning.mp3'}).map(([id,file])=>{let h=2166136261;for(const b of readFileSync(join(root,file)))h=Math.imul(h^b,16777619);return[id,h>>>0]}));
const ssr=await createServer({root,configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
const api=Object.assign({},...await Promise.all(['state','actions','calendar','regions'].map(name=>ssr.ssrLoadModule('/src/game/core/'+name+'.ts'))));
await ssr.close();
const state=api.createInitialState(149727);state.mode='eternal';state.player.money=100000;state.tutorial={done:['eat','work','sleep'],activeStep:-1};
Object.assign(state.time,api.fromLinearDay(api.START_EPOCH+101),{hour:10,minute:0});Object.assign(state.player.attrs,{stamina:100,health:100,mood:80,satiety:80,hygiene:80});
state.locationId='cafe';state.region=state.area=api.getLocation('cafe').regions[0];state.weather.id='sunny';state.weather.lastRollDay=api.gameDay(state.time);state.navStack=['map',api.topRegionOf(state.region),state.region].filter((v,i,a)=>v&&a.indexOf(v)===i);
const server=portable?undefined:await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:14635,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server?.listen();
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
const report={startedAt:new Date().toISOString(),hashes,checks:[],errors:[],passed:false};
try{
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();page.setDefaultTimeout(90000);
  if(portable)await context.route(/^https?:/,route=>route.abort());
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(({state,hashes})=>{
    localStorage.clear();for(const [k,v] of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':'pc','urban-life-ui-zoom':'1','urban-life-scene-mode':'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'0','urban_life_audio_bgm_enabled':'1','urban_life_audio_bgm_volume':'50','urban_life_audio_default_volume_migration_v1':'1','urban_life_save_auto':JSON.stringify(state)}))localStorage.setItem(k,v);
    window.__audioQA={starts:[],stops:[],morningHeld:false};let release;const gate=new Promise(resolve=>{release=resolve});window.__releaseMorning=release;
    const buffers=new WeakMap(),p=AudioContext.prototype,decode=p.decodeAudioData,create=p.createBufferSource;
    p.decodeAudioData=function(data,...rest){let h=2166136261;for(const b of new Uint8Array(data))h=Math.imul(h^b,16777619);return decode.call(this,data,...rest).then(async buffer=>{if((h>>>0)===hashes.morning){window.__audioQA.morningHeld=true;await gate;}buffers.set(buffer,h>>>0);return buffer;});};
    p.createBufferSource=function(){const source=create.call(this),start=source.start,stop=source.stop;source.start=function(...args){window.__audioQA.starts.push({hash:buffers.get(source.buffer),at:performance.now()});return start.apply(this,args);};source.stop=function(...args){window.__audioQA.stops.push({hash:buffers.get(source.buffer),at:performance.now(),when:args[0],clock:source.context.currentTime});return stop.apply(this,args);};return source;};
  },{state,hashes});
  await page.goto(url,{waitUntil:'load',timeout:300000});
  const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();
  await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-cafe-exit]').waitFor();
  await page.waitForFunction(hash=>window.__audioQA.starts.some(x=>x.hash===hash),hashes.cafe,{timeout:90000});
  report.checks.push({cafeStarted:true});
  const exitAt=await page.evaluate(()=>performance.now());await page.locator('[data-cafe-exit]').click();
  if(portable)await page.locator('[data-cafe-exit]').waitFor({state:'hidden',timeout:90000});
  else await page.waitForFunction(async()=>{const s=await import('/src/stores/gameStore.svelte.ts');return s.gameState.locationId==='map';},{timeout:90000});
  await page.waitForFunction(({hash,exitAt})=>window.__audioQA.stops.some(x=>x.hash===hash&&x.at>exitAt&&x.when-x.clock<=.21),{hash:hashes.cafe,exitAt},{timeout:10000});
  await page.waitForFunction(()=>window.__audioQA.morningHeld,null,{timeout:30000});
  assert.equal(await page.evaluate(hash=>window.__audioQA.starts.some(x=>x.hash===hash),hashes.morning),false,'replacement should remain blocked');
  await page.evaluate(()=>window.__releaseMorning());
  await page.waitForFunction(hash=>window.__audioQA.starts.some(x=>x.hash===hash),hashes.morning,{timeout:30000});
  const afterExit=portable?await page.evaluate(()=>({cafeExitHidden:!document.querySelector('[data-cafe-exit]'),audio:window.__audioQA})):await page.evaluate(async()=>{const s=await import('/src/stores/gameStore.svelte.ts');return{location:s.gameState.locationId,audio:window.__audioQA}});
  report.checks.push({slowReplacementExercised:true,cafeRetiredWithin200ms:true,afterExit});
  assert.deepEqual(report.errors,[]);report.passed=true;await context.close();
}catch(e){report.failure=e.stack;process.exitCode=1;}finally{writeFileSync(join(out,`audio-route-${portable?'portable':'browser'}.json`),JSON.stringify(report,null,2));await browser.close();await server?.close();}
console.log(JSON.stringify(report));
