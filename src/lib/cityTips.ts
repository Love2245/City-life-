import {createLoadingTipPicker} from './loadingTips';
import {uiState} from '../stores/uiStore.svelte';
import {gameState} from '../stores/gameStore.svelte';
import {FINANCIAL_ALERT_TIPS} from '../game/data/loadingTips';
import {financialAlertActive} from '../game/core/financialRisk';

// Deliberately separate from the loading-screen bag and all gameplay random state.
const pick=createLoadingTipPicker();
const pickAlert=createLoadingTipPicker(FINANCIAL_ALERT_TIPS);
const next=()=>financialAlertActive(gameState)?pickAlert(1)[0]:pick(1)[0];
export function showCityTip(){
  if(uiState.modal)return;
  uiState.cityTip=next();uiState.modal='city_tip';
}
export function nextCityTip(){uiState.cityTip=next();}
