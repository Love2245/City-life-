import {tick} from 'svelte';
import {createRegionTransition} from '../lib/regionTransition';
const transition=createRegionTransition({settle:tick});
export const transitionRegion=(change:()=>void)=>transition.run(change);
export const cancelRegionTransition=()=>transition.cancel();
