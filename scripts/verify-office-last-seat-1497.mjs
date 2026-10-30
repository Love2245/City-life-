import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),url=process.env.QA_URL??'http://127.0.0.1:1433/';
const out=resolve(process.env.QA_OUT??'docs/company-simplification-1497-20261027/browser-current');mkdirSync(out,{recursive:true});
let web;
if(!process.env.QA_URL){web=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1433,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await web.listen();}
const ssr=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;try{api=Object.assign({},...await Promise.all(['state','company','companyConfig','companyPersonnel','companyOffice','calendar'].map(name=>ssr.ssrLoadModule('/src/game/core/'+name+'.ts'))));}finally{await ssr.close();}

function fixture(stage,kind='office'){
  const s=api.createInitialState(149727);s.mode='eternal';s.player.money=100000;
  Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+100),{hour:10,minute:0});
  Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100,hygiene:100});s.player.skills.programming=s.player.skills.design=10;
  s.developmentHistory.total=kind==='simple'?10:(api.companyStage(stage).capacity-1)*5;s.developmentHistory.byType={home_design:3,personal_programming_order:2};s.locationId='municipal_hall';
  s.tutorial={done:['eat','work','sleep'],activeStep:-1};assert(api.registerCompany(s,'青禾工作室',Math.min(stage,2)).ok);
  const c=s.company;c.stage=stage;c.balanceCents=1000000;c.depositCents=api.companyStage(stage).rent*100;c.growthPoints=7000;c.recruitmentFloor=15;
  c.fundingPolicy={enabled:false,reserveCents:300000,monthlyLimitCents:500000,usedCents:0,monthKey:s.time.year*12+s.time.month-1};
  c.computers=[{id:'pc-founder',tier:'high',costCents:650000,assignee:'founder',seatIndex:0}];
  s.locationId=api.companyStage(stage).location;s.area=s.region=api.companyStage(stage).region;
  if(kind==='closure'){
    s.locationId='municipal_hall';s.region=s.area='downtown_commercial';c.balanceCents=0;c.nextRentDay=100;c.royaltyCents=0;s.player.money=0;
    c.liabilities=[{id:'late-rent',kind:'rent',amountCents:160000,dueDay:100}];return s;
  }
  if(kind==='simple'){
    c.balanceCents=0;s.player.money=0;c.royaltyCents=0;c.growthPoints=0;c.recruitmentFloor=1;
    for(let i=1;i<=3;i++)c.computers.push({id:'pc-vacant-'+i,tier:'high',costCents:650000,assignee:null,seatIndex:i});
    Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+101),{hour:12,minute:0});api.processCompany(s);
    assert(api.startCompanyProject(s,'programming','工具软件','small',false,'contract').ok);c.programming.progress=20;
    assert(api.startCompanyProject(s,'design','平面设计','small',false,'contract').ok);c.design.progress=25;
    s.weather.id='sunny';s.navStack=['map',s.region];return s;
  }
  c.royaltyCents=api.companyStage(stage).cap*100;
  const count=api.companyStage(stage).capacity-1;
  for(let i=0;i<count;i++){
    const e={id:'employee-'+i,name:'员工'+String.fromCharCode(65+i),programming:3,design:5,stars:3,quoteFactor:1,salaryCents:300000,hired:true,role:i===0?'maintenance':'design',secondaryRole:i===0?'design':'idle',seatIndex:i+1,joinedMinute:c.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:86,nextLeaveDay:i===0?101:999,leaveDays:[],requests:{}};
    if(i===0){e.programming=10;e.salaryCents=200000;e.underpaidDays=13;e.stars=5;}
    c.employees.push(e);c.computers.push({id:'pc-'+i,tier:i%3===1?'mid':'high',costCents:i%3===1?150000:650000,assignee:e.id,seatIndex:i+1});
  }
  assert(api.startCompanyProject(s,'programming','工具软件','small',false,'contract').ok);
  assert(api.startCompanyProject(s,'design','品牌视觉','small',true,'contract').ok);
  Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+101),{hour:12,minute:0});api.processCompany(s);
  if(kind==='finance'){c.balanceCents=500000;s.player.money=5000;}
  s.weather.id='sunny';s.weather.lastRollDay=api.gameDay(s.time);s.navStack=['map',s.region];return s;
}
const officeCases=[1,2,3,4].flatMap(stage=>[{id:`pc-stage-${stage}-3d`,stage,mode:'pc',scene:'3d',w:1440,h:900},{id:`pe-stage-${stage}-2d`,stage,mode:'pe',scene:'2d',w:932,h:430}]);
const cases=[{id:'pc-finance',stage:2,mode:'pc',scene:'3d',w:1392,h:896,kind:'finance'},{id:'pc-tour',stage:2,mode:'pc',scene:'3d',w:1392,h:896,kind:'tour'},{id:'pe-tour',stage:2,mode:'pe',scene:'2d',w:932,h:430,kind:'tour'},{id:'pc-simple',stage:2,mode:'pc',scene:'3d',w:1392,h:896,kind:'simple'},{id:'pe-simple',stage:2,mode:'pe',scene:'2d',w:932,h:430,kind:'simple'},...officeCases,{id:'pc-closure',stage:1,mode:'pc',scene:'2d',w:1440,h:900,kind:'closure'}];
const selected=process.env.QA_CASES?.split(',');
const report={createdAt:new Date().toISOString(),url,passed:false,fixtureBoundary:'Controlled saved companies; employee notices are generated by actual processCompany. These are UI/renderer journeys, not a complete natural-play economy run.',scenarios:[]};
async function checkCamera(page,result,shot){
  const host=page.locator('[data-office-camera-limits]').first();await host.waitFor();const size=page.viewportSize();
  for(let i=0;i<8;i++){await page.mouse.move(size.width*.68,size.height*.76);await page.mouse.down();await page.mouse.move(size.width*.1,size.height*.18,{steps:8});await page.mouse.up();}
  await page.mouse.move(size.width*.68,size.height*.76);await page.mouse.down({button:'right'});await page.mouse.move(size.width*.25,size.height*.96,{steps:12});await page.mouse.up({button:'right'});
  await page.mouse.move(size.width*.68,size.height*.76);await page.mouse.wheel(0,2000);await page.waitForTimeout(150);
  const data=await host.evaluate(n=>({pose:JSON.parse(n.dataset.officeCamera),limits:JSON.parse(n.dataset.officeCameraLimits)}));
  const {target,eye}=data.pose,l=data.limits;assert(target[0]>=l.minTarget[0]-1e-6&&target[0]<=l.maxTarget[0]+1e-6);assert(target[2]>=l.minTarget[2]-1e-6&&target[2]<=l.maxTarget[2]+1e-6);assert(Math.abs(target[1]-.3)<1e-6);
  const distance=Math.hypot(...eye.map((v,i)=>v-target[i])),phi=Math.acos((eye[1]-target[1])/distance);assert(distance>=l.minDistance-1e-6&&distance<=l.maxDistance+1e-6);assert(phi>=l.minPolarAngle-1e-6&&phi<=l.maxPolarAngle+1e-6);await shot('camera-clamped');
  await page.getByRole('button',{name:'复位视角',exact:true}).click();await page.waitForFunction(()=>{const n=document.querySelector('[data-office-camera-limits]');if(!n)return false;const p=JSON.parse(n.dataset.officeCamera),l=JSON.parse(n.dataset.officeCameraLimits);return Math.abs(p.target[0]-(l.minTarget[0]+l.maxTarget[0])/2)<.001&&Math.abs(p.target[2]-(l.minTarget[2]+l.maxTarget[2])/2)<.001;});
  result.checks.push({cameraPanClamped:true,zoomAndPitchClamped:true,resetReturnsToOffice:true});
}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
  for(const spec of cases){
    if(selected&&!selected.includes(spec.id))continue;
    const result={...spec,passed:false,errors:[],external:[],checks:[],screenshots:[]};report.scenarios.push(result);
    const context=await browser.newContext({viewport:{width:spec.w,height:spec.h},hasTouch:spec.mode==='pe',deviceScaleFactor:1});
    if(url.startsWith('file:'))await context.route(/^https?:/,r=>r.abort());
    const page=await context.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
    page.on('request',r=>{if(url.startsWith('file:')&&(/^https?:/.test(r.url())||r.url().startsWith('file:')&&new URL(r.url()).href!==new URL(url).href))result.external.push(r.url());});
    await page.addInitScript(({save,spec})=>{
      window.__companyGl=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(/webgl/.test(kind))window.__companyGl++;return original.call(this,kind,...args);};
      localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':spec.mode,'urban-life-pe-zoom-v3':'1','urban-life-ui-zoom':spec.mode==='pe'?'.7':'1','urban-life-scene-mode':spec.scene,'urban-life-scene-mode-v2':'1','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(save)}))localStorage.setItem(k,v);
    },{save:fixture(spec.stage,spec.kind),spec});
    const shot=async name=>{const file=spec.id+'-'+name+'.png';await page.screenshot({path:join(out,file)});result.screenshots.push(file);};
    try{
      await page.goto(url,{waitUntil:'load',timeout:300000});const announcement=page.getByRole('button',{name:'关闭公告',exact:true});if(await announcement.isVisible().catch(()=>false))await announcement.click();
      if(spec.kind!=='tour')await page.getByRole('button',{name:/继续生活/}).click();
      await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
      if(spec.kind==='tour'){
        const saved=await page.evaluate(()=>localStorage.getItem('urban_life_save_auto'));await page.getByRole('button',{name:/小游戏/}).click();const catalogue=page.locator('[data-arcade-category="homes"]');await catalogue.waitFor();
        assert.equal(await catalogue.locator('[data-tour-category]').count(),4);await shot('category-basic');
        await catalogue.getByRole('button',{name:'二级住所',exact:true}).click();assert(await catalogue.locator('[data-tour-home="boyue_talent_apartment"]').isVisible());assert(await catalogue.locator('[data-tour-home="hotel"]').isVisible());await shot('category-comfortable');
        await catalogue.getByRole('button',{name:'三级住所',exact:true}).click();assert(await catalogue.locator('[data-tour-home="own_villa"]').isVisible());await shot('category-premium');
        await catalogue.getByRole('button',{name:'办公室',exact:true}).click();assert.equal(await catalogue.locator('[data-tour-office]').count(),4);await shot('category-offices');await catalogue.locator('[data-tour-office="2"]').click();
        async function ready(stage){const tour=page.locator('[data-office-tour-stage="'+stage+'"]');await tour.waitFor();if(spec.scene==='3d')await tour.locator('[data-office-ready-ms]').waitFor({timeout:180000});else await tour.locator('[data-still-pick-targets]').waitFor({timeout:180000});await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});}
        await ready(2);await shot('office-2-day');if(spec.scene==='3d')await checkCamera(page,result,shot);
        await page.getByRole('button',{name:'切换夜景',exact:true}).click();await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-office-lighting]').dataset.officeLighting).frame==='night');await shot('office-2-night');await page.getByRole('button',{name:'切换白天',exact:true}).click();
        for(const stage of [1,3,4]){await page.getByRole('combobox',{name:'选择参观办公室',exact:true}).selectOption(String(stage));await ready(stage);await shot('office-'+stage+'-day');}
        await page.getByRole('button',{name:'返回参观列表',exact:true}).click();await catalogue.waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('urban_life_save_auto')),saved);if(spec.scene==='2d')assert.equal(await page.evaluate(()=>window.__companyGl),0);
        result.checks.push({fourTourCategories:true,allFourOfficesVisited:true,tourPreservesSavedGame:true});
      }else if(spec.kind==='finance'){
        await page.getByRole('button',{name:/^公司经营/}).click();const panel=page.getByRole('region',{name:'公司经营面板',exact:true});await panel.getByRole('button',{name:'资金',exact:true}).click();
        const finance=panel.getByRole('region',{name:'公司资金',exact:true});await finance.waitFor();assert((await finance.innerText()).includes('预期收支'));assert.equal(await finance.locator('.schedule').count(),0);assert.equal(Number(await finance.locator('[data-monthly-expenses]').getAttribute('data-monthly-expenses')),1600000);
        await finance.getByRole('button',{name:'提到个人',exact:true}).click();assert.equal(await finance.locator('[data-withdrawal-tax]').getAttribute('data-withdrawal-tax'),'20000');await shot('monthly-summary');await finance.locator('.tax-quote').scrollIntoViewIfNeeded();await shot('tax-preview');
        await finance.getByRole('button',{name:'确认提现',exact:true}).click();assert.equal(await finance.locator('[data-company-balance]').getAttribute('data-company-balance'),'400000');assert((await finance.innerText()).includes('个人现金 ¥5,800'));await shot('after-withholding');
        result.checks.push({monthlyIncomeAndAllWagesRent:true,detailedTimelineRemoved:true,withdraw1000Tax200Net800:true});
      }else if(spec.kind==='simple'){
        await page.locator('[data-office-building]').waitFor();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
        await page.getByRole('button',{name:/^公司经营/}).click();const panel=page.getByRole('region',{name:'公司经营面板',exact:true});await panel.waitFor();
        await panel.getByRole('button',{name:/^团队/}).click();await panel.getByRole('button',{name:'添加员工',exact:true}).click();
        await panel.getByRole('button',{name:'开始今日面试',exact:true}).click();const candidates=panel.locator('[data-company-candidate]');assert.equal(await candidates.count(),3);
        for(const card of await candidates.all()){const text=await card.innerText();assert.match(text,/编程.*级.*设计.*级/);assert.match(text,/预期月薪/);assert(!/标准日|毛产出|缺口|边际|结余/.test(text));assert(text.length<110);}
        assert(!/经营经验|上一结账周期|1.2倍/.test(await panel.innerText()));await shot('simple-candidates');
        await candidates.first().getByRole('button',{name:'录用到此工位',exact:true}).click();
        await panel.getByRole('button',{name:'← 返回团队',exact:true}).click();await panel.getByRole('button',{name:'添加员工',exact:true}).click();
        await panel.locator('[data-company-candidate]').nth(1).getByRole('button',{name:'录用到此工位',exact:true}).click();
        await panel.getByRole('button',{name:'← 返回团队',exact:true}).click();assert.equal(await panel.locator('[data-team-employee]').count(),2);
        const team=panel.locator('[data-team-employee]');await team.nth(0).getByRole('combobox',{name:/工作安排/}).selectOption('programming');await team.nth(1).getByRole('combobox',{name:/工作安排/}).selectOption('design');
        await panel.getByRole('button',{name:'工作台',exact:true}).click();const project=panel.getByRole('article',{name:'编程项目',exact:true});
        const bars=panel.locator('[data-project-progress]');const forecasts=await bars.evaluateAll(nodes=>nodes.map(n=>({lane:n.dataset.projectProgress,current:+n.dataset.currentProgress,end:+n.dataset.todayProgress})));
        assert.equal(forecasts.length,2);assert(forecasts.every(f=>f.end>f.current));await shot('today-dashed-progress');
        await project.locator('summary').click();await project.getByRole('combobox',{name:'编程下一项目规模',exact:true}).selectOption('medium');
        await project.getByRole('combobox',{name:'编程下一项目类型',exact:true}).selectOption('product');
        assert((await project.innerText()).includes('当前 20 / 100 点'));await shot('next-project-medium');
        const design=panel.getByRole('article',{name:'设计项目',exact:true});await design.locator('summary').click();await design.getByRole('button',{name:'保留当前，另开项目',exact:true}).click();
        await design.getByRole('combobox',{name:'设计规模',exact:true}).selectOption('medium');await design.getByRole('button',{name:'立项设计订单',exact:true}).click();
        await panel.locator('.pending summary').click();assert.match(await panel.locator('.pending').innerText(),/平面设计.*25.0%/);await shot('switch-with-progress-preserved');
        const expected=await panel.locator('[data-project-progress="programming"]').getAttribute('data-today-progress');
        assert(await panel.evaluate(n=>n.scrollWidth-n.clientWidth<=1));await panel.getByRole('button',{name:'关闭公司经营面板',exact:true}).click();
        await page.getByRole('button',{name:'办公室等待',exact:true}).click();await page.locator('[aria-label="办公室等待时长"]').getByRole('button',{name:'等 6 小时',exact:true}).click();
        await page.locator('.result-modal').waitFor();await page.locator('.result-modal .r-continue').click();await page.locator('.result-modal').waitFor({state:'hidden'});
        await page.getByRole('button',{name:/^公司经营/}).click();await panel.getByRole('button',{name:'工作台',exact:true}).click();
        const actual=+(await panel.locator('[data-project-progress="programming"]').getAttribute('data-current-progress'));assert(Math.abs(actual-Number(expected))<1e-6);await shot('forecast-matches-evening');
        result.checks.push({zeroCashNewCompanyHiredTwo:true,tenProjectsTwoPositions:true,candidateFieldsOnly:true,todayForecastMatchesRealSettlement:true,nextScaleAndModeSaved:true,immediateSwitchPreservesProgress:true});
      }else if(spec.kind==='closure'){
        await page.getByRole('button',{name:'企业窗口',exact:true}).click();
        const dialog=page.getByRole('dialog',{name:'企业窗口',exact:true});await dialog.waitFor();
        await dialog.getByText('公司资金、闲置设备与停业',{exact:true}).click();
        await dialog.getByText('经营退路与闲置设备',{exact:true}).click();
        await dialog.getByRole('button',{name:'办理公司停业',exact:true}).click();await shot('quote');
        assert.match(await dialog.innerText(),/停业后仍待偿.*800/);
        await dialog.getByRole('button',{name:'确认停业并清算',exact:true}).click();
        await dialog.getByText('青禾工作室已停业。',{exact:false}).waitFor();
        await dialog.getByText('公司资金、设备与版税',{exact:true}).click();
        await dialog.getByText('停业后待偿',{exact:false}).waitFor();await shot('closed-with-debt');
        assert.match(await dialog.innerText(),/恢复个人接单/);result.checks.push({closeWithDebt:true,preservedDebtYuan:800,personalDevelopmentAvailableAfterClosure:true});
      }else{
        const scene=page.locator(`[data-company-office="${spec.stage}"]`);await scene.waitFor();await page.locator('[data-office-building]').waitFor();
        await page.locator('[data-office-seat="0"]').waitFor({state:'attached',timeout:120000});
        if(spec.scene==='3d')await page.locator('[data-office-ready-ms]').waitFor({timeout:120000});
        else await page.waitForFunction(()=>document.querySelector('[data-still-pick-targets]')?.dataset.stillPickTargets?.length>2);
        await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
        const address=await page.locator('[data-office-building]').evaluate(n=>JSON.parse(n.dataset.officeBuilding));assert.equal(address.floor,api.OFFICE_ADDRESSES[spec.stage-1].floor);
        console.log(spec.id+' scene ready');
        if(process.env.QA_LAST_SEAT==='1'){
          const last=api.companyStage(spec.stage).capacity-1;
          await scene.locator(`[data-office-seat="${last}"]`).click();
          const selected=page.getByRole('region',{name:'公司经营面板',exact:true});await selected.waitFor();
          const expected='员工'+String.fromCharCode(64+last);assert((await selected.innerText()).includes(expected),'selected wrong employee');
          await selected.getByRole('button',{name:'关闭公司经营面板',exact:true}).click();
          result.checks.push({lastEmployeeWorkstationClickable:true,employee:expected});
        }
        await shot('day');
        if(spec.scene==='3d'&&process.env.QA_WALL_MODES==='1'){
          for(const mode of ['low','full','cutaway']){
            await page.getByRole('button',{name:'画面设置',exact:true}).click();const settings=page.getByRole('dialog',{name:'场景画面设置',exact:true});
            await settings.getByLabel('住宅墙体显示',{exact:true}).selectOption(mode);assert.equal(await settings.getByLabel('住宅墙体显示',{exact:true}).inputValue(),mode);
            await settings.getByRole('button',{name:'关闭画面设置',exact:true}).click();await page.waitForFunction(()=>{const node=document.querySelector('[data-office-wall-animation]');return node&&!JSON.parse(node.dataset.officeWallAnimation).moving;});await shot('walls-'+mode);
          }
          const low=readFileSync(join(out,spec.id+'-walls-low.png')),full=readFileSync(join(out,spec.id+'-walls-full.png')),cutaway=readFileSync(join(out,spec.id+'-walls-cutaway.png'));
          assert(!low.equals(full)&&!low.equals(cutaway)&&!full.equals(cutaway),'Wall mode changes did not alter the rendered scene');result.checks.push({wallModeControls:['low','full','cutaway'],sceneImagesDiffer:true});
        }
        if(spec.scene==='3d')await checkCamera(page,result,shot);
        await page.getByRole('button',{name:'向右旋转90度',exact:true}).click();
        if(spec.scene==='2d')await page.waitForFunction(()=>document.querySelector('[data-company-still-angle]')?.dataset.companyStillAngle==='1');
        await shot('rotated');await page.getByRole('button',{name:'复位视角',exact:true}).click();
        if(spec.scene==='2d')await page.waitForFunction(()=>document.querySelector('[data-company-still-angle]')?.dataset.companyStillAngle==='0');
        await scene.getByRole('button',{name:/^公司经营/}).click();
        const panel=page.getByRole('region',{name:'公司经营面板',exact:true});await panel.waitFor();
        await panel.getByRole('button',{name:/^团队/}).click();await shot('team');
        assert.equal(await panel.locator('[data-team-employee]').count(),api.companyStage(spec.stage).capacity-1);
        const overflow=await panel.evaluate(n=>n.scrollWidth-n.clientWidth);assert(overflow<=1);
        await panel.getByRole('button',{name:'工作台',exact:true}).click();
        await panel.getByRole('button',{name:'公司最多工作4小时',exact:true}).click();
        assert.match(await panel.getByRole('region',{name:'主角工作安排',exact:true}).innerText(),/7\.5/);
        await panel.getByRole('button',{name:'开始工作 · 最多4小时',exact:true}).click();
        assert.match(await panel.getByRole('article',{name:'编程项目',exact:true}).innerText(),/7.5 \/ 100/);await shot('work');
        await panel.getByRole('button',{name:'关闭公司经营面板',exact:true}).click();
        await page.locator('[data-office-door]').click();await page.getByRole('group',{name:'公司出门选项',exact:true}).waitFor();
        assert(await page.locator('[data-company-normal-exit]').isVisible());await shot(spec.stage===4?'elevator-exit':'corridor-exit');
        await page.getByRole('button',{name:'收起',exact:true}).click();
        if(spec.stage===1){
          await page.getByRole('button',{name:'打开手机',exact:true}).click();const phone=page.locator('.phone[data-phone-app]');await phone.waitFor();
          await phone.getByRole('button',{name:'消息与通话',exact:true}).click();await phone.locator('.request-inbox').click();
          await phone.locator('.sms-item').filter({hasText:'员工A'}).click();
          const text=await phone.innerText();assert.match(text,/申请调整月薪/);assert.match(text,/申请.*带薪假/);assert.match(text,/3日|3天/);assert.match(text,/\d+月\d+日00:00前回复/);
          await shot('employee-notices');await phone.getByRole('button',{name:'关机并收起手机',exact:true}).click();await phone.waitFor({state:'hidden'});
          result.checks.push({employeeAdvanceNoticesVisibleOnPhone:true,remoteApprovalAdded:false});
        }
        if(spec.stage>=1){
          await page.getByRole('button',{name:'办公室等待',exact:true}).click();await page.locator('[aria-label="办公室等待时长"]').getByRole('button',{name:'等 6 小时',exact:true}).click();
          await page.locator('.result-modal').waitFor();await page.locator('.result-modal .r-continue').click();await page.locator('.result-modal').waitFor({state:'hidden'});
          await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-office-lighting]').dataset.officeLighting).frame==='night');
          await shot('night');result.checks.push({actualWaitToNight:true,officeLightsOn:true});
        }
        if(spec.mode==='pe'){
          await page.setViewportSize({width:430,height:932});await page.getByText('请将手机横置',{exact:true}).waitFor();await shot('portrait');
          assert(await page.evaluate(()=>!!document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('.mobile-portrait-block')));
        }
        const gl=await page.evaluate(()=>window.__companyGl);if(spec.scene==='2d')assert.equal(gl,0);else assert(gl>0);
        result.checks.push({building:address,webglContexts:gl,rotation:true,teamAndFounderWork:true,exit:true,noPanelHorizontalOverflow:true});
      }
      assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.passed=true;console.log(spec.id+' passed');
    }catch(error){result.failure=error.stack;await shot('failure').catch(()=>{});throw error;}
    finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await context.close();}
  }
  report.passed=report.scenarios.length>0&&report.scenarios.every(s=>s.passed);
}finally{writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));await browser.close();await web?.close();}
