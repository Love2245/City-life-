/** Use elapsed wall time for stable easing; slow frames must not extend an animation. */
export function sceneFrameSeconds(now:number,previous:number):number {
  return previous>0?Math.max(0,(now-previous)/1000):1/60;
}

/** Exponential follow is stable even after a long frame or a covered scene. */
export function sceneFollowBlend(seconds:number,timeConstant=.065):number {
  return 1-Math.exp(-Math.max(0,seconds)/timeConstant);
}
