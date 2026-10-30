/** Isolated saves, real UI input, and refresh recovery; never opens the player's live save. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
const root = process.cwd(), output = resolve(process.env.QA_OUTPUT || "artifacts/v1.48/district-services", process.env.QA_FILE ? "offline" : "browser");
mkdirSync(output, { recursive: true });
const url = process.env.QA_FILE ? pathToFileURL(resolve(process.env.QA_FILE)).href : "http://127.0.0.1:1431/";
const playwright = await import(pathToFileURL("C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js").href);
const chromium = playwright.chromium ?? playwright.default.chromium;
const browser = await chromium.launch({ executablePath: process.env.QA_CHROME || "C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe", headless: true });
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true } });
const { createInitialState } = await server.ssrLoadModule("/src/game/core/state.ts");
const { regionPathOf } = await server.ssrLoadModule("/src/game/core/regions.ts");
const { npcPresenceAt } = await server.ssrLoadModule("/src/game/core/npcs.ts");
const { weekdayOf } = await server.ssrLoadModule("/src/game/core/calendar.ts");
const { gameDay } = await server.ssrLoadModule("/src/game/core/calendar.ts");
const { applyForJob, JOB_DEFS } = await server.ssrLoadModule("/src/game/core/jobs.ts");
const { startDistrictLeisure, blackjackValue } = await server.ssrLoadModule("/src/game/core/districtLeisure.ts");
const { signLease } = await server.ssrLoadModule("/src/game/core/housing.ts");
const steps = JSON.parse(readFileSync("src/game/data/tutorial.json", "utf8")).steps.map(x => x.id);
function saveAt(region, locationId = "map", options = {}) {
  const s = createInitialState(1482026);
  Object.assign(s.time, { month: 9, day: 6, hour: 20, minute: 0, ...options.time });
  Object.assign(s, { region, area: region, locationId, navStack: ["map", ...regionPathOf(region)] });
  s.player.money = 12000; Object.assign(s.player.attrs, { stamina: 100, health: 100, mood: 40, hygiene: 100, satiety: 80 });
  s.tutorial = { done: steps, activeStep: -1 }; s.weather.lastRollDay = gameDay(s.time); s.savedAt = new Date().toISOString();
  options.setup?.(s); return s;
}
const report = [];
const viewports = [{ id:"desktop", width:1360, height:956, mode:"pc" }, { id:"portrait", width:390, height:844, mode:"pc" }, { id:"landscape", width:844, height:390, mode:"pe" }].filter(v => !process.env.QA_VIEW || process.env.QA_VIEW.split(",").includes(v.id));
async function scenario(v, name, save, run) {
  if(process.env.QA_CASE && !process.env.QA_CASE.split(",").includes(name))return;
  const result = { viewport:v.id, name, passed:false, checks:[], errors:[], resources:[] }; report.push(result);
  const context = await browser.newContext({ viewport:{width:v.width,height:v.height}, hasTouch:v.id !== "desktop", deviceScaleFactor:1 });
  const page = await context.newPage(); page.setDefaultTimeout(25000);
  page.on("pageerror", e => result.errors.push(e.message));
  page.on("console", m => { if(m.type()==="error")result.errors.push(m.text()); });
  page.on("requestfailed", r => { if(r.failure()?.errorText !== "net::ERR_ABORTED")result.resources.push({url:r.url().slice(0,200),error:r.failure()?.errorText}); });
  await page.addInitScript(({save,mode,zoom}) => { if(localStorage.getItem("district-qa"))return; localStorage.clear(); localStorage.setItem("district-qa","1"); localStorage.setItem("urban-life-device-setup-v1","1"); localStorage.setItem("urban-life-ui-gamemode",mode); localStorage.setItem("urban-life-ui-zoom",zoom); localStorage.setItem("urban-life-show-log","false"); localStorage.setItem("urban_life_save_auto",JSON.stringify(save)); }, {save,mode:v.mode,zoom:process.env.QA_ZOOM || "1"});
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("urban_life_save_auto")));
  const button = (name) => page.getByRole("button", {name});
  const pin = id => page.locator(`.map-board`).last().locator(`.map-pin[data-location-id="${id}"]`);
  async function changed(test) { await page.waitForFunction(test); return state(); }
  async function resume() { await button(/继续生活/).click(); await page.locator(".scene").waitFor(); await page.waitForFunction(()=>JSON.parse(localStorage.getItem("urban_life_save_auto"))?.flags?.programming_royalty_persistent_v1===true); }
  async function shot(label) {
    await page.evaluate(async () => {await Promise.all([...document.images].map(x=>x.decode().catch(()=>{})));});
    const metrics = await page.evaluate(()=>({width:innerWidth,mode:document.documentElement.dataset.gameMode,docWidth:document.documentElement.scrollWidth,broken:[...document.images].filter(x=>x.complete && !x.naturalWidth && x.currentSrc).map(x=>x.currentSrc.slice(0,160))}));
    assert.equal(metrics.mode, v.mode === "pe" ? "mobile" : v.mode, `${label}: wrong game mode`);
    assert(metrics.docWidth <= metrics.width + 2, `${label}: horizontal overflow ${metrics.docWidth}`); assert.equal(metrics.broken.length,0,`${label}: broken images`);
    result.checks.push({label,...metrics}); await page.screenshot({path:join(output,`${v.id}-${name}-${label}.png`),animations:"disabled"});
  }
  async function action(text) {
    const before = await state();
    let card=page.locator(".action-card").filter({hasText:text}).first();
    if(!await card.count()) {
      const group=page.locator(".group-card").filter({hasText:/吃饭|饮食|采购|购买|运动|日常|生活|其他|用品|酒水/}).first();
      if(await group.count())await group.click();
      card=page.locator(".action-card").filter({hasText:text}).first();
    }
    assert(!await card.evaluate(x=>x.classList.contains("disabled")), `${text} disabled`); await card.click();
    await page.waitForFunction(t=>JSON.stringify(JSON.parse(localStorage.getItem("urban_life_save_auto"))?.time)!==t,JSON.stringify(before.time));
  }
  async function acknowledge() {
    const okay=button("知道了"); if(await okay.isVisible().catch(()=>false))await okay.click();
    const next=button("继续 →"); if(await next.isVisible().catch(()=>false))await next.click();
  }
  async function settle() { await button(/确认结算/).click(); await changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).districtLeisure.active===null); await page.locator(".result-modal").waitFor(); await shot("shared-result"); await button("继续 →").click(); }
  try {
    await page.goto(url,{waitUntil:"load",timeout:180000}); await resume();
    await run({page,state,button,pin,changed,shot,action,acknowledge,settle,resume,result});
    assert.equal(result.errors.length,0,JSON.stringify(result.errors)); assert.equal(result.resources.length,0,JSON.stringify(result.resources)); result.passed=true;
  } catch(e) { result.failure=e.stack; await page.screenshot({path:join(output,`${v.id}-${name}-failure.png`)}).catch(()=>{}); console.error(`${v.id}/${name}: ${e.message}`); }
  finally { writeFileSync(join(output,"report.json"),JSON.stringify(report,null,2)); await context.close(); }
  console.log(`${v.id}/${name}: ${result.passed?"PASS":"FAIL"}`);
}
try {
  for(const v of viewports) {
    if(process.env.QA_CASE?.split(",").includes("atmosphere")) {
      for(const map of ["development","development_university","development_reserve","boyue_night_market"]) {
        for(const sample of [{hour:12,weather:"sunny"},{hour:21,weather:"rain"},{hour:1,weather:"snow"}]) {
          await scenario(v,"atmosphere",saveAt(map,"map",{time:{hour:sample.hour},setup:s=>{s.weather.id=sample.weather;}}),async q=>{
            const board=q.page.locator(".map-board").last();
            assert.equal(await board.getAttribute("data-weather-detail"),sample.weather);
            const filters=await q.page.locator(".map-image").last().evaluate(el=>getComputedStyle(el).filter);
            assert.equal(filters,"none");
            assert.equal(await board.locator(".map-weather").evaluateAll(els=>els.filter(el=>getComputedStyle(el).display!=="none").length),0);
            const bg=q.page.locator(".scene-bg").last();
            assert.equal(await bg.getAttribute("data-district"),"true");
            const bgFilter=await bg.locator("img").evaluate(el=>getComputedStyle(el).filter);
            assert.equal(filters,bgFilter,"map and surrounding artwork must share lighting");
            if(map === "development" && sample.hour === 21) assert.equal(await board.getAttribute("data-native-lighting"),"true");
            await q.shot(`${map}-${sample.hour}-${sample.weather}`);
            q.result.checks.push({map,hour:sample.hour,weather:sample.weather,filters});
          });
        }
      }
      for(const location of ["moon_mountain","dev_museum","boyue_arcade"]) {
        await scenario(v,"atmosphere",saveAt(location === "boyue_arcade" ? "boyue_night_market" : location === "dev_museum" ? "development_culture" : "development_reserve",location,{time:{hour:21},setup:s=>{s.weather.id="rain";}}),async q=>{
          const bg=q.page.locator(".scene-bg").last();
          assert.equal(await bg.getAttribute("data-district"),"true");
          assert.equal(await bg.locator(".district-weather").count(),0);
          assert.equal(await q.page.locator(".loc-card").getAttribute("data-district"),"true");
          const bannerFilter=await q.page.locator(".loc-card").evaluate(el=>getComputedStyle(el,"::before").filter);
          const sceneFilter=await bg.locator("img").evaluate(el=>getComputedStyle(el).filter);
          assert.equal(bannerFilter,sceneFilter,"venue banner and scene lighting must agree");
          await q.shot(`${location}-night-rain`);
        });
      }
    }
    for(const sample of [{hour:12,weather:"rain"},{hour:21,weather:"sunny"}])await scenario(v,"fishing-visuals",saveAt("development_reserve","treasure_lake",{time:{hour:sample.hour},setup:s=>{s.weather.id=sample.weather;Object.assign(s.inventory,{fishing_rod:1,fishing_bait:5,fishing_bucket:1});}}),async q=>{
      await q.button("抛竿钓鱼").click();await q.page.locator(".fishing-dialog canvas").waitFor();await q.shot(`${sample.hour}-${sample.weather}`);assert.equal(await q.page.locator(".fishing-dialog canvas").count(),1);assert.equal(await q.page.locator(".fishing-overlay").evaluate(el=>getComputedStyle(el).backdropFilter),"none");q.result.checks.push({nativeLandscape:true,...sample});
    });
    await scenario(v,"fishing",saveAt("development_reserve","treasure_lake",{time:{hour:12},setup:s=>{Object.assign(s.inventory,{fishing_rod:1,fishing_bait:5,fishing_bucket:1});}}),async q=>{
      await q.shot("lake"); const before=await q.state(); await q.button("抛竿钓鱼").click();
      await q.changed(()=>!!JSON.parse(localStorage.getItem("urban_life_save_auto")).fishing.active);
      const cast=await q.state(); assert.equal(cast.inventory.fishing_bait,4); assert.equal(cast.player.attrs.stamina,before.player.attrs.stamina-5); assert.deepEqual(cast.time,before.time);
      await q.button("立即提竿").click(); await q.page.locator(".fishing-dialog .track").waitFor();
      const dialog=await q.page.locator(".fishing-dialog").boundingBox();assert(Math.abs(dialog.x)<1&&Math.abs(dialog.y)<1&&Math.abs(dialog.width-v.width)<1&&Math.abs(dialog.height-v.height)<1,"fishing must cover the full viewport");assert.equal(await q.page.locator(".fishing-overlay").evaluate(el=>getComputedStyle(el).position),"fixed");await q.shot("fight");
      const hold=q.button("按住上浮"),holdBounds=await hold.boundingBox(),barBefore=await q.page.locator(".fishing-dialog .catch-zone").evaluate(el=>parseFloat(el.style.bottom));
      if(v.id!=="desktop") {const cdp=await q.page.context().newCDPSession(q.page);await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:holdBounds.x+holdBounds.width/2,y:holdBounds.y+holdBounds.height/2}]});await q.page.waitForFunction(b=>parseFloat(document.querySelector(".fishing-dialog .catch-zone").style.bottom)>b+.5,barBefore);await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();}
      else {await q.page.mouse.move(holdBounds.x+holdBounds.width/2,holdBounds.y+holdBounds.height/2);await q.page.mouse.down();await q.page.waitForFunction(b=>parseFloat(document.querySelector(".fishing-dialog .catch-zone").style.bottom)>b+.5,barBefore);await q.page.mouse.up();}
      q.result.checks.push({holdControl:v.id==="desktop"?"mouse":"touch",barMoved:true});
      await q.button("暂停休息").click(); await q.button("收起钓鱼并保存进度").click();
      await q.page.waitForFunction(()=>document.querySelector(".save-status")?.textContent?.trim()==="已保存"); const paused=(await q.state()).fishing.active;
      await q.page.reload({waitUntil:"load"}); await q.resume(); assert.deepEqual((await q.state()).fishing.active,paused); assert.equal((await q.state()).inventory.fishing_bait,4);
      await q.button("继续这一竿").click();
      // Observe the same rendered markers as a player and hold/release the keyboard control.
      await q.page.evaluate(()=>{let previous=null,stamp=performance.now(),held=false;window.qaFishingDriver=setInterval(()=>{const zone=document.querySelector(".fishing-dialog .catch-zone"),marker=document.querySelector(".fishing-dialog .fish-marker");if(!zone||!marker)return;const now=performance.now(),bar=parseFloat(zone.style.bottom)/100,fish=parseFloat(marker.style.bottom.match(/[\d.]+/)[0])/100,dt=Math.max(.01,(now-stamp)/1000),velocity=previous===null?0:(bar-previous)/dt;const next=3*(fish-bar-.145)-velocity>0;if(next!==held){window.dispatchEvent(new KeyboardEvent(next?"keydown":"keyup",{code:"Space",key:" ",bubbles:true}));held=next;}previous=bar;stamp=now;},30);});
      await q.button("收好这一竿").waitFor({timeout:45000}); await q.page.evaluate(()=>{clearInterval(window.qaFishingDriver);window.dispatchEvent(new KeyboardEvent("keyup",{code:"Space"}));}); await q.shot("landed");
      assert.match(await q.page.locator(".fishing-body").innerText(),/鱼上岸了/); await q.button("收好这一竿").click(); await q.page.locator(".result-modal").waitFor(); await q.shot("shared-result"); await q.button("继续 →").click();
      const caught=await q.state(); assert.equal(caught.fishing.active,null); assert.equal(caught.fishing.bucket.length,1); assert.equal(caught.time.minute,30); assert.equal(caught.inventory.fishing_bait,4); assert.equal(caught.player.money,before.player.money);
      await q.page.locator(".bucket summary").click(); await q.shot("dealer"); const quote=Number((await q.page.locator(".fish-row small").first().innerText()).match(/¥([\d.]+)/)[1]); await q.button("卖给鱼商").click();
      await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).fishing.bucket.length===0); assert.equal((await q.state()).player.money,Math.round((before.player.money+quote)*100)/100);
      await q.button("抛竿钓鱼").click(); await q.button("收竿结束").click(); await q.button("继续 →").click(); const cancelled=await q.state(); assert.equal(cancelled.time.hour,13);assert.equal(cancelled.time.minute,0);assert.equal(cancelled.inventory.fishing_bait,3);assert.equal(cancelled.fishing.active,null);
      q.result.checks.push({refreshPreserved:true,actualCatch:caught.fishing.bucket[0],quote,cancelSettledOnce:true});
    });
    await scenario(v,"fish-specimens",saveAt("development_reserve","treasure_lake",{time:{hour:12},setup:s=>{s.fishing={nextId:5,active:null,bucket:[{id:1,speciesId:"crucian",grams:500},{id:2,speciesId:"crucian",grams:400},{id:3,speciesId:"crucian",grams:800}],specimens:{}};}}),async q=>{
      const before=await q.state(); await q.page.locator(".bucket summary").click(); await q.button("留作标本").nth(0).click(); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).fishing.specimens.crucian?.grams===500);
      assert.equal(await q.button("留作标本").nth(0).isEnabled(),false); await q.button("留作标本").nth(1).click();await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).fishing.specimens.crucian?.grams===800);
      const kept=await q.state();assert.equal(kept.fishing.bucket.length,1);assert.equal(kept.fishing.bucket[0].grams,400);assert.equal(kept.player.money,before.player.money);
      assert.equal(await q.page.locator(".specimens").count(),0);assert.equal(kept.inventory.fish_specimen_crucian,1);await q.page.locator('[title="背包"]').click();await q.page.locator(".bag-item").filter({hasText:"鲫鱼标本"}).waitFor();assert.match(await q.page.locator(".bag-item").filter({hasText:"鲫鱼标本"}).innerText(),/0.800/);await q.shot("largest-specimen-in-backpack");await q.button("关闭物品页面").click();await q.page.reload();await q.resume();assert.deepEqual((await q.state()).fishing,kept.fishing); q.result.checks.push({onePerSpecies:true,largest:800,reloadPreserved:true,noReturnOfOldFish:true});
    });
    await scenario(v,"npc-night",saveAt("boyue_night_market","boyue_nightclub",{time:{day:7,hour:1,minute:30},setup:s=>{s.relationships.push({npcId:"npc_netbar_boss",affinity:90,state:"close_friend"});}}),async q=>{
      assert.match(await q.page.locator(".npc-panel").innerText(),/老板/);await q.shot("sunday-overnight");await q.page.reload();await q.resume();assert.match(await q.page.locator(".npc-panel").innerText(),/老板/);
      const waiting=q.page.getByRole("button",{name:/等 30 分钟/}).first();await waiting.click();await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).time.hour===2);assert.equal(await q.page.locator(".npc-panel").count(),0);await q.shot("two-am-off-duty");
    });
    const randomSave=saveAt("development_culture","dev_art_gallery",{time:{day:6,hour:13},setup:s=>{s.relationships.push({npcId:"npc_lin_xiaoyu",affinity:90,state:"close_friend"});}});
    const linPlacement=npcPresenceAt("npc_lin_xiaoyu",{...randomSave.time,weekday:weekdayOf(randomSave.time),seed:randomSave.rng.seed});Object.assign(randomSave,{locationId:linPlacement.locationId,region:linPlacement.regionId,area:linPlacement.regionId,navStack:["map",...regionPathOf(linPlacement.regionId)]});
    await scenario(v,"npc-random",randomSave,async q=>{assert.match(await q.page.locator(".npc-panel").innerText(),/林小雨/);await q.shot("saturday-choice");await q.page.reload();await q.resume();assert.match(await q.page.locator(".npc-panel").innerText(),/林小雨/);q.result.checks.push({fixedChoice:linPlacement.locationId});});
    await scenario(v,"npc-stall",saveAt("boyue_night_market","boyue_snack_street",{time:{day:5,hour:14},setup:s=>{s.relationships.push({npcId:"npc_snack_street_vendor",affinity:90,state:"close_friend"});}}),async q=>{assert.match(await q.page.locator(".npc-panel").innerText(),/马师傅/);await q.shot("friday-new-market");});
    await scenario(v,"npc-camping",saveAt("development_reserve","camping_base",{time:{day:7,hour:10},setup:s=>{s.relationships.push({npcId:"npc_suburb_farmer",affinity:90,state:"close_friend"});}}),async q=>{assert.match(await q.page.locator(".npc-panel").innerText(),/陈守田/);await q.shot("sunday-camp");});
    await scenario(v,"npc-retired",saveAt("downtown_residential","clinic",{time:{day:3,hour:10},setup:s=>{for(const npcId of ["npc_pharmacist","npc_suburb_station_staff"]){s.relationships.push({npcId,affinity:60,state:"friend"});s.contacts.push({id:`npc_${npcId}`,name:"旧NPC",avatar:"👤",relation:"friend",title:"",intro:"",canCall:true,canSms:true,addedDay:1,npcId});}s.cityCommissions.activeId="city_suburb_last_mile";}}),async q=>{const s=await q.state();assert(!s.relationships.some(r=>["npc_pharmacist","npc_suburb_station_staff"].includes(r.npcId)));assert(!s.contacts.some(r=>["npc_pharmacist","npc_suburb_station_staff"].includes(r.npcId)));assert.equal(s.cityCommissions.activeId,null);assert.equal(await q.page.locator(".npc-panel").count(),0);await q.shot("legacy-cleaned");});
    await scenario(v,"boundaries",saveAt("development"),async q=>{
      const before=await q.state(); await q.shot("development"); await q.pin("boyue").click(); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).region==="boyue");
      const after=await q.state(); for(const key of ["time","player","weekly","living","career","work"])assert.deepEqual(after[key],before[key],`free border changes ${key}`);
      assert.equal(await q.pin("development_airport").isEnabled(),false); assert.match(await q.pin("development_airport").innerText(),/尚未开放/);
      assert.equal(await q.pin("downtown").evaluate(x=>x.style.left),"49%"); await q.shot("boyue");
      await q.pin("development").click(); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).region==="development");
      assert.equal(await q.pin("downtown").evaluate(x=>x.style.left),"33%"); await q.button("放大地图").click(); await q.button("重置",{exact:true}).click();
    });
    await scenario(v,"arcade",saveAt("boyue_night_market","boyue_arcade"),async q=>{
      assert.equal(await q.page.locator(".leisure-panel .collection, .leisure-panel .last-result").count(),0);
      await q.shot("entry"); await q.page.locator(".entry").filter({hasText:"玩偶捕手"}).getByRole("button",{name:/开始一轮/}).click();
      const started=await q.changed(()=>!!JSON.parse(localStorage.getItem("urban_life_save_auto")).districtLeisure.active); assert.equal(started.player.money,11995);
      await q.button("向右移动爪子").click(); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).districtLeisure.active?.position>0.59); const active=(await q.state()).districtLeisure.active; await q.shot("claw");
      await q.button("收起娱乐界面并保存进度").click(); await q.page.reload({waitUntil:"load"}); await q.resume();
      assert.deepEqual((await q.state()).districtLeisure.active,active); await q.button(/恢复(游戏|结算)/).click(); await q.button("↓ 降爪").click(); await q.button(/确认结算/).waitFor(); await q.settle();
      const claw=await q.state(); assert.equal(claw.time.minute,5); assert.equal(claw.player.money,11995);
      await q.page.locator(".entry").filter({hasText:"跃过泊月街"}).getByRole("button",{name:/开始一轮/}).click(); await q.button("▶ 开始跑跳").click();
      await q.page.keyboard.down("ArrowRight"); await q.page.keyboard.press("Space"); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).districtLeisure.active?.elapsedMs>1200); await q.page.keyboard.up("ArrowRight");
      await q.shot("platform"); await q.button("收起娱乐界面并保存进度").click(); await q.page.locator(".leisure-dialog").waitFor({state:"hidden"}); await q.page.waitForFunction(()=>document.querySelector(".save-status")?.textContent?.trim()==="已保存"); const platform=(await q.state()).districtLeisure.active; await q.page.reload(); await q.resume();
      const restored=(await q.state()).districtLeisure.active; assert.equal(restored.id,platform.id); assert.equal(restored.paid,platform.paid); assert.equal(restored.x,platform.x); await q.button(/恢复(游戏|结算)/).click(); await q.button("提前结束本轮").click(); await q.settle(); assert.equal((await q.state()).time.minute,35);
    });
    await scenario(v,"fish-home",saveAt("boyue_university","boyue_talent_apartment",{setup:s=>{signLease(s,"boyue_talent_apartment");s.fishing={nextId:2,active:null,bucket:[],specimens:{crucian:{id:1,speciesId:"crucian",grams:900}}};}}),async q=>{
      assert.equal(await q.page.locator(".fishing-panel").count(),0);assert.equal(await q.page.locator(".specimens").count(),0);await q.shot("home-without-collection");await q.page.getByRole("button",{name:"背包",exact:true}).click();await q.page.locator(".bag-item").filter({hasText:"鲫鱼标本"}).waitFor();assert.match(await q.page.locator(".bag-item").filter({hasText:"鲫鱼标本"}).innerText(),/0.900/);await q.shot("specimen-migrated-to-backpack");
    });
    await scenario(v,"card-animations",saveAt("boyue_night_market","boyue_texas_shop",{setup:s=>{for(let seed=1;seed<100;seed++){const trial=structuredClone(s);trial.rng={seed,calls:0};startDistrictLeisure(trial,"blackjack",{bet:20});const a=trial.districtLeisure.active;if(a?.phase==="playing"&&blackjackValue([...a.player,a.deck[a.cursor]]).total<21){Object.assign(s,trial);return;}}throw Error("No suitable deterministic animation save");}}),async q=>{
      await q.button(/恢复游戏/).click();await q.page.locator(".controls button").first().waitFor();
      await q.page.waitForFunction(()=>!!document.querySelector(".controls button")&&!document.querySelector(".controls button").disabled);const before=(await q.state()).districtLeisure.active;
      await q.page.evaluate(()=>{const hit=document.querySelector(".controls button");hit.click();hit.click();});
      await q.page.waitForFunction(n=>JSON.parse(localStorage.getItem("urban_life_save_auto")).districtLeisure.active.player.length===n,before.player.length+1);const hit=(await q.state()).districtLeisure.active;assert.equal(hit.cursor,before.cursor+1);assert.equal(hit.paid,before.paid);
      if(hit.phase!=="ready")await q.button("停牌 · 开庄").click();await q.settle();assert.equal((await q.state()).time.minute,5);
      await q.page.locator(".entry").filter({has:q.page.locator('input[aria-label="德州底注"]')}).getByRole("button",{name:/下注开局/}).click();await q.page.waitForFunction(()=>!!document.querySelector(".controls button")&&!document.querySelector(".controls button").disabled);assert.equal(await q.page.locator(".playing-card.hidden").count(),4);
      await q.button(/继续 · 追加/).click();await q.page.waitForFunction(()=>document.querySelector(".leisure-dialog").getAnimations({subtree:true}).some(a=>a.transitionProperty==="transform"));const animations=await q.page.locator(".leisure-dialog").evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.transitionProperty==="transform").length);assert(animations>0);assert.equal(await q.button(/确认结算/).isEnabled(),false);await q.settle();assert.equal((await q.state()).time.minute,15);q.result.checks.push({doubleHitAppliedOnce:true,pokerHiddenBeforeReveal:4,realFlipTransitions:animations,settleLockedDuringFlip:true});
    });
    await scenario(v,"cards",saveAt("boyue_night_market","boyue_texas_shop"),async q=>{
      await q.page.locator(".entry").filter({has:q.page.locator('input[aria-label="21点底注"]')}).getByRole("button",{name:/下注开局/}).click();
      const bj=await q.changed(()=>!!JSON.parse(localStorage.getItem("urban_life_save_auto")).districtLeisure.active); const bounds=await q.page.locator(".leisure-dialog.card-mode").boundingBox();assert(Math.abs(bounds.width-v.width)<1&&Math.abs(bounds.height-v.height)<1);await q.button("停牌 · 开庄").isVisible().then(async visible=>{if(visible)await q.button("停牌 · 开庄").waitFor({state:"visible"});});await q.shot("blackjack"); await q.button("收起娱乐界面并保存进度").click(); await q.page.reload(); await q.resume(); assert.deepEqual((await q.state()).districtLeisure.active,bj.districtLeisure.active); await q.button(/恢复(游戏|结算)/).click();
      if(await q.button("停牌 · 开庄").isVisible())await q.button("停牌 · 开庄").click(); await q.settle();
      await q.page.locator(".entry").filter({has:q.page.locator('input[aria-label="德州底注"]')}).getByRole("button",{name:/下注开局/}).click(); await q.shot("poker-flop"); await q.button(/继续 · 追加/).click(); await q.page.waitForFunction(()=>!document.querySelector(".round-footer .settle")?.disabled); await q.shot("poker-river"); await q.settle(); assert.equal((await q.state()).time.minute,15);
    });
    await scenario(v,"campus-closed",saveAt("development","map",{time:{month:8,day:30,hour:10}}),async q=>{assert.equal(await q.pin("development_university").isEnabled(),false); await q.shot("date-lock"); await q.pin("boyue").click(); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).region==="boyue"); assert.equal(await q.pin("boyue_university").isEnabled(),false); await q.shot("boyue-date-lock");});
    await scenario(v,"services",saveAt("development_reserve","moon_mountain",{time:{hour:10}}),async q=>{
      if(v.id === "portrait") assert((await q.page.locator(".scene").boundingBox()).width >= 250, "collapsed sidebars must leave a readable scene");
      await q.page.locator(".toast.show").waitFor({state:"hidden"});
      await q.shot("arrival");
      await q.action("东月道观抽签"); await q.acknowledge(); await q.page.locator(".fortune").waitFor(); await q.shot("notice-collapsed"); await q.page.locator(".fortune summary").click(); await q.shot("fortune");
      assert(!/额外体力上限|20\/20|每日一次积累/.test(await q.page.locator(".district-services").first().innerText()));
      const style=await q.page.locator(".district-services").first().evaluate(el=>{const s=getComputedStyle(el),probe=document.createElement("span");probe.style.backgroundImage=s.getPropertyValue("--grad-panel");el.append(probe);const theme=getComputedStyle(probe).backgroundImage;probe.remove();return {background:s.backgroundImage,theme,color:s.color};}); assert.equal(style.background,style.theme); q.result.checks.push({usesSharedSurface:true,...style});
      const f=(await q.state()).districtServices.fortune; await q.page.reload(); await q.resume(); assert.deepEqual((await q.state()).districtServices.fortune,f); await q.action("义诊"); await q.acknowledge(); await q.action("领取施粥"); await q.acknowledge(); await q.shot("quotas");
    });
    await scenario(v,"museum",saveAt("development_culture","dev_museum",{time:{hour:10}}),async q=>{await q.shot("exhibition"); const title=await q.page.locator(".exhibit-card h4").innerText(); await q.button("下一件 →").click(); assert.notEqual(await q.page.locator(".exhibit-card h4").innerText(),title); await q.action("参观"); await q.acknowledge(); assert.equal((await q.state()).player.stats.intelligence,31);});
    await scenario(v,"drinking",saveAt("boyue_night_market","boyue_nightclub"),async q=>{for(let i=1;i<=6;i++){await q.action("25元"); await q.acknowledge(); if(i===3||i===5)assert.equal((await q.state()).districtServices.alcoholCups,i);} await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).locationId==="old_apartment"); assert.equal((await q.state()).districtServices.alcoholCups,0); await q.shot("blackout-home");});
    await scenario(v,"campus-open",saveAt("development_university","dev_university",{time:{hour:10}}),async q=>{await q.shot("canteen"); await q.action("6元"); await q.acknowledge(); assert.equal((await q.state()).player.money,11994);});
    await scenario(v,"housing",saveAt("development_university","dev_incubator",{time:{hour:10}}),async q=>{
      assert.match(await q.page.locator(".loc-info").innerText(),/尚未入住/); await q.shot("public-entry");
      await q.action("签约创业住房"); await q.acknowledge(); const signed=await q.state(); assert.equal(signed.living.lease.housingId,"dev_incubator"); assert.equal(signed.player.money,11200);
      assert.match(await q.page.locator(".loc-info").innerText(),/当前入住/); await q.shot("tenant-entry"); await q.page.reload(); await q.resume(); assert.deepEqual((await q.state()).living.lease,signed.living.lease);
    });
    await scenario(v,"camping",saveAt("development_reserve","camping_base",{time:{hour:22},setup:s=>signLease(s,"dev_incubator")}),async q=>{
      const before=await q.state(); await q.page.locator(".action-card").filter({hasText:"登记野营住宿"}).click(); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).living.awayNight?.lodgingId==="camping_lodging"); await q.acknowledge();
      await q.page.locator(".action-card").filter({hasText:"睡觉"}).first().click(); await q.button(/睡 8 小时/).click(); await q.changed(()=>JSON.parse(localStorage.getItem("urban_life_save_auto")).time.hour===6); const after=await q.state(); assert.deepEqual(after.living.lease,before.living.lease); assert.equal(after.player.money,before.player.money-30); assert.equal(after.locationId,"camping_base"); await q.shot("morning");
    });
    await scenario(v,"sports-outfits",saveAt("downtown_residential","old_apartment",{setup:s=>{for(const id of ["football_jersey","basketball_jersey","sports_shorts"])s.inventory[id]=1; s.equipped.clothes="football_jersey";s.equipped.pants="sports_shorts";}}),async q=>{
      await q.page.locator(".action-card").filter({hasText:"打开衣柜"}).click(); await q.page.locator(".wardrobe-layout").waitFor(); await q.shot("football-shorts");
      await q.page.locator(".clothing-card").filter({hasText:"篮球球衣"}).click(); await q.shot("basketball-shorts"); await q.button("关闭衣柜").click();
    });
  }
  if(!process.env.QA_FILE && viewports.some(v=>v.id==="desktop")) {
    await scenario(viewports.find(v=>v.id==="desktop"),"bartender",saveAt("boyue_night_market","boyue_nightclub",{time:{day:8,hour:18},setup:s=>{applyForJob(s,JOB_DEFS.find(j=>j.id==="job_boyue_bartender"));}}),async q=>{
      await q.page.locator(".fj-card").click(); await q.page.locator(".restaurant-layout").waitFor(); await q.page.locator('.rg-ing-btn[data-item-id]').first().click();
      await q.button("暂停工作").click(); await q.changed(()=>!!JSON.parse(localStorage.getItem("urban_life_save_auto")).work?.active?.minigameProgress);
      const old=(await q.state()).work.active; await q.shot("pause"); await q.page.reload(); await q.resume(); await q.page.locator(".restaurant-layout").waitFor();
      assert.equal((await q.state()).work.active.id,old.id); assert.deepEqual((await q.state()).work.active.minigameProgress.customers,old.minigameProgress.customers); await q.shot("restored");
    });
    await scenario(viewports.find(v=>v.id==="desktop"),"stall-midnight",saveAt("development_university","dev_food_street",{time:{hour:22,minute:45},setup:s=>{s.player.skills.cooking=2;s.inventory.vegetable=1;s.inventory.meat=1;}}),async q=>{
      await q.action("摆摊卖小吃"); await q.page.locator(".restaurant-layout").waitFor(); await q.shot("after-midnight");
      assert.equal((await q.state()).time.hour,0); assert.equal((await q.state()).time.minute,45); assert.match(await q.page.locator(".rg-top").innerText(),/00:45/); await q.button("结束挑战（按 0 分结算）").click();
    });
    await scenario(viewports.find(v=>v.id==="desktop"),"dance",saveAt("boyue_night_market","boyue_nightclub"),async q=>{
      await q.button("进入舞池").click(); await q.button("▶ 开始曲目").click(); await q.shot("rhythm");
      // Driver observes rendered note positions and sends the same pointer input as a player.
      await q.page.evaluate(()=>{window.qaDanceDriver=setInterval(()=>{const lanes=[...document.querySelectorAll(".lanes button")];for(const note of document.querySelectorAll(".rhythm-stage svg g, .stage svg g")){if(!note.querySelector("rect"))continue;const m=note.getAttribute("transform")?.match(/translate\(([-.\d]+),\s*([-.\d]+)\)/);if(m&&Math.abs(Number(m[2])-330)<9){const lane=Math.round((Number(m[1])-70)/140);lanes[lane]?.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));}}},20);});
      await q.page.locator(".finished").waitFor({timeout:60000}); await q.page.evaluate(()=>clearInterval(window.qaDanceDriver)); await q.shot("rhythm-finish"); await q.settle();
      const s=await q.state(); assert(s.districtLeisure.dancePerfectNight !== undefined,"rendered-input driver did not reach full score"); q.result.checks.push({perfect:true,track:0});
      await q.action("兑换免费"); await q.acknowledge(); const claimed=await q.state(); assert.equal(claimed.player.money,s.player.money); assert.equal(claimed.districtServices.alcoholCups,1); q.result.checks.push({freeDrinkClaimed:true});
    });
  }
} finally { await server.close(); await browser.close(); }
writeFileSync(join(output,"report.json"),JSON.stringify(report,null,2));
if(report.some(x=>!x.passed))process.exitCode=1;
