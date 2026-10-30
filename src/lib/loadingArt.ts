import type { WeatherId } from '../game/types';

export type LoadingArtTime = 'day' | 'dusk' | 'night' | 'late-night';

export const LOADING_DISTRICTS: Record<string, { name: string; number: string; detail: string }> = {
  downtown: { name: '树堰区', number: '01', detail: '河桥之间，日常生长' },
  suburb: { name: '紫羊区', number: '02', detail: '风经过田野与湖畔' },
  development: { name: '伯月新区', number: '03', detail: '山湖相望，向新而行' },
  boyue: { name: '泊月区', number: '04', detail: '街巷灯火，生活有声' },
};

/** The vector scene and its full-screen cover share one opaque palette. */
export function loadingArtStyle(time: LoadingArtTime, weather: WeatherId, regionId = 'downtown'): string {
  const dark = time === 'night' || time === 'late-night';
  let paper = time === 'late-night' ? '#101c26' : dark ? '#172832' : time === 'dusk' ? '#f0e1cf' : '#f4f1e8';
  if (!dark && time !== 'dusk') paper = ({ cloudy: '#edf0e9', rain: '#e5ece8', snow: '#eff2ef', heatwave: '#f5ead8', coldwave: '#e8eef0' } as Partial<Record<WeatherId, string>>)[weather] ?? paper;
  if (dark && (weather === 'rain' || weather === 'coldwave')) paper = time === 'late-night' ? '#101b26' : '#182831';
  const accents: Record<string, string> = { downtown: '#b47751', suburb: '#6c8665', development: '#528388', boyue: '#b27465' };
  const colors = {
    paper,
    ink: dark ? time === 'late-night' ? '#b1c4c7' : '#ccdbd5' : '#344b4c',
    muted: dark ? '#829ca4' : '#758480',
    faint: dark ? '#36515d' : '#c7cfbf',
    fill: dark ? '#203943' : time === 'dusk' ? '#e3d6c1' : '#e3e7da',
    fill2: dark ? '#2b4650' : time === 'dusk' ? '#d7c7b1' : '#d2ddd0',
    accent: dark ? '#dfb778' : accents[regionId] ?? accents.downtown,
    light: dark ? '#eec580' : '#ddae71',
  };
  return Object.entries(colors).map(([key, value]) => `--load-${key}:${value}`).join(';');
}
