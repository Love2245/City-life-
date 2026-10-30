// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {createCompanyStill,companyStillComposition} from '../src/lib/companyStillView';
import {officeLightScheme} from '../src/lib/officeLighting';
import manifest from '../src/assets/mobile-stills/company/manifest.json';
const fake=vi.hoisted(()=>({requests:[] as {frame:any;layers:any[];complete:()=>void}[],zoom:vi.fn(),reset:vi.fn(),options:{} as any,dispose:vi.fn()}));
vi.mock('../src/lib/stillScene',async importOriginal=>{
  const actual=await importOriginal<typeof import('../src/lib/stillScene')>();
  return{...actual,createStillScene:vi.fn((host:HTMLElement,options:any)=>{
    fake.options=options;const canvas=document.createElement('canvas');host.append(canvas);let key='',pending:Promise<boolean>|undefined;
    return{canvas,ready:Promise.resolve(),objectAt:()=>undefined,imageToHost:(x:number,y:number)=>({x:x/40.96,y:y/25.6,visible:true}),zoom:fake.zoom,resetView:fake.reset,
      update:(frame:any,layers:any[])=>{const signature=JSON.stringify([frame,layers]);if(signature===key)return pending??Promise.resolve(true);key=signature;return pending=new Promise<boolean>(resolve=>fake.requests.push({frame,layers,complete(){options.onLayout?.();resolve(true);}}));},
      dispose:()=>{fake.dispose();canvas.remove();},
    };
  })};
});
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
afterEach(()=>{fake.requests=[];fake.zoom.mockClear();fake.reset.mockClear();fake.dispose.mockClear();document.body.replaceChildren();vi.restoreAllMocks();});
describe('办公室2D日夜照片与轻量光色',()=>{
  it.each([1,2,3,4])('阶段%i保留四方向既有4K照片，夏冬日落使用各自日夜帧',stage=>{
    for(let angle=0;angle<4;angle++){
      const summer=companyStillComposition(stage,angle,[],18,7),winter=companyStillComposition(stage,angle,[],18,12);
      expect(summer.frame.width).toBe(4096);expect(summer.frame.height).toBe(2560);expect(winter.frame.width).toBe(4096);
      expect(summer.frame).toEqual((manifest.frames as any)[`${stage}-${angle}-day`]);expect(winter.frame).toEqual((manifest.frames as any)[`${stage}-${angle}-night`]);
    }
  });
  it('分钟和天气只更新轻量光色、不重新解码同一照片；昼夜切换保留方向和缩放，释放后不发布迟到帧',async()=>{
    const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>{throw new Error('wrapper must not create WebGL or another canvas context');});
    const host=document.createElement('div');document.body.append(host);const labels=vi.fn(),view=createCompanyStill(host,1,labels,vi.fn());
    view.update([],12,'sunny',9);expect(fake.requests).toHaveLength(1);fake.requests[0]!.complete();await settle();
    const canvas=host.querySelector('canvas')!,day=canvas.style.filter;view.rotate(Math.PI/2);fake.requests[1]!.complete();await settle();view.zoom(2);expect(fake.zoom).toHaveBeenCalledExactlyOnceWith(.5);
    view.update([],12.5,'rain',9);await settle();expect(fake.requests).toHaveLength(2);expect(canvas.style.filter).toBe(officeLightScheme(12.5,9,'rain').filter);expect(canvas.style.filter).not.toBe(day);
    expect(JSON.parse(host.dataset.officeLighting!)).toMatchObject({hour:12.5,weather:'rain',month:9,frame:'day'});expect(host.dataset.companyStillAngle).toBe('1');expect(fake.reset).not.toHaveBeenCalled();
    view.update([],18,'rain',12);expect(fake.requests).toHaveLength(3);expect(fake.requests[2]!.frame.camera.key).toBe('company-1-1');expect(fake.requests[2]!.frame.width).toBe(4096);expect(fake.requests[2]!.frame.photographBackground).toEqual([18,32,57]);fake.requests[2]!.complete();await settle();
    expect(JSON.parse(host.dataset.officeLighting!)).toMatchObject({hour:18,month:12,weather:'rain',lamps:true,frame:'night'});expect(host.querySelector('[data-office-light-wash]')).not.toBeNull();expect(fake.reset).not.toHaveBeenCalled();
    view.update([],18+1/60,'rain',12);await settle();expect(fake.requests).toHaveLength(3);expect(canvas.style.filter).toBe(officeLightScheme(18+1/60,12,'rain').filter);
    view.rotate(Math.PI/2);const count=labels.mock.calls.length;view.dispose();view.dispose();fake.requests[3]!.complete();await settle();
    expect(fake.dispose).toHaveBeenCalledOnce();expect(labels.mock.calls.length).toBe(count);expect(host.querySelector('canvas')).toBeNull();expect(host.querySelector('[data-office-light-wash]')).toBeNull();expect(host.dataset.officeLighting).toBeUndefined();expect(context).not.toHaveBeenCalled();
  });
  it('night background replacement retains assigned PC layers and removes only the employee who went home',async()=>{
    const host=document.createElement('div');document.body.append(host);const view=createCompanyStill(host,2,vi.fn(),vi.fn());
    const seats=[{index:0,personId:'founder',name:'主角',tier:'mid' as const,status:'主角工位',present:false,stars:0},{index:1,personId:'employee-a',name:'员工A',tier:'high' as const,status:'编程中',present:true,stars:5}];
    view.update(seats,16,'sunny',9);const day=fake.requests[0]!;expect(day.frame.photographBackground).toBeUndefined();expect(day.layers.map(layer=>layer.hitId)).toEqual(['0','1','employee:1']);day.complete();await settle();
    view.update(seats.map(seat=>({...seat,present:false})),20,'sunny',9);const night=fake.requests[1]!;expect(night.frame.photographBackground).toEqual([18,32,57]);expect(night.layers.map(layer=>layer.hitId)).toEqual(['0','1']);expect(night.layers.map(layer=>layer.src)).toEqual(day.layers.filter(layer=>!layer.hitId.startsWith('employee:')).map(layer=>layer.src));night.complete();await settle();
    view.dispose();
  });
});
