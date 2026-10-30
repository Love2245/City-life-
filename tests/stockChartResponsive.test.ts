// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import StockChart from '../src/components/StockChart.svelte';

let app:ReturnType<typeof mount>|undefined;
afterEach(async()=>{if(app)await unmount(app);app=undefined;vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
const history=[{minute:360,prices:{SS001:1200}},{minute:720,prices:{SS001:1250}}];
describe('stock chart available width',()=>{
  it('redraws coordinates at the new width and disconnects its observer',async()=>{
    let width=420,notify=()=>{};
    const disconnect=vi.fn();
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
    let nextFrame:FrameRequestCallback=()=>{};
    vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{nextFrame=callback;return 1;});
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){notify=callback;}observe(){}disconnect=disconnect;});
    app=mount(StockChart,{target:document.body,props:{history,stockId:'SS001',costCents:1220}});flushSync();
    const svg=document.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 420 304');
    width=620;notify();flushSync(()=>nextFrame(0));
    expect(svg.getAttribute('viewBox')).toBe('0 0 620 304');
    expect(document.querySelectorAll('circle')).toHaveLength(2);
    for(const line of document.querySelectorAll('line'))expect(Number(line.getAttribute('x2'))).toBeLessThan(620);
    expect(svg.textContent).toContain('持仓成本 12.20');
    await unmount(app);app=undefined;expect(disconnect).toHaveBeenCalledOnce();
  });
  it('remains usable without ResizeObserver and follows window resize',()=>{
    let width=360;
    vi.stubGlobal('ResizeObserver',undefined);
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>width);
    app=mount(StockChart,{target:document.body,props:{history,stockId:'SS001',mode:'daily'}});flushSync();
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 360 304');
    width=540;flushSync(()=>window.dispatchEvent(new Event('resize')));
    expect(document.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 540 304');
    expect(document.querySelectorAll('rect')).toHaveLength(1);
  });
});
