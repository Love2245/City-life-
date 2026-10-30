import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createGzip} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('优化版尚未构建，请先运行 npm run build');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  if(new URL(req.url,'http://localhost').pathname==='/__urban_life_desktop'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({available:false,delivery:'optimized-web'}));return;}
  let target;try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));}catch{res.writeHead(400).end();return;}
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.stat(target,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end();return;}const ext=path.extname(target),gzip=/\bgzip\b/.test(req.headers['accept-encoding']??'')&&/\.(?:html|js|css|svg|json)$/.test(ext);res.setHeader('Content-Type',mime[ext]??'application/octet-stream');res.setHeader('Cache-Control',ext==='.html'?'no-store':'public,max-age=31536000,immutable');if(gzip){res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');}else res.setHeader('Content-Length',stat.size);if(req.method==='HEAD'){res.end();return;}const stream=fs.createReadStream(target);stream.on('error',()=>res.destroy());if(gzip)stream.pipe(createGzip()).pipe(res);else stream.pipe(res);});
});
server.on('error',error=>{console.error('无法启动优化版（1428端口可能已被占用）：',error.message);process.exitCode=1;});
server.listen(1428,'127.0.0.1',()=>{const url='http://127.0.0.1:1428/';console.log('都市生活优化版：'+url+'\n仅监听本机。关闭此窗口将停止服务。\n单HTML与此入口的浏览器存档分开；需要时先在旧入口导出存档，再到此处导入。');if(!process.argv.includes('--no-open'))spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();});
