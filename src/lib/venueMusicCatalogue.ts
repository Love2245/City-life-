import track0 from "../assets/music/场所氛围/夜总会_晴日鼓点_354596.mp3?url";
import track1 from "../assets/music/场所氛围/夜总会_微暗律动_9867.mp3?url";
import track2 from "../assets/music/场所氛围/夜总会_雨夜电子_12327.mp3?url";
import track3 from "../assets/music/场所氛围/夜总会_周末舞池_242100.mp3?url";
import track4 from "../assets/music/场所氛围/夜总会_雨夜迪斯科_253184.mp3?url";
import track5 from "../assets/music/场所氛围/清吧_暖灯爵士_348267.mp3?url";
import track6 from "../assets/music/场所氛围/清吧_阴天慢拍_242713.mp3?url";
import track7 from "../assets/music/场所氛围/清吧_窗边听雨_216043.mp3?url";
import track8 from "../assets/music/场所氛围/清吧_周末爵士_164472.mp3?url";
import track9 from "../assets/music/场所氛围/清吧_雨夜微醺_272869.mp3?url";
import track10 from "../assets/music/场所氛围/教堂_管风琴_347173.mp3?url";
import track11 from "../assets/music/场所氛围/寺庙_禅园_310599.mp3?url";
import cafe from "../assets/music/场所氛围/咖啡馆_暖灯轻爵士_CoffeeHouseBump.mp3?url";
import type {MusicFile} from './musicPlayer';
import type {NightlifeMusicId} from './nightlifeMusic';
export const VENUE_MUSIC={
  "nightclub-clear":{id:"nightclub-clear",url:track0},
  "nightclub-cloudy":{id:"nightclub-cloudy",url:track1},
  "nightclub-rain":{id:"nightclub-rain",url:track2},
  "nightclub-weekend":{id:"nightclub-weekend",url:track3},
  "nightclub-weekend-rain":{id:"nightclub-weekend-rain",url:track4},
  "lounge-clear":{id:"lounge-clear",url:track5},
  "lounge-cloudy":{id:"lounge-cloudy",url:track6},
  "lounge-rain":{id:"lounge-rain",url:track7},
  "lounge-weekend":{id:"lounge-weekend",url:track8},
  "lounge-weekend-rain":{id:"lounge-weekend-rain",url:track9},
  "cafe":{id:"cafe",url:cafe},
  "church":{id:"church",url:track10},
  "temple":{id:"temple",url:track11},
} satisfies Record<NightlifeMusicId|'cafe'|'church'|'temple',MusicFile>;
