import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import playwright from 'file:///C:/Users/lijia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'docs/cat-duel-art-motion-1498-20261029');
const data=JSON.parse(readFileSync(join(out,'card-effect-art.json'),'utf8'));
const browser=await playwright.chromium.launch({headless:true,executablePath:'C:/Users/lijia/AppData/Local/Google/Chrome/Application/chrome.exe'});
try{for(const [name,ids,columns]of [['card-effects-all',null,6],['card-effects-sample',['scratch','pounce','flurry','guard','fortify','shield_claw'],3]]){
  const cards=ids?ids.map(id=>data.cards.find(c=>c.id===id)):data.cards;
  const html='<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:22px;background:#10202c;color:#eadfc5;font-family:Arial,"Microsoft YaHei",sans-serif}h1{font-size:22px;margin:0 0 8px}p{color:#a5b8b7;font-size:12px;margin:0 0 20px}.grid{display:grid;grid-template-columns:repeat('+columns+',1fr);gap:14px}article{background:#1d303d;border:1px solid #bfa66b50;border-radius:8px;padding:9px}img{width:100%;aspect-ratio:400/290;object-fit:cover;border-radius:4px}h2{font-size:15px;margin:8px 0 5px}small{font-size:11px;line-height:1.6;color:#b9c8bf}</style><h1>喵喵对决 · 独立技能效果卡面</h1><p>以爪痕、冲击、盾面、裂隙与流光表达实际效果；不使用具体猫咪或场景立绘。</p><div class="grid">'+cards.map(c=>'<article><img src="'+pathToFileURL(join(root,c.path)).href+'"><h2>'+c.name+'</h2><small>'+c.meaning+'</small></article>').join('')+'</div>';
  const path=join(out,name+'.html');writeFileSync(path,html);const page=await browser.newPage({viewport:{width:columns===6?1440:1100,height:900}});await page.goto(pathToFileURL(path).href);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.screenshot({path:join(out,name+'.png'),fullPage:true});await page.close();console.log(name,cards.length);
}}finally{await browser.close();}
