import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMiniGameConfig, type DeliveryCfg } from '../src/game/core/minigame';
import { cloneStreetDispatchProgress, readStreetDispatchMessage, streetDispatchDocument } from '../src/lib/streetDispatch/bridge';
import {dispatchPayTerms,dispatchMoney} from '../src/lib/streetDispatch/pay.js';

const shell=readFileSync('src/lib/streetDispatch/shell.html','utf8');
const runtime=readFileSync('src/lib/streetDispatch/runtime.js','utf8');
const opened:JSDOM[]=[];
afterEach(()=>{for(const dom of opened.splice(0))dom.window.close();});
function game(key='job_delivery', extra:Record<string,unknown>={}, hasResizeObserver=true){
  const dom=new JSDOM(shell,{url:'http://localhost/',runScripts:'outside-only'});opened.push(dom);
  const win=dom.window as any;
  const ctx=new Proxy({}, {get:(_target,name)=>name==='measureText'?()=>({width:50}):()=>{}});
  win.HTMLCanvasElement.prototype.getContext=()=>ctx;
  if(hasResizeObserver)win.ResizeObserver=class{observe(){}disconnect(){}};
  win.requestAnimationFrame=()=>1;
  win.__STREET_DISPATCH_TEST__=true;win.__STREET_DISPATCH_BRIDGE_ID__='test';
  const post=vi.fn();win.postMessage=post;
  win.eval(readFileSync('src/lib/streetDispatch/pay.js','utf8').replace(/^export /gm,''));
  win.eval(runtime);
  const engine=win.__streetDispatchTest;
  const cfg=getMiniGameConfig(key) as DeliveryCfg;
  engine.configure({cfg,sceneKey:key,seed:901,...extra});
  engine.withoutTraffic();
  return {engine,win,post,cfg};
}
function tick(engine:any,seconds:number){for(let i=0;i<Math.ceil(seconds*60);i++)engine.step(Math.min(1/60,seconds-i/60));}
function park(engine:any,point:{x:number;y:number}){const p=engine.snapshot();Object.assign(p.player,point,{speed:0,vx:0,vy:0,invuln:0});expect(engine.restore(p)).toBe(true);}
function deliverFirst(engine:any){let p=engine.snapshot(),o=p.orders[0];if(o.status==='pickup'){park(engine,o.pickup);engine.interact();o=engine.snapshot().orders.find((q:any)=>q.id===o.id);}park(engine,o.dropoff);engine.interact();}

