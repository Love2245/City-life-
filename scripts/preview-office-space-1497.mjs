import {mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/office-space-1497-20261027');
mkdirSync(out,{recursive:true});
const web=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1437,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await web.listen();
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={passed:false,errors:[],views:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(180000);
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('http://127.0.0.1:1437/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>负责人办公室模型实景</title><style>body{margin:0;overflow:hidden}canvas{display:block}</style>'}));
  await page.goto('http://127.0.0.1:1437/');
  for(const stage of [3,4]){
    const metadata=await page.evaluate(async stage=>{
      const THREE=await import('/node_modules/three/build/three.module.js');
      const {buildCompanyOffice}=await import('/src/lib/companyOffice3D.ts');
      const {COMPANY_OFFICES}=await import('/src/game/core/companyOffice.ts');
      const {officeLightScheme}=await import('/src/lib/officeLighting.ts');
      window.__previewCleanup?.();
      const plan=COMPANY_OFFICES[stage-1],model=buildCompanyOffice(plan),light=officeLightScheme(12,9,'sunny');
      model.update(plan.desks.map((_,index)=>({index,personId:index?'':'founder',name:'',tier:index?undefined:'high',status:'',present:false,stars:0})));model.setLighting(light);
      const scene=new THREE.Scene();scene.background=new THREE.Color(light.background);scene.add(model.root);
      const focus=new THREE.Vector3(stage===4?3.1:2.5,.75,stage===4?2.85:2.45),direction=new THREE.Vector3(.48,1.1,1.1).normalize();
      const camera=new THREE.OrthographicCamera(-4.3,4.3,2.8667,-2.8667,.1,100);camera.position.copy(focus).addScaledVector(direction,25);camera.lookAt(focus);camera.updateMatrixWorld(true);
      for(const wall of model.walls)wall.group.scale.y=wall.normal.dot(direction)<0?.65/2.8:1;
      const sky=new THREE.HemisphereLight(light.skyColor,'#a19b83',light.ambientIntensity),sun=new THREE.DirectionalLight(light.sunColor,light.sunIntensity);
      sun.position.set(-4,12,-4);sun.target.position.copy(focus);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-10;sun.shadow.camera.right=sun.shadow.camera.top=10;sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;scene.add(sky,sun,sun.target);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,960);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),0),new THREE.Plane(new THREE.Vector3(-1,0,0),stage===4?6.2:5),new THREE.Plane(new THREE.Vector3(0,0,1),0),new THREE.Plane(new THREE.Vector3(0,0,-1),stage===4?5.7:4.8)];
      document.body.replaceChildren(renderer.domElement);renderer.render(scene,camera);
      window.__previewCleanup=()=>{model.dispose();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();};
      const suite=model.root.getObjectByName('founder-office-suite');model.root.updateMatrixWorld(true);
      return{stage,desk:model.workstations[0].getObjectByName('office-executive-desk').userData.parts,visitorChairs:suite.children.filter(o=>o.name==='office-ergonomic-chair').length,bounds:[model.workstations[0],...suite.children].map(o=>{const b=new THREE.Box3().setFromObject(o,true);return{name:o.name,min:b.min.toArray(),max:b.max.toArray()};})};
    },stage);
    const file=`founder-office-${stage}.png`;await page.screenshot({path:join(out,file)});report.views.push({file,...metadata});console.log(file);
  }
  if(report.errors.length)throw Error(report.errors.join('\n'));report.passed=true;
}finally{writeFileSync(join(out,'founder-previews.json'),JSON.stringify(report,null,2));await browser.close();await web.close();}
