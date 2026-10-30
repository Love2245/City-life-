import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream,readFileSync,writeFileSync,existsSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/pixabay-asset-integration-1497-20261027');
const baseline=join(root,'docs/nightlife-audio-transition-1497-20261027');
const assetFiles=JSON.parse(readFileSync(join(baseline,'asset-baseline.json'),'utf8'));
const sourceFiles=JSON.parse(readFileSync(join(baseline,'source-sha256.json'),'utf8'));
const intended=new Set(['src/lib/cafeRoom3D.ts','src/lib/musicRouting.ts','src/lib/nightlifeMusic.ts','src/lib/venueMusicCatalogue.ts','src/lib/musicCatalogue.ts','src/lib/interactionSoundRouting.ts','src/lib/detailedSoundCatalogue.ts','src/version.ts','tests/musicRouting.test.ts','tests/nightlifeMusic.test.ts','tests/interactionSoundRouting.test.ts']);
const changedAsset='src/assets/scenes/cafe/asset-manifest.json';
async function hash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');}
const report={checkedAt:new Date().toISOString(),assets:{checked:0,unchanged:0,intendedChanges:[],unexpected:[]},sources:{checked:0,unchanged:0,intendedChanges:[],unexpected:[]},passed:false};
async function check(files,result,allowed){
  for(const entry of files){
    result.checked++;const file=join(root,entry.path);
    if(!existsSync(file)){result.unexpected.push({path:entry.path,reason:'missing'});continue;}
    const actual=await hash(file);
    if(actual===entry.sha256){result.unchanged++;continue;}
    if(allowed.has(entry.path)){
      const backup=join(out,'before',entry.path);
      if(!existsSync(backup)||await hash(backup)!==entry.sha256)result.unexpected.push({path:entry.path,reason:'backup differs from previous verified baseline'});
      else result.intendedChanges.push({path:entry.path,before:entry.sha256,after:actual});
    }else result.unexpected.push({path:entry.path,reason:'unexpected hash change',before:entry.sha256,after:actual});
  }
}
await check(assetFiles,report.assets,new Set([changedAsset]));
await check(sourceFiles,report.sources,intended);
const added=JSON.parse(readFileSync(join(out,'素材索引与校验.json'),'utf8'));
report.added=[...added.audio.map(item=>({path:item.runtime,sha256:item.runtimeSha256})),...added.models.map(item=>({path:item.runtime,sha256:item.sha256}))];
for(const item of report.added){const file=join(root,item.path);assert(existsSync(file));assert.equal(await hash(file),item.sha256);assert(statSync(file).size>0);}
const oldAudio=[...JSON.parse(readFileSync(join(root,'docs/interaction-audio-1497-20261027/sound-manifest.json'),'utf8')),...JSON.parse(readFileSync(join(baseline,'sfx-manifest.json'),'utf8')),...JSON.parse(readFileSync(join(baseline,'music-manifest.json'),'utf8'))];
report.previousAudio={checked:0,unexpected:[]};
for(const item of oldAudio){report.previousAudio.checked++;const file=join(root,item.path);if(!existsSync(file)||await hash(file)!==item.sha256)report.previousAudio.unexpected.push(item.path);}
report.passed=report.assets.unexpected.length===0&&report.sources.unexpected.length===0&&report.previousAudio.unexpected.length===0;
writeFileSync(join(out,'preservation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
