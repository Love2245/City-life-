/** Small isolated model preview: real library GLBs and production furniture. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'docs/company-commute-headgear-1497-20261024/headgear');
const library = 'G:/都市生活/素材库/外部游戏参考素材/Manaka_场景与物件_20261018';
const references = [
  { name: 'Can · LOD1', path: '02_便利店/独立物件/SM_Can_01_LOD1__e00685a973d9.glb' },
  { name: 'Packaging · LOD2', path: '02_便利店/独立物件/SM_Maskbag_01_LOD2__96af18d6472b.glb' },
  { name: 'Door 03 · panel', path: '01_公寓与家居/独立物件/door03__c2c3772d690a.glb' },
  { name: 'Door 03 · frame', path: '01_公寓与家居/独立物件/door03_frame__55ace47d35a1.glb' },
  { name: 'Door 03 · handle', path: '01_公寓与家居/独立物件/door03_handle__69d327bd5718.glb' },
  { name: 'Door 02 · panel', path: '01_公寓与家居/独立物件/door02_door__44beba7bfc0e.glb' },
  { name: 'Cafe · glass door', path: '03_车站前商业街/独立物件/Cafe_Door_LOD0__5adf56c8d230.glb' },
  { name: 'Front door · 04', path: '03_车站前商业街/独立物件/Front_Door_04_LOD0__f72d1673109d.glb' },
  { name: 'Clothing store · door', path: '06_服装店/独立物件/door__3fd04808b3d6.glb' },
];
mkdirSync(out, { recursive: true });
const source = references.map(reference => {
  const file = join(library, reference.path), bytes = readFileSync(file);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  return { ...reference, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    materialNames: json.materials?.map(material => material.name),
    url: `/@fs/${file.replaceAll('\\', '/')}` };
});
const pageHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#d9ded9;color:#35453f;font:16px system-ui}h1{font-size:24px;margin:22px 32px 8px}p{margin:0 32px 15px;font-size:14px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:0 24px}main.reference{grid-template-columns:repeat(3,1fr)}section{text-align:center;background:#eef0e8;border-radius:12px;overflow:hidden}canvas{display:block;width:100%}label{display:block;padding:14px;font-weight:600}section p{font-size:12px}footer{margin:18px 32px;font-size:13px}</style></head><body><h1></h1><p id="note"></p><main></main><footer>都市生活 1.49.7 · isolated production-model preview</footer><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { createOfficeFurniture, OFFICE_HEADGEAR } from '/src/lib/companyOfficeFurniture.ts';
const refs=${JSON.stringify(source)}, reference=location.search.includes('reference');
document.querySelector('h1').textContent=reference?'外部素材库 · 实际 GLB 参考':'公司员工 · 五种头套';
document.querySelector('#note').textContent=reference?'实际读取库内模型与共享贴图。保留原始比例，按高度归一化用于观察结构。':'生产家具工厂直接生成；纸袋、猫、狐狸、熊、易拉罐。头套取代真人头脸，全部无外部贴图。';
const main=document.querySelector('main');if(reference)main.classList.add('reference');
const factory=createOfficeFurniture(), loader=new GLTFLoader(), outputs=[];
const selected=reference?refs:OFFICE_HEADGEAR.map((headgear,index)=>({name:headgear,index}));
for(const info of selected){
  const block=document.createElement('section');main.append(block);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#eef0e8');
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(reference?456:268,reference?320:400);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  block.append(renderer.domElement);const label=document.createElement('label');label.textContent=info.name;block.append(label);
  scene.add(new THREE.HemisphereLight('#fff8df','#7e9287',2.3));const key=new THREE.DirectionalLight('#fff9ee',2.8);key.position.set(-3,5,-4);scene.add(key);
  const model=reference?(await loader.loadAsync(info.url)).scene:factory.worker(info.index,3);
  model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model,true),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  let triangles=0,meshes=0;model.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  const pivot=new THREE.Group();pivot.add(model);scene.add(pivot);
  if(reference){const scale=1.7/Math.max(size.x,size.y,size.z);model.position.sub(center);pivot.scale.setScalar(scale);}else model.position.y=-.83;
  const camera=new THREE.PerspectiveCamera(reference?32:32,(reference?456:268)/(reference?320:400),.01,100);
  camera.position.set(reference?2.15:1.35,reference?1.2:1.0,reference?3.2:-3.8);camera.lookAt(0,reference?0:.05,0);
  renderer.render(scene,camera);outputs.push({name:info.name,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:size.toArray()},meshes,triangles,drawCalls:renderer.info.render.calls,headgear:model.userData.headgear});
}
window.previewResults=outputs;window.previewReady=true;
</script></body></html>`;
const server = await createServer({ root, configFile: false, appType: 'custom',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 1431, strictPort: true, fs: { allow: [root, library] } },
  plugins: [{ name: 'isolated-headgear-preview', configureServer(value) {
    value.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/__headgear')) return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');res.end(pageHtml);
    });
  } }],
});
const pw = await import(pathToFileURL('C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js').href);
let browser;
const report = { sources: source, baselineWorkers: [], previews: [], passed: false };
try {
  await server.listen();
  const prior = await server.ssrLoadModule('/docs/company-commute-headgear-1497-20261024/before/src/lib/companyOfficeFurniture.ts');
  const priorFactory = prior.createOfficeFurniture();
  try {
    for (let index = 0; index < 5; index++) {
      const worker = priorFactory.worker(index, 3);let meshes = 0, triangles = 0;
      worker.traverse(item => { if (item.isMesh) { meshes++;triangles += (item.geometry.index?.count ?? item.geometry.attributes.position.count) / 3; } });
      report.baselineWorkers.push({ index, meshes, triangles });
    }
  } finally { priorFactory.dispose(); }
  browser = await (pw.chromium ?? pw.default.chromium).launch({ headless: true,
    executablePath: join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'] });
  for (const reference of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: reference ? 1320 : 620 } });
    const errors = [];page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:1431/__headgear${reference ? '?reference' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.previewReady, { timeout: 60000 });
    const models = await page.evaluate(() => window.previewResults);
    assert.equal(errors.length, 0, errors.join('\n'));assert.equal(models.length, reference ? references.length : 5);
    const screenshot = reference ? 'library-reference.png' : 'five-headgear.png';
    await page.screenshot({ path: join(out, screenshot) });report.previews.push({ reference, models, errors, screenshot });
    await page.close();
  }
  report.passed = true;
} finally {
  await browser?.close();await server.close();
  writeFileSync(join(out, 'verification.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
