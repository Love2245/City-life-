import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,createReadStream} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import readline from 'node:readline';
import {createServer} from 'vite';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/cat-duel-polish-1498-20261029');mkdirSync(out,{recursive:true});
const portable=process.env.QA_PORTABLE==='1',sources=JSON.parse(readFileSync(join(out,'music-sources.json'),'utf8'));
const report={createdAt:new Date().toISOString(),portable,passed:false,boundary:'Real unmuted native Chromium AudioContext, decoded music buffers, native source nodes and analyser output. Routing/lifecycle use the source module public APIs in an isolated harness. Background pause/resume API is invoked explicitly as the app does; no claim of physical loudspeaker measurement or actual OS background transition.',errors:[],externalRequests:[],decoded:[],checks:{}};
let payloads={};
if(portable){
  const digest=createHash('sha256'),input=createReadStream(join(root,'1.49.8.html'));input.on('data',c=>digest.update(c));
  const lines=readline.createInterface({input,crlfDelay:Infinity});const expected=new Map(sources.map(s=>[s.sha256,s]));
  for await(const line of lines){if(!line.includes('data:audio/'))continue;for(const match of line.matchAll(/"(data:audio\/(?:mpeg|mp3);base64,([A-Za-z0-9+/=]+))"/g)){
    const bytes=Buffer.from(match[2],'base64'),hash=createHash('sha256').update(bytes).digest('hex'),source=expected.get(hash);if(source)payloads[source.key]={uri:match[1],sha256:hash,bytes:bytes.length};
  }}
  report.artifactSha256=digest.digest('hex');assert.equal(Object.keys(payloads).length,4,'Final HTML must contain all four exact music payloads');
  report.artifactAudio=sources.map(s=>({id:s.key,sha256:payloads[s.key].sha256,bytes:payloads[s.key].bytes}));
  report.boundary+=' Portable mode extracts the four MP3 payloads from the actual final HTML, checks their SHA-256 against the imported assets, then substitutes those equivalent data URLs in the isolated source-module harness. It does not claim to instrument the full bundled app routing.';
}
const html=`<!doctype html><html><meta charset="utf-8"><title>Native duel audio verification</title><button id="start">Start native audio</button><pre id="state">Loading</pre><script type="module">
import * as audio from '/src/lib/audio.ts';
import {DUEL_MUSIC} from '/src/lib/catDuelMusicCatalogue.ts';
import {BACKGROUND_MUSIC} from '/src/lib/musicCatalogue.ts';
import {duelMusicForScene} from '/src/lib/catDuelMusic.ts';
window.harness={audio,DUEL_MUSIC,BACKGROUND_MUSIC,duelMusicForScene,stop:null};
window.audioProbe.idByUrl=new Map(Object.entries({...DUEL_MUSIC,cafe:BACKGROUND_MUSIC.cafe}).map(([key,value])=>[new URL(value.url,location.href).href,key]));
document.querySelector('#start').onclick=()=>{audio.setMuted(false);audio.setBgmEnabled(true);audio.setBgmVolume(50);audio.setMusicScene({hour:12,inGame:true,locationId:'cafe'});audio.unlockAudio();};
document.querySelector('#state').textContent='Ready';
</script></html>`;
const server=await createServer({root,logLevel:'error',plugins:[{name:'duel-native-audio-harness',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/__duel-audio-probe'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else next();});}}],server:{host:'127.0.0.1',port:1461,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/src/assets/**','**/待清理文件/**','**/dist*/**']}}});
let browser;
try{
  await server.listen();browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe',args:['--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext();await context.route(/^https?:/,route=>new URL(route.request().url()).origin==='http://127.0.0.1:1461'?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!=='http://127.0.0.1:1461')report.externalRequests.push(r.url());});
  await page.addInitScript(()=>{
    localStorage.clear();const Native=window.AudioContext;
    const p=window.audioProbe={contexts:[],decoded:[],sources:[],masters:[],idByUrl:new Map(),buffers:new WeakMap(),raw:new WeakMap(),next:0};
    const fetchNative=window.fetch.bind(window);window.fetch=async(input,init)=>{const r=await fetchNative(input,init);const original=r.arrayBuffer.bind(r),url=new URL(typeof input==='string'?input:input.url??String(input),location.href).href;
      r.arrayBuffer=async()=>{const data=await original();p.raw.set(data,p.idByUrl.get(url)??'auxiliary');return data;};return r;};
    window.AudioContext=class extends Native{
      constructor(...args){super(...args);const c=this;p.contexts.push(c);const decode=c.decodeAudioData.bind(c),createSource=c.createBufferSource.bind(c),createGain=c.createGain.bind(c);
        c.decodeAudioData=(data,...callbacks)=>{const id=p.raw.get(data)??'manual';return decode(data).then(buffer=>{
          const a=buffer.getChannelData(0),samples=Math.min(a.length,buffer.sampleRate*10);let sum=0,peak=0,n=0;for(let i=0;i<samples;i+=16){sum+=a[i]*a[i];peak=Math.max(peak,Math.abs(a[i]));n++;}
          const meta={id,duration:buffer.duration,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,decodedRms:Math.sqrt(sum/Math.max(1,n)),decodedPeak:peak};p.buffers.set(buffer,meta);p.decoded.push(meta);callbacks[0]?.(buffer);return buffer;
        },e=>{callbacks[1]?.(e);throw e;});};
        c.createBufferSource=()=>{const node=createSource(),start=node.start.bind(node),stop=node.stop.bind(node);let event;
          node.start=(...v)=>{start(...v);event={serial:++p.next,id:p.buffers.get(node.buffer)?.id??'unknown',startAt:v[0]??0,offset:v[1]??0,observedAt:c.currentTime,stopAt:Infinity};p.sources.push(event);};
          node.stop=(...v)=>{stop(...v);if(event)event.stopAt=Math.min(event.stopAt,v[0]??c.currentTime);};node.addEventListener('ended',()=>{if(event)event.endedAt=c.currentTime;});return node;};
        c.createGain=()=>{const node=createGain(),connect=node.connect.bind(node);node.connect=(...v)=>{const result=connect(...v);if(v[0]===c.destination){const analyser=c.createAnalyser();analyser.fftSize=2048;const sink=createGain();sink.gain.value=0;connect(analyser);analyser.connect(sink);sink.connect(c.destination);p.masters.push({node,analyser});}return result;};return node;};
      }
    };
  });
  await page.goto('http://127.0.0.1:1461/__duel-audio-probe');await page.waitForFunction(()=>window.harness&&document.querySelector('#state').textContent==='Ready');
  if(portable)await page.evaluate(data=>{for(const [id,p]of Object.entries(data)){harness.DUEL_MUSIC[id].url=p.uri;audioProbe.idByUrl.set(p.uri,id);}},payloads);
  const snapshot=()=>page.evaluate(()=>{const p=audioProbe,c=p.contexts[0],now=c?.currentTime??0;return {contextState:c?.state,currentTime:now,settings:harness.audio.getAudioSettings(),active:p.sources.filter(s=>now>=s.startAt&&now<s.stopAt&&!s.endedAt).map(s=>({...s,stopAt:Number.isFinite(s.stopAt)?s.stopAt:null})),masters:p.masters.map(m=>{const a=new Float32Array(m.analyser.fftSize);m.analyser.getFloatTimeDomainData(a);return {gain:m.node.gain.value,outputRms:Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length)};}),decoded:p.decoded};});
  const waitForTrack=async id=>{await page.waitForFunction(id=>{const p=audioProbe,c=p.contexts[0];return c?.state==='running'&&p.sources.some(s=>s.id===id&&c.currentTime>=s.startAt&&c.currentTime<s.stopAt&&!s.endedAt);},id);await page.waitForTimeout(3300);const state=await snapshot();assert(state.active.some(s=>s.id===id));assert(state.masters.some(m=>m.outputRms>1e-5),'Real output must contain non-silent PCM');return state;};
  await page.click('#start');report.checks.initialScene=await waitForTrack('cafe');
  for(const source of sources){await page.evaluate(id=>{const before=harness.stop;harness.stop=harness.audio.beginMinigameMusic(id);before?.();},source.key);report.checks[source.key]=await waitForTrack(source.key);}
  await page.evaluate(()=>harness.audio.setBgmVolume(25));await page.waitForTimeout(150);report.checks.volume=await snapshot();assert.equal(report.checks.volume.settings.musicVolume,.25);assert(report.checks.volume.masters.some(m=>Math.abs(m.gain-.25)<.001));
  await page.evaluate(()=>harness.audio.setMuted(true));await page.waitForTimeout(250);report.checks.muted=await snapshot();assert.equal(report.checks.muted.settings.muted,true);assert.equal(report.checks.muted.active.length,0);assert(report.checks.muted.masters.every(m=>m.outputRms<1e-6));
  await page.evaluate(()=>harness.audio.setMuted(false));report.checks.unmuted=await waitForTrack('duel-final');assert.equal(report.checks.unmuted.settings.muted,false);
  await page.evaluate(()=>harness.audio.pauseAudio());await page.waitForFunction(()=>audioProbe.contexts[0]?.state==='suspended');report.checks.backgroundApiPause=await snapshot();assert.equal(report.checks.backgroundApiPause.settings.paused,true);assert.equal(report.checks.backgroundApiPause.active.length,0);
  await page.evaluate(()=>harness.audio.resumeAudio());report.checks.foregroundApiResume=await waitForTrack('duel-final');assert.equal(report.checks.foregroundApiResume.settings.paused,false);assert(report.checks.foregroundApiResume.active.some(s=>s.id==='duel-final'&&s.offset>0));
  await page.evaluate(()=>{harness.stop();harness.stop();harness.stop=null;});report.checks.restoredScene=await waitForTrack('cafe');assert(report.checks.restoredScene.active.every(s=>s.id==='cafe'));
  const native=await page.evaluate(()=>audioProbe.decoded);report.decoded=sources.map(s=>{const d=native.find(d=>d.id===s.key);assert(d&&d.duration>45&&d.channels===2&&d.decodedRms>1e-5);assert(Math.abs(d.duration-s.duration)<.15);return {...d,fileSha256:s.sha256,fileBytes:s.bytes};});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.passed=true;
  await page.evaluate(()=>harness.audio.stopBgm());await context.close();
}catch(e){report.failure=e.stack;throw e;}finally{writeFileSync(join(out,portable?'music-browser-portable.json':'music-browser.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify({passed:report.passed,portable,decodedTracks:report.decoded.length,checks:Object.keys(report.checks).length,errors:report.errors.length,externalRequests:report.externalRequests.length}));
