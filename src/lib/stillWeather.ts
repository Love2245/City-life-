import type {WeatherId} from '../game/types';
/** Color mood supplements baked outdoor surfaces; it never creates animated particles. */
export function stillWeatherFilter(weather:WeatherId){return({sunny:'',rain:'brightness(.9) saturate(.88)',snow:'brightness(1.01) saturate(.88)',cloudy:'brightness(.93) saturate(.9)',coldwave:'brightness(.95) saturate(.82)',heatwave:'sepia(.08) saturate(1.06)'} satisfies Record<WeatherId,string>)[weather];}
