/** Reproducible before/after review of the production employee geometry. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'docs/mobile-stills-company-return-1497-20261024/workers');
mkdirSync(out, { recursive: true });
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;padding:20px 24px;background:#d9dfdc;color:#34473f;font:14px system-ui}h1{margin:0 0 6px;font-size:24px}p{margin:0 0 15px}h2{font-size:16px;margin:12px 0 7px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}section{background:#edf0e8;border-radius:12px;overflow:hidden;text-align:center}canvas{display:block;width:100%;height:auto}label{display:block;padding:8px;font-weight:600}footer{margin-top:15px;font-size:12px}</style></head><body>
<h1>都市生活 1.49.7 · 员工坐姿公仔重制</h1><p>同一相机、同一照明、生产工厂原始比例；保留头套与稳定外观，不生成主角模型。</p>
<h2>修改前</h2><main id="before"></main><h2>修改后</h2><main id="after"></main><footer>五种头套 · 宽肩圆润衣服 · 自然长袖打字姿态 · 现代休闲鞋 · 共享几何与材质缓存</footer>
<script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {createOfficeFurniture as beforeFactory} from '/docs/mobile-stills-company-return-1497-20261024/before/src/lib/companyOfficeFurniture.ts';
import {createOfficeFurniture as afterFactory} from '/src/lib/companyOfficeFurniture.ts';
const names=['纸袋','猫','狐狸','熊','易拉罐'],out=[];
for(const [version,make] of [['before',beforeFactory],['after',afterFactory]]){
 const factory=make();
 for(let i=0;i<5;i++){
  const section=document.createElement('section');document.getElementById(version).append(section);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#edf0e8');
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(268,330);renderer.setPixelRatio(1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  section.append(renderer.domElement);const label=document.createElement('label');label.textContent=names[i];section.append(label);
  scene.add(new THREE.HemisphereLight('#fff8e7','#7e9287',2.0));const sun=new THREE.DirectionalLight('#fff9ef',2.4);sun.position.set(-3,5,-4);scene.add(sun);
  const model=factory.worker(i,3);scene.add(model);model.position.y=-.83;
  const camera=new THREE.PerspectiveCamera(31,268/330,.01,100);camera.position.set(.90,.80,-3.55);camera.lookAt(0,0,0);
  renderer.render(scene,camera);const bounds=new THREE.Box3().setFromObject(model,true);let meshes=0,triangles=0;
  model.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  out.push({version,type:names[i],meshes,triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}});
 }
}
window.previewResults=out;window.previewReady=true;
</script></body></html>`;
const server = await createServer({ root, configFile: false, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 1433, strictPort: true },
  plugins: [{ name: 'employee-comparison-preview', configureServer(value) {
    value.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/__workers')) return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml);
    });
  } }],
});
const pw = await import(pathToFileURL('C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js').href);
let browser;const errors=[];
try {
 await server.listen();browser=await (pw.chromium??pw.default.chromium).launch({headless:true,
 executablePath:join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'),
 args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:920}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:1433/__workers');await page.waitForFunction(()=>window.previewReady,{timeout:60000});
 const models=await page.evaluate(()=>window.previewResults);assert.equal(errors.length,0,errors.join('\n'));assert.equal(models.length,10);
 for(const model of models.filter(m=>m.version==='after')){assert.ok(model.meshes<=11);assert.ok(model.triangles<20000);}
 await page.screenshot({path:join(out,'before-after-workers.png'),fullPage:true});
 writeFileSync(join(out,'verification.json'),JSON.stringify({passed:true,models,errors},null,2));
 console.log(JSON.stringify({passed:true,screenshot:join(out,'before-after-workers.png'),after:models.filter(m=>m.version==='after')}));
}finally{await browser?.close();await server.close();}
