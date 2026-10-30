import type {Plugin} from 'vite';
/** Record the actual Rollup graph, including URL globs and assets, for safe pruning. */
export function assetUsage():Plugin{return{name:'urban-asset-usage',generateBundle(_options,bundle){
  const root=process.cwd().replaceAll('\\','/')+'/';
  const sources=new Set<string>();
  const record=(id:string)=>{const name=id.split('?')[0].replaceAll('\\','/');if(name.startsWith(root+'src/assets/'))sources.add(name.slice(root.length));else if(name.startsWith('src/assets/'))sources.add(name);};
  for(const id of this.getModuleIds())record(id);
  const assets=Object.values(bundle).filter(x=>x.type==='asset').map(x=>{for(const name of x.originalFileNames??[])record(name);return{file:x.fileName,bytes:typeof x.source==='string'?Buffer.byteLength(x.source):x.source.byteLength,originals:x.originalFileNames};});
  this.emitFile({type:'asset',fileName:'asset-usage.json',source:JSON.stringify({createdAt:new Date().toISOString(),sources:[...sources].sort(),assets},null,2)});
}};}
