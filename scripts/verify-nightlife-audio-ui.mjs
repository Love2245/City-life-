import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/nightlife-audio-transition-1497-20261027');
const url=process.env.QA_URL??'http://127.0.0.1:1441/',out=resolve(process.env.QA_OUT??join(audit,'browser-source'));mkdirSync(out,{recursive:true});
let server;if(!process.env.QA_URL){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1441,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
const ssr=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;try{api=Object.assign({},...await Promise.all(['state','housing','actions','calendar','weather','regions'].map(name=>ssr.ssrLoadModule('/src/game/core/'+name+'.ts'))));}finally{await ssr.close();}
const sounds=[...JSON.parse(readFileSync(join(root,'docs/interaction-audio-1497-20261027/sound-manifest.json'),'utf8')),...JSON.parse(readFileSync(join(audit,'sfx-manifest.json'),'utf8'))],music=JSON.parse(readFileSync(join(audit,'music-manifest.json'),'utf8'));
function fingerprint(bytes){let h=2166136261;for(const byte of bytes)h=Math.imul(h^byte,16777619);return h>>>0;}
const hashes=Object.fromEntries([...sounds,...music].map(s=>[s.key??s.id,fingerprint(readFileSync(join(root,s.path)))]));
function fixture(spec){
  const s=api.createInitialState(149727);s.mode='eternal';s.player.money=100000;s.tutorial={done:['eat','work','sleep'],activeStep:-1};
  let day=101;while(api.isWeekend(api.fromLinearDay(api.START_EPOCH+day))!==!!spec.weekend)day++;
  Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+day),{hour:spec.hour??(spec.location?.startsWith('boyue_')?20:10),minute:0});
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:80,satiety:60,hygiene:60});
  s.locationId=spec.location??'map';s.region=s.area=spec.location?api.getLocation(spec.location).regions[0]:'downtown';
  if(spec.home){assert(api.signLease(s,'old_apartment').ok);assert(api.moveTo(s,'old_apartment').ok);s.inventory.energy_drink=1;s.inventory.drink=1;}
  if(spec.nav){s.area='downtown_residential';s.region='downtown';s.locationId='map';}
  s.weather.id=spec.weather??'sunny';s.weather.lastRollDay=api.gameDay(s.time);s.navStack=['map',api.topRegionOf(s.region),s.region].filter((v,i,a)=>v&&a.indexOf(v)===i);return s;
}
const moods=[['clear','sunny',false],['cloudy','cloudy',false],['rain','rain',false],['weekend','sunny',true],['weekend-rain','rain',true]];
const specs=['nightclub','lounge'].flatMap(venue=>moods.map(([mood,weather,weekend])=>({id:venue+'-'+mood,location:venue==='nightclub'?'boyue_nightclub':'boyue_lounge_bar',music:venue+'-'+mood,mood,weather,weekend}))).concat([
  {id:'church',location:'church',music:'church'}, {id:'temple',location:'temple',music:'temple'},
  {id:'church-opening',location:'church',hour:5,waiting:true},
  {id:'home-sfx',home:true},{id:'cafe-sfx',location:'cafe'},
  {id:'nav-desktop',nav:true},{id:'nav-mobile',nav:true,mobile:true},{id:'nav-reduced',nav:true,reduced:true},{id:'nav-fallback',nav:true,fallback:true},
]);
const selected=process.env.QA_CASES?.split(','),report={createdAt:new Date().toISOString(),url,passed:false,boundary:'Isolated headless Chrome profiles with constructed saved states. Real game UI, native audio decode/source starts, and browser view-transition lifecycle observed. No live player profile/save or external music website is controlled.',scenarios:[]};
if(process.env.QA_RESUME==='1'){const previous=JSON.parse(readFileSync(join(out,'verification.json'),'utf8'));assert.equal(previous.url,url);writeFileSync(join(out,'previous-attempt.json'),JSON.stringify(previous,null,2));report.scenarios=previous.scenarios.filter(s=>s.passed);}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
try{for(const spec of specs){
  if(selected&&!selected.includes(spec.id)||report.scenarios.some(s=>s.id===spec.id&&s.passed))continue;
  const result={...spec,passed:false,errors:[],external:[],checks:[],screenshots:[]};report.scenarios.push(result);
  const context=await browser.newContext({viewport:spec.mobile?{width:932,height:430}:{width:1392,height:896},hasTouch:!!spec.mobile,reducedMotion:spec.reduced?'reduce':'no-preference'});
  if(url.startsWith('file:'))await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>result.errors.push(error.message));page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
  page.on('request',request=>{if(url.startsWith('file:')&&/^https?:/.test(request.url()))result.external.push(request.url());});
  const save=fixture(spec);
  await page.addInitScript(({save,spec})=>{
    localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':spec.mobile?'pe':'pc','urban-life-pe-zoom-v3':'1','urban-life-ui-zoom':spec.mobile?'.7':'1','urban-life-scene-mode':'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'0','urban_life_audio_bgm_enabled':spec.music?'1':'0','urban_life_audio_sfx_volume':'50','urban_life_audio_bgm_volume':'50','urban_life_audio_default_volume_migration_v1':'1','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(k,v);
    window.__avQA={decoded:[],starts:[],transitions:[]};const buffers=new WeakMap(),prototype=AudioContext.prototype,decode=prototype.decodeAudioData,create=prototype.createBufferSource;
    prototype.decodeAudioData=function(data,...rest){let h=2166136261;for(const b of new Uint8Array(data))h=Math.imul(h^b,16777619);const hash=h>>>0;return decode.call(this,data,...rest).then(buffer=>{let e=0;const a=buffer.getChannelData(0);for(let i=0;i<a.length;i++)e+=a[i]*a[i];buffers.set(buffer,hash);window.__avQA.decoded.push({hash,duration:buffer.duration,channels:buffer.numberOfChannels,rms:Math.sqrt(e/a.length)});return buffer;});};
    prototype.createBufferSource=function(){const source=create.call(this),start=source.start;source.start=function(...args){window.__avQA.starts.push({hash:buffers.get(source.buffer),duration:source.buffer?.duration,at:performance.now()});return start.apply(this,args);};return source;};
    if(spec.fallback)Object.defineProperty(document,'startViewTransition',{value:undefined,configurable:true});
    else if(document.startViewTransition){const start=document.startViewTransition.bind(document);document.startViewTransition=function(update){const entry={at:performance.now(),updated:false,finished:false,durations:[]};window.__avQA.transitions.push(entry);const transition=start(update);transition.updateCallbackDone.then(()=>{entry.updated=true;entry.updatedAt=performance.now();}).catch(error=>entry.updateError=error.message);transition.ready.then(()=>{entry.durations=document.getAnimations().map(a=>a.effect?.getTiming().duration);}).catch(error=>entry.readyError=error.message);transition.finished.then(()=>{entry.finished=true;entry.finishedAt=performance.now();}).catch(error=>entry.error=error.message);return transition;};}
  },{save,spec});
  const shot=async name=>{const file=spec.id+'-'+name+'.png';await page.screenshot({path:join(out,file)});result.screenshots.push(file);};
  const snap=()=>page.evaluate(()=>window.__avQA),idle=async()=>{await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});await page.waitForFunction(()=>!document.documentElement.dataset.regionTransition);};
  const cue=async(key,action)=>{const before=(await snap()).starts.length;await action();await page.waitForFunction(({hash,before})=>window.__avQA.starts.slice(before).some(s=>s.hash===hash),{hash:hashes[key],before});result.checks.push({cue:key,actualNativeSource:true});console.log(spec.id+' cue '+key);};
  const closeResult=async()=>{const next=page.locator('.result-modal .r-continue');if(await next.isVisible())await next.click();};
  const state=async()=>{await page.waitForTimeout(1000);return page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));};
  try{
    await page.goto(url,{waitUntil:'load',timeout:300000});const announcement=page.getByRole('button',{name:'关闭公告',exact:true});if(await announcement.isVisible().catch(()=>false))await announcement.click();await page.getByRole('button',{name:/继续生活/}).click();await idle();
    await page.waitForFunction(hashes=>Object.values(hashes).every(hash=>window.__avQA.decoded.some(s=>s.hash===hash)),Object.fromEntries(sounds.map(s=>[s.key,hashes[s.key]])),{timeout:60000});
    const loaded=(await snap()).decoded;for(const s of sounds)assert(loaded.some(d=>d.hash===hashes[s.key]&&d.rms>0&&d.duration<2&&d.channels===1),'Missing offline clip '+s.key);
    result.checks.push({all28ClipsDecoded:true,saveLoadNoInteraction:(await snap()).starts.every(s=>s.duration>2)});assert(result.checks.at(-1).saveLoadNoInteraction);
    if(spec.waiting){
      await page.locator('.early-banner').waitFor();const before=(await snap()).starts.length;
      await cue('door_open',()=>page.locator('.wait-bar').getByRole('button',{name:'等到 6:00 开门',exact:true}).click());await closeResult();await page.locator('.early-banner').waitFor({state:'hidden'});
      assert.equal((await snap()).starts.slice(before).filter(s=>s.hash===hashes.door_open).length,1);result.checks.push({waitingOutsideSilent:true,opensOnceOnAdmission:true});await shot('open');
    }
    if(spec.music){
      await page.waitForFunction(hash=>window.__avQA.starts.some(s=>s.hash===hash),hashes[spec.music],{timeout:60000});
      result.checks.push({music:spec.music,actualNativeSource:true});
      if(spec.mood)assert.equal(await page.locator('[data-nightlife-mood]').getAttribute('data-nightlife-mood'),spec.mood);
      if(spec.location==='temple'){await cue('match',()=>page.getByRole('button',{name:/上香祈福/}).click());await closeResult();}
      if(spec.location==='church'){await cue('drawer',()=>page.getByRole('button',{name:/福音小盒/}).click());await closeResult();}
      await shot('venue');
    }
    if(spec.home){
      async function showerObject(){for(let i=0;i<12;i++){const target=page.locator('[data-home-object="shower"]');if(await target.count()&&await target.evaluate(node=>{const r=node.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===node||node.contains(top);})){await target.click();return;}await page.getByRole('button',{name:i<4?'缩小2D画面':'向右旋转90度',exact:true}).click();await page.waitForTimeout(180);}throw Error('Shower object unavailable after zoom/rotation');}
      async function wash(label,key){await showerObject();await page.getByRole('button',{name:/^洗漱/}).click();await cue(key,()=>page.locator('[data-home-branch="use"]').getByRole('button',{name:new RegExp('^'+label)}).click());await closeResult();}
      await wash('洗澡','shower');await wash('简单洗漱','tap');
      await page.getByRole('button',{name:'随身面板',exact:true}).click();await page.locator('.home-tools .personal-fold').getByRole('button',{name:/背包/}).click();
      await cue('bottle_open',()=>page.locator('.bag-item').filter({hasText:'能量饮料'}).getByRole('button',{name:'使用',exact:true}).click());
      await page.getByRole('button',{name:'关闭物品页面',exact:true}).click();await shot('daily-sounds');
    }
    if(spec.id==='cafe-sfx'){
      const order=page.locator('[data-cafe-facility="counter"]');console.log('Cafe facilities '+JSON.stringify(await page.locator('[data-cafe-facility]').evaluateAll(nodes=>nodes.map(n=>n.dataset.cafeFacility))));
      if(await order.count())await order.click();else await page.locator('[data-cafe-facility="order"]').click();
      await cue('sip',()=>page.locator('[data-cafe-order]').first().click());await closeResult();await shot('coffee');
    }
    if(spec.nav){
      const expected=structuredClone(save),plan=api.regionTravelPlan(expected,'downtown_center');assert(api.travelToRegion(expected,'downtown_center').ok);
      const before=(await snap()).transitions.length;
      await cue('train',()=>page.locator('[data-location-id="downtown_center"]').click());
      await shot('region-transition');await idle();
      const actual=await state();assert.deepEqual(actual.time,expected.time);assert.equal(actual.player.money,expected.player.money);assert.equal(actual.region,'downtown_center');
      result.checks.push({travelChargedOnce:true,plan:{mode:plan.mode,hours:plan.hours,fare:plan.fare},time:actual.time,money:actual.player.money});
      await page.locator('[data-location-id="library"]').click();await idle();
      await page.locator('.exit-chip').click();await idle();
      const crumbs=page.locator(spec.mobile?'.city-atlas-navigation button':'.breadcrumbs .crumb');await crumbs.first().click();await idle();
      const transitions=(await snap()).transitions.slice(before);if(spec.reduced||spec.fallback)assert.equal(transitions.length,0);else{assert(transitions.length>=4);assert(transitions.every(t=>t.updated&&t.finished&&!t.error&&!t.updateError&&!t.readyError));assert(transitions.some(t=>t.durations.includes(280)));}
      result.checks.push({navigationRoutes:4,nativeTransitions:transitions.length,reduced:!!spec.reduced,fallback:!!spec.fallback});await shot('map-returned');
    }
    result.audio=await snap();assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.passed=true;console.log(spec.id+' passed');
  }catch(error){result.failure=error.stack;result.audio=await snap().catch(()=>null);await shot('failure').catch(()=>{});console.error(spec.id+' failed: '+error.message);}
  finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await context.close();}
}report.passed=report.scenarios.length>0&&report.scenarios.every(s=>s.passed);if(!report.passed)process.exitCode=1;
}finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await browser.close();await server?.close();}
