import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root=process.cwd();
const playerVersion=/export const VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(root,'src/version.ts'),'utf8'))[1];
const artifact=path.resolve(process.argv[2]??playerVersion+'.html');
const out=path.resolve(process.env.LOADING_PORTABLE_EVIDENCE??path.join(root,'docs/loading-page-refinement-20261021'));
const raw=path.join(root,'dist-portable/_inlined_assets_discard');
const expected=fs.readdirSync(raw).filter(name=>fs.statSync(path.join(raw,name)).isFile());
const hashes=new Set(),mimeCounts={},shellParts=[],modelReferences=[];
const digest=crypto.createHash('sha256');let count=0,rawBytes=0,initialized=false;
const stream=fs.createReadStream(artifact,{highWaterMark:1024*1024});
stream.on('data',chunk=>digest.update(chunk));
for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
  const match=/^<script>globalThis\.__urbanPortableAssets\[(\d+)\]=(".*");<\/script>$/.exec(line);
  if(!match){if(line.includes('globalThis.__urbanPortableAssets=[];'))initialized=true;shellParts.push(line);continue;}
  assert(initialized,'Registry used before initialization');assert.equal(Number(match[1]),count);
  const uri=JSON.parse(match[2]),header=/^data:([^;,]+);base64,/.exec(uri);assert(header,'Invalid embedded URI');
  const mime=header[1],bytes=Buffer.from(uri.slice(header[0].length),'base64');assert(bytes.length>0);
  mimeCounts[mime]=(mimeCounts[mime]??0)+1;rawBytes+=bytes.length;
  hashes.add(crypto.createHash('sha256').update(bytes).digest('hex'));count++;
  if(mime==='model/gltf-binary'){
    assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
    assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
    const model=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    const external=[...(model.buffers??[]),...(model.images??[])].flatMap(item=>item.uri&&!item.uri.startsWith('data:')?[item.uri]:[]);
    assert.equal(external.length,0,`GLB has external dependencies: ${external.join(', ')}`);
    modelReferences.push({bytes:bytes.length,meshes:model.meshes?.length??0});
  }
}
assert.equal(count,expected.length,'Emitted assets and embedded registry differ');
for(const name of expected){
  const bytes=fs.readFileSync(path.join(raw,name));
  assert(hashes.has(crypto.createHash('sha256').update(bytes).digest('hex')),`Emitted asset missing: ${name}`);
}
const shell=shellParts.join('\n');
assert(!/<section\b[^>]*id="local-file-help"/.test(shell),'Source-only help was included');
assert(!shell.includes("var isFile = location.protocol === 'file:';"),'Source-only bootstrap was included');
assert(!/<script\b[^>]*\bsrc=["'](?!data:|blob:)/i.test(shell),'External script dependency');
assert(!/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](?!data:|blob:)/i.test(shell),'External stylesheet dependency');
assert(!/(?:\.\.?\/|\/assets\/)data:(?:image|audio|model|font)\//.test(shell),'Malformed inlined data URI');
assert.equal(expected.filter(name=>shell.includes(name)).length,0,'Emitted filename still used in app shell');
let scripts=0;for(const match of shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const source=ts.createSourceFile('portable.js',match[1],ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);
  assert.equal(source.parseDiagnostics.length,0,'Invalid JavaScript syntax');scripts++;
}
const source=fs.readFileSync(path.join(root,'src/version.ts'),'utf8'),version=/export const VERSION = "([^"]+)"/.exec(source)[1];
assert(shell.includes(JSON.stringify(version)),'Current version not in game shell');
const required=['src/assets/home/v1.49/reference/bed.glb','src/assets/home/v1.49/reference/washing-machine.glb','src/assets/home/v1.49/reference/toilet.glb'];
for(const item of required)assert(hashes.has(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,item))).digest('hex')),`Housing model missing: ${item}`);
const sha256=digest.digest('hex').toUpperCase(),copyHash=crypto.createHash('sha256');
for await(const chunk of fs.createReadStream(path.join(root,'dist-portable/index.html')))copyHash.update(chunk);
assert.equal(sha256,copyHash.digest('hex').toUpperCase(),'Published file differs from build');
const loadingMarkers=['data-scene-loading-overlay','data-loading-landmark','lake-ripple','--ripple-delay','translate(-30px,-2px)','translate(32px,2px)','重新载入','使用平面场景','data-loading-motion-source','surface-drift','sceneLoadingOwner','劳务市场永远都在招人','1125965732'];
for(const marker of loadingMarkers)assert(shell.includes(marker),'Current loading feature missing from portable: '+marker);
const old=JSON.parse(fs.readFileSync(path.join(out,'portable-before.json'),'utf8').replace(/^\uFEFF/,''));assert.notEqual(sha256,old.sha256,'Portable was not updated');
const gallery=fs.readFileSync(path.join(root,'docs/scene-loading-20261021/loading-landmarks-gallery.html'),'utf8');const galleryIds=[...gallery.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(galleryIds.length,new Set(galleryIds).size,'Duplicate gallery IDs');let galleryScripts=0;for(const match of gallery.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){const parsed=ts.createSourceFile('gallery.js',match[1],ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);assert.equal(parsed.parseDiagnostics.length,0,'Gallery JavaScript syntax error');galleryScripts++;}
const report={artifact,version,bytes:fs.statSync(artifact).size,sha256,embeddedAssets:count,embeddedRawBytes:rawBytes,mimeCounts,glbModels:modelReferences.length,externalGlbReferences:0,requiredHousingModels:required,sourceHelpRemoved:true,externalScriptDependencies:0,externalStylesheetDependencies:0,parsedAppScripts:scripts,publishedCopyIdentical:true,loadingMarkers,previousPortableSha256:old.sha256,galleryScripts,galleryUniqueIds:true,fileProtocolBrowserCheck:'Blocked by browser tool URL policy; not runtime-verified',verifiedAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,'portable-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
