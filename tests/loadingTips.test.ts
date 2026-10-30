import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {LOADING_TIPS,FINANCIAL_ALERT_TIPS} from '../src/game/data/loadingTips';
import {createLoadingTipPicker} from '../src/lib/loadingTips';

describe('author loading tips and runtime shuffle bag',()=>{
  it('preserves the original 46 entries and appends the 20 new author tips',()=>{
    const original=JSON.parse(readFileSync('tests/fixtures/loadingTipsOriginal.json','utf8')) as string[];
    expect(LOADING_TIPS.slice(0,46)).toEqual(original);expect(LOADING_TIPS).toHaveLength(66);
    expect(new Set(LOADING_TIPS).size).toBe(66);
    expect(LOADING_TIPS.slice(46)).toEqual([
      '公司资金转入到个人账户会收取20%税务，谁都躲不掉！','创业不要急于求成，回收快速扩张而倒闭公司的器材是本市创业补贴的收入来源之一','清吧每天会根据天气演奏不同风格的音乐','夜总会每天会根据天气播放不同风格的音乐','老实赚钱，很枯燥吧？','不建议摄入过多咖啡因','多运动不是坏事','证券交易所的天台很热闹','如果你的体魄追不上健康，那么健康就会追上你的体魄','什么地方会发放免费小吃？','越大的公司可以容纳越多员工','是的，新企业必须遵循本市双休制度！','房产租赁所可以提前预览房屋','“蔬菜”是本市特色的农产品，是的，就叫蔬菜','一天一苹果，医生远离我','电子游戏在本市似乎并没有多大吸引力','谁知道广播站在哪里？','在绿色桌布的方桌上边吊腊肉是泊月特色习俗！','顺顺花期待您大展宏图！','证券交易所有免费的电脑用于观察行情',
    ]);
    expect(FINANCIAL_ALERT_TIPS).toEqual(['近期似乎出现穿越者，建议大家出门小心','有一个人辜负了都市的信任','以派出超时空侦探进行盘查中','严惩违法获利者！','穿越者请前往鸿门堰派出所办理穿越手续']);
    expect(LOADING_TIPS.some(tip=>tip.includes('占位'))).toBe(false);
    expect(LOADING_TIPS).toContain('劳务市场永远都在招人');
    expect(LOADING_TIPS).toContain('是的，没人知道电视塔藏在哪里');
  });
  it('exhausts every author tip before refilling without changing the source array',()=>{
    const source=[...LOADING_TIPS],pick=createLoadingTipPicker(source,()=>.25);
    const cycle=Array.from({length:LOADING_TIPS.length},()=>pick(1)[0]);expect(new Set(cycle).size).toBe(LOADING_TIPS.length);
    expect(new Set(cycle)).toEqual(new Set(source));expect(cycle).not.toEqual(source);
    expect(pick(1)[0]).not.toBe(cycle.at(-1));expect(source).toEqual(LOADING_TIPS);
  });
  it('keeps each four-tip load distinct even when it crosses a refill boundary',()=>{
    const pick=createLoadingTipPicker(LOADING_TIPS,()=>0);let last:string|undefined;
    for(let load=0;load<100;load++){
      const selected=pick();expect(selected).toHaveLength(4);expect(new Set(selected).size).toBe(4);
      expect(selected[0]).not.toBe(last);expect(selected.every(tip=>(LOADING_TIPS as readonly string[]).includes(tip))).toBe(true);
      last=selected.at(-1);
    }
  });
  it('handles a short or empty editable pool without duplicating entries',()=>{
    expect(createLoadingTipPicker([],()=>0)()).toEqual([]);
    expect(createLoadingTipPicker(['one','one'],()=>0)()).toEqual(['one']);
    const pick=createLoadingTipPicker(['one','two'],()=>0);expect(new Set(pick()).size).toBe(2);
    expect(pick(0)).toEqual([]);
  });
});
