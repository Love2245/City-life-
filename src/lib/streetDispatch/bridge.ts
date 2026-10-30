import payRuntime from './pay.js?raw';
import shell from './shell.html?raw';
import runtime from './runtime.js?raw';
import layout from './layout.css?raw';
import type { DeliveryCfg } from '../../game/core/minigame';
import type { TrafficIncident } from '../../game/core/deliveryShift';

export const STREET_DISPATCH_CHANNEL = 'urban-life-street-dispatch';
export interface StreetDispatchProgress {
  schema: typeof STREET_DISPATCH_CHANNEL;
  version: 1;
  sceneKey: string;
  kind: DeliveryCfg['mode'];
  mode: 'start' | 'playing' | 'paused' | 'end';
  delivered: number;
  earnedFare: number;
  [key: string]: unknown;
}
export type StreetDispatchMessage =
  | { type: 'ready' | 'pause-request'; bridgeId: string }
  | { type: 'initialized'; bridgeId: string; restored: boolean }
  | { type: 'progress'; bridgeId: string; progress: StreetDispatchProgress; completedOrders: number; earnedFare: number }
  | { type: 'finish'; bridgeId: string; ratio: number; completedOrders: number; earnedFare: number; final: boolean; reason: string }
  | { type: 'incident'; bridgeId: string; incident: TrafficIncident };

/** JSON also removes Svelte's state proxies before crossing the frame boundary. */
export function cloneStreetDispatchProgress(progress: unknown): unknown {
  if (progress == null) return undefined;
  try { return JSON.parse(JSON.stringify(progress)); }
  catch { return undefined; }
}
export function streetDispatchDocument(bridgeId: string): string {
  const script = `window.__STREET_DISPATCH_BRIDGE_ID__=${JSON.stringify(bridgeId)};\n${payRuntime.replace(/^export /gm,'')}\n${runtime}`
    .replace(/<\/script/gi, '<\\/script');
  return shell.replace('<!-- STREET_DISPATCH_STYLES -->', `<style>${layout}</style>`)
    .replace('<!-- STREET_DISPATCH_RUNTIME -->', `<script>${script}</script>`);
}
/** The caller must separately require event.source === iframe.contentWindow. */
export function readStreetDispatchMessage(data: unknown, bridgeId: string): StreetDispatchMessage | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const value = data as Record<string, unknown>;
  if (value.channel !== STREET_DISPATCH_CHANNEL || value.bridgeId !== bridgeId) return undefined;
  const finite = (number: unknown): number is number => typeof number === 'number' && Number.isFinite(number);
  const totals = () => finite(value.completedOrders) && Number.isInteger(value.completedOrders) && value.completedOrders >= 0
    && finite(value.earnedFare) && value.earnedFare >= 0;
  if (value.type === 'ready' || value.type === 'pause-request') return { type: value.type, bridgeId };
  if (value.type === 'initialized') return { type: 'initialized', bridgeId, restored: value.restored === true };
  if (value.type === 'progress' && totals()) {
    const progress = value.progress as StreetDispatchProgress | undefined;
    if (!progress || progress.schema !== STREET_DISPATCH_CHANNEL || progress.version !== 1) return undefined;
    return { type: 'progress', bridgeId, progress, completedOrders: value.completedOrders as number, earnedFare: value.earnedFare as number };
  }
  if (value.type === 'finish' && totals() && finite(value.ratio) && value.ratio >= 0 && value.ratio <= 1 && typeof value.final === 'boolean') {
    return { type: 'finish', bridgeId, ratio: value.ratio, completedOrders: value.completedOrders as number,
      earnedFare: value.earnedFare as number, final: value.final, reason: typeof value.reason === 'string' ? value.reason : '' };
  }
  if (value.type === 'incident') {
    const incident = value.incident as TrafficIncident | undefined;
    if (!incident || !['collision', 'redlight'].includes(incident.kind) || !finite(incident.fine) || incident.fine < 0 || typeof incident.message !== 'string') return undefined;
    return { type: 'incident', bridgeId, incident };
  }
  return undefined;
}
