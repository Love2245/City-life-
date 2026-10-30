import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {optimizeAssets} from '../vite.optimizeAssets';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
describe('optimized delivery asset graph',()=>{
  it('replaces binary resources and every JS/HTML URL, preserving original source metadata',async()=>{
    const temp=mkdtempSync(join(tmpdir(),'urban-asset-test-'));
    try{const original=Buffer.from('formal original'),optimized=Buffer.from('compressed variant');writeFileSync(join(temp,'variant.webp'),optimized);writeFileSync(join(temp,'manifest.json'),JSON.stringify({entries:[{sourceHash:hash(original),file:'variant.webp',sha256:hash(optimized),extension:'.webp'}]}));
      const bundle:any={'assets/bg-test.png':{type:'asset',fileName:'assets/bg-test.png',source:original,originalFileNames:['src/assets/bg/test.png']},'entry.js':{type:'chunk',fileName:'entry.js',code:'const art="./assets/bg-test.png";const local=new URL("bg-test.png",import.meta.url);',referencedFiles:['assets/bg-test.png']},'index.html':{type:'asset',fileName:'index.html',source:'<img src="./assets/bg-test.png">'}};
      bundle['entry.js'].viteMetadata={importedAssets:new Set(['assets/bg-test.png'])};
      const emitFile=()=>{};await (optimizeAssets(temp).generateBundle as Function).call({emitFile},{},bundle);
      const asset=Object.values(bundle).find((a:any)=>a.type==='asset'&&a.fileName.endsWith('.webp')) as any;
      expect(asset.source).toEqual(optimized);expect(asset.originalFileNames).toEqual(['src/assets/bg/test.png']);expect(bundle['assets/bg-test.png']).toBeUndefined();expect(bundle['entry.js'].code).not.toContain('bg-test.png');expect(bundle['entry.js'].code).toContain(asset.fileName);expect(bundle['index.html'].source).toContain(asset.fileName);expect(bundle['entry.js'].referencedFiles).toEqual([asset.fileName]);expect([...bundle['entry.js'].viteMetadata.importedAssets]).toEqual([asset.fileName]);
    }finally{if(temp.startsWith(join(tmpdir(),'urban-asset-test-')))rmSync(temp,{recursive:true,force:true});}
  });
  it('rejects a damaged optimized variant instead of shipping it',async()=>{
    const temp=mkdtempSync(join(tmpdir(),'urban-asset-test-'));try{const original=Buffer.from('original');writeFileSync(join(temp,'variant.webp'),'wrong');writeFileSync(join(temp,'manifest.json'),JSON.stringify({entries:[{sourceHash:hash(original),file:'variant.webp',sha256:'0'.repeat(64),extension:'.webp'}]}));const bundle:any={'x.png':{type:'asset',fileName:'x.png',source:original}};expect(()=> (optimizeAssets(temp).generateBundle as Function).call({emitFile:()=>{}},{},bundle)).toThrow('Invalid optimized asset');}finally{if(temp.startsWith(join(tmpdir(),'urban-asset-test-')))rmSync(temp,{recursive:true,force:true});}
  });
});
