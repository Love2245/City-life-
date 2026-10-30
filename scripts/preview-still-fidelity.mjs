import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='docs/still-navigation-fidelity-1497-20261025/preview';mkdirSync(out,{recursive:true});
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe'});
try{const page=await browser.newPage({viewport:{width:932,height:430}});page.on('pageerror',e=>console.log('ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
await page.route('**/still-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><body style="margin:0"><div id="host" style="position:relative;width:100vw;height:100vh"></div><script type="module">
import {createHomeStillView} from '/src/lib/homeStillView.ts';import {homePreviewRoom} from '/src/lib/homeRoomState.ts';import {homePlanFor} from '/src/game/core/homeInterior.ts';import {homeReferencePlan,homeReferenceState} from '/src/lib/homeReferencePlan.ts';let view;window.show=async(full)=>{view?.dispose();const plan=homeReferencePlan(homePlanFor('own_apartment'));view=createHomeStillView(document.querySelector('#host'),plan,labels=>window.labels=labels,()=>{});view.update(homeReferenceState(homePreviewRoom(plan,full,12,'auto','sunny','basic'),plan));await view.ready;};window.ready=true;</script>`}));
await page.goto('http://127.0.0.1:1431/still-fixture');await page.waitForFunction(()=>window.ready);
for(const full of [false,true]){await page.evaluate(full=>window.show(full),full);await page.waitForTimeout(200);await page.screenshot({path:`${out}/${full?'owned':'bare'}.png`});console.log('view',full,await page.evaluate(()=>window.labels));}
}finally{await browser.close();}
