import type {Plugin,ResolvedConfig} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

/** Emit separate phone GLBs; desktop assets and the formal library stay intact. */
export function mobileModels():Plugin{
  let config:ResolvedConfig;
  return {name:'urban-mobile-models',enforce:'pre',configResolved(value){config=value;},
    load(id){
      const [file,query]=id.split('?');
      if(!file.endsWith('.glb')||!new URLSearchParams(query).has('mobile-model'))return;
      const script=path.join(config.root,'scripts/build-mobile-model.py');
      const bytes=fs.readFileSync(file),hash=createHash('sha256').update(bytes).update(fs.readFileSync(script)).digest('hex');
      const cached=path.join(config.root,'.cache/mobile-models',hash+'.glb');
      if(!fs.existsSync(cached))execFileSync('python',[script,file,cached],{stdio:'pipe'});
      this.addWatchFile(file);this.addWatchFile(script);
      if(config.command==='serve')return `export default ${JSON.stringify('/@fs/'+cached.replaceAll('\\','/'))};`;
      const reference=this.emitFile({type:'asset',name:path.basename(file,'.glb')+'-mobile.glb',source:fs.readFileSync(cached)});
      return `export default "__VITE_ASSET__${reference}__";`;
    },
  };
}
