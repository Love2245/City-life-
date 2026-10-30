import type {GameMode} from './mobileLayout';
import type {QualityMode} from './scenePipeline';
import {isMobileGraphics} from './graphicsDevice';
/** Explicit PE/tablet mode also works in WebViews with incomplete pointer APIs. */
export const qualityForDevice=(mode:QualityMode,device:GameMode):QualityMode=>isMobileGraphics()||mode==='auto'&&device!=='pc'?'light':mode;
export type SceneMode='3d'|'2d';
export const defaultSceneMode=(device:GameMode):SceneMode=>device==='pc'?'3d':'2d';
/** Old phone "3d" displayed stills; keep that appearance until an explicit new choice. */
export function resolveSceneMode(value:string|null,device:GameMode,versioned=false):SceneMode{
  if(value==='flat'||value==='2d')return'2d';
  if(value==='3d')return device==='pc'||versioned?'3d':'2d';
  return defaultSceneMode(device);
}
