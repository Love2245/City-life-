import {createServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=process.cwd(),out=path.join(root,process.env.TIPS_QA_OUT||'docs/bedside-tips-20261021/loading-browser-proof');
await fs.mkdir(out,{recursive:true});
const virtual='\0author-loading-tips';
const entry=`
import {mount,flushSync} from 'svelte';
import Overlay from '/src/components/layout/TransitionOverlay.svelte';
import {beginSceneLoading,cancelSceneLoading} from '/src/stores/sceneLoading.svelte.ts';
import {LOADING_TIPS} from '/src/game/data/loadingTips.ts';
mount(Overlay,{target:document.body});let sequence=0;
window.tipQA={tips:LOADING_TIPS,async show(){const task=beginSceneLoading({sceneKey:'tip-qa:'+ ++sequence,regionId:'downtown',label:'城市住宅',kind:'3d',time:'day',weather:'sunny'});flushSync();await task.covered;return task.id;},cancel(){cancelSceneLoading();flushSync();}};
`;
const plugin={name:'author-tip-preview',resolveId(id){if(id==='/@author-tips')return virtual;},load(id){if(id===virtual)return entry;},configureServer(server){server.middlewares.use((request,response,next)=>{if(request.url!=='/tips-preview')return next();response.setHeader('Content-Type','text/html; charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Author tips QA</title><style>html,body{margin:0;height:100%}</style><script type="module" src="/@author-tips"></script>');});}};
const server=await createServer({root,configFile:false,plugins:[plugin,svelte({compilerOptions:{dev:false,hmr:false}})],server:{host:'127.0.0.1',port:1447,strictPort:true},optimizeDeps:{noDiscovery:true},appType:'custom'});
let browser;const report={sourcePreview:true,gameSavesTouched:false,errors:[],shown:[],layouts:[]};
try{
  await server.listen();browser=await playwright.chromium.launch({executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  // Deterministic shuffle in this isolated preview makes the longest author line reachable.
  await context.addInitScript(()=>{Math.random=()=>0;});
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));
  await page.goto('http://127.0.0.1:1447/tips-preview');await page.waitForFunction(()=>!!window.tipQA);
  await page.evaluate(()=>window.tipQA.show());
  const read=()=>page.locator('[data-loading-tip] span:last-child').textContent();
  report.shown.push(await read());
  for(const step of [1,2,3]){await page.waitForFunction(step=>document.querySelector('[data-loading-tip]')?.dataset.loadingTip===String(step),step,{timeout:5000});report.shown.push(await read());}
  assert.equal(new Set(report.shown).size,4);
  const author=await page.evaluate(()=>window.tipQA.tips);assert.equal(author.length,46);assert(report.shown.every(tip=>author.includes(tip)));
  await page.waitForFunction(()=>document.querySelector('[data-loading-tip]')?.dataset.loadingTip==='long-wait',{timeout:5000});assert((await page.locator('.loading-state').textContent()).includes('预计加载时间可能较长'));assert(!(await read()).includes('1125965732'));report.longWaitAfterFour=true;
  await page.waitForFunction(()=>document.querySelector('[data-loading-tip]')?.dataset.loadingTip==='feedback',{timeout:5000});assert((await read()).includes('1125965732'));report.feedbackAtFifteenSeconds=true;
  const longest=author.reduce((a,b)=>a.length>=b.length?a:b);
  for(const [name,viewport] of [['desktop',{width:1440,height:900}],['portrait',{width:390,height:844}],['landscape',{width:844,height:390}],['small-portrait',{width:320,height:568}],['short-landscape',{width:640,height:320}]]){
    await page.setViewportSize(viewport);let matched=false;
    for(let attempt=0;attempt<60;attempt++){await page.evaluate(()=>window.tipQA.show());if(await read()===longest){matched=true;break;}}
    assert(matched,'Longest author tip was not drawn');await page.waitForTimeout(120);
    const bounds=await page.evaluate(()=>{
      const rect=selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,visible:getComputedStyle(node).display!=='none'};};
      return {tip:rect('[data-loading-tip]'),text:rect('[data-loading-tip] span:last-child'),copy:rect('.loading-copy'),footer:rect('.loading-footer')};
    });
    assert(bounds.tip.x>=-1&&bounds.tip.right<=viewport.width+1&&bounds.tip.y>=0&&bounds.tip.bottom<=viewport.height,'Tip overflow: '+name);
    assert(bounds.text.right<=viewport.width+1&&bounds.text.bottom<=viewport.height,'Text overflow: '+name);
    assert(bounds.copy.bottom<=bounds.tip.y+1,'Tip overlaps scene title: '+name);
    if(bounds.footer.visible)assert(bounds.tip.bottom<=bounds.footer.y+1,'Tip overlaps footer: '+name);
    report.layouts.push({name,viewport,bounds,text:longest});await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
  }
  assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report,null,2));
