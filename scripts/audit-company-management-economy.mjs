import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;
try{api=Object.assign({},...await Promise.all(['/src/game/core/state.ts','/src/game/core/company.ts','/src/game/core/companyConfig.ts','/src/game/core/companyOverview.ts','/src/game/core/companyAccounting.ts','/src/game/core/companyPersonnel.ts','/src/game/core/calendar.ts'].map(p=>server.ssrLoadModule(p))));}finally{await server.close();}
function setTime(s,minute){Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+Math.floor(minute/1440)),{hour:Math.floor(minute%1440/60),minute:minute%60});api.processCompany(s);}
function fixture(stage,skill,headcount,divisor,scale){
  const s=api.createInitialState(149725);s.mode='eternal';s.player.money=1000000;s.developmentHistory.total=1;s.locationId='municipal_hall';
  Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+2),{hour:9,minute:0});
  assert(api.registerCompany(s,'成熟经营核算',Math.min(stage,2)).ok);
  const c=s.company;c.stage=stage;c.depositCents=api.companyStage(stage).rent*100;c.royaltyCents=api.companyStage(stage).cap*100;c.balanceCents=1e9;
  const maintenancePeople=Math.min(headcount,Math.ceil(c.royaltyCents/100/divisor/(api.companyDailyWork(skill,'high')*5)));
  c.computers=[];c.employees=[];
  for(let index=0;index<headcount;index++){
    const e={id:'employee-'+index,name:'员工'+String.fromCharCode(65+index),hired:true,programming:skill,design:skill,stars:api.employeeStars(skill,skill),quoteFactor:1,salaryCents:api.companyFairSalary({programming:skill,design:skill,quoteFactor:1}),role:index<maintenancePeople?'maintenance':'design',secondaryRole:index<maintenancePeople?'design':'idle',joinedMinute:c.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:-14,nextLeaveDay:20+(index*7)%21,leaveDays:[],requests:{}};
    c.employees.push(e);c.computers.push({id:'pc-'+index,tier:'high',costCents:500000,assignee:e.id,seatIndex:index+1});
  }
  s.locationId=api.companyStage(stage).location;
  assert(api.startCompanyProject(s,'design','界面设计',scale,true,'contract').ok);
  c.accounting=api.createCompanyAccounting(c.cursor);
  return {s,c,maintenancePeople};
}
function accounts(c){const a=api.companyAccountingOverview(c);return [...a.periods,a].reduce((r,p)=>{r.incomeCents+=p.incomeCents;r.wageUnits+=p.wageUnits;r.rentUnits+=p.rentUnits;r.otherCostCents+=p.otherCostCents;return r;},{incomeCents:0,wageUnits:0,rentUnits:0,otherCostCents:0});}
function simulate({stage,skill=10,headcount=api.companyStage(stage).capacity-1,divisor=100,scale=stage===1?'small':stage===2?'medium':'large',id}){
  const {s,c,maintenancePeople}=fixture(stage,skill,headcount,divisor,scale),start=c.cursor,startDeliveries=s.developmentHistory.total;
  const requests={raise:0,leave:0,paidVacationDays:0};
  for(let day=1;day<=90;day++){
    setTime(s,start+day*1440);
    for(const e of [...c.employees])for(const request of api.companyEmployeeRequests(e)){
      assert(api.respondCompanyRequest(s,e.id,true,request.kind).ok);
      requests[request.kind]++;if(request.kind==='leave')requests.paidVacationDays+=request.leaveDays.length;
    }
  }
  const a=accounts(c),wages=a.wageUnits/api.COMPANY_MONTH_MINUTES,rent=a.rentUnits/api.COMPANY_MONTH_MINUTES,cost=wages+rent+a.otherCostCents,ratio=a.incomeCents/cost;
  const result={id,stage,days:90,skill,computer:'high',headcount,maintenancePeople,secondaryMaintenanceRole:'design',scale,maintenanceDivisor:divisor,
    normalDailyPoints:api.companyDailyWork(skill,'high'),monthlySalaryAtStart:api.companyFairSalary({programming:skill,design:skill,quoteFactor:1})/100,
    cashAtStart:1e7,royaltyAtStart:api.companyStage(stage).cap,royaltyAtEnd:c.royaltyCents/100,
    income:a.incomeCents/100,wageCost:wages/100,rentCost:rent/100,otherCost:a.otherCostCents/100,operatingCost:cost/100,operatingProfit:(a.incomeCents-cost)/100,
    revenueCostRatio:ratio,profitMargin:a.incomeCents?(a.incomeCents-cost)/a.incomeCents:0,targetMet:ratio>=1.3&&ratio<=1.5,
    completedDesigns:s.developmentHistory.total-startDeliveries,activeStaffAtEnd:c.employees.length,approvedRequests:requests,unpaidDebt:c.liabilities.reduce((n,d)=>n+d.amountCents,0)/100,
    endingUnpaidAccrual:api.companyOverview(s).accruedCents/100};
  assert([result.income,result.wageCost,result.rentCost,result.operatingCost,result.revenueCostRatio].every(Number.isFinite),'Economy totals must be finite');assert.equal(result.unpaidDebt,0);assert.equal(result.activeStaffAtEnd,headcount);
  console.log(JSON.stringify(result));return result;
}
const originalDivisor=api.COMPANY_RULES.maintenanceDivisor,samples=[];
try{
  for(const divisor of [100,50]){
    api.COMPANY_RULES.maintenanceDivisor=divisor;
    for(const stage of [1,2,3,4])samples.push(simulate({id:`stage-${stage}-divisor-${divisor}`,stage,divisor}));
  }
}finally{api.COMPANY_RULES.maintenanceDivisor=originalDivisor;}
const employeeEconomics=[1,2,3,5,8,10].map(skill=>{
  const daily=api.companyDailyWork(skill,'high'),salary=api.companyFairSalary({programming:skill,design:skill,quoteFactor:1})/100;
  return {skill,normalDailyPoints:daily,monthlyFairSalary:salary,designGrossPer22Days:Object.fromEntries(['small','medium','large'].map(scale=>[scale,daily*22/api.COMPANY_SCALES[scale].work*api.COMPANY_SCALES[scale].design])),
    netContributionBeforeRentPer22Days:Object.fromEntries(['small','medium','large'].map(scale=>[scale,daily*22/api.COMPANY_SCALES[scale].work*api.COMPANY_SCALES[scale].design-salary]))};
});
const firstEmployee={registrationUnlocks:api.companyOverview(fixture(1,1,0,100,'small').s).unlocked,notes:'No project-grinding gate for first employee; first slot available at registration. Further capacity uses weighted project growth, not historical deliverable count.'};
const report={generatedAt:new Date().toISOString(),target:{days:90,revenueCostRatio:[1.3,1.5]},
 method:'Actual processCompany minute settlement, 90 calendar days, one mature company per stage filled to employee capacity (founder excluded). Skill10, high computers, individual quote factor1, fair salary3080. Current weekly royalty starts at stage cap; no founder work, no injected future revenue. Enough initial company cash prevents financing failures. Maintenance headcount is ceiling(weekly need / five normal workdays); maintenance primary and design secondary, others design primary; continuous same-scale design contracts. Both employee requests approved each day, including paid leave. Income includes real milestone/royalty receipts; costs are minute-accrued wages and occupied rent across accounting periods. Equipment/deposits/owner transfers excluded. Dividend is not automatically labelled balanced.',
 caveats:['Mature, already cap-filled product portfolios are an advantageous scenario; startup return and historical investment are not included.',
 'Maintenance capacity does not include founder or overtime; approved vacations can reduce coverage and future royalty.',
 'Design milestones may be collected for still-unfinished work by day90. This model defines accepted-stage receipts as operating income, consistent with in-game contracts.',
 'Employee contribution table uses 22 standard workdays and steady throughput before rent and holidays. The 90-day samples use actual calendar and vacation.',
 'The divisor50 comparison mutates only the in-memory exported parameter in this isolated script process and restores it in finally; source files and saves are untouched.'],
 parameters:{stages:api.COMPANY_STAGES,scales:api.COMPANY_SCALES,salaryBase:api.COMPANY_RULES.salaryBase,salaryPerSkill:api.COMPANY_RULES.salaryPerSkill,restoredMaintenanceDivisor:api.COMPANY_RULES.maintenanceDivisor},
 firstEmployee,employeeEconomics,samples,assessment:{currentDivisor100TargetMet:samples.filter(s=>s.maintenanceDivisor===100).every(s=>s.targetMet),
 summary:'The target is evaluated from measured income and accrued costs. Any ratio outside 1.3–1.5 is reported as outside target; no wages or quotes were changed to force a passing result.'}};
writeFileSync('docs/company-management-v2-1497-20261025/economy.json',JSON.stringify(report,null,2));
console.log('Output: docs/company-management-v2-1497-20261025/economy.json');

