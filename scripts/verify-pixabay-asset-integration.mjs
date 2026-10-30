import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,createReadStream} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..');
const out=resolve(process.env.QA_OUT||join(root,'docs/pixabay-asset-integration-1497-20261027/browser-source'));
const url=process.env.QA_URL||'http://127.0.0.1:14631/';
mkdirSync(out,{recursive:true});
const files={
  'nightclub-late-night':'src/assets/music/场所氛围/夜总会_深夜律动_Still.mp3',
  'lounge-late-night':'src/assets/music/场所氛围/清吧_深夜慢拍_Chills.mp3',
  cafe:'src/assets/music/场所氛围/咖啡馆_暖灯轻爵士_CoffeeHouseBump.mp3',
  cat_play:'src/assets/sfx/场景细化/猫咪玩耍_轻叫_Kerzoven.mp3',
};
function fingerprint(bytes){let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return h>>>0;}
const hashes=Object.fromEntries(Object.entries(files).map(([id,file])=>[id,fingerprint(readFileSync(join(root,file)))]));
const report={startedAt:new Date().toISOString(),url,boundary:'独立浏览器配置与构造存档；不读取或改写玩家存档。',passed:false,cases:[]};
if(url.startsWith('file:')){const path=fileURLToPath(url),hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);report.artifact={path,sha256:hash.digest('hex')};}
const save=()=>writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));
let server,ssr,browser;
try{
  ssr=await createServer({root,configFile:false,server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
  const api=Object.assign({},...await Promise.all(['state','housing','actions','calendar','weather','regions','cat','catCare'].map(name=>ssr.ssrLoadModule('/src/game/core/'+name+'.ts'))));
  await ssr.close();ssr=undefined;
  if(!process.env.QA_URL){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:14631,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
  function fixture(spec){
    const s=api.createInitialState(149727);s.mode='eternal';s.player.money=100000;s.tutorial={done:['eat','work','sleep'],activeStep:-1};
    let day=101;while(api.isWeekend(api.fromLinearDay(api.START_EPOCH+day)))day++;
    Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+day),{hour:spec.hour,minute:0});
    Object.assign(s.player.attrs,{stamina:100,health:100,mood:80,satiety:80,hygiene:80});
    if(spec.cat){assert(api.signLease(s,'old_apartment').ok);assert(api.moveTo(s,'old_apartment').ok);assert(api.adoptCat(s,'orange'));api.setActivePet(s,s.pets[0].uid);s.pets[0].care.mood=50;}
    else {s.locationId=spec.location;s.region=s.area=api.getLocation(spec.location).regions[0];}
    s.weather.id='sunny';s.weather.lastRollDay=api.gameDay(s.time);s.navStack=['map',api.topRegionOf(s.region),s.region].filter((v,i,a)=>v&&a.indexOf(v)===i);
    return s;
  }
  const specs=[
    {id:'nightclub-after-midnight',location:'boyue_nightclub',hour:1,music:'nightclub-late-night'},
    {id:'lounge-after-midnight',location:'boyue_lounge_bar',hour:1,music:'lounge-late-night'},
    {id:'cafe-3d',location:'cafe',hour:10,music:'cafe',scene:'3d'},
    {id:'cat-play',cat:true,hour:10,scene:'2d'},
  ];
  const selected=process.env.QA_CASES?specs.filter(spec=>process.env.QA_CASES.split(',').includes(spec.id)):specs;
  assert(selected.length>0,'No matching QA cases');
  browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
  for(const spec of selected){
    const result={id:spec.id,passed:false,errors:[],external:[],checks:[],screenshots:[]};report.cases.push(result);save();
    const context=await browser.newContext({viewport:{width:1392,height:896}});
    if(url.startsWith('file:'))await context.route(/^https?:/,route=>route.abort());
    const page=await context.newPage();page.setDefaultTimeout(60000);
    page.on('pageerror',error=>result.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
    page.on('request',request=>{if(url.startsWith('file:')&&(/^https?:/.test(request.url())||request.url().startsWith('file:')&&new URL(request.url()).href!==new URL(url).href))result.external.push(request.url());});
    await page.addInitScript(({state,spec})=>{
      localStorage.clear();
      for(const [key,value] of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':'pc','urban-life-ui-zoom':'1','urban-life-scene-mode':spec.scene||'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'0','urban_life_audio_bgm_enabled':'1','urban_life_audio_sfx_volume':'50','urban_life_audio_bgm_volume':'50','urban_life_audio_default_volume_migration_v1':'1','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(state)}))localStorage.setItem(key,value);
      window.__assetQA={decoded:[],starts:[]};const buffers=new WeakMap(),prototype=AudioContext.prototype,decode=prototype.decodeAudioData,create=prototype.createBufferSource;
      prototype.decodeAudioData=function(data,...rest){let h=2166136261;for(const b of new Uint8Array(data))h=Math.imul(h^b,16777619);const hash=h>>>0;return decode.call(this,data,...rest).then(buffer=>{buffers.set(buffer,hash);window.__assetQA.decoded.push({hash,duration:buffer.duration,channels:buffer.numberOfChannels});return buffer;});};
      prototype.createBufferSource=function(){const source=create.call(this),start=source.start;source.start=function(...args){window.__assetQA.starts.push({hash:buffers.get(source.buffer),duration:source.buffer?.duration});return start.apply(this,args);};return source;};
    },{state:fixture(spec),spec});
    const shot=async label=>{const name=spec.id+'-'+label+'.png';await page.screenshot({path:join(out,name),animations:'disabled'});result.screenshots.push(name);};
    try{
      await page.goto(url,{waitUntil:'load',timeout:300000});
      const announcement=page.getByRole('button',{name:'关闭公告',exact:true});if(await announcement.isVisible().catch(()=>false))await announcement.click();
      await page.getByRole('button',{name:/继续生活/}).click();
      await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});
      if(spec.music){await page.waitForFunction(hash=>window.__assetQA.starts.some(start=>start.hash===hash),hashes[spec.music],{timeout:90000});result.checks.push({music:spec.music,nativeAudioStarted:true});}
      if(spec.scene==='3d'){
        const host=page.locator('.cafe-world');await page.waitForFunction(()=>document.querySelector('.cafe-world')?.dataset.cafeReady==='true',null,{timeout:180000});
        const data=await host.evaluate(node=>({...node.dataset}));const placements=JSON.parse(data.cafePlacements);const pot=placements.find(item=>item.id==='pixabay-cezve-4797'),plant=placements.find(item=>item.id==='polyhaven-potted-plant-04');
        assert(pot,'Pixabay coffee pot not placed');assert(plant,'Poly Haven potted plant not placed');assert([pot,plant].every(model=>model.size.every(value=>Number.isFinite(value)&&value>0)));assert.equal(data.cafeErrors,'[]');
        await page.locator('[data-cafe-facility="coffee"]').click();await page.locator('[data-cafe-selected="coffee"]').waitFor();await shot('coffee-facility');
        result.checks.push({modelsPlaced:[pot,plant],cafeErrors:data.cafeErrors,coffeeFacilityClickable:true});
      }
      if(spec.cat){
        await page.waitForFunction(hash=>window.__assetQA.decoded.some(item=>item.hash===hash),hashes.cat_play,{timeout:90000});
        await page.getByRole('button',{name:'随身面板',exact:true}).click();await page.locator('.home-tools .personal-fold').getByRole('button',{name:/猫咪/}).click();
        const before=(await page.evaluate(()=>window.__assetQA.starts)).length;await page.getByRole('button',{name:/玩耍/}).click();
        await page.waitForFunction(({hash,before})=>window.__assetQA.starts.slice(before).some(start=>start.hash===hash),{hash:hashes.cat_play,before},{timeout:30000});
        result.checks.push({catPlayNativeAudioStarted:true});await shot('play');
      }
      assert.deepEqual(result.errors,[]);assert.deepEqual(result.external,[]);result.passed=true;console.log(spec.id+': passed');
    }catch(error){result.failure=error.stack;await shot('failure').catch(()=>{});console.error(spec.id+': '+error.message);}
    finally{save();await context.close();}
  }
  report.passed=report.cases.length===selected.length&&report.cases.every(item=>item.passed);if(!report.passed)process.exitCode=1;
}finally{save();await browser?.close();await server?.close();await ssr?.close();}
