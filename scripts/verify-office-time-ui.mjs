import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const out=resolve(process.env.QA_OUT??'docs/company-calibration-1497-20261026/office-time-browser-current'),url=process.env.QA_URL??'http://127.0.0.1:1427/';mkdirSync(out,{recursive:true});
const sameHour=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`Clock ${actual} differs from ${expected}`);
const ssr=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;try{api=Object.assign({},...await Promise.all(['/src/game/core/state.ts','/src/game/core/company.ts','/src/game/core/calendar.ts'].map(p=>ssr.ssrLoadModule(p))));}finally{await ssr.close();}
function fixture(spec){
  const s=api.createInitialState(149726);s.mode='eternal';s.player.money=200000;s.time.month=spec.winter?12:9;s.time.day=3;s.time.hour=10;s.time.minute=0;s.tutorial={done:['eat','work','sleep'],activeStep:-1};Object.assign(s.player.attrs,{stamina:100,health:100,hygiene:100,mood:100,satiety:100});
  while(api.weekdayOf(s.time)>=5)s.time.day++;
  // Register on the prior day so a 06:30 save has no company/accounting cursor in its future.
  s.time.day--;s.locationId='municipal_hall';s.developmentHistory.total=5;assert(api.registerCompany(s,'昼夜观察工作室',2).ok);s.time.day++;s.locationId='company_office_single';s.area=s.region='downtown_commercial';s.navStack=['map',s.region];
  s.time.hour=spec.winter?18:6;s.time.minute=spec.winter?0:30;s.weather.id=spec.winter?'snow':'sunny';s.weather.lastRollDay=api.gameDay(s.time);const c=s.company;c.balanceCents=10000000;c.cursor=api.companyMinute(s);c.nextPayDay=c.nextRentDay=api.gameDay(s.time)+1;
  c.employees.push({id:'office-time-worker',name:'员工A',stars:5,programming:10,design:10,quoteFactor:1,salaryCents:362500,hired:true,role:'programming',joinedMinute:c.cursor,accruedUnits:362500*15*1440,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:api.gameDay(s.time),nextLeaveDay:api.gameDay(s.time)+30,leaveDays:[],seatIndex:1});
  c.computers.push({id:'office-time-pc',tier:'high',costCents:500000,assignee:'office-time-worker',seatIndex:1});assert(api.startCompanyProject(s,'programming','工具软件','medium',false,'contract').ok);return s;
}
const specs=[{id:'pc-3d',sceneMode:'3d',mode:'pc',w:1440,h:900},{id:'pc-2d',sceneMode:'2d',mode:'pc',w:1440,h:900},{id:'pe-2d',sceneMode:'2d',mode:'pe',w:932,h:430},{id:'winter-3d',sceneMode:'3d',mode:'pc',w:1440,h:900,winter:true},{id:'winter-2d',sceneMode:'2d',mode:'pe',w:932,h:430,winter:true}];
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']}),report={url,passed:false,scenarios:[]};
try{for(const spec of specs){
  if(process.env.QA_CASES&&!process.env.QA_CASES.split(',').includes(spec.id))continue;
  const r={...spec,passed:false,checks:[],screenshots:[],errors:[],external:[]};report.scenarios.push(r);const context=await browser.newContext({viewport:{width:spec.w,height:spec.h},hasTouch:spec.mode==='pe',deviceScaleFactor:1});if(url.startsWith('file:'))await context.route(/^https?:/,route=>route.abort());const page=await context.newPage();page.setDefaultTimeout(180000);
  page.on('pageerror',e=>r.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});page.on('request',req=>{if(url.startsWith('file:')&&(/^http/.test(req.url())||req.url().startsWith('file:')&&new URL(req.url()).href!==new URL(url).href))r.external.push(req.url());});
  await page.addInitScript(({save,spec})=>{window.officeQAWebgl=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/.test(kind))window.officeQAWebgl++;return original.call(this,kind,...args);};localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':spec.mode,'urban-life-pe-zoom-v3':'1','urban-life-ui-zoom':spec.mode==='pe'?'.7':'1','urban-life-scene-mode':spec.sceneMode,'urban-life-scene-mode-v2':'1','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(k,v);},{save:fixture(spec),spec});
  const office=page.locator('[data-company-office]'),host=office.locator('[data-office-lighting]'),snapshot=office.getByRole('region',{name:'公司与时间'});
  const lighting=async()=>host.evaluate(n=>JSON.parse(n.dataset.officeLighting));
  const capture=async name=>{await page.waitForTimeout(spec.sceneMode==='3d'?900:400);const file=spec.id+'-'+name+'.png';await page.screenshot({path:join(out,file)});r.screenshots.push(file);r.checks.push({at:name,lighting:await lighting(),employeeStatus:await page.locator('[data-office-seat="1"]').getAttribute('title')});};
  const wait=async label=>{await page.getByRole('button',{name:'办公室等待',exact:true}).click();const choice=page.locator('[aria-label="办公室等待时长"]').getByRole('button',{name:label,exact:true});if(spec.mode==='pe'){const box=await choice.boundingBox();assert(box.height>=43.9,'等待触控按钮不足44px');}await choice.click();await page.locator('.result-modal').waitFor();await page.locator('.result-modal .r-continue').click();await page.locator('.result-modal').waitFor({state:'hidden'});await page.locator('[aria-label="办公室等待时长"]').waitFor({state:'hidden'});};
  try{
    await page.goto(url,{waitUntil:'load',timeout:300000});const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();await page.getByRole('button',{name:/继续生活/}).click();await host.waitFor();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:240000});await page.locator('[data-office-seat="1"]').waitFor();
    assert.equal(await lighting().then(v=>v.month),spec.winter?12:9);sameHour(await lighting().then(v=>v.hour),spec.winter?18:6.5);console.log(spec.id,'office ready');
    if(spec.winter){assert.deepEqual(await lighting().then(({weather,lamps,frame})=>({weather,lamps,frame})),{weather:'snow',lamps:true,frame:'night'});await capture('winter-18-00');}
    else{
      assert.equal(await lighting().then(v=>v.phase),'清晨');assert.match(await page.locator('[data-office-seat="1"]').getAttribute('title'),/休息中/);await capture('06-30');
      const early=await lighting();await wait('等 5 分钟');const next=await lighting();sameHour(next.hour,6+35/60);assert(next.daylight>early.daylight);await wait('等 30 分钟');await wait('等 3 小时');await wait('等 2 小时');
      // 06:35 + 00:30 + 03:00 + 02:00 = 12:05. Five minutes are deliberately observable.
      sameHour((await lighting()).hour,12+5/60);assert.match(await page.locator('[data-office-seat="1"]').getAttribute('title'),/编程中/);await capture('12-05');
      const camera=await host.getAttribute(spec.sceneMode==='3d'?'data-office-camera':'data-still-viewport');
      await wait('等 3 小时');await wait('等 2 小时');await wait('等 30 分钟');sameHour((await lighting()).hour,17+35/60);assert.match(await page.locator('[data-office-seat="1"]').getAttribute('title'),/休息中/);await capture('17-35');
      assert.equal(await host.getAttribute(spec.sceneMode==='3d'?'data-office-camera':'data-still-viewport'),camera,'游戏时间推进不应重置镜头');
      await wait('等 2 小时');await wait('等 30 分钟');sameHour((await lighting()).hour,20+5/60);assert.deepEqual(await lighting().then(({lamps,frame})=>({lamps,frame})),{lamps:true,frame:'night'});await capture('20-05');
      await page.getByRole('button',{name:/公司经营/}).click();await page.getByRole('button',{name:'工作台',exact:true}).click();const text=await page.getByRole('article',{name:'编程项目',exact:true}).innerText();assert.match(text,/15 \/ 400 点/);await page.getByRole('button',{name:'关闭公司经营面板'}).click();
      await wait('等 3 小时');await wait('等 30 分钟');await wait('等 1 小时');sameHour((await lighting()).hour,35/60);await capture('next-day-00-35');
      r.checks.push({minuteProgression:true,employee9to17:true,actualWaitDevelopedPoints:15,crossMidnight:true,cameraPreserved:true});
    }
    const gl=await page.evaluate(()=>window.officeQAWebgl);if(spec.sceneMode==='2d')assert.equal(gl,0);else assert(gl>0);r.checks.push({webglContexts:gl});assert.deepEqual(r.errors,[]);assert.deepEqual(r.external,[]);r.passed=true;console.log(spec.id,'office-time passed');
  }catch(e){r.failure=e.stack;const file=spec.id+'-failure.png';await page.screenshot({path:join(out,file)}).then(()=>r.screenshots.push(file)).catch(()=>{});throw e;}
  finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await context.close();}
}
report.passed=report.scenarios.length>0&&report.scenarios.every(r=>r.passed);
}finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await browser.close();}
