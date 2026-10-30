import {createServer} from 'vite';
import {writeFileSync} from 'node:fs';
const server=await createServer({server:{host:'127.0.0.1',port:1427,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/dist-portable/**','**/待清理文件/**','**/.cache/**','**/*.html','**/src/assets/**']}}});
await server.listen();
writeFileSync('docs/company-calibration-1497-20261026/preview-server.json',JSON.stringify({pid:process.pid,url:'http://127.0.0.1:1427/'}));
console.log('Company calibration preview: http://127.0.0.1:1427/');
