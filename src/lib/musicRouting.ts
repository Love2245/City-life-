import type {WeatherId} from '../game/types';
import {nightlifeMusic,nightlifeVenue,type NightlifeMusicId} from './nightlifeMusic';
import type {DuelMusicId} from './catDuelMusic';
/** Music-only scene data; no game state or save data is changed here. */
export interface MusicScene {
  hour: number;
  locationId?: string | null;
  regionId?: string | null;
  inGame: boolean;
  admitted?: boolean;
  sessionKey?: number;
  weather?: WeatherId;
  weekend?: boolean;
}

/** afternoon remains a readable alias for old saved music preferences. */
export type BgmTrackId = "dawn" | "morning" | "noon" | "afternoon" | "night";
export type MapMusicId = Exclude<BgmTrackId, "afternoon">;
export type BackgroundMusicId = MapMusicId | "nightclub" | "lounge" | "cafe" | "texas" | "temple" | "church" | NightlifeMusicId | DuelMusicId;
export type DoorJingleId = "store-enter" | "store-exit" | "cafe-enter" | "cafe-exit";

export function bgmForHour(hour: number): MapMusicId {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized >= 18) return "night";
  if (normalized >= 12) return "noon";
  if (normalized >= 6) return "morning";
  return "dawn";
}

const facilityMusic: Record<string, BackgroundMusicId> = {
  boyue_nightclub: "nightclub",
  boyue_lounge_bar: "lounge",
  cafe: "cafe",
  boyue_cafe: "cafe",
  boyue_texas_shop: "texas",
  temple: "temple",
  church: "church",
};

export function musicForScene(scene: MusicScene, selection: BgmTrackId | "auto"): BackgroundMusicId {
  if (scene.inGame && scene.admitted !== false && scene.locationId && facilityMusic[scene.locationId]) {
    const venue=nightlifeVenue(scene.locationId);
    if(venue&&scene.weather!==undefined)return nightlifeMusic(venue,scene.weather,scene.weekend===true,scene.hour);
    return facilityMusic[scene.locationId];
  }
  return selection === "auto" ? bgmForHour(scene.hour) : selection === "afternoon" ? "noon" : selection;
}

function doorKind(scene: MusicScene): "store" | "cafe" | null {
  if (scene.admitted === false) return null;
  if (scene.locationId === "convenience_store" || scene.locationId === "boyue_convenience_store") return "store";
  if (scene.locationId === "cafe" || scene.locationId === "boyue_cafe") return "cafe";
  return null;
}

export function doorJingles(previous: MusicScene | null, next: MusicScene): DoorJingleId[] {
  if (!previous || !previous.inGame || !next.inGame || previous.sessionKey !== next.sessionKey) return [];
  const before = doorKind(previous);
  const after = doorKind(next);
  if (previous.locationId === next.locationId && previous.regionId === next.regionId && before === after) return [];
  const result: DoorJingleId[] = [];
  if (before) result.push(`${before}-exit`);
  if (after) result.push(`${after}-enter`);
  return result;
}
