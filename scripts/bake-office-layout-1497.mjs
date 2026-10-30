import {createServer} from 'vite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),assets=join(root,'src/assets/mobile-stills/company');
const evidence=resolve(process.env.OFFICE_BAKE_OUT??join(root,'docs/office-layout-mobile-audio-1497-20261027'));
mkdirSync(evidence,{recursive:true});
const manifest=JSON.parse(readFileSync(join(assets,'manifest.json'),'utf8'));
const server=await createServer({root,server:{host:'127.0.0.1',port:1436,strictPort:true,hmr:false,watch:{ignored:['**/src/assets/**','**/docs/**','**/待清理文件/**','**/dist*/**']}}});
await server.listen();
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={createdAt:new Date().toISOString(),frames:[],sprites:[],errors:[],passed:false};
const save=(name,data)=>writeFileSync(join(assets,name),Buffer.from(data.split(',')[1],'base64'));
try {
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('http://127.0.0.1:1436/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Office scene capture</title><body></body>'}));
  await page.goto('http://127.0.0.1:1436/');
  await page.evaluate(async()=>{window.capture=await import('/scripts/companyStillCapture.ts');});
  const stages=process.argv.includes('--all-stages')?[1,2,3,4]:process.argv.includes('--stage4')?[4]:[3,4],framesOnly=process.argv.includes('--frames-only');
  for(const stage of stages)for(const angle of [0,1,2,3]){
    let hit;
    for(const night of [false,true]){
      const result=await page.evaluate(({stage,angle,night})=>window.capture.officeBase(stage,angle,night),{stage,angle,night});
      const key=`${stage}-${angle}-${night?'night':'day'}`,src=`office-${key}.webp`,foreground=`office-${key}-foreground.webp`,depthSrc=`office-${key}.depth.png`;
      save(src,result.image);save(foreground,result.foreground);save(depthSrc,result.depth);
      if(!hit)hit=await page.evaluate(()=>window.capture.officeInteraction());
      const hitSrc=`office-${stage}-${angle}-interaction.png`;save(hitSrc,hit.image);
      manifest.frames[key]={...result.frame,src,foreground,depthSrc,hitSrc,hitIds:hit.ids};
      report.frames.push(key);console.log('office frame '+key);
    }
  }
  // 13 headgears and six body looks are coprime: 78 indices cover every pair.
  if(!framesOnly)for(const angle of [0,1,2,3])for(let variant=0;variant<78;variant++){
    const result=await page.evaluate(({variant,angle})=>window.capture.officeSprite('worker',variant,angle),{variant,angle});
    const key=`worker-${result.sprite.look}-${result.sprite.headgear}-${angle}`,src=`${key}.webp`,depthSrc=`${key}.depth.png`;
    save(src,result.image);save(depthSrc,result.depth);manifest.sprites[key]={...result.sprite,src,depthSrc};
    report.sprites.push(key);if(variant%13===12)console.log(`worker angle ${angle}: ${variant+1}/78`);
  }
  await page.evaluate(()=>window.capture.finish());
  if(report.errors.length)throw new Error(report.errors.join('\n'));
  if(report.frames.length!==stages.length*8||(!framesOnly&&new Set(report.sprites).size!==312))throw new Error('Incomplete office assets');
  manifest.layoutRevision=process.env.OFFICE_LAYOUT_REVISION??'2026-10-27-private-offices-and-pods';
  writeFileSync(join(assets,'manifest.json'),JSON.stringify(manifest,null,2));report.passed=true;
}finally{writeFileSync(join(evidence,'office-stills-bake.json'),JSON.stringify(report,null,2));await browser.close();await server.close();}
