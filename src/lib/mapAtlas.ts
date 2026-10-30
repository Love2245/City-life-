import { RESIDENCE_TIERS } from "../game/core/residence";
import locationsData from "../game/data/locations.json";
/** Normalized coordinates belong to each uncropped aerial image, not the viewport. */
export interface MapAnchor { x: number; y: number }
export type MapSymbol = "city" | "leaf" | "home" | "shop" | "hotel" | "factory" | "station" | "university" | "sport" | "night" | "airport";
export interface AtlasItem {
  id: string;
  name: string;
  description?: string;
  /** 地图标牌下方的入口内容提示，帮助玩家理解区域内有什么。 */
  detail?: string;
  hint?: string;
  /** 仅用于地图标牌的短提示；地点列表和无障碍说明仍使用完整 hint。 */
  pinHint?: string;
  /** 地点营业与可进入时段，和交通提示分开显示。 */
  schedule?: string;
  locked?: boolean;
  current?: boolean;
  /** 当前有效住房所在区域/地点标记。 */
  home?: boolean;
  /** 地图卡片上的短徽章，例如“家在这里”。 */
  badge?: string;
  /** 跨一级区域的道路入口使用较窄标牌，避免遮住临近区域设施。 */
  shortcut?: boolean;
  /** 进入其他一级区域的地图转换入口，使用独立视觉强调。 */
  crossRegion?: boolean;
  /** 营业状态供地图入口统一禁用/提示。 */
  status?: "open" | "early" | "closed" | "locked";
  disabledReason?: string;
}

