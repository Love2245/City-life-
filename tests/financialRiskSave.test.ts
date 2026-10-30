// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {configureFinancialRiskStorage,recordFinancialEvent,initializeFinancialRisk,financialBanReason} from '../src/game/core/financialRisk';
import {installFinancialRiskStorage} from '../src/lib/financialRiskStorage';
import {saveGameImmediately,loadGameIntoState,listSaves,loadGame,exportSavePayload,importSavePayload,isImportableSavePayload} from '../src/lib/save';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
let restore:()=>void;
beforeEach(()=>{localStorage.clear();restore=configureFinancialRiskStorage(undefined);installFinancialRiskStorage(s=>s===gameState);const s=createInitialState(14972898);s.player.money=100000;initializeFinancialRisk(s,'save-risk-life');replaceState(s);});
afterEach(()=>{restore();localStorage.clear();});
describe('真实存档入口与独立审计记录',()=>{
  it('存档列表、纯读取、导出、导入校验、恢复文件不算一次实际读档',async()=>{
    saveGameImmediately('slot_1',gameState);recordFinancialEvent(gameState,'stock');const key='urban_life_financial_risk_v1_save-risk-life';const before=localStorage.getItem(key);
    for(let i=0;i<4;i++){await listSaves();await loadGame('slot_1');const payload=exportSavePayload('slot_1')!;expect(isImportableSavePayload(payload)).toBe(true);expect(importSavePayload('slot_2',payload)).toBe(true);}
    expect(localStorage.getItem(key)).toBe(before);
    expect(await loadGameIntoState('slot_1')).toBe(true);expect(JSON.parse(localStorage.getItem(key)!).stock.rollbacks).toHaveLength(1);
  });
  it('跨手动档、自动档、导入档进行三次真实金融回退，普通存档不能清除封禁',async()=>{
    saveGameImmediately('slot_1',gameState);const payload=exportSavePayload('slot_1')!;expect(importSavePayload('slot_2',payload)).toBe(true);expect(importSavePayload('auto',payload)).toBe(true);
    for(const slot of ['slot_1','slot_2','auto']){expect(recordFinancialEvent(gameState,'stock')).toBe(true);expect(await loadGameIntoState(slot)).toBe(true);}
    expect(financialBanReason(gameState,'stock')).not.toBeNull();expect(gameState.player.money).toBe(100000);
    saveGameImmediately('slot_3',gameState);expect(await loadGameIntoState('slot_1')).toBe(true);expect(financialBanReason(gameState,'stock')).not.toBeNull();
    expect(await loadGameIntoState('slot_3')).toBe(true);expect(financialBanReason(gameState,'stock')).not.toBeNull();
  });
  it('正常保存并继续最新金融进度，重新载入十次也不封禁',async()=>{
    recordFinancialEvent(gameState,'stock');saveGameImmediately('auto',gameState);
    for(let i=0;i<10;i++)expect(await loadGameIntoState('auto')).toBe(true);
    expect(financialBanReason(gameState,'stock')).toBeNull();
    expect(JSON.parse(localStorage.getItem('urban_life_financial_risk_v1_save-risk-life')!).stock.rollbacks).toHaveLength(0);
  });
});