describe('街头派送模板与三种车辆规则',()=>{
  function touchButton(win:any,button:HTMLButtonElement,kind:string,x=10,y=10){
    vi.spyOn(button,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:100,bottom:100,width:100,height:100,x:0,y:0,toJSON:()=>({})});
    const event=new win.Event(kind,{bubbles:true,cancelable:true});
    Object.defineProperties(event,{pointerType:{value:'touch'},pointerId:{value:7},clientX:{value:x},clientY:{value:y}});button.dispatchEvent(event);
  }
  it.each(['job_delivery','job_delivery_fulltime','job_express','job_taxi','job_ride_hailing'])('%s 触摸松手激活，错位兼容点击不会重复操作，鼠标键盘仍可用',key=>{
    const {engine,win,cfg}=game(key),start=win.document.querySelector('#startBtn')!,fast=win.document.querySelector('#fastBtn')!;
    touchButton(win,start,'pointerdown');touchButton(win,start,'pointerup');
    expect(engine.snapshot().mode).toBe('playing');expect(engine.snapshot().orders.length).toBe(cfg.mode==='rideshare'?1:3);
    expect(win.document.querySelector('#startOverlay')!.hidden).toBe(true);
    fast.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));expect(engine.snapshot().fastMode).toBe(false);
    fast.click();expect(engine.snapshot().fastMode).toBe(true);
    const mouse=new win.MouseEvent('click',{bubbles:true,cancelable:true,detail:1});Object.defineProperty(mouse,'pointerType',{value:'mouse'});fast.dispatchEvent(mouse);expect(engine.snapshot().fastMode).toBe(false);
  });
  it.each(['move','cancel'])('触摸%s后不误启动班次',kind=>{
    const {engine,win}=game(),button=win.document.querySelector('#startBtn')!;
    touchButton(win,button,'pointerdown');touchButton(win,button,kind==='move'?'pointermove':'pointercancel',50,50);touchButton(win,button,'pointerup',50,50);
    expect(engine.snapshot().mode).toBe('start');
  });
  it('宿主尚未完成初始化时开始按钮显示准备状态，不能吞掉看似有效的点击',()=>{
    const dom=new JSDOM(shell);opened.push(dom);const button=dom.window.document.querySelector<HTMLButtonElement>('#startBtn')!;
    expect(button.disabled).toBe(true);expect(button.getAttribute('aria-busy')).toBe('true');expect(button.textContent).toContain('正在准备');
  });
  it.each(['job_delivery','job_delivery_fulltime','job_express','job_taxi','job_ride_hailing'])('%s 初始化完成后真实按钮可启动相应班次',key=>{
    const {engine,win,cfg}=game(key);const button=win.document.querySelector<HTMLButtonElement>('#startBtn')!;
    expect(button.disabled).toBe(false);expect(button.hasAttribute('aria-busy')).toBe(false);button.click();
    const state=engine.snapshot();expect(state.mode).toBe('playing');expect(state.kind).toBe(cfg.mode);
    expect(state.orders.length).toBe(cfg.mode==='rideshare'?1:3);expect(engine.route().length).toBeGreaterThan(1);
  });
  it.each(['job_delivery','job_express','job_ride_hailing'])('%s 缺少 ResizeObserver 的旧环境仍可装配并通过按钮开始',key=>{
    const {engine,win}=game(key,{},false);const button=win.document.querySelector<HTMLButtonElement>('#startBtn')!;
    expect(button.disabled).toBe(false);button.click();expect(engine.snapshot().mode).toBe('playing');expect(engine.route().length).toBeGreaterThan(1);
  });
  it.each(['job_delivery','job_express'])('%s 新报价逐单足额累计，越过旧180元拐点和285元预算后不会缩水',key=>{
    const terms=dispatchPayTerms(180,key==='job_express'?6:10),cfg={...getMiniGameConfig(key) as DeliveryCfg,actualIncome:true,deliveryPay:terms};
    const {engine,win,post}=game(key,{cfg});engine.start();
    let total=0;
    function handoff(point:{x:number;y:number}){park(engine,point);const before=engine.snapshot();engine.interact();const after=engine.snapshot(),ids=new Set(after.orders.map((o:any)=>o.id));for(const o of before.orders)if(o.status==='delivery'&&!ids.has(o.id))total=dispatchMoney(total+dispatchMoney(o.reward*o.quality/100));}
    while(engine.snapshot().delivered<40){
      if(!engine.snapshot().orders.length)handoff({x:420,y:540});
      let order=engine.snapshot().orders[0];
      if(order.status==='pickup')handoff(order.pickup);
      order=engine.snapshot().orders.find((o:any)=>o.id===order.id);
      if(order)handoff(order.dropoff);
      expect(engine.snapshot().earnedFare).toBe(total);expect(engine.displayedIncome()).toBe(dispatchMoney(terms.base+total));
    }
    expect(total).toBeGreaterThan(285);const delivered=engine.snapshot().delivered;expect(delivered).toBeGreaterThanOrEqual(40);
    engine.pause();const saved=engine.snapshot(),loaded=game(key,{cfg,progress:saved});
    expect(loaded.engine.displayedIncome()).toBe(dispatchMoney(terms.base+total));loaded.engine.resume();
    const ending=loaded.engine.snapshot();ending.remaining=.02;loaded.engine.restore(ending);tick(loaded.engine,.1);
    const final=loaded.post.mock.calls.map(([m])=>m).find(m=>m.type==='finish'&&m.final);expect(final).toMatchObject({completedOrders:delivered,earnedFare:total});
    const summary=loaded.win.document.querySelector('#resultComment').textContent;expect(summary).toContain('底薪 ¥36 + 订单提成 ¥'+total);expect(summary).not.toContain('8小时兼职');
    expect(win.document.querySelector('.stat.money .stat-label').textContent).toBe('预计总工资');expect(post.mock.calls.some(([m])=>m.type==='progress')).toBe(true);
  });
  it('手机兼职恢复已送达收入不按单价截断，开始与结束保留同一累计金额',()=>{
    const cfg={...getMiniGameConfig('job_delivery') as DeliveryCfg,actualIncome:true};
    const {engine,win,post}=game('job_delivery',{cfg,progress:{schema:'urban-life-street-dispatch',version:0,sceneKey:'job_delivery',kind:'food',delivered:6,earnedFare:143.27}});
    expect(engine.snapshot()).toMatchObject({delivered:6,earnedFare:143.27,money:143.27});
    expect(win.document.querySelector('.stat.money .stat-label').textContent).toBe('本班工资');
    engine.start();expect(engine.snapshot().earnedFare).toBe(143.27);
    const progress=engine.snapshot();progress.remaining=.02;engine.restore(progress);tick(engine,.1);
    const finish=post.mock.calls.map(call=>call[0]).find(message=>message.type==='finish'&&message.final);
    expect(finish).toMatchObject({completedOrders:6,earnedFare:143.27});
    expect(win.document.querySelector('#resultComment').textContent).toContain('8小时兼职班次');
  });
  it('网约车预览遵守结算单价上限，外卖工资与即时扣罚分开展示',()=>{
    const rideCfg={...getMiniGameConfig('job_ride_hailing') as DeliveryCfg,actualIncome:true};
    const ride=game('job_ride_hailing',{cfg:rideCfg});
    const rideProgress=ride.engine.snapshot();Object.assign(rideProgress,{delivered:8,earnedFare:270,money:270});
    expect(ride.engine.restore(rideProgress)).toBe(true);
    expect(ride.engine.displayedIncome()).toBe(200);
    expect(ride.win.document.querySelector('.stat.money .stat-label').textContent).toBe('本班工资');

    const deliveryCfg={...getMiniGameConfig('job_delivery') as DeliveryCfg,actualIncome:true};
    const delivery=game('job_delivery',{cfg:deliveryCfg});
    const deliveryProgress=delivery.engine.snapshot();Object.assign(deliveryProgress,{delivered:2,earnedFare:100,trafficFine:5,money:95});
    expect(delivery.engine.restore(deliveryProgress)).toBe(true);
    expect(delivery.engine.displayedIncome()).toBe(100);
    expect(delivery.engine.snapshot().money).toBe(95);
    delivery.engine.start();
    const ending = delivery.engine.snapshot();
    ending.remaining = 0.02;
    expect(delivery.engine.restore(ending)).toBe(true);
    tick(delivery.engine, 0.1);
    const result = delivery.win.document.getElementById('resultComment')!.textContent!;
    expect(result).toContain('本班工资 ¥100');
    expect(result).toContain('交通罚款 ¥5 已即时扣除');
    expect(result).toContain('工资扣罚后 ¥95');
  });
  it('固定工资配送按班次底薪和达标奖金预估工资',()=>{
    const cfg={...getMiniGameConfig('job_delivery_fulltime') as DeliveryCfg,fixedShiftBase:200,shiftBonusRate:.05};
    const {engine,win}=game('job_delivery_fulltime',{cfg});
    const progress=engine.snapshot();Object.assign(progress,{delivered:3,earnedFare:999,money:999});
    expect(engine.restore(progress)).toBe(true);
    expect(engine.displayedIncome()).toBe(205);
    expect(win.document.querySelector('.stat.money .stat-label').textContent).toBe('预计班次工资');
    expect(win.document.getElementById('incomeNote').textContent).toContain('固定工资 ¥200');
  });
  it('开场只保留简短说明与开始按钮，不再加载大图',()=>{
    const {win}=game();
    expect(win.document.querySelector('.start-art')).toBeNull();
    expect(win.document.querySelector('#startBtn').textContent).toBe('开始接单');
    expect(win.document.querySelector('#joystick')).not.toBeNull();
    expect(win.document.querySelectorAll('.dpad button')).toHaveLength(0);
  });
  it.each([.37,2.41])('圆形摇杆使用连续向量转弯，方向 %s 不被限制在八个方向',angle=>{
    const {engine,win}=game();engine.start();
    const base=win.document.getElementById('joystick');
    base.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
    Object.defineProperty(base,'clientWidth',{value:100});
    const event=new win.Event('pointerdown',{bubbles:true,cancelable:true});
    Object.assign(event,{button:0,pointerId:7,clientX:50+Math.cos(angle)*32,clientY:50+Math.sin(angle)*32});
    base.dispatchEvent(event);tick(engine,1);
    expect(engine.snapshot().player.angle).toBeCloseTo(angle,1);
    expect(base.classList.contains('active')).toBe(true);
    const up=new win.Event('pointerup');Object.assign(up,{pointerId:7});base.dispatchEvent(up);tick(engine,2);
    expect(engine.snapshot().player.speed).toBe(0);
    expect(win.document.getElementById('joystickKnob').style.transform).toBe('translate(-50%,-50%)');
  });
  it('摇杆中央无漂移，暂停或取消触控会清除输入',()=>{
    const {engine,win}=game();engine.start();const origin=engine.snapshot().player;
    const base=win.document.getElementById('joystick');
    base.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
    const down=new win.Event('pointerdown',{cancelable:true});Object.assign(down,{button:0,pointerId:2,clientX:50,clientY:50});base.dispatchEvent(down);tick(engine,.3);
    expect(engine.snapshot().player).toMatchObject({x:origin.x,y:origin.y,speed:0});
    const move=new win.Event('pointermove');Object.assign(move,{pointerId:2,clientX:90,clientY:50});base.dispatchEvent(move);tick(engine,.3);
    expect(engine.snapshot().player.speed).toBeGreaterThan(0);engine.pause();expect(base.classList.contains('active')).toBe(false);
    engine.resume();tick(engine,1);expect(engine.snapshot().player.speed).toBe(0);
    base.dispatchEvent(down);const cancel=new win.Event('pointercancel');Object.assign(cancel,{pointerId:2});base.dispatchEvent(cancel);
    expect(base.classList.contains('active')).toBe(false);
  });
  it.each(['job_delivery','job_delivery_fulltime','job_express','job_taxi','job_ride_hailing'])('%s 接入同一模板并使用对应车辆模式',key=>{
    const {engine,cfg,win}=game(key);engine.start();const p=engine.snapshot();
    expect(p.kind).toBe(cfg.mode);expect(p.remaining).toBe(90);expect(p.delivered).toBe(0);
    expect(win.document.querySelector('canvas#game')).not.toBeNull();expect(engine.route().length).toBeGreaterThan(1);
    expect(win.document.body.dataset.mode).toBe(cfg.mode);
    expect(p.orders.length).toBe(cfg.mode==='rideshare'?1:3);
  });
  it('自由驾驶具有惯性，静止时不会自动前进，刹车可停稳',()=>{
    const {engine}=game();engine.start();const initial=engine.snapshot().player;tick(engine,.5);
    expect(engine.snapshot().player.x).toBe(initial.x);engine.controls(['d']);tick(engine,.5);
    expect(engine.snapshot().player.x).toBeGreaterThan(initial.x+8);expect(engine.snapshot().player.speed).toBeGreaterThan(0);
    engine.controls([' ']);tick(engine,1);expect(engine.snapshot().player.speed).toBe(0);
  });
  it('远离取送点或未停稳时，E 不能凭空取送',()=>{
    const {engine}=game();engine.start();engine.interact();expect(engine.snapshot().orders.every((o:any)=>o.status==='pickup')).toBe(true);
    const p=engine.snapshot(),o=p.orders[0];Object.assign(p.player,o.pickup,{speed:80});engine.restore(p);engine.interact();
    expect(engine.snapshot().orders.find((q:any)=>q.id===o.id).status).toBe('pickup');park(engine,o.pickup);engine.interact();
    expect(engine.snapshot().orders.find((q:any)=>q.id===o.id).status).toBe('delivery');expect(engine.snapshot().delivered).toBe(0);
  });
  it('外卖自动接单可设置 1–6，关闭自动后送达不会补单',()=>{
    const {engine,win}=game();engine.start();const select=win.document.getElementById('autoLimit');
    select.value='6';select.dispatchEvent(new win.Event('change'));expect(engine.snapshot().orders).toHaveLength(6);
    win.document.getElementById('autoAcceptBtn').click();const before=engine.snapshot().orders.length;deliverFirst(engine);
    expect(engine.snapshot().orders.length).toBeLessThan(before);expect(engine.snapshot().autoAccept).toBe(false);
  });
  it('三轮车同仓批量装货；全部送达后必须回仓，不能在外面补下一批',()=>{
    const {engine}=game('job_express');engine.start();let p=engine.snapshot();expect(p.orders).toHaveLength(3);
    expect(new Set(p.orders.map((o:any)=>`${o.pickup.x},${o.pickup.y}`)).size).toBe(1);engine.interact();
    expect(engine.snapshot().orders.every((o:any)=>o.status==='delivery')).toBe(true);
    while(engine.snapshot().orders.length)deliverFirst(engine);
    p=engine.snapshot();expect(p.delivered).toBe(3);expect(p.returningWarehouse).toBe(true);expect(p.orders).toHaveLength(0);
    tick(engine,2);engine.interact();expect(engine.snapshot().orders).toHaveLength(0);
    park(engine,{x:420,y:540});engine.interact();p=engine.snapshot();expect(p.returningWarehouse).toBe(false);expect(p.orders).toHaveLength(3);
    expect(p.orders.every((o:any)=>o.status==='pickup'&&o.pickup.x===420&&o.pickup.y===540)).toBe(true);
  });
  it('快递超时不会把装载货物凭空删除，仍需交付和回仓',()=>{
    const {engine}=game('job_express');engine.start();engine.interact();const p=engine.snapshot();p.orders.forEach((o:any)=>o.time=.05);engine.restore(p);tick(engine,.2);
    expect(engine.snapshot().orders).toHaveLength(3);expect(engine.snapshot().orders.every((o:any)=>o.status==='delivery'&&o.late)).toBe(true);
  });
  it.each(['job_taxi','job_ride_hailing'])('%s 满意度初始 100，一次仅一人，下客后派下一单并计车费',key=>{
    const {engine,cfg}=game(key);engine.start();let p=engine.snapshot(),o=p.orders[0];expect(o.quality).toBe(100);
    expect(engine.canAccept(p.offers[0].id)).toBe(false);park(engine,o.pickup);engine.interact();p=engine.snapshot();
    expect(p.orders).toHaveLength(1);expect(p.delivered).toBe(0);expect(p.earnedFare).toBe(0);
    park(engine,o.dropoff);engine.interact();p=engine.snapshot();expect(p.delivered).toBe(1);expect(p.earnedFare).toBe(cfg.payPerOrder);
    expect(p.orders).toHaveLength(1);expect(p.orders[0].id).not.toBe(o.id);expect(p.orders[0].quality).toBe(100);
  });
  it('乘客超时期间满意度持续下降，碰撞继续扣除，下客车费按最终满意度折算',()=>{
    const {engine,cfg}=game('job_ride_hailing');engine.start();let p=engine.snapshot(),o=p.orders[0];park(engine,o.pickup);engine.interact();
    p=engine.snapshot();p.orders[0].time=0;engine.restore(p);tick(engine,2);const first=engine.snapshot().orders[0].quality;tick(engine,2);
    expect(engine.snapshot().orders[0].quality).toBeLessThan(first);engine.impact('car',155);p=engine.snapshot();
    const quality=p.orders[0].quality;expect(quality).toBeLessThan(80);expect(p.earnedFare).toBe(0);expect(p.delivered).toBe(0);
    park(engine,p.orders[0].dropoff);engine.interact();expect(engine.snapshot().earnedFare).toBe(Math.round(cfg.payPerOrder!*quality)/100);
  });
  it('碰撞无敌期和撞墙锁防止单次持续接触重复扣罚',()=>{
    const {engine,post}=game();engine.start();engine.impact('building',180);engine.impact('building',180);
    expect(engine.snapshot().crashes).toBe(1);expect(engine.snapshot().trafficFine).toBe(3);
    expect(post.mock.calls.filter(([m])=>m.type==='incident')).toHaveLength(1);
  });
  it('评级达标后继续跑单，最终只在班次时间结束结算一次',()=>{
    const {engine,post}=game('job_ride_hailing');engine.start();for(let i=0;i<7;i++)deliverFirst(engine);
    expect(engine.snapshot().delivered).toBe(7);expect(engine.snapshot().mode).toBe('playing');
    expect(post.mock.calls.filter(([m])=>m.type==='finish'&&m.final)).toHaveLength(0);
    const p=engine.snapshot();p.remaining=.02;engine.restore(p);tick(engine,.1);tick(engine,1);
    expect(post.mock.calls.filter(([m])=>m.type==='finish'&&m.final)).toHaveLength(1);
  });
  it('保存恢复保留车辆、在途订单、收入、满意度与随机状态；暂停不耗时',()=>{
    const {engine}=game('job_taxi');engine.start();deliverFirst(engine);engine.controls(['d']);tick(engine,.4);engine.pause();
    const saved=engine.snapshot();tick(engine,20);expect(engine.snapshot().remaining).toBe(saved.remaining);
    const next=game('job_taxi',{progress:saved});expect(next.engine.snapshot()).toMatchObject({mode:'paused',delivered:1,earnedFare:saved.earnedFare,gameplayState:saved.gameplayState,player:saved.player,orders:saved.orders});
    next.engine.resume();tick(next.engine,.1);expect(next.engine.snapshot().remaining).toBeLessThan(saved.remaining);
    expect(game('job_express',{progress:saved}).engine.snapshot().delivered).toBe(0);
  });
  it('主游戏暂停桥先发布最新进度，再请求暂停；主游戏恢复能解除内部暂停',()=>{
    const {engine,win,post}=game('job_taxi',{pauseWithParent:true});engine.start();engine.pause();
    const messages=post.mock.calls.map(([m])=>m);expect(messages.at(-2).type).toBe('progress');expect(messages.at(-1).type).toBe('pause-request');
    const send=(paused:boolean)=>win.dispatchEvent(new win.MessageEvent('message',{source:win,data:{channel:'urban-life-street-dispatch',bridgeId:'test',type:'pause',paused}}));
    send(true);tick(engine,2);const before=engine.snapshot().remaining;send(false);tick(engine,.1);
    expect(engine.snapshot().mode).toBe('playing');expect(engine.snapshot().remaining).toBeLessThan(before);
  });
  it('桥接只接受匹配标识和有效数值；单文件文档没有外部脚本',()=>{
    const base={channel:'urban-life-street-dispatch',bridgeId:'test',type:'finish',ratio:.5,completedOrders:2,earnedFare:40,final:true};
    expect(readStreetDispatchMessage(base,'test')).toMatchObject({completedOrders:2,earnedFare:40});
    expect(readStreetDispatchMessage({...base,earnedFare:NaN},'test')).toBeUndefined();expect(readStreetDispatchMessage(base,'other')).toBeUndefined();
    const document=streetDispatchDocument('test');expect(document).toContain('WASD');expect(document).not.toMatch(/<script[^>]+src=/);expect(document.match(/<script>/g)).toHaveLength(1);
    expect(cloneStreetDispatchProgress(undefined)).toBeUndefined();
  });
  it('旧驾驶班次没有完整快照时仍保留已下客人次和应得车费',()=>{
    const {engine}=game('job_ride_hailing',{progress:{schema:'urban-life-street-dispatch',version:0,sceneKey:'job_ride_hailing',kind:'rideshare',delivered:2,earnedFare:50}});
    expect(engine.snapshot()).toMatchObject({mode:'start',delivered:2,earnedFare:50,remaining:90});engine.start();deliverFirst(engine);
    expect(engine.snapshot().delivered).toBe(3);expect(engine.snapshot().earnedFare).toBe(75);
  });
});

