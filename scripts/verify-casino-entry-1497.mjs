import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/casino-entry-1497-20261028');
const portable=process.env.QA_PORTABLE==='1',baseline=process.env.QA_BASELINE==='1',out=join(audit,baseline?'baseline':portable?'portable':'source');
mkdirSync(out,{recursive:true});
const ssr=await createServer({root,configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
let api={};try{for(const n of ['state','stockMath','calendar']){console.log('LOAD '+n);Object.assign(api,await ssr.ssrLoadModule('/src/game/core/'+n+'.ts'));}}finally{await ssr.close();}
function fixture(seed,{cash=1000,day=6}={}){
  const s=api.createInitialState(seed);s.mode='eternal';s.player.money=cash;s.tutorial={done:['eat','work','sleep'],activeStep:-1};
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100,hygiene:100});
  s.time={...s.time,year:2026,month:9,day,hour:20,minute:0};s.weather.id='sunny';s.weather.lastRollDay=api.gameDay(s.time);
  s.locationId='boyue_texas_shop';s.region=s.area='boyue_night_market';s.navStack=['map','boyue',s.region];s.districtLeisure.casinoChips=10000;
  return s;
}
const cases=[
  {id:'pc-newbie',room:'leisure'},
  {id:'pe-advanced',room:'competition',mobile:true},
  {id:'pc-insufficient-ticket',room:'competition',cash:49,rejected:'高级场门票需要 50 元'},
  {id:'pe-weekday',room:'leisure',mobile:true,day:5,rejected:'小店当前未营业'},
];
const selected=process.env.QA_CASES?.split(','),report={createdAt:new Date().toISOString(),baseline,portable,passed:false,boundary:'Fresh isolated browser profiles and controlled weekend/weekday saves; real room, bet, reveal, settlement and reload UI. No personal saves are read.',scenarios:[]};
for(const spec of cases)assert.equal(api.isWeekend(fixture(1,spec).time),!spec.day,'Fixture must use the game calendar');
const url=portable?pathToFileURL(join(root,'1.49.7.html')).href:'http://127.0.0.1:1447/';
let server;if(!portable){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1447,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--autoplay-policy=no-user-gesture-required']});
async function tap(page,locator,mobile){await locator.scrollIntoViewIfNeeded();if(mobile)await locator.tap();else await locator.click();}
async function state(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));}
async function boot(page){
  await page.goto(url,{waitUntil:'load',timeout:300000});const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();
  await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
  await page.getByRole('button',{name:/进入场次选择/}).waitFor();
}
try{for(const spec of cases){
  if(selected&&!selected.includes(spec.id))continue;console.log('START '+spec.id);
  const result={...spec,passed:false,errors:[],external:[],screenshots:[]};report.scenarios.push(result);
  const context=await browser.newContext({viewport:spec.mobile?{width:932,height:430}:{width:1440,height:900},hasTouch:!!spec.mobile,isMobile:!!spec.mobile,deviceScaleFactor:1});
  if(portable)await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  page.on('request',r=>{if(portable&&/^https?:/.test(r.url()))result.external.push(r.url());});
  await page.addInitScript(({save,mobile})=>{
    if(sessionStorage.getItem('casino-entry-qa-seeded'))return;sessionStorage.setItem('casino-entry-qa-seeded','1');localStorage.clear();
    for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':mobile?'pe':'pc','urban-life-ui-zoom':mobile?'.7':'1','urban-life-pe-zoom-v3':'1','urban-life-scene-mode':'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(k,v);
  },{save:fixture(14972840+report.scenarios.length,spec),mobile:!!spec.mobile});
  const shot=async name=>{const file=spec.id+'-'+name+'.png';await page.screenshot({path:join(out,file)});result.screenshots.push(file);};
  try{
    await boot(page);await tap(page,page.getByRole('button',{name:/进入场次选择/}),spec.mobile);await page.getByRole('dialog',{name:'选择赌场场次',exact:true}).waitFor();
    await tap(page,page.locator(spec.room==='leisure'?'.room-card:not(.competition)':'.room-card.competition'),spec.mobile);
    if(baseline){await page.waitForTimeout(750);result.gameMenuVisible=await page.getByRole('dialog',{name:'选择赌场游戏',exact:true}).isVisible();result.bodyText=(await page.locator('.casino-menu').innerText()).slice(0,650);await shot('after-room-click');result.passed=true;continue;}
    if(spec.rejected){
      await page.getByText(spec.rejected,{exact:true}).waitFor();assert(await page.getByRole('dialog',{name:'选择赌场场次',exact:true}).isVisible());
      const saved=await state(page);assert.equal(saved.player.money,spec.cash??1000);assert.equal(saved.districtLeisure.casinoChips,10000);result.rejectionVisible=true;result.noMoneyOrChipMutation=true;await shot('rejected');
    }else{
      await page.getByRole('dialog',{name:'选择赌场游戏',exact:true}).waitFor();await shot('game-menu');
      await page.waitForFunction(room=>JSON.parse(localStorage.getItem('urban_life_save_auto'))?.districtLeisure?.casinoRoom===room,spec.room);
      const entered=await state(page);assert.equal(entered.player.money,1000-(spec.room==='competition'?50:0));assert.equal(entered.districtLeisure.casinoChips,10100);
      const journalKey=await page.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('urban_life_financial_risk_v1_'))),journalBefore=await page.evaluate(k=>localStorage.getItem(k),journalKey);
      for(const category of ['老虎机','轮盘类','棋牌类'])await tap(page,page.getByRole('navigation',{name:'游戏类别'}).getByRole('button',{name:category,exact:true}),spec.mobile);
      assert.equal(await page.evaluate(k=>localStorage.getItem(k),journalKey),journalBefore,'Rendering/category changes must not write financial journals');
      await tap(page,page.locator('.game-picker').getByRole('button',{name:/比大小/}),spec.mobile);
      await tap(page,page.getByRole('button',{name:/进入牌桌.*下注/}),spec.mobile);await page.getByRole('dialog',{name:'比大小',exact:true}).waitFor();await shot('table');
      await tap(page,page.getByRole('button',{name:/翻开牌面/}),spec.mobile);const settle=page.getByRole('button',{name:/确认结算 · 5 分钟/});await settle.waitFor();await page.waitForFunction(()=>!document.querySelector('button.settle')?.disabled);
      await tap(page,settle,spec.mobile);
      await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('urban_life_save_auto'));return s?.districtLeisure?.active===null&&s?.districtLeisure?.lastResult?.kind==='high_low';});
      const settled=await state(page);assert.equal(settled.player.money,entered.player.money);assert.equal(settled.time.minute,5);assert.equal(settled.districtLeisure.casinoGiftNight,entered.districtLeisure.casinoGiftNight);
      result.normalEntry=true;result.ticketChargedOnce=true;result.giftOnce=true;result.categoryChangesReadOnly=true;result.roundSettled=true;result.casinoCursor=settled.financialRisk.casino.cursor;assert(result.casinoCursor>0);await shot('settled');
      await boot(page);await tap(page,page.getByRole('button',{name:/进入场次选择/}),spec.mobile);await tap(page,page.locator('.room-card:not(.competition)'),spec.mobile);await page.getByRole('dialog',{name:'选择赌场游戏',exact:true}).waitFor();
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')).districtLeisure.casinoRoom==='leisure');const reentered=await state(page);
      assert.equal(reentered.player.money,settled.player.money);assert.equal(reentered.districtLeisure.casinoChips,settled.districtLeisure.casinoChips);result.reloadEntryWorks=true;await shot('reentered');
    }
    assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.passed=true;console.log('PASS '+spec.id);
  }catch(e){result.failure=e.stack;await shot('failure').catch(()=>{});throw e;}finally{await context.close();}
}}finally{report.passed=report.scenarios.length>0&&report.scenarios.every(s=>s.passed);writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();if(server)await server.close();}
console.log(JSON.stringify({passed:report.passed,scenarios:report.scenarios.length,baseline,portable,out}));
