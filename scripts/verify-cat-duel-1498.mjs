import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const root=resolve(import.meta.dirname,'..'),portable=process.env.QA_PORTABLE==='1',out=join(root,process.env.QA_PROOF_DIR??'docs/cat-duel-art-motion-1498-20261029',portable?'portable':'source');mkdirSync(out,{recursive:true});
let api={};const ssr=await createServer({root,configFile:false,appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]}});
try{for(const file of ['state','cat','catBattle','catDuelCollection','tournament'])Object.assign(api,await ssr.ssrLoadModule('/src/game/core/'+file+'.ts'));}finally{await ssr.close();}
const cases=[{id:'pc-animation-sequence',w:1440,h:900,motion:true},{id:'pc-resume-event-history',w:1440,h:900,motionReload:true},{id:'pc-practice',w:1440,h:900,practice:true},{id:'mid-height-practice',w:1280,h:660,practice:true},{id:'pe-landscape-practice',w:932,h:430,mobile:true,practice:true},{id:'pe-portrait-practice',w:430,h:932,mobile:true,practice:true},{id:'pc-hospital-reload',w:1440,h:900,clinic:true},{id:'pe-hospital-doubletap',w:932,h:430,mobile:true,clinic:true},{id:'pc-live-reward-save',w:1440,h:900,live:true},{id:'pc-tournament',w:1440,h:900,tournament:true},{id:'pc-facing-minion',w:1440,h:900,practice:true,opponent:'t1_rookie',playerMirror:-1,enemyMirror:-1},{id:'pe-facing-skeleton',w:932,h:430,mobile:true,practice:true,opponent:'opp_skeleton',playerMirror:-1,enemyMirror:-1}];
cases.push(
  {id:'bg-alley-night',w:1440,h:900,backgroundProbe:true,location:'street',hour:22,scene:'alley'},
  {id:'bg-park-day',w:1440,h:900,backgroundProbe:true,location:'park',hour:10,scene:'park'},
  {id:'bg-amusement-dusk-mobile',w:932,h:430,mobile:true,backgroundProbe:true,location:'amusement_park',hour:18,scene:'arena'},
  {id:'bg-final-modern-pavilion',w:1440,h:900,backgroundProbe:true,location:'amusement_park',hour:22,scene:'boss',opponent:'roundhead'},
  {id:'bg-reduced-motion',w:1280,h:660,backgroundProbe:true,reducedMotion:true,location:'park',hour:18,scene:'park'},
);
function fixture(spec){const s=api.createInitialState(14982910);s.mode='eternal';s.player.money=10000;s.tutorial={done:['eat','work','sleep'],activeStep:-1};Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100,hygiene:100});s.time.hour=12;s.time.minute=0;const pet=api.adoptCat(s,spec.cat??'orange');assert(pet);pet.level=10;s.locationId=spec.clinic?'flower_market':'amusement_park';s.region=s.area=spec.clinic?'downtown_station':'downtown_commercial';s.navStack=['map','downtown',s.region];if(spec.clinic){s.version=37;delete s.catDuel;delete s.pets[0].cardPack;}if(spec.tournament){s.time.day=2;s.time.hour=14;for(const c of api.ensureCatDuel(s).collection)c.upgraded=true;assert(api.signupTournament(s,'tournament_primary').ok);}if(spec.live||spec.motion||spec.motionReload){assert(api.startBattle(s,'wild_stray',undefined,{casual:true}).ok);if(spec.motion||spec.motionReload){const b=s.catBattle,ids=Object.entries(b.duel.cards).filter(([,id])=>id==='scratch').map(([uid])=>uid);b.playerHand=ids;b.playerDrawPile=Object.keys(b.duel.cards).filter(uid=>!ids.includes(uid));b.playerDiscardPile=[];if(spec.motionReload)assert(api.playCard(s,ids[0]).ok);}}return s;}
let server;const url=portable?pathToFileURL(join(root,'1.49.8.html')).href:'http://127.0.0.1:1458/';
if(!portable){server=await createServer({root,logLevel:'error',server:{host:'127.0.0.1',port:1458,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});await server.listen();}
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--autoplay-policy=no-user-gesture-required']});
const report={createdAt:new Date().toISOString(),portable,passed:false,boundary:'Fresh isolated browser profiles, generated fixtures only; no personal saves read or overwritten.',artifactSha256:portable?readFileSync(join(root,'1.49.8.sha256'),'utf8').trim().split(/\s+/)[0]:undefined,scenarios:[]};
if(process.env.QA_RESUME==='1'&&existsSync(join(out,'report.json')))report.scenarios=JSON.parse(readFileSync(join(out,'report.json'),'utf8')).scenarios.filter(r=>r.passed&&cases.some(c=>c.id===r.id));
const force=process.env.QA_FORCE_CASES?.split(',');if(force)report.scenarios=report.scenarios.filter(r=>!force.includes(r.id));
const filter=process.env.QA_CASES?.split(',');
async function tap(page,locator,mobile){
  if(mobile&&await locator.evaluate(n=>n.classList.contains('play-card'))){
    await page.waitForTimeout(220);
    const hit=await locator.evaluate(n=>{const r=n.getBoundingClientRect();for(let y=Math.max(1,r.top+8);y<Math.min(innerHeight-1,r.bottom);y+=8)for(let x=Math.max(1,r.left+8);x<Math.min(innerWidth-1,r.right);x+=8)if(document.elementFromPoint(x,y)?.closest('.play-card')===n)return {x,y};return null;});
    if(hit){await page.touchscreen.tap(hit.x,hit.y);if(await locator.evaluate(n=>n.classList.contains('selected')))return;}
    const index=await locator.evaluate(n=>[...n.parentElement.querySelectorAll('.play-card')].indexOf(n));
    for(let n=0;n<12;n++){if(await page.locator('.play-card').nth(index).evaluate(n=>n.classList.contains('selected')))return;await page.getByRole('button',{name:'查看下一张手牌',exact:true}).tap();}
    throw Error('Hand card cannot be reached through tap or next-card control');
  }
  await locator.scrollIntoViewIfNeeded();if(mobile)await locator.tap();else await locator.click();
}
async function dragToPlay(page,locator){
  await locator.hover();await page.waitForTimeout(180);
  const hit=await locator.evaluate(n=>{const r=n.querySelector('.duel-card-face').getBoundingClientRect();for(let y=Math.max(2,r.top+20);y<Math.min(innerHeight-2,r.bottom);y+=8)for(let x=Math.max(2,r.left+15);x<Math.min(innerWidth-2,r.right);x+=8)if(document.elementFromPoint(x,y)?.closest('.play-card')===n)return {x,y};return null;});
  assert(hit,'Mouse must reach the real card');
  const bounds=await page.locator('.duel-battle').boundingBox(),hand=await page.locator('.hand-zone').boundingBox(),header=await page.locator('.battle-top').boundingBox();
  const y=Math.max(header.y+header.height+25,Math.min(hit.y-75,hand.y-48,bounds.y+bounds.height*.55));
  await page.mouse.move(hit.x,hit.y);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.57,y,{steps:8});await page.mouse.up();
}
async function dismiss(page){const a=page.getByRole('button',{name:'关闭公告',exact:true});if(await a.isVisible().catch(()=>false))await a.click();}
async function boot(page,live){await page.goto(url,{waitUntil:'load',timeout:300000});await dismiss(page);if(live){await page.getByRole('button',{name:/继续生活/}).click();await page.locator('[data-scene-loading-overlay]').waitFor({state:'hidden',timeout:180000});}}
async function playToEnd(page,mobile,record){
  for(let n=0;n<100;n++){
    await page.waitForFunction(()=>document.querySelector('.duel-battle')?.getAttribute('data-animating')!=='true');
    if(await page.locator('.result-overlay').count())return;
    const energy=parseInt(await page.locator('.energy>strong').innerText(),10);
    const options=await page.locator('.play-card').evaluateAll(nodes=>nodes.map((node,i)=>({i,cost:Number(node.querySelector('.card-top>b').textContent),title:node.title,actual:node.querySelector('.actual')?.textContent??''}))); 
    const available=options.filter(c=>c.cost<=energy).sort((a,b)=>Number(b.title.match(/实际生命伤害 (\d+)/)?.[1]??0)-Number(a.title.match(/实际生命伤害 (\d+)/)?.[1]??0));
    if(available.length){const before=energy;if(mobile)await tap(page,page.locator('.play-card').nth(available[0].i),true);else await dragToPlay(page,page.locator('.play-card').nth(available[0].i));if(mobile){assert.equal(parseInt(await page.locator('.energy>strong').innerText(),10),before);record.mobileTapOnlySelects=true;await page.getByRole('button',{name:'打出选中牌',exact:true}).tap();}}
    else {await tap(page,page.getByRole('button',{name:'结束回合 →',exact:true}),mobile);await page.waitForTimeout(400);}
  }throw Error('No battle result within100 actions');
}
try{for(const spec of cases){if(report.scenarios.some(r=>r.id===spec.id&&r.passed)||filter&&!filter.includes(spec.id))continue;console.log('START',spec.id);const r={...spec,passed:false,errors:[],external:[],screenshots:[]};report.scenarios.push(r);
  const context=await browser.newContext({viewport:{width:spec.w,height:spec.h},isMobile:!!spec.mobile,hasTouch:!!spec.mobile,deviceScaleFactor:spec.mobile?2:1});if(portable)await context.route(/^https?:/,route=>route.abort());
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>r.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});page.on('request',req=>{if(portable&&/^https?:/.test(req.url()))r.external.push(req.url());});
  const seeded=fixture(spec);
  if(spec.backgroundProbe){seeded.locationId=spec.location;seeded.time.hour=spec.hour;seeded.region=seeded.area=spec.location==='park'?'downtown_center':spec.location==='street'?'residential':'downtown_commercial';seeded.pets[0].level=100;assert(api.startBattle(seeded,spec.opponent??'wild_stray',undefined,{casual:true}).ok);}
  if(spec.reducedMotion)await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(({state,mobile})=>{if(sessionStorage.getItem('duel1498-fixture'))return;sessionStorage.setItem('duel1498-fixture','1');localStorage.clear();for(const[k,v]of Object.entries({'urban-life-device-setup-v1':'1','urban-life-ui-gamemode':mobile?'pe':'pc','urban-life-ui-zoom':mobile?'.7':'1','urban-life-pe-zoom-v3':'1','urban-life-scene-mode':'2d','urban-life-scene-mode-v2':'1','urban_life_audio_muted':'1','urban_life_audio_bgm_enabled':'0','urban-life-show-log':'false','urban_life_save_auto':JSON.stringify(state)}))localStorage.setItem(k,v);},{state:seeded,mobile:!!spec.mobile});
  const shot=async name=>{const path=spec.id+'-'+name+'.png';await page.screenshot({path:join(out,path),animations:spec.motion?'disabled':'allow'});r.screenshots.push(path);};
  try{
    if(spec.motion)await page.clock.install();await boot(page,!spec.practice);
    if(spec.backgroundProbe){
      await page.locator('.duel-battle').waitFor();await page.waitForFunction(()=>{const image=document.querySelector('.battle-background');return image?.complete&&image.naturalWidth>=1000;});
      assert.equal(await page.locator('.duel-battle').getAttribute('data-scene'),spec.scene);
      const period=spec.hour>=20||spec.hour<6?'night':spec.hour>=17?'dusk':'day';assert.equal(await page.locator('.duel-battle').getAttribute('data-period'),period);
      if(!portable)assert((await page.locator('.battle-background').getAttribute('src')).includes(`/duel-1498/${spec.scene==='boss'?'boss':spec.scene+'_'+period}.png`));
      r.ambientCount=await page.locator('.duel-environment i').count();assert.equal(r.ambientCount,spec.reducedMotion?0:spec.mobile?7:16);
      if(spec.scene==='boss'){
        const image=page.locator('.enemy img.portrait');await image.waitFor();
        r.roundheadPortraitSha256=await image.evaluate(async n=>{const b=await(await fetch(n.src)).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');});
        assert.equal(r.roundheadPortraitSha256,createHash('sha256').update(readFileSync(join(root,'src/assets/cats/duel-roundhead-1498/roundhead_idle.png'))).digest('hex'));
      }
      assert.equal(await page.locator('.duel-environment').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
      const button=page.getByRole('button',{name:'结束回合 →',exact:true});assert(await button.isVisible());assert.equal(await button.evaluate(n=>{const b=n.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===n;}),true);r.particlesDoNotInterceptControls=true;
      await page.getByRole('button',{name:'暂停与退出'}).click();assert.equal(await page.locator('.duel-environment').evaluate(n=>n.classList.contains('suspended')),true);await page.keyboard.press('Escape');
      await page.locator('.piles button').first().click();assert.equal(await page.locator('.duel-environment').evaluate(n=>n.classList.contains('suspended')),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.duel-environment').evaluate(n=>n.classList.contains('suspended')),false);r.environmentPausesWithOverlays=true;
      await shot('battle');r.modernSceneLoaded=true;
    }else if(spec.practice){
      const before=await page.evaluate(()=>localStorage.getItem('urban_life_save_auto'));
      await page.getByRole('button',{name:/小游戏/}).first().click();await page.locator('.arcade-card').filter({hasText:'喵喵对决'}).click();await page.locator('.duel-hub').waitFor();
      const portrait=page.getByRole('button',{name:/继续竖屏|保持竖屏/});if(await portrait.isVisible().catch(()=>false))await portrait.click();
      if(spec.opponent)await page.locator('#duel-opponent').selectOption(spec.opponent);assert.equal(await page.locator('.contender.player img').evaluate(n=>getComputedStyle(n).transform.split(',')[0]),'matrix('+(spec.playerMirror??-1));assert.equal(await page.locator('.contender.enemy img').evaluate(n=>getComputedStyle(n).transform.split(',')[0]),'matrix('+(spec.enemyMirror??1));await shot('preparation');await page.getByRole('button',{name:'收藏与组牌',exact:true}).click();assert.equal(await page.locator('.collection-card:not(.unowned)').count()>=36,true);await shot('deck');
      await page.getByRole('button',{name:'对战准备',exact:true}).click();await tap(page,page.getByRole('button',{name:'开始对决 →',exact:true}),spec.mobile);
      await page.locator('.duel-battle').waitFor();await page.locator('.play-card').first().waitFor();r.actualPlayerName=await page.locator('.fighter.player h2').innerText();assert.equal(r.actualPlayerName,'橘猫');assert.equal(await page.locator('.player .portrait-facing').evaluate(n=>getComputedStyle(n).transform.split(',')[0]),'matrix('+(spec.playerMirror??-1));assert.equal(await page.locator('.enemy .portrait-facing').evaluate(n=>getComputedStyle(n).transform.split(',')[0]),'matrix('+(spec.enemyMirror??1));r.portraitsFaceInwards=true;
      const boxes=await page.evaluate(()=>Object.fromEntries(['.battle-content','.enemy-intent','.hand-zone','.end-turn','.energy'].map(selector=>{const b=document.querySelector(selector).getBoundingClientRect();return [selector,{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}]})));r.boxes=boxes;
      for(const selector of ['.enemy-intent','.end-turn','.energy']){const b=boxes[selector];assert(b.x>=-2&&b.y>=-2&&b.right<=spec.w+2&&b.bottom<=spec.h+2,selector+' is outside viewport');}
      await page.waitForTimeout(300);await shot('battle');
      const fan=await page.locator('.play-card').evaluateAll(nodes=>nodes.map(n=>({uid:n.dataset.instance,x:n.getBoundingClientRect().x+n.getBoundingClientRect().width/2,z:Number(getComputedStyle(n).zIndex)})));assert.equal(new Set(fan.map(c=>c.uid)).size,fan.length);assert(fan.every((c,i)=>!i||c.x>fan[i-1].x&&c.z>fan[i-1].z));r.handOrderAndLayers=true;
      if(spec.mobile)await tap(page,page.locator('.play-card').nth(2),true);else await page.locator('.play-card').nth(2).hover();
      await page.waitForTimeout(250);const inspected=await page.locator('.play-card.selected .duel-card-face').boundingBox();assert(inspected&&inspected.x>=0&&inspected.y>=0&&inspected.x+inspected.width<=spec.w+2&&inspected.y+inspected.height<=spec.h+2,'Selected full card outside viewport');await shot('inspect');r.fullCardReadable=true;await page.keyboard.press('Escape');
      await tap(page,page.locator('.piles button').first(),spec.mobile);await page.locator('.pile-viewer').waitFor();await shot('draw-pile');await page.keyboard.press('Escape');assert.equal(await page.locator('.pile-viewer').count(),0);r.pileEscWorks=true;
      if(!spec.mobile){const cards=await page.locator('.play-card').evaluateAll(nodes=>nodes.map((n,i)=>({i,cost:Number(n.querySelector('.cost-gem').textContent)}))),cost=cards.find(c=>c.cost<=3),button=page.locator('.play-card').nth(cost.i);await button.click();assert.equal(parseInt(await page.locator('.energy>strong').innerText(),10),3);r.pcClickOnlySelects=true;await button.hover();await page.waitForTimeout(220);const from=await button.locator('.duel-card-face').boundingBox(),arena=await page.locator('.arena').boundingBox(),count=await page.locator('.play-card').count();await page.mouse.move(from.x+from.width/2,from.y+from.height*.35);await page.mouse.down();await page.mouse.move(arena.x+arena.width*.7,arena.y+arena.height*.4,{steps:12});await page.mouse.up();await page.waitForTimeout(150);assert.equal(parseInt(await page.locator('.energy>strong').innerText(),10),3-cost.cost);assert((await page.locator('.play-card').count())<=count+2);r.mouseDragChargesOnce=true;}
      await playToEnd(page,spec.mobile,r);await shot('victory');await page.getByRole('button',{name:'领取本场结算 →',exact:true}).click();await page.getByRole('button',{name:'返回准备与组牌 →',exact:true}).click();await page.getByRole('button',{name:'关闭对决准备',exact:true}).click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('urban_life_save_auto')),before);r.practiceSaveUnchanged=true;
    }else if(spec.clinic){
      await tap(page,page.locator('.pet-hospital-facility'),spec.mobile);await tap(page,page.locator('.action-card').filter({hasText:'卡牌永久强化＋'}),spec.mobile);await page.locator('.hospital-cards').waitFor();
      assert.equal(await page.locator('.card-list>button').count(),12);await shot('before');await tap(page,page.locator('.upgrade'),spec.mobile);
      await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('urban_life_save_auto'));return s?.player.money===9800&&s?.catDuel?.collection?.some(c=>c.upgraded);});
      assert(await page.locator('.upgrade').isDisabled());await page.waitForTimeout(550);const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));assert.equal(after.player.money,9800);assert.equal(after.time.hour,13);assert.equal(after.version,38);assert.equal(after.pets[0].cardPack,undefined);r.upgradeExactAndLegacyPreserved=true;await shot('after');
      await boot(page,true);await tap(page,page.locator('.pet-hospital-facility'),spec.mobile);await tap(page,page.locator('.action-card').filter({hasText:'卡牌永久强化＋'}),spec.mobile);assert.equal(await page.locator('.card-list>button').count(),11);r.upgradeSurvivesReload=true;await shot('reloaded');
    }else if(spec.tournament){
      await page.locator('.action-card').filter({hasText:'喵喵对决赛赛场'}).click();await page.locator('.duel-hub').waitFor();const start=page.getByRole('button',{name:'进入赛事 →',exact:true});assert(await start.isEnabled());await shot('preparation');await start.click();
      for(let round=0;round<3;round++){await page.locator('.duel-battle').waitFor();assert.equal(await page.locator('[aria-label="我方生命"]').getAttribute('value'),'80');await playToEnd(page,false,r);if(round<2){await page.getByRole('button',{name:'结算并继续赛事 →',exact:true}).click();assert.equal(await page.locator('.choices').count(),0);}else await page.getByRole('button',{name:'结算并继续赛事 →',exact:true}).click();}
      assert.equal(await page.locator('.choices button').count(),3);await shot('final-reward');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('urban_life_save_auto'))?.catTournament?.entry?.settled);const finished=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));assert(finished.catTournament.entry.settled);assert.equal(finished.catTournament.entry.rank,1);assert.equal(finished.catTournament.entry.beaten.length,3);r.tournamentStartsFromUnstartedTicketAndFinishes=true;
      await page.locator('.choices button').first().click();await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('urban_life_save_auto'));return s?.catDuel?.collection.length===13&&!s?.catDuel?.offer;});await boot(page,true);const loaded=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));assert.equal(loaded.catTournament.entry.prizeMoney,finished.catTournament.entry.prizeMoney);assert.equal(loaded.catDuel.collection.length,13);r.finalPrizeAndCardPersistOnce=true;
    }else if(spec.motion){
      await page.locator('.duel-battle').waitFor();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));await page.clock.runFor(700);assert.equal(await page.locator('.play-card').count(),2);await page.locator('.play-card').first().click();assert.equal(parseInt(await page.locator('.energy>strong').innerText(),10),3);r.pcClickOnlySelects=true;await dragToPlay(page,page.locator('.play-card').first());
      assert.equal(parseInt(await page.locator('.energy>strong').innerText(),10),2);
      await page.clock.runFor(76);await page.waitForFunction(()=>document.querySelector('.player')?.getAttribute('data-pose')==='attack');assert.equal(await page.locator('.player svg.action-portrait image').count(),1);await page.clock.runFor(55);await shot('player-attack');
      await page.clock.runFor(135);await page.waitForFunction(()=>document.querySelector('.enemy')?.getAttribute('data-pose')==='hurt');assert.equal(await page.locator('.enemy svg.action-portrait image').count(),1);assert.equal(await page.locator('.enemy .duel-impact.hurt .amount').innerText(),'−6');assert.equal(await page.locator('.enemy .impact-particles i').count(),8);assert.equal(await page.locator('.player .impact-particles i').count(),0);r.hitParticlesUseExplicitTarget=true;await shot('enemy-hurt');
      await page.clock.runFor(1000);await page.waitForFunction(()=>document.querySelector('.duel-battle')?.getAttribute('data-animating')==='false');assert.equal(await page.locator('.enemy .health-line').innerText().then(t=>t.includes('32 / 38')),true);assert.equal(await page.locator('.play-card').count(),1);
      await page.getByRole('button',{name:'结束回合 →',exact:true}).click();await page.clock.runFor(161);await page.waitForFunction(()=>document.querySelector('.enemy')?.getAttribute('data-pose')==='attack');await page.clock.runFor(55);await shot('enemy-attack');
      await page.clock.runFor(135);await page.waitForFunction(()=>document.querySelector('.player')?.getAttribute('data-pose')==='hurt');assert.equal(await page.locator('.play-card').count(),0);assert.equal(parseInt(await page.locator('.energy>strong').innerText(),10),2);assert((await page.locator('.round').innerText()).includes('第 1 回合'));r.nextTurnIsNotShownDuringEnemyHit=true;await shot('player-hurt');await page.clock.runFor(1000);await page.waitForFunction(()=>document.querySelector('.duel-battle')?.getAttribute('data-animating')==='false');assert((await page.locator('.player .health-line').innerText()).includes('75 / 80'));r.attackHurtAndHpAtImpact=true;r.sequenceReturnsControl=true;
    }else if(spec.motionReload){
      await page.locator('.duel-battle').waitFor();assert.equal(await page.locator('.duel-battle').getAttribute('data-motion'),'idle');assert.equal(parseInt(await page.locator('.energy>strong').innerText(),10),2);assert((await page.locator('.enemy .health-line').innerText()).includes('32 / 38'));await page.waitForTimeout(800);assert.equal(await page.locator('.duel-battle').getAttribute('data-motion'),'idle');await shot('resumed');r.savedEventsDoNotReplay=true;
    }else{
      await page.locator('.duel-battle').waitFor();await playToEnd(page,false,r);await page.getByRole('button',{name:'领取本场结算 →',exact:true}).click();await page.locator('.choices button').first().waitFor();assert.equal(await page.locator('.choices button').count(),3);await shot('choose-one');await page.locator('.choices button').first().click();
      await page.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('urban_life_save_auto'));return s?.catDuel?.collection.length===13&&!s?.catDuel?.offer;});
      await boot(page,true);assert.equal(await page.locator('.duel-battle').count(),0);const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('urban_life_save_auto')));assert.equal(saved.catDuel.collection.length,13);assert.equal(Object.values(saved.catDuel.decks)[0].length,12);r.selectedCardPersistsAndDeckUnchanged=true;await shot('saved');
    }
    assert.deepEqual(r.errors,[]);assert.deepEqual(r.external,[]);r.passed=true;console.log('PASS',spec.id);
  }catch(e){r.failure=e.stack;r.visibleText=(await page.locator('body').innerText()).slice(-7000);await shot('failure').catch(()=>{});throw e;}finally{await context.close();}
}}finally{report.passed=report.scenarios.length>0&&report.scenarios.every(r=>r.passed);writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();if(server)await server.close();}
console.log(JSON.stringify({passed:report.passed,scenarios:report.scenarios.length,out}));
