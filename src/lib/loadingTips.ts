import {LOADING_TIPS,LOADING_TIP_COUNT,FINANCIAL_ALERT_TIPS} from '../game/data/loadingTips';
import type {GameState} from '../game/types';
import {financialAlertActive} from '../game/core/financialRisk';

/** A runtime-only shuffle bag; loading copy never consumes the game's random state. */
export function createLoadingTipPicker(tips:readonly string[]=LOADING_TIPS,random:()=>number=Math.random){
  const source=[...new Set(tips)];
  let bag:string[]=[],last:string|undefined;
  return (count=LOADING_TIP_COUNT):string[]=>{
    const selected:string[]=[];
    const length=Math.min(source.length,Math.max(0,Math.floor(count)));
    while(selected.length<length){
      if(!bag.length){
        bag=[...source];
        for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
      }
      let index=bag.findIndex(tip=>!selected.includes(tip)&&(selected.length>0||tip!==last));
      if(index<0)index=bag.findIndex(tip=>!selected.includes(tip));
      const [tip]=bag.splice(index,1);selected.push(tip);last=tip;
    }
    return selected;
  };
}

export const drawLoadingTips=createLoadingTipPicker();
const drawAlertTips=createLoadingTipPicker(FINANCIAL_ALERT_TIPS);
export function drawContextualLoadingTips(state:GameState){return financialAlertActive(state)?drawAlertTips():drawLoadingTips();}
