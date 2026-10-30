import {clampRenderScale} from './mobileLayout';
import {isMobileGraphics,MOBILE_NATIVE_PIXEL_BUDGET} from './graphicsDevice';

export type RenderResolution='auto'|'75'|'100'|'125'|'150';
export const RENDER_RESOLUTIONS=[
  {value:'auto',label:'自动 · 按性能调整'},
  {value:'75',label:'流畅 · 屏幕原生的 75%'},
  {value:'100',label:'屏幕原生 · 100%'},
  {value:'125',label:'高清 · 屏幕原生的 125%'},
  {value:'150',label:'超清 · 屏幕原生的 150%'},
] as const;
export function isRenderResolution(value:unknown):value is RenderResolution{return RENDER_RESOLUTIONS.some(option=>option.value===value);}
/** Native modes use physical display pixels, independent of both UI zoom and the legacy quality budget. */
export function renderPixelRatio(quality:{pixelRatio:number;maxPixels:number},width:number,height:number,scale=1,resolution:RenderResolution='auto',displayScale=1,maxTextureSize=8192,dpr=typeof devicePixelRatio==='number'?devicePixelRatio:1):number{
  const area=Math.max(1,width*height);
  if(resolution==='auto'){
    const display=Math.max(.1,Number.isFinite(displayScale)?displayScale:1);
    const ratio=Math.min(quality.pixelRatio*display,Math.sqrt(quality.maxPixels/area))*clampRenderScale(scale);
    // Low quality reduces lighting and shadows, not legibility. Even an old 50%
    // preference keeps one render pixel per displayed CSS pixel, within budget.
    return quality.maxPixels<=1_000_000?Math.max(ratio,Math.min(display,Math.sqrt(quality.maxPixels/area))):ratio;
  }
  const native=Math.max(.1,Number.isFinite(dpr)?dpr:1)*Math.max(.1,Number.isFinite(displayScale)?displayScale:1)*Number(resolution)/100;
  // Keep framebuffer dimensions and post-processing allocations within finite hardware limits.
  const mobile=isMobileGraphics(),budget=mobile?MOBILE_NATIVE_PIXEL_BUDGET:16_777_216;
  return Math.min(native,Math.sqrt(budget/area),Math.max(1,Math.min(maxTextureSize,mobile?4096:maxTextureSize))/Math.max(1,width,height));
}
export function displayPixelScale(host:HTMLElement):number{return host.getBoundingClientRect().width/Math.max(1,host.clientWidth)||1;}
