import type {Plugin} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
/** Optimized delivery variants; never overwrite the formal source library. */
export function optimizeAssets(cache=path.resolve('.cache/release-assets')):Plugin{return{name:'urban-optimize-assets',augmentChunkHash(){const h=createHash('sha256');h.update(fs.readFileSync(path.resolve('scripts/optimize-release-assets.py')));const manifest=path.join(cache,'manifest.json');if(fs.existsSync(manifest)){const rows=JSON.parse(fs.readFileSync(manifest,'utf8')).entries??[];h.update(rows.map((r:any)=>r.sourceHash+':'+r.sha256).sort().join('\n'));}return h.digest('hex');},generateBundle(_options,bundle){
  const file=path.join(cache,'manifest.json');
  let data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{entries:[],checkedHashes:[]};
  const known=new Set<string>([...(data.checkedHashes??[]),...data.entries.map((r:any)=>r.sourceHash)]);
  const unknown=Object.values(bundle).filter(a=>a.type==='asset'&&typeof a.source!=='string'&&a.source.byteLength>=12000&&/\.(?:png|jpg|jpeg|webp|glb)$/i.test(a.fileName)&&!known.has(createHash('sha256').update(a.source).digest('hex')));
  if(unknown.length){
    fs.mkdirSync(cache,{recursive:true});const input=fs.mkdtempSync(path.join(cache,'input-'));
    try{const assets=unknown.map((a:any,i:number)=>{const inputFile=path.join(input,String(i)+path.extname(a.fileName));fs.writeFileSync(inputFile,a.source);return{file:a.fileName,originals:a.originalFileNames??[],inputFile};});const jobs=path.join(input,'jobs.json');fs.writeFileSync(jobs,JSON.stringify({assets}));
      try{execFileSync('python',[path.resolve('scripts/optimize-release-assets.py'),'--jobs',jobs,'--cache',cache],{stdio:'inherit'});}catch{throw new Error('Release asset optimization failed. Install Python and scripts/requirements-assets.txt, then rebuild.');}
      data=JSON.parse(fs.readFileSync(file,'utf8'));
    }finally{if(path.resolve(input).startsWith(path.resolve(cache)+path.sep))fs.rmSync(input,{recursive:true,force:true});}
  }
  const byHash=new Map<string,any>(data.entries.map((r:any)=>[r.sourceHash,r]));
  const replacements=new Map<string,string>();let before=0,after=0,count=0;
  for(const [key,asset]of Object.entries(bundle)){
    if(asset.type!=='asset'||typeof asset.source==='string')continue;
    const row=byHash.get(createHash('sha256').update(asset.source).digest('hex'));if(!row)continue;
    const bytes=fs.readFileSync(path.join(cache,row.file));
    if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new Error('Invalid optimized asset: '+row.file);
    const parsed=path.parse(asset.fileName),name=parsed.name.replace(/-[\w-]{8}$/,'')+'-'+row.sha256.slice(0,12)+row.extension;
    const next=path.posix.join(parsed.dir,name);if(bundle[next]&&next!==key)throw new Error('Optimized asset name collision: '+next);
    before+=asset.source.byteLength;after+=bytes.byteLength;count++;replacements.set(asset.fileName,next);
    delete bundle[key];asset.fileName=next;asset.source=bytes;bundle[next]=asset;
  }
  if(replacements.size){
    const urls=new Map(replacements);for(const [from,to]of replacements)urls.set(path.posix.basename(from),path.posix.basename(to));
    const pattern=new RegExp([...urls.keys()].sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
    const replace=(s:string)=>s.replace(pattern,name=>urls.get(name)!);
    for(const item of Object.values(bundle)){
      if(item.type==='chunk'){item.code=replace(item.code);item.referencedFiles=item.referencedFiles.map(f=>replacements.get(f)??f);const metadata=(item as any).viteMetadata;if(metadata?.importedAssets)metadata.importedAssets=new Set([...metadata.importedAssets].map((f:any)=>replacements.get(f)??f));}
      else if(typeof item.source==='string'&&/\.(?:html|css|svg)$/.test(item.fileName))item.source=replace(item.source);
    }
  }
  this.emitFile({type:'asset',fileName:'asset-optimization-summary.json',source:JSON.stringify({count,bytesBefore:before,bytesAfter:after,saved:before-after})});
}};}