export const MAP_ANCHORS: Record<string, Record<string, MapAnchor>> = {
  main: { downtown: { x: 43, y: 43 }, suburb: { x: 81, y: 37 }, development: { x: 20, y: 77 }, boyue: { x: 66, y: 83 } },
  downtown: {
    downtown_center: { x: 44, y: 30 }, downtown_mall: { x: 17, y: 45 },
    downtown_industrial: { x: 80, y: 32 }, downtown_residential: { x: 77, y: 59 },
    downtown_station: { x: 44, y: 79 }, suburb: { x: 10, y: 61 }, development: { x: 91, y: 43 }, boyue: { x: 94, y: 82 },
  },
  suburb: {
    suburban_edge: { x: 59, y: 77 }, rural: { x: 42, y: 44 },
    heavy_industry: { x: 80, y: 30 }, downtown: { x: 92, y: 54 },
  },
  development: {
    // A2 实图：校门前街、三馆广场、珍宝湖与科技馆东侧的泊月区道路。
    development_culture: { x: 76, y: 56 }, development_university: { x: 66, y: 31 },
    development_reserve: { x: 30, y: 63 }, boyue: { x: 97, y: 37 },
    downtown: { x: 33, y: 19 },
    // 郊区仍在地点列表可达，不在新构图上放置无对应建筑的标牌。
  },
  development_culture: {
    // 最终 A2 放大图：三馆台阶入口与两座公交候车棚前的上车点。
    dev_museum: { x: 30, y: 32 }, dev_science_museum: { x: 72, y: 37 },
    dev_art_gallery: { x: 68, y: 66 }, development_bus_station: { x: 28, y: 65 },
  },
  development_university: {
    // 校园中轴广场、底部临街餐饮铺面与右侧玻璃办公楼入口。
    campus_teacher:{x:53,y:50},dev_university: { x: 53, y: 50 }, dev_food_street: { x: 66, y: 84 }, dev_incubator: { x: 88, y: 49 },
  },
  development_reserve: {
    // 上部月亮山观景步道、湖面中央与右下帐篷营地。
    moon_mountain: { x: 36, y: 17 }, treasure_lake: { x: 50, y: 66 }, camping_base: { x: 84, y: 88 },
  },
  development_airport: { airport: { x: 50, y: 57 } },
  boyue: {
    // 正式东邻总图：工程校园广场、小商场正门、球形建筑前喷泉、奥体前场与小通航机场。
    boyue_university: { x: 29, y: 28 }, boyue_mall: { x: 74, y: 29 },
    boyue_night_market: { x: 32, y: 56 }, boyue_olympic: { x: 76, y: 56 },
    development_airport: { x: 56, y: 88 }, development: { x: 3, y: 36 }, downtown: { x: 49, y: 11 },
  },
  boyue_university: {
    // 正式图：校园门前广场、右上住宅组团、底部餐饮店、右下网吧与东侧临街便利店。
    campus_engineering:{x:54,y:50},boyue_engineering_college: { x: 54, y: 65 }, boyue_talent_apartment: { x: 84, y: 24 },
    boyue_food_street: { x: 42, y: 87 }, boyue_internet_cafe: { x: 86, y: 81 },
    boyue_convenience_store: { x: 68, y: 72 },
  },
  boyue_mall: {
    // 商场切面中的五间店铺：咖啡左上、便利左下、快餐中下、健身右上、西餐右下。
    boyue_cafe: { x: 30, y: 34 }, boyue_convenience_store: { x: 36, y: 57 },
    boyue_fast_food: { x: 54, y: 54 }, boyue_gym: { x: 70, y: 35 }, boyue_western_restaurant: { x: 76, y: 48 },
  },
  boyue_olympic: {
    // 室内泳池玻璃入口、球场中心、左下篮球场与前景体育用品店。
    boyue_swimming_pool: { x: 84, y: 74 }, boyue_football_field: { x: 58, y: 37 },
    boyue_basketball_court: { x: 29, y: 73 }, boyue_sports_store: { x: 52, y: 86 },
  },
  boyue_night_market: {
    // 同构昼夜图：球形夜总会门前、左侧小吃铺面、右侧电玩城、左上洗浴楼、右下露台清吧。
    boyue_nightclub: { x: 50, y: 41 }, boyue_snack_street: { x: 24, y: 56 }, boyue_arcade: { x: 76, y: 47 },
    boyue_bathhouse: { x: 22, y: 26 }, hotel_boyu_nightmarket: { x: 80, y: 28 },
    boyue_lounge_bar: { x: 78, y: 78 }, boyue_texas_shop: { x: 37, y: 65 },
  },
  downtown_residential: {
    // Organic courtyards and a diagonal neighborhood street (art revision 2).
    home: { x: 30, y: 24 }, npc_guest_room: { x: 62, y: 72 }, convenience_store: { x: 47, y: 35 },
    park: { x: 79, y: 27 }, cafe: { x: 27, y: 54 },
    street: { x: 45, y: 48 }, market: { x: 78, y: 56 },
    gym: { x: 30, y: 80 }, internet_cafe: { x: 57, y: 95 }, clinic: { x: 87, y: 81 },
  },
  downtown_station: {
    high_speed_rail: { x: 29, y: 32 }, bus_station: { x: 51, y: 35 },
    flower_market: { x: 82, y: 42 }, snack_street: { x: 29, y: 70 }, school: { x: 72, y: 66 },
    home: { x: 91, y: 84 },
  },
  downtown_center: {
    // Civic plaza, river bend and mixed-use streets; entrances follow the art.
    convenience_store: { x: 7, y: 46 }, library: { x: 31, y: 34 }, park: { x: 77, y: 38 }, downtown_commercial: { x: 18, y: 22 },
    internet_cafe: { x: 35, y: 63 }, western_restaurant: { x: 56, y: 77 }, hospital: { x: 87, y: 23 },
    hotel: { x: 14, y: 79 }, bathhouse: { x: 33, y: 87 }, market_fair: { x: 75, y: 77 },
    training_school: { x: 67, y: 60 }, home: { x: 84, y: 67 },
    municipal_hall: { x: 49, y: 25 },
  },
  downtown_commercial: {
    // 月牙广场实图：北侧商业街、西侧写字楼、东北交易所，南端图书馆与市政大厅。
    housing_agency: { x: 18, y: 47 }, car_rental: { x: 80, y: 56 }, cafe: { x: 16, y: 72 },
    commercial_office: { x: 36, y: 30 }, company_office_single: { x: 28, y: 19 }, company_office_large: { x: 28, y: 19 }, company_office_floor: { x: 28, y: 19 }, commercial_exchange: { x: 78, y: 22 },
    commercial_street: { x: 54, y: 23 }, commercial_convenience_store: { x: 63, y: 24 },
    municipal_hall: { x: 73, y: 78 },hotel_mooncourt:{x:36,y:68},
    downtown_center: { x: 47, y: 94 },
  },
  downtown_mall: {
    // Entrance positions confirmed against the generated v1.46 exterior day art.
    mall_interior: { x: 56, y: 42 }, convenience_store: { x: 19, y: 50 },
    budget_clothing_store: { x: 15, y: 67 }, fast_food: { x: 40, y: 72 },
    gym: { x: 83, y: 48 }, electronics_store: { x: 89, y: 71 },
  },
  campus_teacher:{dev_university:{x:37,y:34},campus_teacher_library:{x:39,y:65},campus_teacher_canteen:{x:73,y:66},campus_teacher_sports:{x:13,y:30},campus_teacher_affairs:{x:89,y:37},dev_incubator:{x:73,y:15},development_university:{x:51,y:94}},
  campus_engineering:{boyue_engineering_college:{x:16,y:37},campus_engineering_library:{x:41,y:30},campus_engineering_canteen:{x:76,y:70},campus_engineering_sports:{x:58,y:13},campus_engineering_affairs:{x:23,y:72},boyue_talent_apartment:{x:86,y:17},boyue_university:{x:55,y:92}},
  mall_interior: {
    // Doorway anchors calibrated against the delivered atrium cutaway.
    clothing_store: { x: 23, y: 34 }, luxury_store: { x: 78, y: 34 },
    furniture_store: { x: 18, y: 85 }, western_restaurant: { x: 81, y: 85 },
    downtown_mall: { x: 50, y: 91 },
  },
  downtown_industrial: {
    labor_market: { x: 24, y: 39 }, labor_company: { x: 50, y: 39 }, driving_school: { x: 80, y: 40 },
    electronics_factory: { x: 25, y: 78 }, logistics_center: { x: 73, y: 79 },
  },
  suburban_edge: {
    suburb_bus_station: { x: 20, y: 43 }, suburb_train_station: { x: 53, y: 34 }, amusement_park: { x: 66, y: 55 },
    lake_park: { x: 78, y: 88 }, church: { x: 20, y: 81 }, temple: { x: 44, y: 74 }, home: { x: 8, y: 64 },
  },
  rural: { farm: { x: 24, y: 40 }, pasture: { x: 62, y: 67 }, orchard: { x: 81, y: 40 } },
  heavy_industry: {
    steel_factory: { x: 30, y: 54 }, glass_factory: { x: 60, y: 85 }, aluminum_factory: { x: 80, y: 54 },
    worker_dormitory: { x: 54, y: 27 },
  },
};

