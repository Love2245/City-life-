import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const base=process.env.QA_URL??'http://127.0.0.1:1427',quality=process.env.OFFICE_QA_QUALITY??'light';
const out=path.resolve('docs/office-remaster-1497-20261024/office-performance');
const runtime='C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const imported=await import(pathToFileURL(runtime).href),chromium=imported.chromium??imported.default.chromium;
const browser=await chromium.launch({executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
const results=[],errors=[];
try{
  for(const stage of [1,4])for(const version of ['before','after']){
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    page.on('pageerror',error=>errors.push({version,stage,message:error.message}));
    await page.route(`${base}/`,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}#office-probe{width:100vw;height:100vh}</style><div id="office-probe"></div>'}));
    await page.goto(`${base}/`);
    const result=await page.evaluate(async options=>{const {runOfficeProbe}=await import('/docs/office-remaster-1497-20261024/office-performance/harness.ts');return runOfficeProbe(options);},{version,stage,quality});
    results.push(result);
    console.log(`${version} stage${stage}: construction=${result.constructionMs.toFixed(1)}ms firstPresented=${result.firstPresentedMs.toFixed(1)}ms calls/frame=${result.typicalFrame?.calls??0} idle=${result.idle.frames} frames status geometryDisposals=${result.status.geometryDisposals} computersAdded=${result.status.computersAdded}`);
    await page.close();
  }
}finally{await browser.close();}
const checks=results.flatMap(result=>[
  {id:`${result.version}-stage${result.stage}-cleanup`,passed:result.dispose.canvasRemoved&&result.dispose.after.drawCalls===0&&result.dispose.contexts.every(context=>context.contextLost)},
  ...(result.version==='after'?[
    {id:`after-stage${result.stage}-real-ready`,passed:result.readyHasPopulatedDraw},
    {id:`after-stage${result.stage}-idle-no-drawing`,passed:result.idle.frames===0&&result.idle.drawCalls===0},
    {id:`after-stage${result.stage}-clock-keeps-equipment`,passed:result.clock.geometryDisposals===0&&result.clock.computersAdded===0&&result.clock.objectsAdded===0},
    {id:`after-stage${result.stage}-status-keeps-equipment`,passed:result.status.geometryDisposals===0&&result.status.computersAdded===0&&result.status.objectsAdded===0},
  ]:[]),
]);
const report={createdAt:new Date().toISOString(),base,quality,renderer:'Chrome headless SwiftShader; WebGL draw-call interception across all render passes; diagnostic desktop fixture, not physical-device performance',results,checks,errors,passed:results.length===4&&errors.length===0&&checks.every(check=>check.passed)};
await mkdir(out,{recursive:true});await writeFile(path.join(out,`verification-${quality}.json`),JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
