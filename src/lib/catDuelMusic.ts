import type {BattleBgKey} from './battleBg';

export const DUEL_MUSIC_IDS=['duel-street','duel-garden','duel-arcade','duel-final'] as const;
export type DuelMusicId=typeof DUEL_MUSIC_IDS[number];
export function isDuelMusicId(value:string):value is DuelMusicId{return (DUEL_MUSIC_IDS as readonly string[]).includes(value);}
/** Temporary presentation routing; never changes saves or consumes game randomness. */
export function duelMusicForScene(scene:BattleBgKey,hour:number):DuelMusicId{
  if(scene==='boss')return 'duel-final';
  if(scene==='arena')return 'duel-arcade';
  if(scene==='park'||hour>=20||hour<6)return 'duel-garden';
  return 'duel-street';
}