/** Coordinates point to inspected entrances/courtyards, not arbitrary grid cells.
 * Unknown destinations remain available in the list; never invent a landmark.
 * The unused index preserves compatibility with callers passing list position.
 */
for (const tier of RESIDENCE_TIERS) {
  if (tier.region && tier.locationId && tier.mapAnchor) {
    // 酒店入口按实际地图建筑定位；住宅数据只提供缺少美术锚点时的兜底。
    const locationAnchor = (locationsData as Array<{ id: string; mapAnchor?: MapAnchor }>)
      .find(({ id }) => id === tier.locationId)?.mapAnchor;
    const hotelAnchor = tier.id === "hotel_boyue_quick" ? locationAnchor
      : tier.id === "hotel_boyu_nightmarket" ? { x: 80, y: 28 }
      : undefined;
    const map=MAP_ANCHORS[tier.region]??={};
    if(tier.region.startsWith('campus_')||['downtown_center','downtown_commercial'].includes(tier.region))map[tier.locationId]??=hotelAnchor??locationAnchor??tier.mapAnchor;
    else map[tier.locationId]=hotelAnchor??locationAnchor??tier.mapAnchor;
  }
}

export function mapAnchor(mapId: string, itemId: string, _index = 0): MapAnchor | undefined {
  return MAP_ANCHORS[mapId]?.[itemId];
}

export function mapSymbol(id: string): MapSymbol {
  if (id === "home") return "home";
  if (/^(gov_residence|hostel|minsu|old_apartment|rental_apartment|suburb_room|own_old_unit|own_apartment|own_villa|worker_dormitory|npc_guest_room)$/.test(id)) return "home";
  if (id === "suburban_edge") return "station";
  if (/^hotel(_|$)/.test(id)) return "hotel";
  if (/airport/.test(id)) return "airport";
  if (/university|college/.test(id)) return "university";
  if (/olympic|swimming|football|basketball|sports_store|boyue_gym/.test(id)) return "sport";
  if (/night_market|nightclub|lounge_bar|arcade|texas/.test(id)) return "night";
  if (/boyue_talent_apartment/.test(id)) return "home";
  if (/boyue_(cafe|convenience_store|fast_food|western_restaurant|food_street)/.test(id)) return "shop";
  if (/reserve|mountain|lake|camping/.test(id)) return "leaf";
  if (id === "dev_food_street") return "shop";
  if (["commercial_street", "commercial_convenience_store", "cafe", "car_rental", "housing_agency"].includes(id)) return "shop";
  if (/industrial|industry/.test(id)) return "factory";
  if (/residential/.test(id)) return "home";
  if (/mall/.test(id)) return "shop";
  if (/station/.test(id)) return "station";
  if (/suburb|rural/.test(id)) return "leaf";
  return "city";
}
