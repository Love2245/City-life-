import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/financial-risk-1497-20261028');
const portable=process.env.QA_PORTABLE==='1',out=join(audit,portable?'browser-portable':'browser-source');
mkdirSync(out,{recursive:true});
const url=portable?pathToFileURL(join(root,'1.49.7.html')).href:'http://127.0.0.1:1441/';
const ssr=await createServer({root,configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api={};try{for(const n of ['state','stockMath','calendar'])Object.assign(api,await ssr.ssrLoadModule('/src/game/core/'+n+'.ts'));}finally{await ssr.close();}
const alertTips=['近期似乎出现穿越者，建议大家出门小心','有一个人辜负了都市的信任','以派出超时空侦探进行盘查中','严惩违法获利者！','穿越者请前往鸿门堰派出所办理穿越手续'];
let mouseHash=2166136261;for(const byte of readFileSync(join(root,'src/assets/sfx/日常交互/鼠标_213004.mp3')))mouseHash=Math.imul(mouseHash^byte,16777619);mouseHash>>>=0;
function fixture(kind,seed){
  const s=api.createInitialState(seed);s.mode='eternal';s.player.money=100000;s.tutorial={done:['eat','work','sleep'],activeStep:-1};
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100,hygiene:100});
  s.time.hour=kind==='casino'?20:12;s.time.minute=0;s.weather.id='sunny';s.weather.lastRollDay=api.gameDay(s.time);
  s.locationId=kind==='casino'?'boyue_texas_shop':'commercial_exchange';s.region=s.area=kind==='casino'?'boyue_night_market':'downtown_commercial';s.navStack=['map',...(kind==='casino'?['boyue']:[]),s.region];
  s.economy.stockMarket=api.createStockMarket(s);s.economy.stockMarket.cashCents=1000000;
  s.districtLeisure.casinoChips=500000;s.districtLeisure.casinoRoom='competition';return s;
}
const sourceFixtures=portable?JSON.parse(readFileSync(join(audit,'browser-fixtures.json'),'utf8')):{};
const report={startedAt:new Date().toISOString(),url,portable,passed:false,fixtureBoundary:'Isolated browser storage only. Source uses actual live game/save/financial APIs with controlled roulette outcomes. Portable reapplies source-generated external journals to pre-ban saves and exercises real UI; this is not a natural-play profitability run.',scenarios:[]};
let server;if(!portable){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1441,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required','--mute-audio']});
async function run(id,save,journals,fn,{mobile=false,sfx=true}={}){
  const result={id,passed:false,checks:[],errors:[],external:[],screenshots:[]};report.scenarios.push(result);console.log('START '+id);
  const context=await browser.newContext({viewport:mobile?{width:932,height:430}:{width:1440,height:900},hasTouch:mobile,deviceScaleFactor:1});
  if(portable)await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
  page.on('request',r=>{if(portable&&(/^https?:/.test(r.url())||r.url().startsWith('file:')&&r.url()!==url))result.external.push(r.url());});
  await page.addInitScript(({save,journals,mobile,sfx,mouseHash})=>{
    localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':mobile?'pe':'pc','urban-life-ui-zoom':mobile?'.7':'1','urban-life-pe-zoom-v3':'1','urban-life-scene-mode':'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'0','urban_life_audio_bgm_enabled':'0','urban_life_audio_sfx_volume':sfx?'50':'0','urban_life_audio_default_volume_migration_v1':'1','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(save),...journals}))localStorage.setItem(k,v);
    window.__mouseQA={decoded:false,starts:0};const buffers=new WeakMap(),p=AudioContext.prototype,decode=p.decodeAudioData,create=p.createBufferSource;
    p.decodeAudioData=function(data,...rest){let hash=2166136261;for(const b of new Uint8Array(data))hash=Math.imul(hash^b,16777619);return decode.call(this,data,...rest).then(buffer=>{buffers.set(buffer,hash>>>0);if((hash>>>0)===mouseHash)window.__mouseQA.decoded=true;return buffer;});};
    p.createBufferSource=function(){const source=create.call(this),start=source.start;source.start=function(...args){if(buffers.get(source.buffer)===mouseHash)window.__mouseQA.starts++;return start.apply(this,args);};return source;};
  },{save,journals,mobile,sfx,mouseHash});
  const shot=async name=>{const file=id+'-'+name+'.png';await page.screenshot({path:join(out,file)});result.screenshots.push(file);};
  try{
    await page.goto(url,{waitUntil:'load',timeout:300000});const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();
    await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
    await fn(page,result,shot);assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.passed=true;console.log('PASS '+id);
  }catch(e){result.failure=e.stack;await shot('failure').catch(()=>{});throw e;}finally{await context.close();}
}
async function paper(page,result,shot,expectedAlert,{fromHome=false}={}){
  if(fromHome){const trash=page.locator('[data-home-object="trash"], [data-home-trash-flat]').first();await trash.waitFor({state:'visible',timeout:180000});await trash.click();}
  else await page.evaluate(async()=>{(await import('/src/lib/cityTips.ts')).showCityTip();});
  const tips=[];for(let i=0;i<(expectedAlert?5:2);i++){const text=await page.locator('[data-city-tip-text]').innerText();assert.equal(alertTips.includes(text),expectedAlert);tips.push(text);if(i===0)await shot('paper');if(i<(expectedAlert?4:1))await page.getByRole('button',{name:'再翻一条',exact:true}).click();}
  if(expectedAlert)assert.equal(new Set(tips).size,5);result.checks.push({paperTips:tips,allUseCorrectPool:true});await page.getByRole('button',{name:'收起来',exact:true}).click();
}
async function loading(page,result,shot,expectedAlert){
  await page.evaluate(async()=>{window.__qaLoading=(await import('/src/stores/sceneLoading.svelte.ts')).beginSceneLoading({sceneKey:'risk-qa',regionId:'boyue',label:'泊月城',kind:'map',time:'night',weather:'sunny'});});
  const text=await page.locator('[data-loading-tip] span').last().innerText();assert.equal(alertTips.includes(text),expectedAlert);await shot('loading');result.checks.push({loadingTip:text,correctPool:true});await page.evaluate(()=>window.__qaLoading.cancel());
}
async function mouseCheck(page,result){
  await page.waitForFunction(()=>window.__mouseQA.decoded);const start=await page.evaluate(()=>window.__mouseQA.starts);
  await page.getByRole('button',{name:'使用免费电脑',exact:true}).click();await page.locator('[data-computer-clicks] .main-tabs').waitFor();
  await page.waitForFunction(n=>window.__mouseQA.starts>n,start);assert.equal(await page.evaluate(()=>window.__mouseQA.starts),start+1);
  for(const name of ['买卖交易','行情市场']){await page.waitForTimeout(150);const before=await page.evaluate(()=>window.__mouseQA.starts);await page.getByRole('navigation',{name:'软件页面'}).getByRole('button',{name,exact:true}).click();await page.waitForFunction(n=>window.__mouseQA.starts>n,before,{timeout:10000});assert.equal(await page.evaluate(()=>window.__mouseQA.starts),before+1);}
  await page.waitForTimeout(150);const control=page.getByRole('navigation',{name:'软件页面'}).getByRole('button',{name:'持仓与委托',exact:true});await control.focus();const before=await page.evaluate(()=>window.__mouseQA.starts);await page.keyboard.press('Enter');await page.waitForFunction(n=>window.__mouseQA.starts>n,before,{timeout:10000});assert.equal(await page.evaluate(()=>window.__mouseQA.starts),before+1);
  result.checks.push({mousePublicTerminal:true,mouseTabsOnce:true,mouseKeyboardOnce:true});
}
try{
  if(!portable){
    await run('casino-live-rollback',fixture('casino',1497281),{},async(page,result,shot)=>{
      const data=await page.evaluate(async()=>{
        const {gameState:s}=await import('/src/stores/gameStore.svelte.ts'),save=await import('/src/lib/save.ts'),casino=await import('/src/game/core/districtLeisure.ts'),risk=await import('/src/game/core/financialRisk.ts'),actions=await import('/src/game/core/actions.ts');
        save.saveGameImmediately('slot_1',s);const baseline=JSON.parse(localStorage.getItem('urban_life_save_slot_1'));const key='urban_life_financial_risk_v1_'+s.financialRisk.lifeId;
        const round=won=>{const start=casino.startDistrictLeisure(s,'roulette_number',{currency:'chips',room:'competition',bet:5000,choice:0});if(!start.ok)throw Error(start.reason);s.districtLeisure.active.outcome=[won?0:1];const id=s.districtLeisure.active.id;const reveal=casino.stepDistrictLeisure(s,id,{type:'reveal'});if(!reveal.ok)throw Error(reveal.reason);const paid=casino.settleDistrictLeisure(s,id);if(!paid.ok)throw Error(paid.reason);return paid;};
        for(let i=0;i<3;i++){round(false);if(!await save.loadGameIntoState('slot_1'))throw Error('load failed');}
        const before={ban:risk.financialBanReason(s,'casino'),journal:JSON.parse(localStorage.getItem(key))};
        const win=round(true);const after={ban:risk.financialBanReason(s,'casino'),money:s.player.money,chips:s.districtLeisure.casinoChips,location:s.locationId,seized:s.financialRisk.casinoSeizedCents,summary:win.result.summary};
        const blocks=[actions.moveTo(s,'boyue_texas_shop'),casino.buyCasinoChips(s,100),casino.startDistrictLeisure(s,'roulette_number',{currency:'chips',room:'competition',bet:5000,choice:0})];
        await save.loadGameIntoState('slot_1');const oldLoad={money:s.player.money,chips:s.districtLeisure.casinoChips,ban:risk.financialBanReason(s,'casino'),location:s.locationId};
        const journal=localStorage.getItem(key);await save.listSaves();save.exportSavePayload('slot_1');const listingUnchanged=journal===localStorage.getItem(key);
        return{baseline,journals:{[key]:localStorage.getItem(key)},before,after,blocks,oldLoad,listingUnchanged};
      });
      assert.equal(data.before.ban,null);assert.equal(data.before.journal.casino.rollbacks.length,3);assert(data.after.ban);assert.equal(data.after.money,100000);assert.equal(data.after.chips,500000);assert.equal(data.after.seized,3500000);assert.equal(data.after.location,'map');assert(data.blocks.every(x=>!x.ok));assert(data.oldLoad.ban);assert.equal(data.oldLoad.money,100000);assert.equal(data.oldLoad.chips,500000);assert.equal(data.oldLoad.location,'map');assert(data.listingUnchanged);
      result.checks.push({threeRollbackWithoutThresholdNoBan:true,winNet:35000,casinoOnlyConfiscation:data.after,oldSave:data.oldLoad,allEntryPointsBlocked:true,listingUnchanged:true});sourceFixtures.casino={save:data.baseline,journals:data.journals};
      await paper(page,result,shot,true);await loading(page,result,shot,true);
    });
    await run('stock-live-rollback-sound',fixture('stock',1497282),{},async(page,result,shot)=>{
      await mouseCheck(page,result);
      const data=await page.evaluate(async()=>{
        const store=await import('/src/stores/gameStore.svelte.ts'),s=store.gameState,save=await import('/src/lib/save.ts'),stocks=await import('/src/game/core/stockMarket.ts'),risk=await import('/src/game/core/financialRisk.ts'),engine=await import('/src/game/engine.ts');
        const key='urban_life_financial_risk_v1_'+s.financialRisk.lifeId,copy=JSON.parse(JSON.stringify(s)),previous=localStorage.getItem(key);engine.advanceTime(copy,7);const previewUnchanged=previous===localStorage.getItem(key);
        save.saveGameImmediately('slot_1',s);const baseline=JSON.parse(localStorage.getItem('urban_life_save_slot_1'));
        for(let i=0;i<3;i++){const order=stocks.placeStockOrder(s,{stockId:'SS001',side:'buy',quantity:1});if(!order.ok)throw Error(order.reason);if(!await save.loadGameIntoState('slot_1'))throw Error('load failed');}
        const frozen=JSON.stringify(s.economy.stockMarket),money=s.player.money;const order=stocks.placeStockOrder(s,{stockId:'SS001',side:'buy',quantity:1}),transfer=stocks.transferStockCash(s,100,'in');
        return{baseline,journals:{[key]:localStorage.getItem(key)},previewUnchanged,ban:risk.financialBanReason(s,'stock'),order,transfer,unchanged:frozen===JSON.stringify(s.economy.stockMarket)&&money===s.player.money,journal:JSON.parse(localStorage.getItem(key))};
      });
      assert(data.previewUnchanged);assert(data.ban);assert(!data.order.ok&&!data.transfer.ok);assert(data.unchanged);assert.equal(data.journal.stock.caseId,1);sourceFixtures.stock={save:data.baseline,journals:data.journals};
      await page.evaluate(async()=>{(await import('/src/stores/gameStore.svelte.ts')).goto('saveLoad');});await page.locator('.exchange').first().waitFor({state:'hidden'});await page.evaluate(async()=>{(await import('/src/stores/gameStore.svelte.ts')).goto('game');});await page.getByRole('button',{name:'使用免费电脑',exact:true}).click();await page.locator('[data-stock-risk-ban]').waitFor();assert.match(await page.locator('[data-stock-risk-ban]').innerText(),/30/);await shot('frozen-account');result.checks.push({previewUnchanged:true,threeActualTradeRollbacksBan:true,freezeMessage:data.ban,tradeAndTransferBlockedWithoutMutation:true});
    });
    await run('casino-fair-high-income',fixture('casino',1497283),{},async(page,result,shot)=>{
      const data=await page.evaluate(async()=>{
        const {gameState:s}=await import('/src/stores/gameStore.svelte.ts'),casino=await import('/src/game/core/districtLeisure.ts'),risk=await import('/src/game/core/financialRisk.ts');
        const start=casino.startDistrictLeisure(s,'roulette_number',{currency:'chips',room:'competition',bet:5000,choice:0});if(!start.ok)throw Error(start.reason);s.districtLeisure.active.outcome=[0];const id=s.districtLeisure.active.id;casino.stepDistrictLeisure(s,id,{type:'reveal'});casino.settleDistrictLeisure(s,id);return{save:JSON.parse(JSON.stringify(s)),ban:risk.financialBanReason(s,'casino'),chips:s.districtLeisure.casinoChips};
      });assert.equal(data.ban,null);assert.equal(data.chips,675000);sourceFixtures.fair={save:data.save,journals:{}};result.checks.push({honestNetWin:35000,noBan:true,fullWinningsRetained:true});await paper(page,result,shot,false);await loading(page,result,shot,false);
    });
    await run('forecast-versus-commit',fixture('stock',1497284),{},async(page,result)=>{
      await page.getByRole('button',{name:'使用免费电脑',exact:true}).click();
      const data=await page.evaluate(async()=>{
        const store=await import('/src/stores/gameStore.svelte.ts'),s=store.gameState,engine=await import('/src/game/engine.ts'),save=await import('/src/lib/save.ts');
        const key='urban_life_financial_risk_v1_'+s.financialRisk.lifeId,old=localStorage.getItem(key),cursor=s.financialRisk.stock.cursor,copy=JSON.parse(JSON.stringify(s));engine.advanceTime(copy,7);const previewUnchanged=old===localStorage.getItem(key);store.replaceState(copy,{sameSession:true});const after=s.financialRisk.stock.cursor,head=JSON.parse(localStorage.getItem(key)).stock.head;save.saveGameImmediately('slot_1',s);for(let i=0;i<5;i++)await save.loadGameIntoState('slot_1');return{previewUnchanged,cursor,after,head,rollbacks:JSON.parse(localStorage.getItem(key)).stock.rollbacks.length};
      });assert(data.previewUnchanged);assert.equal(data.after,data.cursor+1);assert.equal(data.head,data.after);assert.equal(data.rollbacks,0);result.checks.push({simulatedSevenHoursNotAudited:true,actualCommittedMarketProgressAuditedOnce:true,fiveLatestReloadsNoRollback:true});
    });
    writeFileSync(join(audit,'browser-fixtures.json'),JSON.stringify(sourceFixtures,null,2));
  }else{
    for(const mobile of [false,true]){
      const src=sourceFixtures.casino,home=structuredClone(src.save);home.locationId='old_apartment';home.area=home.region='downtown_residential';home.navStack=['map',home.region];
      await run(mobile?'pe-old-save-blacklist-tips':'pc-old-save-blacklist-tips',home,src.journals,async(page,result,shot)=>{
        await paper(page,result,shot,true,{fromHome:true});const auto=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));result.checks.push({oldSaveExternalBlacklistReapplied:true,fixtureLife:auto.financialRisk.lifeId});
      },{mobile});
    }
    const src=sourceFixtures.stock;
    await run('old-stock-save-frozen-sound',src.save,src.journals,async(page,result,shot)=>{
      await mouseCheck(page,result);await page.locator('[data-stock-risk-ban]').waitFor();assert.match(await page.locator('[data-stock-risk-ban]').innerText(),/30/);
      await page.getByRole('navigation',{name:'软件页面'}).getByRole('button',{name:'买卖交易',exact:true}).click();await page.getByRole('button',{name:'确认买入',exact:true}).click();await page.getByText(/交易与资金转移冻结/).last().waitFor();await shot('blocked-order');
      await page.getByRole('navigation',{name:'软件页面'}).getByRole('button',{name:'资金与借款',exact:true}).click();await page.getByRole('spinbutton',{name:'资金划转金额',exact:true}).fill('100');await page.getByRole('button',{name:'转入证券',exact:true}).click();await page.getByText(/交易与资金转移冻结/).last().waitFor();await shot('blocked-transfer');result.checks.push({externalStockBanReapplied:true,actualUiBuyBlocked:true,actualUiTransferBlocked:true});
    });
    const fair=structuredClone(sourceFixtures.fair.save);fair.locationId='old_apartment';fair.area=fair.region='downtown_residential';fair.navStack=['map',fair.region];
    await run('fair-win-normal-tips',fair,{},async(page,result,shot)=>{await paper(page,result,shot,false,{fromHome:true});result.checks.push({highIncomeAloneKeepsNormalTips:true});});
    await run('computer-sfx-disabled',src.save,src.journals,async(page,result,shot)=>{await page.getByRole('button',{name:'使用免费电脑',exact:true}).click();await page.getByRole('navigation',{name:'软件页面'}).getByRole('button',{name:'买卖交易',exact:true}).click();await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__mouseQA.starts),0);result.checks.push({sfxZeroRespected:true});await shot('muted-terminal');},{sfx:false});
  }
  report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e);}finally{writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();await server?.close();}
console.log(JSON.stringify({passed:report.passed,scenarios:report.scenarios.map(x=>({id:x.id,passed:x.passed,errors:x.errors,failure:x.failure}))}));
