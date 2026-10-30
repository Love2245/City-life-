import type { GameState, WeatherId } from '../game/types';
import { getLocation } from '../game/core/actions';
import { topRegionOf, getRegion } from '../game/core/regions';
import { currentHomeSceneId } from '../game/core/homeInterior';
import { currentResidence, residenceRegion } from '../game/core/residence';
import { currentWeather } from '../game/core/weather';
import { companyOfficeHere } from '../game/core/companyOverview';
import { themeOfHour } from '../game/timeOfDay';
import type { LoadingRequest } from './sceneLoading';

export function loadingConditions(state: {time:{hour:number};weather?:{id:WeatherId}}) {
  const hour = state.time.hour;
  return { time: hour >= 23 || hour < 5 ? 'late-night' as const : themeOfHour(hour),
    weather: state.weather?.id ?? 'sunny' as const };
}

export function loadingRegionOf(state: GameState): string {
  if(currentHomeSceneId(state))return topRegionOf(residenceRegion(state))??'downtown';
  const registered=getLocation(state.locationId)?.regions??[];
  const currentTop=state.region?topRegionOf(state.region):undefined;
  const validSavedRegion=state.locationId==='map'||!registered.length||registered.some(region=>topRegionOf(region)===currentTop);
  const region=(validSavedRegion?state.region:undefined)??registered[0]??state.area??residenceRegion(state);
  return region?topRegionOf(region)??'downtown':'downtown';
}

export function sceneLoadingTarget(state: GameState, sceneMode: '3d' | '2d'): LoadingRequest {
  const home = currentHomeSceneId(state);
  const regionId = loadingRegionOf(state);
  // Both renderers end their own loading cover. The legacy kind name is internal.
  const rendered = companyOfficeHere(state) || home || ['convenience_store', 'boyue_convenience_store', 'commercial_convenience_store', 'cafe', 'boyue_cafe'].includes(state.locationId);
  return {
    sceneKey: rendered ? `${sceneMode}:${home ? `home:${home}` : state.locationId}`
      : state.locationId === 'map' ? `map:${regionId}` : `place:${state.locationId}:${regionId}`,
    regionId, kind: rendered ? '3d' : 'map',
    label: home ? currentResidence(state).name : state.locationId === 'map' ? getRegion(regionId)?.name ?? '地区地图' : getLocation(state.locationId)?.name ?? '目的地',
    ...loadingConditions(state), weather: currentWeather(state),
  };
}
