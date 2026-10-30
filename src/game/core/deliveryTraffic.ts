import type { GameState } from '../types';
import type { TrafficIncident } from './deliveryShift';
import { recordMoney } from './weekly';
import { pushLog } from '../engine';

/** Only the live work host calls this; practice games keep their own virtual ledger. */
export function applyDeliveryTrafficIncident(state: GameState, incident: TrafficIncident): number {
  const fine = Number.isFinite(incident.fine) ? Math.max(0, incident.fine) : 0;
  const amount = Math.min(Math.max(0, state.player.money), fine);
  state.player.money -= amount;
  if (amount) recordMoney(state, -amount);
  pushLog(state, incident.kind === 'collision' ? '🚧' : '🚦', `${incident.message}，钱包扣除 ¥${amount}`);
  return amount;
}
