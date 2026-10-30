import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime='C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const playwright=await import(pathToFileURL(runtime).href),chromium=playwright.chromium??playwright.default.chromium;
const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:1432,strictPort:true,hmr:false,watch:{ignored:["**/docs/**","**/src/assets/mobile-stills/**"]}},optimizeDeps:{noDiscovery:true}});
let browser;
try{
  await server.listen();browser=await chromium.launch({executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:4096,height:2560},deviceScaleFactor:1});
  page.on('pageerror',error=>console.error(error.message));
  await page.goto('http://127.0.0.1:1432/');
  await page.setContent('<!doctype html><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#host{width:4096px;height:2560px}</style><div id="host"></div>');
  const output=resolve(root,'src/assets/mobile-stills/venues');await mkdir(output,{recursive:true});
  const manifest={version:1,width:4096,height:2560,views:{}};
  for(const venue of ['store','cafe']){
    await page.evaluate(async venue=>{const host=document.querySelector('#host');const module=await import(venue==='store'?'/src/lib/convenienceStore3D.ts':'/src/lib/cafeRoom3D.ts');window.room=venue==='store'?module.createStoreRoom(host,{night:false,quality:'fine',renderScale:1}):module.createCafeRoom(host,{night:false,linPresent:false,quality:'fine',renderScale:1});await window.room.ready;},venue);
    for(let angle=0;angle<4;angle++)for(const night of [false,true]){
      for(const doorOpen of [false,true]){
        const name=`${venue}-${angle}-${night?'night':'day'}-${doorOpen?'open':'closed'}`;
        const result=await page.evaluate(request=>window.room.captureStill(request),{angle,night,doorOpen});
        await writeFile(resolve(output,`${name}.webp`),Buffer.from(result.data.split(',')[1],'base64'));
        manifest.views[name]={file:`${name}.webp`,width:result.width,height:result.height,points:result.points};
        console.log(name);
      }
      if(venue==='cafe')for(const layer of ['lin','stool']){
        const name=`${venue}-${angle}-${night?'night':'day'}-${layer}`;
        const result=await page.evaluate(request=>window.room.captureStill(request),{angle,night,doorOpen:false,layer});
        await writeFile(resolve(output,`${name}.webp`),Buffer.from(result.data.split(',')[1],'base64'));
        manifest.views[name]={file:`${name}.webp`,width:result.width,height:result.height,rect:result.rect};console.log(name);
      }
    }
    await page.evaluate(()=>{window.room.dispose();delete window.room;});
  }
  await writeFile(resolve(output,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);console.log(`Saved ${Object.keys(manifest.views).length} clean scene images`);
}finally{await browser?.close();await server.close();}
