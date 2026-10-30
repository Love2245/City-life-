import {copyFileSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,statSync,createReadStream} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/financial-risk-1497-20261028');
if(existsSync(join(out,'before-sha256.json')))throw Error('Baseline already exists');
mkdirSync(out,{recursive:true});const files=[];
function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory()){if(p===join(root,'src/assets'))continue;walk(p);}else files.push(p);}}
for(const dir of ['src','tests','scripts'])walk(join(root,dir));
for(const name of ['package.json','index.html'])files.push(join(root,name));
const records=[];
for(const p of files){const name=relative(root,p),target=join(out,'before',name);mkdirSync(dirname(target),{recursive:true});copyFileSync(p,target);records.push({path:name.replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(p)).digest('hex')});}
writeFileSync(join(out,'before-sha256.json'),JSON.stringify(records,null,2));
const artifact=join(root,'1.49.7.html'),archive=join(root,'待清理文件/便携版历史/1.49.7_金融风控修改前_20261028.html');
if(existsSync(archive))throw Error('Archive already exists');copyFileSync(artifact,archive);
const h=createHash('sha256');for await(const part of createReadStream(artifact))h.update(part);
writeFileSync(join(out,'previous-portable.json'),JSON.stringify({path:relative(root,artifact),archive:relative(root,archive),bytes:statSync(artifact).size,sha256:h.digest('hex')},null,2));
console.log('Baseline files: '+records.length);
