// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createCafeStill,createStoreStill} from '../src/lib/venueStill';
import manifest from '../src/assets/mobile-stills/venues/manifest.json';

const fake=vi.hoisted(()=>({options:{} as Record<string,any>,requests:[] as {frame:any;layers:any[];complete:()=>void}[]}));
vi.mock('../src/lib/stillScene',()=>({createStillScene:vi.fn((host:HTMLElement,options:Record<string,any>)=>{
  fake.options=options;const canvas=document.createElement('canvas');host.append(canvas);
  let previous='',pending:Promise<boolean>|undefined;
  return {canvas,objectAt:()=>'door',ready:Promise.resolve(),imageToHost:(x:number,y:number)=>({x:x/1536*100,y:y/960*100,visible:true}),dispose:()=>canvas.remove(),
    update:(frame:unknown,layers:unknown[])=>{const key=JSON.stringify([frame,layers]);if(key===previous&&pending)return pending;previous=key;return pending=new Promise<boolean>(resolve=>fake.requests.push({frame,layers,complete(){options.onLayout?.();resolve(true);}}));},
  };
})}));
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
afterEach(()=>{fake.requests=[];fake.options={};document.body.innerHTML='';});

describe('phone venue photograph state',()=>{
  it('keeps the displayed hotspots until a rotated photograph has actually loaded, including weather updates during decoding',async()=>{
    const host=document.createElement('div'),labels=vi.fn(),selected=vi.fn();document.body.append(host);
    const view=createStoreStill(host,{onLabels:labels,onSelect:selected});
    expect(view.selectFacility('door')).toBe(false);
    fake.requests[0].complete();await view.ready;
    const original=labels.mock.lastCall?.[0];expect(original.length).toBe(8);
    view.rotate(Math.PI/2);expect(fake.requests).toHaveLength(2);
    fake.options.onLayout();expect(labels.mock.lastCall?.[0]).toEqual(original);
    expect(JSON.parse(host.dataset.venueStill!).angle).toBe(0);
    view.update({night:false,weather:'rain'});expect(fake.requests).toHaveLength(3);expect(fake.requests[2].frame.src).toContain('-rain.webp');
    await settle();expect(JSON.parse(host.dataset.venueStill!).angle).toBe(0);
    fake.requests[1].complete();await settle();expect(JSON.parse(host.dataset.venueStill!).angle).toBe(0);fake.requests[2].complete();await settle();
    expect(JSON.parse(host.dataset.venueStill!)).toMatchObject({angle:1,weather:'rain'});
    expect(labels.mock.lastCall?.[0]).not.toEqual(original);
    const point=manifest.views['store-1-day-closed'].points.find(p=>p.id==='door')!;
    fake.options.onClick(point.x,point.y);expect(selected.mock.lastCall?.[0]).toMatchObject({id:'door'});
    view.dispose();
  });

  it('ignores superseded frame completions and removes Lin only with the completed replacement image',async()=>{
    const host=document.createElement('div'),labels=vi.fn();document.body.append(host);
    const view=createCafeStill(host,{linPresent:true,onLabels:labels});fake.requests[0].complete();await view.ready;
    expect(labels.mock.lastCall?.[0].some((p:any)=>p.id==='lin')).toBe(true);
    view.rotate(Math.PI/2);view.rotate(Math.PI/2);expect(fake.requests).toHaveLength(3);
    fake.requests[1].complete();await settle();expect(JSON.parse(host.dataset.venueStill!).angle).toBe(0);
    fake.requests[2].complete();await settle();expect(JSON.parse(host.dataset.venueStill!).angle).toBe(2);
    view.update({night:false,linPresent:false});
    expect(labels.mock.lastCall?.[0].some((p:any)=>p.id==='lin')).toBe(true);
    expect(fake.requests[3].layers[0].src).toContain('cafe-2-day-stool.webp');
    fake.requests[3].complete();await settle();
    expect(labels.mock.lastCall?.[0].some((p:any)=>p.id==='lin')).toBe(false);
    expect(view.selectFacility('lin')).toBe(false);
    view.rotate(-Math.PI/2);const before=labels.mock.calls.length;view.dispose();fake.requests[4].complete();await settle();
    expect(labels.mock.calls.length).toBe(before);expect(host.querySelector('canvas')).toBeNull();
  });
});
