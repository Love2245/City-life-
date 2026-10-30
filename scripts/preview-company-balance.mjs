import {createServer} from 'vite';
import {writeFileSync} from 'node:fs';
const server=await createServer({server:{host:'127.0.0.1',port:1427,strictPort:true,hmr:false,watch:{ignored:['**/docs/**','**/dist-portable/**','**/待清理文件/**','**/*.html','**/src/assets/**']}}});
await server.listen();
writeFileSync('docs/company-balance-ui-1497-20261025/preview-server.json',JSON.stringify({pid:process.pid,url:'http://127.0.0.1:1427/'}));
console.log('Company balance preview: http://127.0.0.1:1427/');
