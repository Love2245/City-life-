import {configureFinancialRiskStorage,type FinancialRiskJournal} from '../game/core/financialRisk';
import type {GameState} from '../game/types';
const PREFIX='urban_life_financial_risk_v1_';
export function installFinancialRiskStorage(accepts?:(state:GameState)=>boolean){
  configureFinancialRiskStorage({
    accepts,
    read(lifeId){const raw=localStorage.getItem(PREFIX+lifeId);return raw?JSON.parse(raw) as FinancialRiskJournal:null;},
    write(journal){try{const key=PREFIX+journal.lifeId,payload=JSON.stringify(journal);localStorage.setItem(key,payload);return localStorage.getItem(key)===payload;}catch{return false;}},
  });
}
export function newFinancialLifeId():string {return 'life-'+(globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);}
