/** 在隔离 Chrome 上验收正式游戏路由。只在进入前写合法存档，进入后通过真实 UI 操作。 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,process.env.QA_OUT||'docs/company-1497-20261024/browser');mkdirSync(out,{recursive:true});
const reportFile=join(out,process.env.QA_CASES?'subset-verification.json':'verification.json');
const runtime=process.env.QA_PW||'C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const playwright=await import(pathToFileURL(runtime).href),chromium=playwright.chromium??playwright.default?.chromium;
const chrome=process.env.QA_CHROME||join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe');assert(existsSync(chrome));
const fixtureServer=await createServer({root,configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;
try{api={...await fixtureServer.ssrLoadModule('/src/game/core/state.ts'),...await fixtureServer.ssrLoadModule('/src/game/core/company.ts'),...await fixtureServer.ssrLoadModule('/src/game/core/time.ts'),...await fixtureServer.ssrLoadModule('/src/game/core/calendar.ts')};}finally{await fixtureServer.close();}
const stages=[{capacity:3,location:'dev_incubator',region:'campus_teacher'},{capacity:6,location:'company_office_single',region:'downtown_commercial'},{capacity:10,location:'company_office_large',region:'downtown_commercial'},{capacity:16,location:'company_office_floor',region:'downtown_commercial'}];
function fixture(stage){
  const s=api.createInitialState(1497+stage);s.mode='eternal';s.player.money=1e6;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory={total:75,byType:{home_design:75},migrated:true};
  s.player.skills.programming=s.player.skills.design=3;s.tutorial={done:['eat','work','sleep'],activeStep:-1};s.flags.item_laptop_mid=true;
  assert(api.registerCompany(s,'青禾数字工作室').ok);s.company.stage=stage;s.locationId='electronics_store';
  assert(api.buyCompanyComputers(s,'low',Math.ceil(stages[stage-1].capacity/3)).ok);assert(api.buyCompanyComputers(s,'mid',Math.ceil(stages[stage-1].capacity/3)).ok);assert(api.buyCompanyComputers(s,'high',Math.ceil(stages[stage-1].capacity/3)).ok);
  s.locationId=stages[stage-1].location;assert(api.assignCompanyComputer(s,s.company.computers.at(-1).id,'founder').ok);
  while(s.company.employees.length+1<stages[stage-1].capacity){api.interviewCompany(s);for(const c of s.company.candidates){if(s.company.employees.length+1>=stages[stage-1].capacity)break;assert(api.hireCompanyEmployee(s,c.id).ok);}if(s.company.employees.length+1<stages[stage-1].capacity)api.advanceHours(s,24,false,true);}
  while(api.weekdayOf(s.time)>=5||s.time.hour!==10)api.advanceHours(s,s.time.hour>=10?34-s.time.hour:10-s.time.hour,false,true);
  s.company.balanceCents=5000000;s.company.royaltyCents=stage===4?2100000:120000;s.company.maintenance=12;
  assert(api.startCompanyProject(s,'programming','工具软件',stage>=3?'large':stage===2?'medium':'small',true).ok);assert(api.startCompanyProject(s,'design','界面设计',stage>=3?'large':'small',true).ok);
  s.company.employees.forEach((e,i)=>api.assignCompanyEmployee(s,e.id,['programming','design','maintenance'][i%3]));
  Object.assign(s,{locationId:stages[stage-1].location,region:stages[stage-1].region,area:stages[stage-1].region,navStack:['map',stages[stage-1].region]});
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,hygiene:100,satiety:100});return s;
}
const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage']});
const report={url:process.env.QA_URL||'http://127.0.0.1:1427/',browser:browser.version(),policy:'Startup fixtures only; actual production route, real UI clicks, no live gameState injection.',scenarios:[],passed:false};
const cases=[...stages.map((_,i)=>({id:`pc-3d-${i+1}`,stage:i+1,mode:'pc',scene:'3d',width:1440,height:900,zoom:1})),
  ...stages.map((_,i)=>({id:`phone-3d-${i+1}`,stage:i+1,mode:'pe',scene:'3d',width:852,height:393,zoom:.7})),
  {id:'pc-flat-zoom',stage:4,mode:'pc',scene:'flat',width:1440,height:900,zoom:1.25},
  {id:'phone-flat-safe',stage:4,mode:'pe',scene:'flat',width:852,height:393,zoom:1},
  {id:'phone-portrait',stage:1,mode:'pe',scene:'flat',width:393,height:852,zoom:.7}];
try{
  for(const spec of cases){
    if(process.env.QA_CASES&&!process.env.QA_CASES.split(',').includes(spec.id))continue;
    const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},hasTouch:spec.mode==='pe',deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(30000);
    const result={...spec,errors:[],checks:[],screenshots:[],modelRequests:[],passed:false};report.scenarios.push(result);
    page.on('request',request=>{if(/\.(?:glb|gltf)(?:\?|$)|\/(?:companyOffice3D|homeRoom3D|cafeRoom3D|convenienceStore3D|GLTFLoader)\./.test(request.url()))result.modelRequests.push(request.url());});
    await page.addInitScript(()=>{window.__sceneGpuRequests=[];const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/i.test(kind))window.__sceneGpuRequests.push(kind);return original.call(this,kind,...args);};});
    page.on('pageerror',error=>result.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
    await page.addInitScript(({save,spec})=>{if(sessionStorage.getItem('company-qa'))return;sessionStorage.setItem('company-qa','1');localStorage.clear();localStorage.setItem('urban-life-device-setup-v1','1');localStorage.setItem('urban-life-ui-gamemode',spec.mode);localStorage.setItem('urban-life-pe-zoom-v3','1');localStorage.setItem('urban-life-ui-zoom',String(spec.zoom));localStorage.setItem('urban-life-show-log','false');localStorage.setItem('urban-life-scene-mode',spec.scene);localStorage.setItem('urban_life_save_auto',JSON.stringify(save));},{save:fixture(spec.stage),spec});
    try{
      await page.goto(report.url,{waitUntil:'load',timeout:120000});
      if(await page.getByRole('button',{name:'关闭公告',exact:true}).isVisible().catch(()=>false))await page.getByRole('button',{name:'关闭公告',exact:true}).click();
      await page.getByRole('button',{name:/继续生活/}).click();
      if(spec.id==='phone-portrait'){await page.locator('.mobile-portrait-block').waitFor();result.checks.push({portraitHint:true});await page.screenshot({path:join(out,`${spec.id}.png`)});result.screenshots.push(`${spec.id}.png`);assert.equal(result.errors.length,0,result.errors.join('\n'));result.passed=true;continue;}
      await page.locator('[data-company-office]').waitFor();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:60000});
      if(spec.scene==='3d'){assert.equal(await page.locator('.office canvas').count(),1);assert.equal(await page.locator('.labels [data-office-seat]').count(),stages[spec.stage-1].capacity);}
      else assert.equal(await page.locator('.flat-plan [data-office-seat]').count(),stages[spec.stage-1].capacity);
      if(spec.id.includes('safe'))await page.addStyleTag({content:':root{--sai-left:35px!important;--sai-right:35px!important;--sai-top:12px!important;--sai-bottom:12px!important}'});
      const snapshot=async(label)=>{const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,panel:(()=>{const p=document.querySelector('.company-panel');if(!p)return null;const r=p.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,overflow:p.scrollWidth-p.clientWidth};})(),workstations:document.querySelectorAll('.office [data-office-seat]').length}));result.checks.push({label,...metrics});assert(metrics.overflow<=2,`${label}: page horizontal overflow`);if(metrics.panel){assert(metrics.panel.x>=0&&metrics.panel.y>=0&&metrics.panel.right<=spec.width+2&&metrics.panel.bottom<=spec.height+2,`${label}: panel outside viewport`);assert(metrics.panel.overflow<=2,`${label}: panel horizontal overflow`);}const file=`${spec.id}-${label}.png`;await page.screenshot({path:join(out,file),animations:'disabled'});result.screenshots.push(file);};
      await snapshot('office');await page.locator('.office .manage').click();await page.locator('[aria-label="公司经营面板"]').waitFor();await snapshot('overview');
      for(const tab of ['项目','员工','面试','设备','财务']){await page.locator('.company-panel nav').getByRole('button',{name:new RegExp(`^${tab}`)}).click();await snapshot(tab);}
      await page.getByRole('button',{name:'关闭公司经营面板'}).click();
      if(spec.mode!=='pc'&&spec.scene==='3d'){
        const world=page.locator('[data-company-renderer="stills"]');await world.waitFor();
        const layers=Number(await world.getAttribute('data-still-layers'));assert.equal(layers,stages[spec.stage-1].capacity*2-1,'实际电脑和在场员工分别叠加，主角没有人物层');
        const positions=[];
        for(let angle=0;angle<4;angle++){
          await page.waitForFunction(angle=>document.querySelector('[data-company-renderer]')?.dataset.companyStillAngle===String(angle),angle);
          positions.push(await page.locator('.labels [data-office-seat]').evaluateAll(nodes=>nodes.map(node=>[node.style.left,node.style.top])));
          await page.locator('.labels [data-office-seat="0"]').click();await page.locator('[aria-label="公司经营面板"]').waitFor();await page.getByRole('button',{name:'关闭公司经营面板'}).click();
          await snapshot(`fixed-angle-${angle}`);
          if(angle<3)await page.getByRole('button',{name:'向右旋转90度',exact:true}).click();
        }
        assert.equal(new Set(positions.map(p=>JSON.stringify(p))).size,4,'四方向使用各自的设施定位');
        await page.getByRole('button',{name:'复位视角',exact:true}).click();
        await page.waitForFunction(()=>document.querySelector('[data-company-renderer]')?.dataset.companyStillAngle==='0');
        await page.getByRole('button',{name:'画面设置',exact:true}).click();assert.match(await page.getByLabel('场景显示',{exact:true}).innerText(),/固定视角/);assert.equal(await page.getByLabel('办公室画质',{exact:true}).count(),0);await page.getByRole('button',{name:'关闭画面设置',exact:true}).click();
        // Change the real equipment assignment; rendering must follow without mounting a GPU scene.
        await page.locator('.office .manage').click();await page.locator('.company-panel nav').getByRole('button',{name:'设备',exact:true}).click();
        const assigned=page.locator('.company-panel .content select').first();const previous=await assigned.inputValue();await assigned.selectOption('');
        await page.waitForFunction(count=>Number(document.querySelector('[data-company-renderer]')?.dataset.stillLayers)===count,layers-1);
        await assigned.selectOption(previous);await page.waitForFunction(count=>Number(document.querySelector('[data-company-renderer]')?.dataset.stillLayers)===count,layers);
        await page.getByRole('button',{name:'关闭公司经营面板'}).click();
        await page.locator('[data-office-door]').click();await page.locator('[data-company-return-home]').waitFor();await snapshot('door-home-route');await page.getByRole('button',{name:'收起',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>window.__sceneGpuRequests),[],'手机整段流程不得申请WebGL');assert.deepEqual(result.modelRequests,[],'手机不得载入3D模块或GLB');
        result.checks.push({mobileStill:{fourAngles:true,hotspotsFollowCamera:true,founderHidden:true,actualEquipmentAndPeople:true,assignmentUpdatesImage:true,webglRequests:0,modelRequests:0}});
      }
      if(process.env.QA_CONTROLS==='1'&&spec.id==='pc-3d-1'){
        const labels=()=>page.locator('.labels [data-office-seat]').evaluateAll(nodes=>nodes.map(n=>({left:n.style.left,top:n.style.top})));
        const before=await labels();await page.getByRole('button',{name:'向左旋转90度',exact:true}).click();await page.waitForTimeout(350);assert.notDeepEqual(await labels(),before);await snapshot('rotate');
        await page.getByRole('button',{name:'复位视角',exact:true}).click();await page.getByRole('button',{name:'画面设置',exact:true}).click();
        await page.getByLabel('办公室画质',{exact:true}).selectOption('light');await page.getByRole('button',{name:'70%',exact:true}).click();
        await page.getByLabel('住宅墙体显示',{exact:true}).selectOption('full');await page.getByRole('button',{name:'关闭画面设置',exact:true}).click();await snapshot('full-walls');
        await page.getByRole('button',{name:'画面设置',exact:true}).click();await page.getByLabel('住宅墙体显示',{exact:true}).selectOption('low');
        await page.getByLabel('场景显示',{exact:true}).selectOption('flat');await page.locator('.flat-plan').waitFor();await page.waitForFunction(()=>document.querySelectorAll('.office').length===1);assert.equal(await page.locator('.flat-plan [data-office-seat]').count(),3);
        await page.getByRole('button',{name:'画面设置',exact:true}).click();await page.getByLabel('场景显示',{exact:true}).selectOption('3d');await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelectorAll('.office').length===1);await page.locator('.office canvas').waitFor();assert.equal(await page.locator('.office canvas').count(),1);await snapshot('reload-after-flat');
        result.checks.push({controls:{rotate:true,reset:true,quality:true,resolution:true,fullAndLowWalls:true,flatAnd3dReload:true}});
      }
      if(spec.id==='pc-3d-1'){const stateBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));await page.reload({waitUntil:'load'});await page.getByRole('button',{name:/继续生活/}).click();await page.locator('.office canvas').waitFor();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden'});const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));assert.deepEqual(after.company,stateBefore.company);result.checks.push({reloadNoSettlement:true});}
      assert.equal(result.errors.length,0,result.errors.join('\n'));result.passed=true;
    }catch(error){result.failure=error.stack;await page.screenshot({path:join(out,`${spec.id}-failure.png`)}).catch(()=>{});throw error;}
    finally{writeFileSync(reportFile,JSON.stringify(report,null,2));await context.close();}
    process.stdout.write(`${spec.id}: passed\n`);
  }
  report.passed=report.scenarios.every(s=>s.passed);assert(report.passed);
}finally{try{await browser.close();}catch(error){report.passed=false;report.cleanupError=String(error);throw error;}finally{report.exitCodeAtCompletion=process.exitCode??0;writeFileSync(reportFile,JSON.stringify(report,null,2));}}
process.stdout.write(`Browser verification complete: ${report.scenarios.length} scenarios, ${report.scenarios.flatMap(s=>s.errors).length} runtime errors.\n`);
