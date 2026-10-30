import type { SceneTheme } from './sceneVisuals';

export const INDOOR_FACILITY_SCENES = [
  'commercial_exchange', 'commercial_office', 'municipal_hall', 'hotel_mooncourt',
  'dev_university', 'campus_teacher_library', 'campus_teacher_canteen', 'campus_teacher_affairs',
  'boyue_engineering_college', 'campus_engineering_library', 'campus_engineering_canteen', 'campus_engineering_affairs',
] as const;
export const OUTDOOR_FACILITY_SCENES = ['commercial_street', 'campus_teacher_sports', 'campus_engineering_sports'] as const;

const indoor = new Set<string>(INDOOR_FACILITY_SCENES);
const outdoor = new Set<string>(OUTDOOR_FACILITY_SCENES);
const images = import.meta.glob('/src/assets/bg/v1.495/facilities/*.webp', {eager: true, import: 'default'}) as Record<string, string>;

/** Indoor rooms use their own electric lighting; outdoor scenes follow the game clock. */
export function facilityBackgroundUrl(locationId: string, period: SceneTheme): string | undefined {
  // 办公室的公共介绍底景复用写字楼；进入后由四套独立 3D／平面结构呈现。
  const key = locationId.startsWith('company_office_') ? 'commercial_office' : indoor.has(locationId) ? locationId : outdoor.has(locationId) ? `${locationId}-${period}` : undefined;
  return key ? images[`/src/assets/bg/v1.495/facilities/${key}.webp`] : undefined;
}

export function hasFacilityLighting(locationId: string, period: SceneTheme): boolean {
  return !!facilityBackgroundUrl(locationId, period);
}
