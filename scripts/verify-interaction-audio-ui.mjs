import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/interaction-audio-1497-20261027');
const url=process.env.QA_URL??'http://127.0.0.1:1437/',out=resolve(process.env.QA_OUT??join(audit,'browser-source'));mkdirSync(out,{recursive:true});
let web;if(!process.env.QA_URL){web=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1437,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await web.listen();}
const ssr=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;try{api=Object.assign({},...await Promise.all(['state','housing','actions','fridge','company','companyConfig','calendar'].map(name=>ssr.ssrLoadModule('/src/game/core/'+name+'.ts'))));}finally{await ssr.close();}
const sounds=JSON.parse(readFileSync(join(audit,'sound-manifest.json'),'utf8'));
function fingerprint(bytes){let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);return hash>>>0;}
const expected=Object.fromEntries(sounds.map(s=>[s.key,fingerprint(readFileSync(join(root,s.path)))]));
function fixture(stage,home=false,venue){
  const s=api.createInitialState(149727);s.mode='eternal';s.player.money=100000;Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+101),{hour:9,minute:0});
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:80,hygiene:100});s.player.skills.programming=s.player.skills.design=10;s.player.skills.cooking=6;
  s.developmentHistory.total=75;s.developmentHistory.byType={home_design:3,personal_programming_order:2};s.locationId='municipal_hall';s.tutorial={done:['eat','work','sleep'],activeStep:-1};const registered=api.registerCompany(s,'青禾工作室',Math.min(stage,2));assert(registered.ok,registered.reason);
  const c=s.company;c.stage=stage;c.balanceCents=1000000;c.depositCents=api.companyStage(stage).rent*100;c.computers=[{id:'pc-founder',tier:'high',costCents:650000,assignee:'founder',seatIndex:0}];
  s.locationId=api.companyStage(stage).location;s.area=s.region=api.companyStage(stage).region;
  assert(api.startCompanyProject(s,'programming','工具软件','small',false,'contract').ok);assert(api.startCompanyProject(s,'design','平面设计','small',false,'contract').ok);
  if(home){assert(api.signLease(s,'old_apartment').ok);assert(api.moveTo(s,'old_apartment').ok);assert(api.installFridge(s,'small').ok);s.flags.cook_utensil=true;s.inventory.milk=1;s.inventory.egg=1;s.inventory.book_sports=1;}
  if(venue){s.locationId=venue==='cafe'?'cafe':'convenience_store';s.region=s.area='downtown_commercial';}
  s.weather.id='sunny';s.weather.lastRollDay=api.gameDay(s.time);s.navStack=['map',s.region];return s;
}
const report={createdAt:new Date().toISOString(),url,passed:false,boundary:'Independent browser contexts and controlled saved states; real UI events and native Web Audio decode/start/stop observed. Visibility pause uses the application visibilitychange path with a controlled hidden property. No player save/profile is opened.',scenarios:[]};
if(process.env.QA_RESUME==='1'){const previous=JSON.parse(readFileSync(join(out,'verification.json'),'utf8'));assert.equal(previous.url,url);writeFileSync(join(out,'previous-attempt.json'),JSON.stringify(previous,null,2));report.scenarios=previous.scenarios.filter(s=>s.passed);report.resumedFrom=previous.createdAt;}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
const specs=[{id:'home-office-audio',stage:2,home:true},{id:'cafe-interactions',stage:2,venue:'cafe'},{id:'store-interactions',stage:2,venue:'store'},{id:'office-1',stage:1},{id:'office-3',stage:3},{id:'office-4',stage:4},{id:'office-reduced-motion',stage:2,reduced:true},{id:'mobile-home-audio',stage:2,home:true,mobile:true}];
const selected=process.env.QA_CASES?.split(',');
try{for(const spec of specs){
  if(selected&&!selected.includes(spec.id))continue;
  if(report.scenarios.some(s=>s.id===spec.id&&s.passed))continue;
  const result={...spec,passed:false,errors:[],external:[],checks:[],screenshots:[]};report.scenarios.push(result);
  const context=await browser.newContext({viewport:spec.mobile?{width:932,height:430}:spec.venue?{width:1440,height:900}:{width:1280,height:800},hasTouch:!!spec.mobile,deviceScaleFactor:1,reducedMotion:spec.reduced?'reduce':'no-preference'});
  if(url.startsWith('file:'))await context.route(/^https?:/,r=>r.abort());
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  page.on('request',r=>{if(url.startsWith('file:')&&(/^https?:/.test(r.url())||r.url().startsWith('file:')&&new URL(r.url()).href!==new URL(url).href))result.external.push(r.url());});
  await page.addInitScript(({save,spec})=>{
    localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':spec.mobile?'pe':'pc','urban-life-pe-zoom-v3':'1','urban-life-ui-zoom':spec.mobile?'.7':'1','urban-life-scene-mode':spec.home?'2d':'3d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'0','urban_life_audio_bgm_enabled':'0','urban_life_audio_sfx_volume':'50','urban_life_audio_bgm_volume':'50','urban_life_audio_default_volume_migration_v1':'1','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(k,v);
    window.__audioQA={decoded:[],starts:[],stops:[]};const buffers=new WeakMap(),nodes=new WeakMap(),prototype=AudioContext.prototype;
    const decode=prototype.decodeAudioData;prototype.decodeAudioData=function(data,...rest){let hash=2166136261;for(const byte of new Uint8Array(data))hash=Math.imul(hash^byte,16777619);const stamp=hash>>>0;return decode.call(this,data,...rest).then(buffer=>{let energy=0;const a=buffer.getChannelData(0);for(let i=0;i<a.length;i++)energy+=a[i]*a[i];buffers.set(buffer,stamp);window.__audioQA.decoded.push({hash:stamp,duration:buffer.duration,rms:Math.sqrt(energy/a.length),channels:buffer.numberOfChannels});return buffer;});};
    const createGain=prototype.createGain;prototype.createGain=function(){const node=createGain.call(this),connect=node.connect;node.connect=function(target,...rest){nodes.set(node,target);return connect.call(this,target,...rest);};return node;};
    const createSource=prototype.createBufferSource;prototype.createBufferSource=function(){const source=createSource.call(this),connect=source.connect,start=source.start,stop=source.stop;source.connect=function(target,...rest){nodes.set(source,target);return connect.call(this,target,...rest);};source.start=function(...args){let node=nodes.get(source);const gains=[];while(node){if(node.gain)gains.push(node.gain.value);node=nodes.get(node);}window.__audioQA.starts.push({hash:buffers.get(source.buffer),duration:source.buffer?.duration,gains,at:performance.now()});return start.apply(this,args);};source.stop=function(...args){window.__audioQA.stops.push({hash:buffers.get(source.buffer),at:performance.now()});return stop.apply(this,args);};return source;};
  },{save:fixture(spec.stage,spec.home,spec.venue),spec});
  const shot=async name=>{const file=spec.id+'-'+name+'.png';await page.screenshot({path:join(out,file)});result.screenshots.push(file);};
  const snapshot=()=>page.evaluate(()=>window.__audioQA);
  const cue=async(key,action)=>{const before=(await snapshot()).starts.length;await action();await page.waitForFunction(({hash,before})=>window.__audioQA.starts.slice(before).some(s=>s.hash===hash),{hash:expected[key],before});const played=(await snapshot()).starts.slice(before).find(s=>s.hash===expected[key]);assert(played.gains.at(-1)===.5);result.checks.push({cue:key,duration:played.duration,gains:played.gains});console.log(spec.id+' cue '+key);};
  const noCue=async(action)=>{const before=(await snapshot()).starts.length;await action();await page.waitForTimeout(180);assert.equal((await snapshot()).starts.length,before);};
  const light=async()=>{if(!await page.locator('[data-home-light-switch]').isVisible())await page.getByRole('button',{name:'随身面板',exact:true}).click();await page.locator('[data-home-light-switch]').click();};
  const closePhone=()=>page.locator('.phone[data-phone-app]').getByRole('button',{name:'关机并收起手机',exact:true}).click();
  async function settingsPhone(){await page.getByRole('button',{name:'打开手机',exact:true}).click();const phone=page.locator('.phone[data-phone-app]');await phone.getByRole('button',{name:'设置',exact:true}).first().click();return phone.locator('.phone-settings-page');}
  async function range(locator,value){await locator.evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);}
  async function facility(selector,rotateName){for(let attempt=0;attempt<4;attempt++){const button=page.locator(selector);if(await button.count()&&await button.evaluate(node=>{const r=node.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return top===node||node.contains(top);})){await button.click();return;}await page.getByRole('button',{name:rotateName,exact:true}).click();await page.waitForTimeout(200);}throw new Error('Facility stays behind HUD after four views: '+selector);}
  async function officeReady(){await page.locator('[data-office-ready-ms]').waitFor({timeout:180000});await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});}
  async function wallMode(mode){await page.getByRole('button',{name:'画面设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'场景画面设置',exact:true});await settings.getByLabel('住宅墙体显示',{exact:true}).selectOption(mode);await settings.getByRole('button',{name:'关闭画面设置',exact:true}).click();await page.waitForFunction(mode=>{const n=document.querySelector('[data-office-wall-animation]');if(!n)return false;const s=JSON.parse(n.dataset.officeWallAnimation);return s.mode===mode&&!s.moving;},mode);}
  async function traceWalls(){
    await officeReady();await wallMode('cutaway');await page.evaluate(()=>{const host=document.querySelector('[data-office-wall-animation]');window.__wallTrace=[{at:performance.now(),...JSON.parse(host.dataset.officeWallAnimation)}];window.__wallObserver=new MutationObserver(()=>window.__wallTrace.push({at:performance.now(),...JSON.parse(host.dataset.officeWallAnimation)}));window.__wallObserver.observe(host,{attributes:true,attributeFilter:['data-office-wall-animation']});});
    await page.getByRole('button',{name:'向右旋转90度',exact:true}).click();await page.waitForTimeout(80);await page.waitForFunction(()=>{const a=window.__wallTrace;return a.length>1&&!a.at(-1).moving;},{},{timeout:30000});
    const frames=await page.evaluate(()=>{window.__wallObserver.disconnect();return window.__wallTrace;});const first=frames[0],last=frames.at(-1),changed=last.targets.map((t,i)=>Math.abs(t-first.scales[i])>.001?i:-1).filter(i=>i>=0);assert(changed.length>0);
    const intermediate=frames.filter(f=>f.moving&&changed.some(i=>Math.abs(f.scales[i]-first.scales[i])>.001&&Math.abs(f.scales[i]-last.scales[i])>.001));
    if(spec.reduced)assert.equal(intermediate.length,0);else assert(intermediate.length>0,'Rotation skipped intermediate wall heights');assert(last.scales.every((v,i)=>Math.abs(v-last.targets[i])<.0002));
    result.wallTrace={frames,changedWalls:changed.length,intermediateFrames:intermediate.length,reducedMotion:!!spec.reduced};await shot('wall-rotation');
    await wallMode('low');await shot('walls-low');await wallMode('full');await shot('walls-full');await wallMode('cutaway');
  }
  try{
    await page.goto(url,{waitUntil:'load',timeout:300000});const announcement=page.getByRole('button',{name:'关闭公告',exact:true});if(await announcement.isVisible().catch(()=>false))await announcement.click();await page.getByRole('button',{name:/继续生活/}).click();
    await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});await page.waitForFunction(()=>window.__audioQA.decoded.length>=18,{},{timeout:60000});
    const loaded=(await snapshot()).decoded;for(const key of Object.keys(expected))assert(loaded.some(s=>s.hash===expected[key]&&s.rms>0&&s.duration<2&&s.channels===1),'Missing decoded clip '+key);assert.equal((await snapshot()).starts.length,0,'Loading a save played an interaction');
    result.checks.push({all18OfflineClipsDecoded:true,saveLoadDoesNotPlayCue:true});console.log(spec.id+' clips decoded');
    if(spec.venue){
      if(spec.venue==='cafe'){await page.locator('[data-cafe-facility="books"]').waitFor();await cue('page',()=>facility('[data-cafe-facility="books"]','咖啡厅向右旋转'));await cue('mouse',()=>facility('[data-cafe-facility="door"]','咖啡厅向右旋转'));await cue('door_open',()=>page.locator('button[data-cafe-door]').click());await page.waitForTimeout(160);await cue('door_close',()=>page.locator('button[data-cafe-door]').click());}
      else{await page.locator('[data-store-facility="drinks"]').waitFor();await cue('fridge_open',()=>facility('[data-store-facility="drinks"]','便利店向右旋转'));await cue('mouse',()=>facility('[data-store-facility="checkout"]','便利店向右旋转'));}
      await shot('facility-interactions');
    }else if(spec.home){
      await page.locator('[data-home-object="fridge"]').waitFor();await cue('switch',light);
      await cue('fridge_open',()=>page.locator('[data-home-object="fridge"]').click());await page.getByRole('button',{name:'看看冰箱',exact:false}).click();await cue('fridge_close',()=>page.getByRole('button',{name:'关闭冰箱',exact:true}).click());
      const settings=await settingsPhone();await range(settings.locator('input[type=range]').nth(0),0);await closePhone();await noCue(light);
      const settings2=await settingsPhone();await range(settings2.locator('input[type=range]').nth(0),50);await settings2.getByRole('button',{name:'切换音效开关',exact:true}).click();await closePhone();await noCue(light);
      const settings3=await settingsPhone();await settings3.getByRole('button',{name:'切换音效开关',exact:true}).click();await closePhone();await page.waitForTimeout(180);await cue('switch',light);
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await noCue(light);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(180);await cue('switch',light);
      result.checks.push({sfxZeroSilent:true,muteSilent:true,visibilityPauseSilent:true,resumeNoDelayedCue:true});
      await cue('cutlery',()=>page.locator('[data-home-object="kitchen"]').click());await page.getByRole('button',{name:/^做饭/}).click();await page.getByRole('button',{name:'正式烹饪',exact:false}).click();await page.getByRole('button',{name:'牛奶',exact:false}).first().click();await page.waitForTimeout(150);await cue('chop',()=>page.getByRole('button',{name:'鸡蛋',exact:false}).first().click());await cue('cook',()=>page.getByRole('button',{name:'开火',exact:false}).click());await shot('cooking');await cue('cutlery',()=>page.getByRole('button',{name:'立即食用',exact:false}).click());await page.keyboard.press('Escape');
      await cue('page',()=>facility('[data-home-object="bookshelf"]','向右旋转90度'));await page.getByRole('button',{name:/^阅读/}).click();await page.getByRole('button',{name:'选一本书',exact:false}).click();await page.locator('.shelf-read').filter({hasText:'运动'}).first().click();await cue('page',()=>page.locator('.reader-controls').getByRole('button',{name:'下一页 →',exact:true}).click());await shot('reader');await page.getByRole('button',{name:'关闭阅读器',exact:true}).click();if(await page.locator('.result-modal').isVisible())await page.locator('.result-modal .r-continue').click();const closeShelf=page.getByRole('button',{name:'关闭书架',exact:true});if(await closeShelf.isVisible())await closeShelf.click();
      if(!spec.mobile){await page.locator('[data-home-departure]').click();await cue('door_open',()=>page.locator('[data-home-company-commute]').click());if(await page.locator('.result-modal').isVisible())await page.locator('.result-modal .r-continue').click();await page.locator('[data-company-office]').waitFor();await page.getByRole('button',{name:'画面设置',exact:true}).click();const display=page.getByRole('dialog',{name:'场景画面设置',exact:true});await display.getByLabel('场景显示',{exact:true}).selectOption('3d');if(await display.isVisible())await display.getByRole('button',{name:'关闭画面设置',exact:true}).click({timeout:3000}).catch(async error=>{if(await display.isVisible())throw error;});await officeReady();await traceWalls();}
    }else await traceWalls();
    if(!spec.mobile&&!spec.venue){
      await page.getByRole('button',{name:/^公司经营/}).click();const panel=page.getByRole('region',{name:'公司经营面板',exact:true});await panel.waitFor();await panel.getByRole('button',{name:'公司最多工作4小时',exact:true}).click();await cue('keyboard',()=>panel.getByRole('button',{name:'开始工作 · 最多4小时',exact:true}).click());
      await panel.getByRole('button',{name:'资金',exact:true}).click();await panel.getByRole('spinbutton',{name:'公司转账金额',exact:true}).fill('100');await cue('coins',()=>panel.getByRole('button',{name:'确认注资',exact:true}).click());await shot('company-finance');await panel.getByRole('button',{name:'关闭公司经营面板',exact:true}).click();
      if(spec.stage===4){await page.locator('[data-office-door]').click();await cue('elevator',()=>page.locator('[data-company-normal-exit]').click());}
    }
    assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.audio=await snapshot();result.passed=true;console.log(spec.id+' passed');
  }catch(error){result.failure=error.stack;result.audio=await snapshot().catch(()=>null);await shot('failure').catch(()=>{});console.error(spec.id+' failed: '+error.message);}
  finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await context.close();}
}report.passed=report.scenarios.length>0&&report.scenarios.every(s=>s.passed);if(!report.passed)process.exitCode=1;
}finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await browser.close();await web?.close();}
