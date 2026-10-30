import type { HomePlan } from '../../game/core/homeInterior';
import {HOME_ALIASES} from '../../game/core/homeAliases';

export type HomeEntryKind = 'stairwell' | 'elevator-hall' | 'hotel-corridor' | 'ground-cottage' | 'courtyard';
export type HomeDistrictKind = 'old-neighborhood' | 'suburban-edge' | 'city-center' | 'campus-courtyard' | 'night-market' | 'garden-neighborhood';
export interface HomeExteriorProfile {
  id: string;
  entry: HomeEntryKind;
  district: HomeDistrictKind;
  /** Zero is the ground floor. Indoor geometry always retains its existing y=0. */
  floor: number;
  doorLabel: string;
  buildingLabel: string;
  facade: string;
  trim: string;
}

/** Architectural identity follows the registered room, never its shared background image ID. */
export const HOME_EXTERIOR_PROFILES: Readonly<Record<string, HomeExteriorProfile>> = {
  old_apartment: { id:'old_apartment',entry:'stairwell',district:'old-neighborhood',floor:2,doorLabel:'301',buildingLabel:'安居里 · 3号楼',facade:'#c7bca5',trim:'#7a877a' },
  suburb_room: { id:'suburb_room',entry:'ground-cottage',district:'suburban-edge',floor:0,doorLabel:'12',buildingLabel:'城边小院',facade:'#d1cbb8',trim:'#747e67' },
  rental_apartment: { id:'rental_apartment',entry:'elevator-hall',district:'city-center',floor:4,doorLabel:'506',buildingLabel:'城市公寓',facade:'#c9d0cb',trim:'#778a8b' },
  boyue_talent_apartment: { id:'boyue_talent_apartment',entry:'elevator-hall',district:'campus-courtyard',floor:3,doorLabel:'412',buildingLabel:'人才公寓 · 北苑',facade:'#c4ccb8',trim:'#668278' },
  dev_incubator: { id:'dev_incubator',entry:'stairwell',district:'campus-courtyard',floor:1,doorLabel:'203',buildingLabel:'创业住房',facade:'#c7cec7',trim:'#748879' },
  own_old_unit: { id:'own_old_unit',entry:'stairwell',district:'old-neighborhood',floor:1,doorLabel:'202',buildingLabel:'榕树里 · 2单元',facade:'#c1b59c',trim:'#7f8271' },
  own_apartment: { id:'own_apartment',entry:'elevator-hall',district:'city-center',floor:7,doorLabel:'802',buildingLabel:'景庭公寓',facade:'#c0cdd1',trim:'#6b7f89' },
  own_villa: { id:'own_villa',entry:'courtyard',district:'garden-neighborhood',floor:0,doorLabel:'06',buildingLabel:'梧桐庭院',facade:'#d2c5af',trim:'#5b7164' },
  minsu: { id:'minsu',entry:'stairwell',district:'old-neighborhood',floor:1,doorLabel:'201 · 客房',buildingLabel:'里巷民宿',facade:'#cbbca5',trim:'#8b7c68' },
  hotel_budget: { id:'hotel_budget',entry:'hotel-corridor',district:'city-center',floor:2,doorLabel:'308',buildingLabel:'中心酒店',facade:'#c5c3b8',trim:'#786d62' },
  hotel: { id:'hotel',entry:'hotel-corridor',district:'city-center',floor:6,doorLabel:'706',buildingLabel:'中心酒店',facade:'#c5c3b8',trim:'#786d62' },
  hotel_mooncourt: { id:'hotel_mooncourt',entry:'hotel-corridor',district:'city-center',floor:4,doorLabel:'508',buildingLabel:'月庭大酒店',facade:'#d1d5cb',trim:'#789087' },
  hotel_boyue_quick: { id:'hotel_boyue_quick',entry:'hotel-corridor',district:'campus-courtyard',floor:2,doorLabel:'306',buildingLabel:'伯月快捷酒店',facade:'#c7d0c8',trim:'#5f8587' },
  hotel_boyu_nightmarket: { id:'hotel_boyu_nightmarket',entry:'hotel-corridor',district:'night-market',floor:1,doorLabel:'208',buildingLabel:'泊月夜市酒店',facade:'#c6b6ad',trim:'#896d78' },
  npc_guest_room: { id:'npc_guest_room',entry:'stairwell',district:'old-neighborhood',floor:2,doorLabel:'302',buildingLabel:'居民楼',facade:'#c8c4b1',trim:'#7c897b' },
};

export function homeExteriorProfile(plan: HomePlan): HomeExteriorProfile {
  const id=plan.residenceId ?? (plan.id==='house'?'own_villa':plan.id==='premium'?'own_apartment':plan.id==='compact'?'own_old_unit':plan.id==='apartment'?'rental_apartment':'old_apartment');
  const profile=HOME_EXTERIOR_PROFILES[id]??HOME_EXTERIOR_PROFILES[HOME_ALIASES[id]]??HOME_EXTERIOR_PROFILES.old_apartment;
  return id==='hotel_mooncourt_budget'?{...profile,id,buildingLabel:'月庭大酒店',doorLabel:'208'}:profile;
}

/** The entrance and the distant district share this one elevation. */
export function homeGroundY(profile: HomeExteriorProfile): number { return -.165-profile.floor*3.05; }
