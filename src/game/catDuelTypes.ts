import type { CatCardDef, CatCardEffect } from './types';

export type DuelFamily = '通用' | '连击' | '防反' | '力量' | '异常';
export interface DuelEffect extends CatCardEffect {
  poison?: number; weak?: number; vulnerable?: number;
  retaliate?: number; retainBlock?: number; blockDamage?: number;
  combo?: number; comboBonus?: number; energy?: number; poisonFactor?: number;
  /** Card-local Strength scaling; omitted on old cards means the normal 1x bonus. */
  strengthMultiplier?: number;
}
export interface DuelCardDef extends CatCardDef {
  effect: DuelEffect; upgraded: boolean; family: DuelFamily;
}
export interface DuelCollectionCard {
  uid: string; cardId: string; upgraded: boolean;
  legacy?: { petUid: string; entryUid: string; defId: string; quality: number; bonus: number };
}
export interface DuelOffer { id: string; source: 'train' | 'duel' | 'tournament'; choices: string[] }
export interface DuelRecovery { opponentId: string; playerUid: string; tournamentId?: string; casual?: boolean }
export interface CatDuelState {
  rulesVersion: 2; collection: DuelCollectionCard[]; decks: Record<string, string[]>;
  sequence: number; offer?: DuelOffer; recovery?: DuelRecovery;
  legacyDecks: Record<string, Array<{ uid: string; defId: string }>>;
  legacyBattle?: unknown;
}
export interface DuelConditions { poison: number; weak: number; vulnerable: number }
export interface DuelEvent {
  id: number; type: 'attack' | 'collect' | 'damage' | 'block' | 'heal' | 'status' | 'draw' | 'turn' | 'card' | 'mechanic' | 'finish';
  side: 'player' | 'opponent'; amount?: number; text: string;
  source?: 'player' | 'opponent'; cardId?: string; attack?: boolean;
  hitIndex?: number; hits?: number; blocked?: number; hpAfter?: number;
  handAfter?:string[];energyAfter?:number;turnAfter?:number;pilesAfter?:{draw:number;discard:number;exhaust:number};
}
export interface DuelCombatState {
  rulesVersion: 2; id: string; practice: boolean; sequence: number;
  cards: Record<string, string>; exhaustPile: string[]; events: DuelEvent[];
  conditions: { player: DuelConditions; opponent: DuelConditions };
  retaliate: number; retainBlock: number; plays: number; attacks: number;
  roundDamage: number; dodgeLayer: boolean; revived: boolean; enraged: boolean;
}
