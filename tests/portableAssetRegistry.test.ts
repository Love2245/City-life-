import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
const folders:string[]=[];
function bundle(html:string) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'urban-portable-registry-'));folders.push(dir);
  fs.writeFileSync(path.join(dir,'index.html'),html);
  fs.writeFileSync(path.join(dir,'test-image.svg'),'<svg xmlns="http://www.w3.org/2000/svg"/>');
  execFileSync(process.execPath,['scripts/inline-portable-assets.mjs'],{cwd:process.cwd(),env:{...process.env,PORTABLE_OUT_DIR:dir},stdio:['ignore','pipe','pipe']});
  return {dir,html:fs.readFileSync(path.join(dir,'index.html'),'utf8')};
}
afterEach(()=>{for(const dir of folders.splice(0))fs.rmSync(dir,{recursive:true,force:true});});
describe('离线资源共享内嵌',()=>{
  it('加载壳包含已有文字、可见品牌和不确定进度条，启动锚点位于样式之后',()=>{
    const source=fs.readFileSync('index.html','utf8');const dom=new JSDOM(source);
    const hint=dom.window.document.querySelector<HTMLElement>('#boot-hint')!,brand=hint.querySelector<HTMLElement>('[data-boot-brand]')!,progress=hint.querySelector<HTMLElement>('[data-boot-progress]')!;
    expect(brand.textContent).toBe('都市生活');expect(hint.textContent).toContain('正在加载游戏，首次可能需要几分钟…');expect(progress.getAttribute('role')).toBe('progressbar');expect(progress.hasAttribute('aria-valuenow')).toBe(false);
    for(const node of [brand,progress])for(let current:HTMLElement|null=node;current;current=current.parentElement){const style=dom.window.getComputedStyle(current);expect(style.opacity).not.toBe('0');expect(style.display).not.toBe('none');expect(style.visibility).not.toBe('hidden');}
    expect(source.indexOf('<template id="portable-assets-anchor"></template>')).toBeGreaterThan(source.indexOf('@keyframes boot-progress'));dom.window.close();
  });
  it('Vite 移到 head 的模块在加载壳和资源注册后执行，保持离线可引用',()=>{
    const {html}=bundle('<!doctype html><html><head><script type="module" crossorigin>globalThis.first="./test-image.svg";globalThis.second="../test-image.svg";</script></head><body><div id="app"><div id="boot-hint">正在加载游戏</div></div><style>#boot-hint{display:flex}</style><template id="portable-assets-anchor"></template></body></html>');
    const hint=html.indexOf('id="boot-hint"'),style=html.indexOf('#boot-hint{display:flex}'),registry=html.indexOf('globalThis.__urbanPortableAssets=[]'),app=html.indexOf('<script type="module"');
    expect(hint).toBeGreaterThan(0);expect(style).toBeGreaterThan(hint);expect(registry).toBeGreaterThan(style);expect(app).toBeGreaterThan(registry);
    expect(html).not.toContain('portable-assets-anchor');expect(html).not.toContain('test-image.svg');expect(html).not.toMatch(/<script[^>]+src=/i);
    const context=vm.createContext({});for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
    expect(context.first).toMatch(/^data:image\/svg\+xml;base64,/);expect(context.second).toBe(context.first);
  });
  it('多个延迟模块后移时保留先后顺序，并在注册后获得资源',()=>{
    const {html}=bundle('<html><head><script type="module">globalThis.order=["head"];globalThis.a="test-image.svg";</script></head><body><div id="boot-hint">加载中</div><template id="portable-assets-anchor"></template><script type="module">globalThis.order.push("body");globalThis.b="test-image.svg";</script></body></html>');
    const registry=html.indexOf('globalThis.__urbanPortableAssets=[]'),head=html.indexOf('globalThis.order=['),body=html.indexOf('globalThis.order.push');
    expect(registry).toBeLessThan(head);expect(head).toBeLessThan(body);
    const context=vm.createContext({});for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
    expect(context.order).toEqual(['head','body']);expect(context.a).toBe(context.b);
  });
  it('加载壳之前出现不能安全后移的同步资源脚本时拒绝输出',()=>{
    expect(()=>bundle('<html><head><script>globalThis.a="test-image.svg";</script></head><body><div id="boot-hint">加载中</div><template id="portable-assets-anchor"></template></body></html>')).toThrow();
  });
  it('不能静默后移 async 模块',()=>{
    expect(()=>bundle('<html><head><script type="module" async>globalThis.a="test-image.svg";</script></head><body><div id="boot-hint">加载中</div><template id="portable-assets-anchor"></template></body></html>')).toThrow();
  });
  it('有加载壳但缺失锚点时拒绝把资源重新插入 head',()=>{
    expect(()=>bundle('<html><head><script type="module">globalThis.a="test-image.svg";</script></head><body><div id="boot-hint">加载中</div></body></html>')).toThrow();
  });
  it('便携页不显示源码启动提示，也不执行本地桌面启动检测',()=>{
    const {html}=bundle(`<html><body><section id="local-file-help" hidden>双击启动游戏.cmd <a href="http://127.0.0.1:1420/">源码服务</a></section><script>
      var isFile = location.protocol === 'file:';
      if(isFile)throw Error('source entry only');fetch('/__urban_life_desktop');
    </script><div id="app"><div id="boot-hint">正在加载游戏</div></div><script>globalThis.booted=true;</script></body></html>`);
    expect(html).not.toContain('local-file-help');expect(html).not.toContain('__urban_life_desktop');expect(html).not.toContain('127.0.0.1:1420');
    expect(html).toContain('boot-hint');const context=vm.createContext({});
    for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
    expect(context.booted).toBe(true);
  });
  it('同一图片多处引用只嵌入一次，并能在脚本执行时取得完整 data URI',()=>{
    const {html,dir}=bundle('<html><head><script>var first="./test-image.svg";var second="../test-image.svg";</script></head></html>');
    expect(html.match(/data:image\/svg\+xml;base64/g)).toHaveLength(1);
    const context=vm.createContext({});
    for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
    expect(context.first).toMatch(/^data:image\/svg\+xml;base64,/);expect(context.second).toBe(context.first);
    expect(fs.existsSync(path.join(dir,'test-image.svg'))).toBe(false);
    expect(fs.existsSync(path.join(dir,'_inlined_assets_discard','test-image.svg'))).toBe(true);
  });
  it('CSS 与 HTML 引用正确内嵌，不把 data URI 留成相对地址',()=>{
    const {html}=bundle('<html><style>.bg{background:url("../test-image.svg")}</style><img src="/assets/test-image.svg"></html>');
    expect(html.match(/data:image\/svg\+xml;base64/g)).toHaveLength(2);
    expect(html).not.toMatch(/\.\.\/data:|\/assets\/data:/);expect(html).not.toContain('test-image.svg');
  });
  it('图片文件名作为对象键保持合法，模板字符串内的完整 URL 也能共享',()=>{
    const {html}=bundle('<html><script>var map={"test-image.svg":`./test-image.svg`};</script></html>');
    const context=vm.createContext({});
    for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],context);
    // The existing filename-substitution behavior also inlines an asset name
    // used as a key; it must remain a quoted key rather than a JS expression.
    const entries=Object.entries(context.map);
    expect(entries).toHaveLength(1);expect(entries[0][0]).toBe(entries[0][1]);
  });
});
