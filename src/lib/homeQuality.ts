import type { QualityMode } from './scenePipeline';
import {renderPixelRatio,type RenderResolution} from './renderResolution';
import {isMobileGraphics} from './graphicsDevice';

export type HomeDeviceMode = 'pc' | 'mobile';
export interface HomeQuality {
  id: 'fine' | 'light';
  pixelRatio: number;
  maxPixels: number;
  windowShadowSize: number;
  ceilingShadowSize: number;
  anisotropy: number;
  contactShadows: boolean;
  samples: number;
}
/** Explicit PE mode takes precedence over desktop pointer detection. */
export function homeSceneQuality(mode: QualityMode = 'auto', device: HomeDeviceMode = 'pc', ratio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): HomeQuality {
  const fine = !isMobileGraphics()&&(mode === 'fine' || mode === 'auto' && device === 'pc');
  return fine
    ? { id: 'fine', pixelRatio: Math.min(1.5, Math.max(1.25, ratio)), maxPixels: 2_000_000, windowShadowSize: 1024, ceilingShadowSize: 512, anisotropy: 4, contactShadows: true, samples: 0 }
    : { id: 'light', pixelRatio: Math.min(1.25, ratio), maxPixels: 1_000_000, windowShadowSize: 512, ceilingShadowSize: 256, anisotropy: 2, contactShadows: false, samples: 0 };
}
export function homePixelRatio(quality: HomeQuality, width: number, height: number, renderScale=1,resolution:RenderResolution='auto',displayScale=1,maxTextureSize=8192): number {
  return renderPixelRatio(quality,width,height,renderScale,resolution,displayScale,maxTextureSize);
}
