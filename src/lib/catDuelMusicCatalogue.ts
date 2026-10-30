import track0 from "../assets/music/喵喵对决/街巷_轻快律动_334895.mp3?url";
import track1 from "../assets/music/喵喵对决/公园_都市爵士_155528.mp3?url";
import track2 from "../assets/music/喵喵对决/游乐场_街机对决_146875.mp3?url";
import track3 from "../assets/music/喵喵对决/首领_猫王挑战_378908.mp3?url";
import type {MusicFile} from './musicPlayer';
import type {DuelMusicId} from './catDuelMusic';
export const DUEL_MUSIC={
  'duel-street':{id:'duel-street',url:track0},
  'duel-garden':{id:'duel-garden',url:track1},
  'duel-arcade':{id:'duel-arcade',url:track2},
  'duel-final':{id:'duel-final',url:track3},
} satisfies Record<DuelMusicId,MusicFile>;
