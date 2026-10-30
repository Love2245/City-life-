import type {CompanyState} from '../companyTypes';
import {companyStage} from './companyConfig';
/** Legacy staff receive their former positions; explicit seats stay put when a colleague leaves. */
export function companyEmployeeSeats(c:CompanyState){
  const seats=new Map<string,number>(),used=new Set<number>(),capacity=companyStage(c.stage).capacity;
  for(const e of c.employees)if(Number.isInteger(e.seatIndex)&&e.seatIndex!>0&&e.seatIndex!<capacity&&!used.has(e.seatIndex!)){seats.set(e.id,e.seatIndex!);used.add(e.seatIndex!);}
  for(const e of c.employees)if(!seats.has(e.id)){let index=1;while(used.has(index))index++;seats.set(e.id,index);used.add(index);}
  return seats;
}
export function companyEmployeeAtSeat(c:CompanyState,index:number){const positions=companyEmployeeSeats(c);return c.employees.find(e=>positions.get(e.id)===index);}
export function normalizeCompanyWorkstations(c:CompanyState){
  const seats=companyEmployeeSeats(c),used=new Set<number>();for(const e of c.employees)e.seatIndex=seats.get(e.id)!;
  for(const pc of c.computers)if(pc.assignee){pc.seatIndex=pc.assignee==='founder'?0:seats.get(pc.assignee);if(pc.seatIndex!==undefined)used.add(pc.seatIndex);}
  for(const pc of c.computers)if(!pc.assignee&&pc.seatIndex!==undefined){if(!Number.isInteger(pc.seatIndex)||pc.seatIndex<0||pc.seatIndex>=companyStage(c.stage).capacity||used.has(pc.seatIndex))delete pc.seatIndex;else used.add(pc.seatIndex);}
}
