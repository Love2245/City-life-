import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/announcement-pe-1497-20261028');
const portable=process.env.QA_PORTABLE==='1',baseline=process.env.QA_BASELINE==='1',out=join(audit,baseline?'baseline':portable?'portable':'source');mkdirSync(out,{recursive:true});
const url=portable?pathToFileURL(join(root,'1.49.7.html')).href:'http://127.0.0.1:1445/';
let server;if(!portable){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1445,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--autoplay-policy=no-user-gesture-required']});
const cases=[
  {id:'pe-landscape-70',w:932,h:430,zoom:.7,insets:{top:0,right:0,bottom:24,left:59}},
  {id:'pe-compact-70',w:844,h:390,zoom:.7,insets:{top:0,right:44,bottom:20,left:0}},
  {id:'pe-landscape-100',w:812,h:375,zoom:1},
  {id:'pe-small-130',w:740,h:360,zoom:1.3},
  {id:'pe-short-70',w:640,h:320,zoom:.7},
  {id:'pe-portrait-70',w:390,h:844,zoom:.7,insets:{top:34,right:0,bottom:24,left:0}},
  {id:'pc-100',w:1440,h:900,zoom:1,pc:true},
  {id:'pc-150',w:1366,h:768,zoom:1.5,pc:true},
];
const selected=process.env.QA_CASES?.split(','),report={createdAt:new Date().toISOString(),url,baseline,passed:false,boundary:'Fresh isolated browser storage. PE uses real Chromium touch events plus controlled native safe-area bridge values; no player saves or physical devices are used.',scenarios:[]};
async function metrics(page){return page.evaluate(()=>{
  const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};},dialog=document.querySelector('#version-announcement-dialog'),body=document.querySelector('.announcement-scroll'),close=document.querySelector('.announcement-close'),confirm=document.querySelector('.announcement-confirm');
  const hit=n=>{const r=n.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return target===n||n.contains(target);};
  return{viewport:[innerWidth,innerHeight],dialog:rect(dialog),scroll:{...rect(body),top:body.scrollTop,client:body.clientHeight,total:body.scrollHeight},close:{...rect(close),hit:hit(close)},confirm:{...rect(confirm),hit:hit(confirm)},noteCount:body.querySelectorAll('li').length,rootZoom:getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')};
});}
async function swipe(page,cdp,rect,pc){
  const x=Math.min(page.viewportSize().width-20,rect.right-35),bottom=Math.min(page.viewportSize().height-12,rect.bottom-12),top=Math.max(12,rect.y+12),from=bottom-10,to=Math.max(top,from-Math.min(240,(bottom-top)*.72));
  if(pc){await page.mouse.move(x,(top+bottom)/2);await page.mouse.wheel(0,400);}else{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from,radiusX:6,radiusY:6,force:1}]});
    for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/10,radiusX:6,radiusY:6,force:1}]});await page.waitForTimeout(16);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await page.waitForTimeout(180);
}
async function tapCenter(page,selector,pc){const b=await page.locator(selector).boundingBox();assert(b);const x=b.x+b.width/2,y=b.y+b.height/2;assert(x>0&&y>0&&x<page.viewportSize().width&&y<page.viewportSize().height,'Control outside physical viewport');if(pc)await page.mouse.click(x,y);else await page.touchscreen.tap(x,y);}
try{for(const spec of cases){
  if(selected&&!selected.includes(spec.id))continue;console.log('START '+spec.id);const result={...spec,passed:false,errors:[],external:[],screenshots:[]};report.scenarios.push(result);
  const context=await browser.newContext({viewport:{width:spec.w,height:spec.h},hasTouch:!spec.pc,isMobile:!spec.pc,deviceScaleFactor:1,...(!spec.pc?{userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'}:{})});
  if(portable)await context.route(/^https?:/,r=>r.abort());const page=await context.newPage(),cdp=await context.newCDPSession(page);page.setDefaultTimeout(45000);page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});page.on('request',r=>{if(portable&&/^https?:/.test(r.url()))result.external.push(r.url());});
  await page.addInitScript(spec=>{localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':spec.pc?'pc':'pe','urban-life-ui-zoom':String(spec.zoom),'urban-life-pe-zoom-v3':'1','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0'}))localStorage.setItem(k,v);window.UrbanLifeDisplay={getInsets:()=>JSON.stringify(spec.insets??{top:0,right:0,bottom:0,left:0})};},spec);
  const shot=async label=>{const file=spec.id+'-'+label+'.png';await page.screenshot({path:join(out,file)});result.screenshots.push(file);};
  try{
    await page.goto(url,{waitUntil:'load',timeout:300000});await page.locator('#version-announcement-dialog[open]').waitFor();result.initial=await metrics(page);await shot('opened');
    const a=result.initial,insets=spec.insets??{top:0,right:0,bottom:0,left:0};result.dialogFits=a.dialog.x>=Math.max(0,insets.left)-1&&a.dialog.y>=Math.max(0,insets.top)-1&&a.dialog.right<=spec.w-Math.max(0,insets.right)+1&&a.dialog.bottom<=spec.h-Math.max(0,insets.bottom)+1;
    await swipe(page,cdp,a.scroll,spec.pc);result.afterSwipe=await metrics(page);result.nativeScrollWorks=result.afterSwipe.scroll.top>5;result.fixedControls=Math.abs(result.afterSwipe.close.y-a.close.y)<1&&Math.abs(result.afterSwipe.confirm.y-a.confirm.y)<1;
    for(let i=0;i<80;i++){const m=await metrics(page);if(m.scroll.top+m.scroll.client>=m.scroll.total-3)break;await swipe(page,cdp,m.scroll,spec.pc);}
    result.bottom=await metrics(page);result.allContentReachable=result.bottom.scroll.top+result.bottom.scroll.client>=result.bottom.scroll.total-3;await shot('scrolled-bottom');
    if(result.bottom.close.hit){await tapCenter(page,'.announcement-close',spec.pc);await page.locator('#version-announcement-dialog').waitFor({state:'hidden'});result.closeTapped=true;result.dismissalPersisted=await page.evaluate(()=>localStorage.getItem('urban-life-announcement-dismissed-v1.49.7')==='shown');}
    else result.closeTapped=false;
    if(!baseline){
      assert(result.dialogFits,'Dialog outside safe viewport');assert(result.initial.close.hit&&result.initial.confirm.hit,'Close/confirm must be directly hittable');assert(result.nativeScrollWorks,'Native scroll must move content');assert(result.fixedControls,'Header and footer must stay fixed');assert(result.allContentReachable,'Last note must be reachable');assert(result.closeTapped&&result.dismissalPersisted,'Tap close must dismiss and persist');
      if(!spec.pc)assert(Math.min(a.close.w,a.close.h,a.confirm.h)>=43.5,'PE controls must be at least 44 physical CSS pixels');
      await page.getByRole('button',{name:'重新查看版本公告',exact:true}).click();await page.locator('#version-announcement-dialog[open]').waitFor();await tapCenter(page,'.announcement-confirm',spec.pc);await page.locator('#version-announcement-dialog').waitFor({state:'hidden'});result.confirmTapped=true;
      if(spec.id==='pe-landscape-70'){await page.getByRole('button',{name:'重新查看版本公告',exact:true}).click();await page.setViewportSize({width:430,height:932});result.afterRotation=await metrics(page);assert(result.afterRotation.close.hit&&result.afterRotation.confirm.hit);await tapCenter(page,'.announcement-close',false);await page.locator('#version-announcement-dialog').waitFor({state:'hidden'});result.rotationDismissed=true;}
      assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);
    }
    result.passed=baseline||result.dialogFits&&result.nativeScrollWorks&&result.closeTapped;console.log('PASS '+spec.id);
  }catch(e){result.failure=e.stack;await shot('failure').catch(()=>{});console.error(spec.id+': '+e.message);if(!baseline)process.exitCode=1;}finally{await context.close();}
}report.passed=report.scenarios.every(s=>s.passed);}finally{await browser.close();await server?.close();writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,baseline,scenarios:report.scenarios.map(s=>({id:s.id,passed:s.passed,dialogFits:s.dialogFits,nativeScrollWorks:s.nativeScrollWorks,closeTapped:s.closeTapped,failure:s.failure}))}));
