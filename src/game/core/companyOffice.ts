import type { GameState } from '../types';
import type { CompanyComputerTier } from '../companyTypes';
import { gameDay, weekdayOf } from './calendar';
import { COMPANY_COMPUTERS } from './companyConfig';
import {companyEmployeeAtSeat} from './companyWorkstations';
export type OfficePoint = [number, number];
export interface OfficePlan {
  stage: number; size: OfficePoint; outline: OfficePoint[];
  desks: OfficePoint[]; deskRotations?: number[]; partitions: [number, number, number, number][];
  zones: { name: string; rect: [number, number, number, number]; color: string }[];
  meeting: [number, number, number, number]; shelves: OfficePoint[]; plants: OfficePoint[];
  entry: OfficePoint; lounge: OfficePoint; board: OfficePoint;
  /** Low acoustic screens and shared print/storage cabinets, in metre units. */
  screens?: [x: number, z: number, width: number, yaw: number][];
  utilities?: [x: number, z: number, yaw: number][];
}
/** Shared suites occupy part of a larger floor; the full-floor office owns its footprint. */
export function officeBuildingFootprint(plan:OfficePlan){
  const [w,d]=plan.size,minX=plan.stage===4?-.325:-6,maxX=plan.stage===4?w+.325:w+6;
  const minZ=plan.stage===4?-.2:0,maxZ=plan.stage===4?d+.2:d+10;
  return{minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ};
}
export const OFFICE_ADDRESSES = [
  { floor: 3, room: '306', building: '大学创业中心', arrival: '共享走廊', kind: 'corridor' },
  { floor: 6, room: '608', building: '城市商务中心', arrival: '共享走廊', kind: 'corridor' },
  { floor: 16, room: '1606', building: '城市商务中心', arrival: '高层电梯厅', kind: 'highrise' },
  { floor: 22, room: '22F', building: '城市商务中心', arrival: '独立楼层 · 电梯直达', kind: 'floor' },
] as const;
/** 四套结构各自绘制，工位坐标也是平面、3D 与点击标签的共同来源。 */
export const COMPANY_OFFICES: readonly OfficePlan[] = [
  { stage: 1, size: [8, 6], outline: [[0,0],[8,0],[8,6],[0,6]],
    desks: [[1.5,.8],[3.8,.8],[6.1,.8]], partitions: [],
    zones: [{ name: '创业工位', rect: [.4,.2,7.2,2.2], color: '#c0cbc5' },{ name: '共用讨论区',rect: [4.4,3.4,3.2,2.2],color:'#c9b69b' }],
    meeting: [5.9,4.45,1.8,.9], shelves: [[.35,2.8]], plants: [[7.5,.55],[7.5,5.45]], entry:[2.6,6], lounge:[.55,4.7], board:[2.9,.13] },
  { stage: 2, size: [10, 8], outline: [[0,0],[10,0],[10,5.7],[8,5.7],[8,8],[0,8]],
    desks: [[1.6,.8],[4.7,.8],[7.1,.8],[1.6,4.3],[4.7,4.3],[7.1,4.3]],
    partitions: [[3.1,.15,3.1,2.9],[.2,5.8,2.9,5.8]],
    zones: [{name:'负责人工作区',rect:[.2,.7,2.7,2.4],color:'#c8b99f'},{name:'团队工作区',rect:[3.4,.7,5.1,4.9],color:'#b5c1c2'},{name:'访客区',rect:[.3,6,2.7,1.7],color:'#cdbca6'}],
    meeting: [5.8,6.6,2.5,1], shelves: [[9.5,3.2]], plants: [[9.4,.6],[7.5,7.5]], entry:[3.65,8], lounge:[.55,6.85], board:[1.55,.13] },
  { stage: 3, size: [16,12], outline: [[0,0],[16,0],[16,12],[0,12]],
    // A window pair, a four-person project island and a sideways three-person team.
    desks: [[2.7,1.85],[6.65,.8],[8.55,.8],[6.7,7],[6.7,8],[8.55,7],[8.55,8],[13.1,7.1],[14.1,7.1],[14.1,9]],
    deskRotations: [Math.PI,0,0,Math.PI,0,Math.PI,0,-Math.PI/2,Math.PI/2,Math.PI/2],
    partitions: [[5,0,5,4.8],[0,4.8,2.8,4.8],[4,4.8,5,4.8],[11.2,0,11.2,4.8],[11.2,4.8,12.6,4.8],[13.8,4.8,16,4.8]],
    zones: [{name:'负责人办公室',rect:[.2,.2,4.6,4.4],color:'#c8b99f'},{name:'临窗工作区',rect:[5.55,.2,4.1,2.2],color:'#c4c8b9'},{name:'项目工作区',rect:[5.5,5.65,4.15,4.35],color:'#b2c0bd'},{name:'专注工作区',rect:[11.7,6.1,3.9,4.15],color:'#b5bec7'},{name:'会议室',rect:[11.4,.2,4.4,4.4],color:'#adbbc0'},{name:'会客区',rect:[.2,7.75,3.7,2.6],color:'#c7bbaa'}],
    screens:[[7.625,7.5,3.5,0],[13.6,8.05,3.55,Math.PI/2]], utilities:[[.55,6.25,Math.PI/2]],
    meeting: [13.6,2.35,2.6,1.2], shelves:[[.45,1.3],[15.5,5.5]], plants:[[.6,11.4],[10.6,.6],[15.4,11.3],[5.3,4.2],[11.8,10.5]], entry:[8,12], lounge:[.55,9], board:[13.6,.13] },
  { stage: 4, size: [23,16], outline:[[0,0],[23,0],[23,16],[0,16]],
    // Three staggered four-person islands and a rotated three-person focus area.
    // The entry feeds the clear lane between the left islands and the right team.
    desks:[[2.9,1.95],[7.4,7.45],[7.4,8.45],[9.25,7.45],[9.25,8.45],[13.85,8.05],[13.85,9.05],[15.7,8.05],[15.7,9.05],[7.15,12.35],[7.15,13.35],[9,12.35],[9,13.35],[19.2,11.3],[20.2,11.3],[20.2,13.15]],
    deskRotations:[Math.PI,Math.PI,0,Math.PI,0,Math.PI,0,Math.PI,0,Math.PI,0,Math.PI,0,-Math.PI/2,Math.PI/2,Math.PI/2],
    partitions:[[6.2,0,6.2,5.7],[0,5.7,3.7,5.7],[5,5.7,6.2,5.7],[15.5,0,15.5,5.7],[15.5,5.7,17.3,5.7],[18.7,5.7,23,5.7]],
    zones:[{name:'负责人办公室',rect:[.2,.2,5.8,5.3],color:'#c6b79d'},{name:'前台与访客区',rect:[.2,6.3,5.5,7.5],color:'#b6c1bd'},{name:'会议室',rect:[15.7,.2,7.1,5.3],color:'#acbccb'},{name:'项目一组',rect:[6.35,6.15,4,3.85],color:'#b4c5c5'},{name:'项目二组',rect:[12.8,6.75,4,3.85],color:'#b6c0ca'},{name:'项目三组',rect:[6.1,11.05,4,3.85],color:'#c5c6b6'},{name:'专注工作区',rect:[17.85,10.2,3.85,4.05],color:'#b6c5bd'},{name:'共享设备区',rect:[12.85,14.7,3.9,1.05],color:'#c9c3b4'},{name:'协作区',rect:[6.5,.3,8.5,4.9],color:'#c5c4b5'}],
    screens:[[8.325,7.95,3.5,0],[14.775,8.55,3.5,0],[8.075,12.85,3.5,0],[19.7,12.225,3.55,Math.PI/2]], utilities:[[14.5,15.45,Math.PI]],
    meeting:[19.2,2.65,4.2,1.4], shelves:[[.45,1.35],[5.75,3.1],[14.7,.7]], plants:[[22.3,.7],[22.3,15.2],[6.7,4.9],[17.55,6.7],[16.35,15.25],[6.05,10.55]], entry:[10.5,16], lounge:[.55,12.1], board:[19.2,.13] },
];
export interface OfficeSeat { index: number; personId: string; name: string; tier?: CompanyComputerTier; status: string; present: boolean; stars: number }
export function officeSeats(s: GameState): OfficeSeat[] {
  const c = s.company; if (!c) return [];
  const plan = COMPANY_OFFICES[c.stage - 1]!, day = gameDay(s.time);
  const open = weekdayOf(s.time) < 5 && s.time.hour >= 9 && s.time.hour < 17;
  return plan.desks.map((_, index) => {
    const e = companyEmployeeAtSeat(c,index), personId = index === 0 ? 'founder' : e?.id ?? '';
    const pc = personId ? c.computers.find(p => p.assignee === personId) : c.computers.find(p=>!p.assignee&&p.seatIndex===index);
    let status = index === 0 ? '主角工位' : !e ? '空工位' : e.leaveDays.includes(day) ? '带薪休假' : !open ? '休息中' : c.liabilities.length ? '欠款停工' : !pc ? '缺少电脑' : e.role === 'idle' ? '待分配' : e.role === 'maintenance' ? '作品维护' : !c[e.role] ? '等待立项' : e.role === 'design' ? '设计中' : '编程中';
    if (pc) status += ` · ${COMPANY_COMPUTERS[pc.tier].name}`;
    return { index, personId, name: index === 0 ? s.player.name : e?.name ?? `空工位 ${index + 1}`, tier: pc?.tier, status,
      present: index > 0 && !!e && open && !e.leaveDays.includes(day), stars: e?.stars ?? 0 };
  });
}
