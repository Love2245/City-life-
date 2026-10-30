export const CAFE = { width: 12, depth: 11, height: 3.2, doorX: 9.8, doorWidth: 1.8 } as const;
export const CAFE_CAMERA_MIN_POLAR = .002;
export const CAFE_CAMERA_MAX_POLAR = Math.PI * .46;
// Stay just above the pole limit so the original overhead focus can settle.
export const CAFE_PLAN_VIEW = { eye: [6, 28, 5.56], target: [6, .1, 5.5], zoom: 1.13 } as const;
export const BAR = { x: 7.6, z: 2.45, width: 6.2, depth: .84, height: .98 } as const;
export const BACK_BAR = { x: 7.6, z: .40, width: 6.2, depth: .68, height: .92 } as const;
export const COMMUNAL = { x: 5.85, z: 6.25, width: 2.8, depth: 1.05, height: .76 } as const;
export const BANQUETTE_TABLES = [{ x: 1.85, z: 4.85 }, { x: 1.85, z: 7.15 }] as const;
export const WINDOW_STOOLS = [2.4, 4.3, 6.2] as const;
export const WINDOW_SEAT_Z = 9.90;
export const LIN_SEAT = { npcId: 'npc_lin_xiaoyu', name: '林小雨', x: 2.4, z: WINDOW_SEAT_Z, yaw: 0, stoolHeight: .74 } as const;
// The chair's back is local -Z; its seated occupant looks along local +Z.
export const seatYaw = (x: number, z: number, targetX: number, targetZ: number) => Math.atan2(targetX - x, targetZ - z);
export const COMMUNAL_SEATS = [5, 5.85, 6.7].flatMap(x => [5.15, 7.35].map(z => ({ x, z, yaw: seatYaw(x, z, x, COMMUNAL.z) })));
export const BANQUETTE_CHAIRS = BANQUETTE_TABLES.map(({ x, z }) => ({ x: 3.05, z, yaw: seatYaw(3.05, z, x, z) }));
export const LOUNGE_SEATS = [1.05, 3.15].map(x => ({ x, z: 2.2, yaw: seatYaw(x, 2.2, 2.1, 2.65) }));
export const CAFE_GAMEPLAY = {
  mode: 'npc-visual-preview', npcVisualPreview: true, liveNpcIntegration: false, stateWrites: false,
  locationId: 'cafe', openHours: { start: 8, end: 22 },
  drink: { actionId: 'drink_cafe', price: 25, duration: .5, dailyLimit: 2 },
  job: { id: 'job_cafe_staff', startHour: 9, endHour: 17 },
} as const;
export const CAFE_ZONES = {
  all: { label: '全店', title: '给日常，留一处空隙', tag: 'YIYU / CITY COFFEE', copy: '点一杯咖啡，找一个喜欢的位置。暖木、深绿和午后的光，把城市的脚步留在玻璃门外。', eye: [-10, 17, 24], target: [6, .4, 5.5], zoom: 1 },
  order: { label: '点单取餐', title: '点单与取餐，各有位置', tag: '01 / ORDER & PICK UP', copy: '从入口沿右侧到点单台，完成后向左取餐。拿铁沿用游戏里的 25 元一杯；烘焙柜先作为环境陈列。', eye: [1, 10, 15], target: [7.6, 1.1, 2.45], zoom: 1.85 },
  craft: { label: '咖啡吧台', title: '一杯咖啡，慢慢完成', tag: '02 / COFFEE CRAFT', copy: '磨豆、萃取、手冲、清洗沿后吧台展开。留出独立的员工通道，围裙和工具就在顺手的位置。', eye: [3.6, 8, 10.7], target: [7.7, 1.3, 1.0], zoom: 2.6 },
  lounge: { label: '软座角落', title: '坐下来，暂时不赶路', tag: '03 / A QUIET CORNER', copy: '两把软椅、一张圆桌和靠墙长椅。一本翻到一半的书，一杯刚刚放下的咖啡；也有完全空着的桌面。', eye: [-4, 9.5, 13.8], target: [1.9, .65, 4.5], zoom: 2.15 },
  community: { label: '共享长桌', title: '有人工作，也有人发呆', tag: '04 / SHARED TABLE', copy: '长桌留出六个座位，插座、台灯和留言小卡让这里适合停留。座位之间留有余量，中央动线从桌边绕过。', eye: [-5, 10.5, 17], target: [5.8, .7, 6.4], zoom: 2 },
  window: { label: '临窗座位', title: '把视线，借给街道', tag: '05 / WINDOW SEATS', copy: '三处临窗高座，留给一个人喝咖啡的时刻。门上的叶影、营业时间与小小的推门提示，构成街边店面的日常。', eye: [1, 7.2, 19], target: [5.5, .8, 9.9], zoom: 1.9 },
  lin: { label: '林 · 窗边', title: '小林，和她的窗边座位', tag: 'LIN / A MOMENT BY THE WINDOW', copy: '靠着窗边坐一会儿，让街道从面前慢慢经过。换个角度，看看小林安静的一面。', eye: [8.3, 4.2, 8.5], target: [2.4, .80, WINDOW_SEAT_Z], zoom: 3.5 },
  details: { label: '生活细节', title: '细节里，留一点人的痕迹', tag: '06 / EVERYDAY DETAILS', copy: '原创咖啡海报、旅行小景、手写卡纸、围裙和绿植各有落点。装饰避开通道，桌面也保留可以放下一杯咖啡的空白。', eye: [2, 8, 18], target: [10.8, 1.5, 6.2], zoom: 2.1 },
} as const;
export type CafeZone = keyof typeof CAFE_ZONES;

// Floor footprints used by the independent access check, including chair space.
export const CAFE_OBSTACLES = [
  { id: 'front-bar', x: BAR.x, z: BAR.z, width: BAR.width, depth: BAR.depth },
  { id: 'back-bar', x: BACK_BAR.x, z: BACK_BAR.z, width: BACK_BAR.width, depth: BACK_BAR.depth },
  { id: 'bookshelf', x: 2.1, z: .28, width: 3.2, depth: .42 },
  { id: 'lounge-left', x: 1.05, z: 2.2, width: .95, depth: .95 },
  { id: 'lounge-right', x: 3.15, z: 2.2, width: .95, depth: .95 },
  { id: 'lounge-table', x: 2.1, z: 2.65, width: .82, depth: .82 },
  { id: 'banquette', x: .55, z: 6.0, width: .9, depth: 4.7 },
  ...BANQUETTE_TABLES.flatMap(({ x, z }, i) => [{ id: `banquette-table-${i}`, x, z, width: .95, depth: .95 }, { id: `banquette-chair-${i}`, x: 3.05, z, width: .62, depth: .68 }]),
  { id: 'communal-table', x: COMMUNAL.x, z: COMMUNAL.z, width: COMMUNAL.width, depth: COMMUNAL.depth },
  ...[5, 5.85, 6.7].flatMap((x, i) => [5.15, 7.35].map((z, j) => ({ id: `communal-chair-${i}-${j}`, x, z, width: .56, depth: .66 }))),
  { id: 'window-bar', x: 4.5, z: 10.55, width: 5.8, depth: .5 },
  ...WINDOW_STOOLS.map((x, i) => ({ id: `window-stool-${i}`, x, z: WINDOW_SEAT_Z, width: .5, depth: .5 })),
  { id: 'condiments', x: 11.55, z: 6.15, width: .65, depth: 1.8 },
] as const;
