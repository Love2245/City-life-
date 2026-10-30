export type ZoneId = 'all' | 'cold' | 'shelves' | 'checkout' | 'services' | 'seating' | 'entrance';
export type Rect = [x: number, z: number, width: number, depth: number];
export const STORE = { width: 10.4, depth: 12.4, height: 3.05, entrance: [3.25, 12.4, 2.6] as const };
export const COLD_CASES = [1.18, 2.66, 4.14, 5.62, 7.1];
export const SHELF_ROWS = [3.4, 5.9];
export const SHELF_BAYS = Array.from({ length: 6 }, (_, index) => 3.02 + index * .82);
export const COUNTERS = Array.from({ length: 6 }, (_, index) => 3.15 + index);
export const COUNTER_X = 8.5;
export const TABLES = [1.13, 2.43];
export const SERVICE_COUNTER = { x: .49, z: 5.75, width: .78, depth: 3.3, height: .91 };
export const SERVICE_FOOTPRINT: Rect = [.10, 4.10, .78, 3.30];
export const FIRE_EXTINGUISHER = { x: 10.12, z: 9.8, size: [.18, .62, .18] as [number, number, number] };
export const ZONES: Record<ZoneId, { title: string; subtitle: string; copy: string; target: [number, number, number]; eye: [number, number, number]; zoom: number }> = {
  all: { title: '城市里，随时亮着的一站', subtitle: '24H / 朝夕便利', copy: '蓝白店招、冷藏鲜食与饮料、速食调料货架。买一餐、带点补给，也能在这里完成一天的店员工作。', target: [5.2, .35, 6.2], eye: [-10, 18, 26], zoom: .96 },
  cold: { title: '一餐与一瓶清凉', subtitle: '01 / 冷藏鲜食 · 饮料', copy: '左侧两组陈列盒饭、三明治和沙拉，右侧三组为普通饮料与能量饮料。买一份简餐，也带走路上的补给。', target: [4.1, .9, .7], eye: [-3.4, 6.7, 9.8], zoom: 1.65 },
  shelves: { title: '日常所需，慢慢挑', subtitle: '02 / 零食 · 调味 · 日用', copy: '泡面、调味与零食分层陈列，另一排补上纸品和洗护用品。包装高低和少量留空，让货架有自然的变化。', target: [4.65, .8, 5.2], eye: [-5.6, 10.6, 17.5], zoom: 1.7 },
  checkout: { title: '收银台，也是上班的地方', subtitle: '03 / 结账 · 店员岗位', copy: '扫码、应收、找零和小票各有位置。正式店员先通过手机招聘入职，再按班次到店上班；夜间盲盒在柜台端部领取。', target: [8.8, .85, 6], eye: [1.2, 7.5, 14.5], zoom: 1.8 },
  services: { title: '热一餐，歇一会儿', subtitle: '04 / 自助服务台', copy: '微波炉、热水、纸杯与餐具靠墙集中设置，咖啡设备与临窗座位相邻。加热、取用、入座的路线留在同一侧。', target: [.65, 1.0, 5.65], eye: [7.8, 6.3, 12.8], zoom: 2.05 },
  seating: { title: '把这一餐，好好吃完', subtitle: '05 / 临窗堂食', copy: '两桌四座面向街边。食品可以打包放入背包，也可以在购买时选择堂食；堂食额外花费半小时。', target: [1.8, .55, 9.5], eye: [8.4, 6.8, 16.5], zoom: 2.25 },
  entrance: { title: '二十四小时，留一盏蓝灯', subtitle: '06 / 玻璃入口', copy: '蓝白门头与通透玻璃保留街边便利店的辨识度。入口提供购物篮、回收箱和招聘告示，主通道可直接到达各功能区。', target: [4.6, 1.0, 10.9], eye: [1.5, 5.8, 24], zoom: 1.55 },
};

/** Customer floor obstacles, including the occupied seating envelope. */
export const CUSTOMER_OBSTACLES: { id: string; rect: Rect }[] = [
  ...COLD_CASES.map((x, i) => ({ id: `cold-${i}`, rect: [x - .7, .18, 1.4, .72] as Rect })),
  ...SHELF_ROWS.map((x, i) => ({ id: `shelves-${i}`, rect: [x - .41, SHELF_BAYS[0] - .4, .82, 4.9] as Rect })),
  { id: 'checkout', rect: [COUNTER_X - .4, 2.65, .8, 6] },
  ...TABLES.map((x, i) => ({ id: `seating-${i}`, rect: [x - .49, 8.42, .98, 2.07] as Rect })),
  { id: 'baskets', rect: [6.64, 10.92, .62, .56] },
  { id: 'recycle', rect: [.26, 11.3, .7, .42] },
  { id: 'self-service', rect: SERVICE_FOOTPRINT },
  { id: 'fire-extinguisher', rect: [10.02, 9.70, .20, .20] },
];
export const CUSTOMER_DESTINATIONS = { cold: [4.1, 1.65], shelves: [4.65, 5.2], checkout: [7.75, 7.5], seating: [1.8, 11.1], services: [1.45, 5.75] };
