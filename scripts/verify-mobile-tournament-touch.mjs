import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/office-layout-mobile-audio-1497-20261027');
const portable=process.env.QA_PORTABLE==='1',url=portable?pathToFileURL(join(root,'1.49.7.html')).href:'http://127.0.0.1:14636/';
const ssr=await createServer({root,configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
const api=Object.assign({},...await Promise.all(['state','housing','actions','calendar','cat','catCare','items'].map(name=>ssr.ssrLoadModule('/src/game/core/'+name+'.ts'))));await ssr.close();
const s=api.createInitialState(149727);s.mode='eternal';s.player.money=100000;s.tutorial={done:['eat','work','sleep'],activeStep:-1};
Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+101),{hour:10,minute:0});Object.assign(s.player.attrs,{stamina:100,health:100,mood:80,satiety:80,hygiene:80});
assert(api.signLease(s,'old_apartment').ok);assert(api.moveTo(s,'old_apartment').ok);api.addItem(s,'laptop');s.flags.laptop_app_forum=true;
assert(api.adoptCat(s,'orange'));api.setActivePet(s,s.pets[0].uid);s.pets[0].level=99;s.catTournament={ultimateUnlocked:true,elderKing:false};
s.weather.id='sunny';s.weather.lastRollDay=api.gameDay(s.time);s.navStack=['map',s.region];
const server=portable?undefined:await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:14636,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server?.listen();
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={startedAt:new Date().toISOString(),cases:[],passed:false};
try{
  for(const viewport of portable?[{width:932,height:430}]:[{width:932,height:430},{width:740,height:360}]){
    const result={viewport,checks:[],errors:[]};report.cases.push(result);
    const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(90000);
    if(portable)await context.route(/^https?:/,route=>route.abort());
    page.on('pageerror',e=>result.errors.push(e.message));
    await page.addInitScript(({s})=>{localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':'pe','urban-life-pe-zoom-v3':'1','urban-life-ui-zoom':'.7','urban-life-scene-mode':'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban_life_save_auto':JSON.stringify(s)}))localStorage.setItem(k,v);},{s});
    try{
      await page.goto(url,{waitUntil:'load',timeout:300000});const close=page.getByRole('button',{name:'关闭公告',exact:true});if(await close.isVisible().catch(()=>false))await close.click();
      await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-home-object="computer"]').waitFor({timeout:180000});
      await page.locator('[data-home-object="computer"]').click();await page.locator('.action-roots button').first().click();await page.locator('.action-branch button').first().click();
      await page.locator('.desk-icon[data-app-id="forum"]').click();
      const cdp=await context.newCDPSession(page);
      const swipe=async bounds=>{const x=Math.round(bounds.x+bounds.width*.55),y=Math.round(bounds.y+bounds.height*.78),end=Math.round(bounds.y+bounds.height*.22);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
        for(let j=1;j<=8;j++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.round(y+(end-y)*j/8),id:1}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);};
      const feed=page.locator('.tieba-feed'),feedBefore=await feed.evaluate(n=>({top:n.scrollTop,height:n.clientHeight,total:n.scrollHeight}));
      if(feedBefore.total>feedBefore.height+5){const bounds=await feed.boundingBox();assert(bounds);await swipe(bounds);await page.waitForTimeout(250);const top=await feed.evaluate(n=>n.scrollTop);assert(top>feedBefore.top,'forum feed did not respond to touch');result.checks.push({forumFeedTouch:true,before:feedBefore.top,after:top});}
      const side=page.locator('.tieba-left'),sideBefore=await side.evaluate(n=>({top:n.scrollTop,height:n.clientHeight,total:n.scrollHeight}));
      if(sideBefore.total>sideBefore.height+5){const bounds=await side.boundingBox();assert(bounds);await swipe(bounds);await page.waitForTimeout(250);const top=await side.evaluate(n=>n.scrollTop);assert(top>sideBefore.top,'forum sidebar did not respond to touch');result.checks.push({forumSidebarTouch:true,before:sideBefore.top,after:top});}
      await page.locator('.tieba-bar').filter({hasText:'喵喵对决赛'}).click();
      const list=page.locator('.tourney');await list.waitFor();const before=await list.evaluate(n=>({top:n.scrollTop,height:n.clientHeight,total:n.scrollHeight}));assert(before.total>before.height);
      const bounds=await list.boundingBox();assert(bounds&&bounds.height>30);
      for(let i=0;i<8;i++){
        await swipe(bounds);
      }
      const after=await list.evaluate(n=>({top:n.scrollTop,height:n.clientHeight,total:n.scrollHeight}));assert(after.top>before.top+30,'touch gesture did not scroll');assert(after.top+after.height>=after.total-8,'last tournament remains unreachable');
      const last=list.locator('.tourney-card').last(),button=last.getByRole('button',{name:/立即报名/});assert(await button.isVisible());assert(await button.isEnabled());
      await page.screenshot({path:join(out,`tournament-touch-${portable?'portable-':''}${viewport.width}.png`)});await button.tap();
      await page.waitForFunction(()=>document.querySelector('.tourney-entry')?.textContent?.includes('已报名'));
      result.checks.push({realTouchSwipes:true,before,after,lastTournamentSignup:true});assert.deepEqual(result.errors,[]);result.passed=true;
    }catch(e){result.failure=e.stack;await page.screenshot({path:join(out,`tournament-failure-${viewport.width}.png`)}).catch(()=>{});}
    finally{await context.close();}
  }
  report.passed=report.cases.every(x=>x.passed);if(!report.passed)process.exitCode=1;
}finally{writeFileSync(join(out,`tournament-touch-${portable?'portable':'browser'}.json`),JSON.stringify(report,null,2));await browser.close();await server?.close();}
console.log(JSON.stringify(report));
