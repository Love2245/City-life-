import {createServer} from 'vite';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),out=join(root,'src/assets/mobile-stills/company');mkdirSync(out,{recursive:true});
const pw=await import(pathToFileURL('C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js').href),chromium=pw.chromium??pw.default.chromium;
const server=await createServer({root,configFile:join(root,'vite.config.ts'),server:{host:'127.0.0.1',port:1429,strictPort:true}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
const report={createdAt:new Date().toISOString(),frames:{},sprites:{},errors:[],passed:false};
const save=(name,url)=>writeFileSync(join(out,name),Buffer.from(url.split(',')[1],'base64'));
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',error=>report.errors.push(error.message));
  await page.route('http://127.0.0.1:1429/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline company scene capture</title><body></body>'}));await page.goto('http://127.0.0.1:1429/');
  await page.evaluate(async()=>{window.capture=await import('/scripts/companyStillCapture.ts');});
  for(const stage of [1,2,3,4])for(const angle of [0,1,2,3])for(const night of [false,true]){
    const result=await page.evaluate(async({stage,angle,night})=>window.capture.officeBase(stage,angle,night),{stage,angle,night});const key=`${stage}-${angle}-${night?'night':'day'}`,src=`office-${key}.webp`,foreground=`office-${key}-foreground.webp`;save(src,result.image);save(foreground,result.foreground);const depthSrc=`office-${key}.depth.png`;save(depthSrc,result.depth);report.frames[key]={...result.frame,src,foreground,depthSrc};process.stdout.write(`base ${key}\n`);
  }
  for(const angle of [0,1,2,3]){
    for(const kind of ['low','mid','high']){const result=await page.evaluate(({kind,angle})=>window.capture.officeSprite(kind,0,angle),{kind,angle});const key=`pc-${kind}-${angle}`,src=`${key}.webp`;save(src,result.image);const depthSrc=`${key}.depth.png`;save(depthSrc,result.depth);report.sprites[key]={...result.sprite,src,depthSrc};}
    for(let variant=0;variant<30;variant++){const result=await page.evaluate(({variant,angle})=>window.capture.officeSprite('worker',variant,angle),{variant,angle});const key=`worker-${result.sprite.look}-${result.sprite.headgear}-${angle}`,src=`${key}.webp`;save(src,result.image);const depthSrc=`${key}.depth.png`;save(depthSrc,result.depth);report.sprites[key]={...result.sprite,src,depthSrc};}
    process.stdout.write(`sprites angle ${angle}\n`);
  }
  await page.evaluate(()=>window.capture.finish());report.passed=report.errors.length===0;writeFileSync(join(out,'manifest.json'),JSON.stringify(report,null,2));if(!report.passed)throw new Error(report.errors.join('\n'));
}finally{await browser.close();await server.close();}
process.stdout.write(`Company still assets: ${Object.keys(report.frames).length} frames, ${Object.keys(report.sprites).length} sprites.\n`);
