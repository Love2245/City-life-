import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/gameplay-audit-1497-20261028'),portable=process.env.QA_PORTABLE==='1',out=join(audit,portable?'portable':'source');mkdirSync(out,{recursive:true});
const ssr=await createServer({root,configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});let api={};
try{for(const name of ['state','stockMath','calendar','cat']){console.log('LOAD '+name);Object.assign(api,await ssr.ssrLoadModule('/src/game/core/'+name+'.ts'));}}finally{await ssr.close();}
const cases=[{id:'pc-legacy-cards',kind:'cards'},{id:'pe-hospital-special-closing',kind:'special',mobile:true,hour:19},{id:'pc-hospital-focus-reload',kind:'focus'},{id:'pc-stock-roundtrip',kind:'stock'}];
function fixture(spec,seed){
  const s=api.createInitialState(seed);s.mode='eternal';s.player.money=10000;s.tutorial={done:['eat','work','sleep'],activeStep:-1};
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100,hygiene:100});s.time.hour=spec.hour??12;s.time.minute=0;s.weather.id='sunny';s.weather.lastRollDay=api.gameDay(s.time);
  api.adoptCat(s,'orange');delete s.pets[0].cardPack;
  s.locationId=spec.kind==='cards'?'home':spec.kind==='stock'?'commercial_exchange':'flower_market';s.region=s.area=spec.kind==='cards'?'downtown_residential':spec.kind==='stock'?'downtown_commercial':'downtown_station';s.navStack=['map','downtown',s.region];
  s.economy.stockMarket=api.createStockMarket(s);if(spec.kind==='stock')s.economy.stockMarket.cashCents=1000000;return s;
}
const url=portable?pathToFileURL(join(root,'1.49.7.html')).href:'http://127.0.0.1:1449/';let server;
if(!portable){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1449,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--autoplay-policy=no-user-gesture-required']});
const report={createdAt:new Date().toISOString(),portable,passed:false,boundary:'Fresh isolated browser profiles. Legacy saves omit optional pet cardPack fields. Real UI opens nested flower-market hospital, trains, persists and reloads. No personal saves accessed.',scenarios:[]},selected=process.env.QA_CASES?.split(',');
async function tap(page,target,mobile){await target.scrollIntoViewIfNeeded();if(mobile)await target.tap();else await target.click();}
async function saved(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));}
async function boot(page){await page.goto(url,{waitUntil:'load',timeout:300000});const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});}
async function openHospital(page,kind,mobile){await tap(page,page.locator('.pet-hospital-facility'),mobile);await tap(page,page.locator('.action-card').filter({hasText:kind==='special'?'猫咪特殊训练':'猫咪专注性训练'}),mobile);await page.locator('.card-list .card-row').first().waitFor();}
try{for(const spec of cases){
  if(selected&&!selected.includes(spec.id))continue;console.log('START '+spec.id);const r={...spec,passed:false,errors:[],external:[],screenshots:[]};report.scenarios.push(r);
  const context=await browser.newContext({viewport:spec.mobile?{width:932,height:430}:{width:1440,height:900},hasTouch:!!spec.mobile,isMobile:!!spec.mobile,deviceScaleFactor:1});if(portable)await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>r.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});page.on('request',req=>{if(portable&&/^https?:/.test(req.url()))r.external.push(req.url());});
  await page.addInitScript(({state,mobile})=>{if(sessionStorage.getItem('gameplay-audit-seeded'))return;sessionStorage.setItem('gameplay-audit-seeded','1');localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':mobile?'pe':'pc','urban-life-ui-zoom':mobile?'.7':'1','urban-life-pe-zoom-v3':'1','urban-life-scene-mode':'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(state)}))localStorage.setItem(k,v);},{state:fixture(spec,149728700+report.scenarios.length),mobile:!!spec.mobile});
  const shot=async label=>{const file=spec.id+'-'+label+'.png';await page.screenshot({path:join(out,file)});r.screenshots.push(file);};
  try{
    await boot(page);
    if(spec.kind==='cards'){
      await tap(page,page.locator('.cat-status-card'));await tap(page,page.locator('.tabs').getByRole('button',{name:'卡包',exact:true}));
      assert.equal(await page.locator('.pack-card').count(),16);await shot('legacy-pack');await page.locator('.panel-close').click();await page.waitForTimeout(1200);
      assert.equal((await saved(page)).pets[0].cardPack,undefined);r.readOnlyLegacyPack=true;r.cardsShown=16;
    }else if(spec.kind==='special'||spec.kind==='focus'){
      await openHospital(page,spec.kind,spec.mobile);assert.equal(await page.locator('.card-list .card-row').count(),16);await shot('opened');
      await tap(page,page.locator('.card-list .row-btn').first(),spec.mobile);
      await page.waitForFunction(kind=>{const s=JSON.parse(localStorage.getItem('urban_life_save_auto'));return s?.player.money===9800&&s?.pets[0].cardPack?.length===(kind==='focus'?15:16);},spec.kind);
      const after=await saved(page);assert.equal(after.time.hour,(spec.hour??12)+1);r.legacyTrainingWorks=true;r.chargedExactly200=true;r.savedCardCount=after.pets[0].cardPack.length;
      if(spec.kind==='special'){
        assert.equal(after.pets[0].cardPack[0].defId,'scratch_b1');assert.equal(await page.locator('.card-list .row-btn:enabled').count(),0);const reason=await page.getByRole('status').filter({hasText:/打烊|关门/}).innerText();assert(reason);r.closingBlocksAllButtons=true;r.closingReason=reason;await shot('closing-blocked');
        await page.waitForTimeout(1200);assert.equal((await saved(page)).player.money,9800);
      }else{
        await shot('deleted-once');await boot(page);await openHospital(page,spec.kind,spec.mobile);assert.equal(await page.locator('.card-list .card-row').count(),15);assert.equal((await saved(page)).player.money,9800);r.deletedCardSurvivesReload=true;await shot('reloaded');
      }
    }else{
      await page.getByRole('button',{name:'使用免费电脑',exact:true}).click();const nav=page.getByRole('navigation',{name:'软件页面'});await nav.getByRole('button',{name:'资金与借款',exact:true}).click();
      await page.getByLabel('资金划转金额',{exact:true}).fill('100');await page.getByRole('button',{name:'转入证券',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')).player.money===9900);let s=await saved(page);assert.equal(s.economy.stockMarket.cashCents,1010000);
      await page.getByRole('button',{name:'转回生活',exact:true}).click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')).player.money===10000);s=await saved(page);assert.equal(s.economy.stockMarket.cashCents,1000000);
      await nav.getByRole('button',{name:'买卖交易',exact:true}).click();await page.getByLabel('交易股数',{exact:true}).fill('1');await page.locator('.submit-order').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')).economy.stockMarket.positions.length===1);await shot('bought-one');
      await nav.getByRole('button',{name:'持仓与委托',exact:true}).click();await page.getByRole('table').getByRole('button',{name:'卖出',exact:true}).click();await page.locator('.submit-order').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')).economy.stockMarket.positions.length===0);
      s=await saved(page);assert.equal(s.economy.stockMarket.cashCents,1000000-s.economy.stockMarket.feesPaidCents);assert.equal(s.player.money,10000);assert.equal(s.economy.stockMarket.trades.length,2);r.transferRoundtripConservesMoney=true;r.buySellOnlyCostsFees=true;r.feesCents=s.economy.stockMarket.feesPaidCents;
      await boot(page);await page.getByRole('button',{name:'使用免费电脑',exact:true}).click();assert.equal(await page.locator('[data-stock-risk-ban]').count(),0);r.latestReloadDoesNotBan=true;await shot('reloaded-account');
    }
    assert.deepEqual(r.errors,[]);assert.deepEqual(r.external,[]);r.passed=true;console.log('PASS '+spec.id);
  }catch(e){r.failure=e.stack;r.visibleText=(await page.locator('body').innerText()).slice(-6000);await shot('failure').catch(()=>{});throw e;}finally{await context.close();}
}}finally{report.passed=report.scenarios.length>0&&report.scenarios.every(r=>r.passed);writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();if(server)await server.close();}
console.log(JSON.stringify({passed:report.passed,scenarios:report.scenarios.length,portable,out}));
