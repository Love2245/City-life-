import dawn from "../assets/music/dawn.mp3?url";
import morning from "../assets/music/morning.mp3?url";
import noon from "../assets/music/noon.mp3?url";
import night from "../assets/music/night.mp3?url";
import nightclub from "../assets/music/nightclub.mp3?url";
import lounge from "../assets/music/lounge.mp3?url";
import texas from "../assets/music/texas.mp3?url";
import storeEnter from "../assets/music/store-enter.mp3?url";
import storeExit from "../assets/music/store-exit.mp3?url";
import cafeEnter from "../assets/music/cafe-enter.mp3?url";
import cafeExit from "../assets/music/cafe-exit.mp3?url";
import type { BackgroundMusicId, DoorJingleId } from "./musicRouting";
import type { MusicFile } from "./musicPlayer";
import {VENUE_MUSIC} from './venueMusicCatalogue';
import {DUEL_MUSIC} from './catDuelMusicCatalogue';

/** Static Vite URLs are also inlined by the existing portable HTML publisher. */
export const BACKGROUND_MUSIC: Record<BackgroundMusicId, MusicFile> = {
  ...VENUE_MUSIC,
  ...DUEL_MUSIC,
  dawn: { id: "dawn", url: dawn },
  morning: { id: "morning", url: morning },
  noon: { id: "noon", url: noon },
  night: { id: "night", url: night },
  nightclub: { id: "nightclub", url: nightclub },
  lounge: { id: "lounge", url: lounge },
  cafe: VENUE_MUSIC.cafe,
  texas: { id: "texas", url: texas },
  temple: VENUE_MUSIC.temple,
  church: VENUE_MUSIC.church,
};

export const DOOR_JINGLES: Record<DoorJingleId, MusicFile> = {
  "store-enter": { id: "store-enter", url: storeEnter },
  "store-exit": { id: "store-exit", url: storeExit },
  "cafe-enter": { id: "cafe-enter", url: cafeEnter },
  "cafe-exit": { id: "cafe-exit", url: cafeExit },
};
