import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const {chromium}=playwright;
const root=resolve(import.meta.dirname,'..'),out=join(root,'src/assets/mobile-stills/home');await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
try{
const page=await browser.newPage({viewport:{width:4096,height:3072}});page.setDefaultTimeout(300000);
page.on('pageerror',e=>console.error('PAGE',e.message));
let count=0,bytes=0;
await page.exposeFunction('emitHomeAsset',async(name,data)=>{const dest=join(out,name);await mkdir(resolve(dest,'..'),{recursive:true});const buffer=Buffer.from(data,'base64');await writeFile(dest,buffer);count++;bytes+=buffer.length;});
await page.goto('http://127.0.0.1:1431/scripts/home-stills-baker.html');await page.waitForFunction(()=>!!window.bakeHome);
const ids=await page.evaluate(()=>window.homeBakeIds),aliases=await page.evaluate(()=>window.homeBakeAliases),manifest={version:2,width:4096,height:3072,aliases,homes:{}};
try{Object.assign(manifest.homes,JSON.parse(await readFile(join(out,'manifest.json'),'utf8')).homes);}catch{}
for(const id of ids.filter(id=>!process.env.HOME_BAKE_IDS||process.env.HOME_BAKE_IDS.split(',').includes(id))){
 const checkpoint=join(out,`${id}.json`);let existing;try{existing=JSON.parse(await readFile(checkpoint,'utf8'));}catch{}
 if(existing&&process.env.HOME_BAKE_FULL!=='1'){manifest.homes[id]=existing;if(process.env.HOME_BAKE_WALLS==='1'&&!existing.fixed){console.log('REFRESH WALLS',id);manifest.homes[id]=await page.evaluate(({id,existing})=>window.bakeHome(id,existing),{id,existing});await writeFile(checkpoint,JSON.stringify(manifest.homes[id]));}else console.log('REUSE',id);continue;}
 console.log('BAKE',id);manifest.homes[id]=await page.evaluate(id=>window.bakeHome(id),id);await writeFile(checkpoint,JSON.stringify(manifest.homes[id]));console.log('DONE',id,count,Math.round(bytes/1024)+'KiB');
}
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest));console.log('COMPLETE',ids.length,count,bytes);
}finally{await browser.close();}


