import {createServer} from 'vite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),assets=join(root,'src/assets/mobile-stills/company');
const evidence=resolve(process.env.COMPANY_CONTEXT_OUT??'docs/company-simplification-1497-20261027');
const preview=process.argv.includes('--preview'),out=preview?join(evidence,'model-preview'):assets;
mkdirSync(out,{recursive:true});
const manifest=JSON.parse(readFileSync(join(assets,'manifest.json'),'utf8'));
const server=await createServer({root,server:{host:'127.0.0.1',port:1431,strictPort:true,hmr:false,watch:{ignored:['**/src/assets/**','**/docs/**','**/待清理文件/**','**/dist*/**']}}});
await server.listen();
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={createdAt:new Date().toISOString(),preview,frames:[],errors:[],passed:false};
const save=(name,data)=>writeFileSync(join(out,name),Buffer.from(data.split(',')[1],'base64'));
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('http://127.0.0.1:1431/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Company context capture</title><body></body>'}));
  await page.goto('http://127.0.0.1:1431/');
  await page.evaluate(async()=>{window.capture=await import('/scripts/companyStillCapture.ts');});
  for(const stage of [1,2,3,4])for(const angle of preview?[0]:[0,1,2,3]){
    let hit;
    for(const night of preview?[false]:[false,true]){
      const result=await page.evaluate(async({stage,angle,night})=>window.capture.officeBase(stage,angle,night),{stage,angle,night});
      const key=`${stage}-${angle}-${night?'night':'day'}`,src=`office-${key}.webp`,foreground=`office-${key}-foreground.webp`,depthSrc=`office-${key}.depth.png`;
      save(src,result.image);
      if(!preview){
        save(foreground,result.foreground);save(depthSrc,result.depth);
        if(!hit)hit=await page.evaluate(()=>window.capture.officeInteraction());
        const hitSrc=`office-${stage}-${angle}-interaction.png`;save(hitSrc,hit.image);
        manifest.frames[key]={...result.frame,src,foreground,depthSrc,hitSrc,hitIds:hit.ids};
      }
      report.frames.push(key);console.log('Company context '+key);
    }
  }
  await page.evaluate(()=>window.capture.finish());
  report.passed=report.errors.length===0;
  if(!report.passed)throw Error(report.errors.join('\n'));
  if(!preview){manifest.contextRevision='2026-10-27-office-finish';manifest.contextFrames=report.frames;writeFileSync(join(assets,'manifest.json'),JSON.stringify(manifest,null,2));}
}finally{writeFileSync(join(evidence,preview?'model-preview.json':'stills-bake.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