describe('配送独立配乐遵守全局声音设置', () => {
  it('关闭音乐只停止自带旋律，重新开启后可以恢复，静音暂停独立音频上下文', () => {
    const {engine,win}=game('job_delivery',{audioSettings:{musicEnabled:false,musicVolume:.6,sfxVolume:.8,muted:false,paused:false}});
    const createOscillator=vi.fn(()=>({type:'sine',frequency:{value:0},connect:vi.fn(),start:vi.fn(),stop:vi.fn()}));
    const context={state:'running',currentTime:0,createOscillator,createGain:()=>({gain:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn()}),resume:vi.fn(async()=>{}),suspend:vi.fn(async()=>{})};
    win.AudioContext=function(){return context;};
    engine.start();createOscillator.mockClear();engine.step(.26);
    expect(createOscillator).not.toHaveBeenCalled();
    win.dispatchEvent(new win.MessageEvent('message',{source:win.parent,data:{channel:'urban-life-street-dispatch',bridgeId:'test',type:'audio-settings',audioSettings:{musicEnabled:true,musicVolume:.6,sfxVolume:.8,muted:false,paused:false}}}));
    engine.step(.26);expect(createOscillator).toHaveBeenCalled();
    win.dispatchEvent(new win.MessageEvent('message',{source:win.parent,data:{channel:'urban-life-street-dispatch',bridgeId:'test',type:'audio-settings',audioSettings:{musicEnabled:true,musicVolume:.6,sfxVolume:.8,muted:true,paused:false}}}));
    expect(context.suspend).toHaveBeenCalled();
  });
});
