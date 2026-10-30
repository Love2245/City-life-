import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createServer} from 'vite';
const finalMode=process.argv.includes('--final');
const slope125=process.argv.includes('--slope125');
const sensitivityOnly=process.argv.includes('--sensitivity-only');
const cashRiskOnly=process.argv.includes('--cash-risk-only');
const refinedMode=finalMode||process.argv.includes('--refined');
const ordinaryMode=refinedMode||process.argv.includes('--ordinary');
const out='docs/company-calibration-1497-20261026';mkdirSync(out,{recursive:true});
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
let api;try{api=Object.assign({},...await Promise.all(['/src/game/core/state.ts','/src/game/core/company.ts','/src/game/core/companyConfig.ts','/src/game/core/companyOverview.ts','/src/game/core/companyAccounting.ts','/src/game/core/companyPersonnel.ts','/src/game/core/calendar.ts','/src/game/core/time.ts','/src/game/core/items.ts','/src/game/core/housing.ts','/src/game/core/actions.ts'].map(p=>server.ssrLoadModule(p))));}finally{await server.close();}
const baseline={rules:{...api.COMPANY_RULES},scales:structuredClone(api.COMPANY_SCALES),stages:structuredClone(api.COMPANY_STAGES)};
const weekdays=Array.from({length:90},(_,index)=>api.weekdayOf(api.fromLinearDay(api.START_EPOCH+2+index))<5).filter(Boolean).length;
// A legal parameter-only set has affordable entry wages, no falling unit prices for bigger orders,
// and non-decreasing marginal contribution on the lowest computer for every skill step.
const boundDays=20,grid=[];
for(const pointPrice of [15,18,20,22,25,28,30])for(const salaryBase of [1600,1800,2000,2200,2400,2500,2600])for(const salaryPerSkill of [80,100,120,130,140,150]){
 const lowGross=5*boundDays*pointPrice,increment=5/18*boundDays*pointPrice;
 if(salaryBase>lowGross||salaryPerSkill>increment)continue;
 const salary10=salaryBase+9*salaryPerSkill;
 const lowerBounds=baseline.stages.map(stage=>{const n=stage.capacity-1;return n*15*weekdays*pointPrice/(3*(n*salary10+stage.rent));});
 grid.push({pointPrice,salaryBase,salaryPerSkill,salary10,ordinaryLowComputerNetPer20Days:lowGross-salaryBase,minGrowthNetPer20Days:increment-salaryPerSkill,
   lowerBoundAllContractRatios:lowerBounds,passesAllContractUpperBound:lowerBounds.every(v=>v<=1.5),distanceFromTarget:lowerBounds.reduce((n,v)=>n+Math.max(0,v-1.5),0)});
}
grid.sort((a,b)=>a.distanceFromTarget-b.distanceFromTarget);
const ordinaryCandidate={id:finalMode?(slope125?'ordinary-office-final-slope125':'ordinary-office-final'):refinedMode?'ordinary-office-refined':'ordinary-office-reference',salaryBase:2500,salaryPerSkill:finalMode?(slope125?125:120):140,prices:refinedMode?[850,2200,9200,30000]:[720,2000,9200,28800],caps:[600,1000,2000,4000],divisor:100};
const candidates=ordinaryMode?[ordinaryCandidate]:[
 {id:'current',salaryBase:2000,salaryPerSkill:120,prices:[1000,3000,14000,48000],caps:[4500,7500,15000,30000],divisor:100},
 {id:'smooth-pay-and-contracts',salaryBase:2400,salaryPerSkill:130,prices:[1000,2500,10000,30000],caps:[1500,2500,5000,10000],divisor:50},
 {id:'royalty-only-reduction',salaryBase:2400,salaryPerSkill:130,prices:[1000,3000,14000,48000],caps:[450,750,1500,3000],divisor:100},
 {id:'aggressive-affordable-orders',salaryBase:2000,salaryPerSkill:110,prices:[800,2000,8000,24000],caps:[300,600,1200,2400],divisor:40},
];
function apply(p){Object.assign(api.COMPANY_RULES,{salaryBase:p.salaryBase,salaryPerSkill:p.salaryPerSkill,maintenanceDivisor:p.divisor});['short','small','medium','large'].forEach((scale,index)=>api.COMPANY_SCALES[scale].design=p.prices[index]);api.COMPANY_STAGES.forEach((stage,index)=>stage.cap=p.caps[index]);}
function restore(){Object.assign(api.COMPANY_RULES,baseline.rules);Object.keys(baseline.scales).forEach(scale=>Object.assign(api.COMPANY_SCALES[scale],baseline.scales[scale]));api.COMPANY_STAGES.forEach((stage,index)=>Object.assign(stage,baseline.stages[index]));}
function setTime(s,minute){Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+Math.floor(minute/1440)),{hour:Math.floor(minute%1440/60),minute:minute%60});api.processCompany(s);}
function totalAccounting(c){const a=api.companyAccountingOverview(c);return [...a.periods,a].reduce((r,p)=>{r.income+=p.incomeCents/100;r.wage+=p.wageUnits/api.COMPANY_MONTH_MINUTES/100;r.rent+=p.rentUnits/api.COMPANY_MONTH_MINUTES/100;r.other+=p.otherCostCents/100;return r;},{income:0,wage:0,rent:0,other:0});}
function simulate(p,{stage,skill=10,tier='high',factor=1,headcount=api.companyStage(stage).capacity-1,maintenance=true,scale=stage===1?'small':stage===2?'medium':'large',royalty=true,profile='mature',initialCashCents=1e9,seed=149726,founderWorks=false,startDay=2,billsInDays=null}){
 apply(p);const s=api.createInitialState(seed);s.mode='eternal';s.player.money=1e7;s.developmentHistory.total=1;s.locationId='municipal_hall';Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+startDay),{hour:9,minute:0});assert(api.registerCompany(s,'独立参数搜索',Math.min(stage,2)).ok);
 const c=s.company;c.stage=stage;c.depositCents=api.companyStage(stage).rent*100;c.balanceCents=initialCashCents;if(initialCashCents<1e9){s.player.money=3000;c.fundingPolicy.enabled=false;}c.royaltyCents=royalty?api.companyStage(stage).cap*100:0;c.computers=[];c.employees=[];
 if(billsInDays!==null)c.nextRentDay=c.nextPayDay=api.gameDay(s.time)+billsInDays;
 const maintenancePeople=maintenance?Math.min(headcount,Math.ceil(c.royaltyCents/100/p.divisor/(api.companyDailyWork(skill,tier)*5))):0;
 for(let index=0;index<headcount;index++){
  const e={id:'e'+index,name:'员工'+String.fromCharCode(65+index),hired:true,programming:skill,design:skill,stars:api.employeeStars(skill,skill),quoteFactor:factor,salaryCents:api.companyFairSalary({programming:skill,design:skill,quoteFactor:factor}),role:index<maintenancePeople?'maintenance':'design',secondaryRole:index<maintenancePeople?'design':'idle',joinedMinute:c.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:-14,nextLeaveDay:20+(index*7)%21,leaveDays:[],requests:{}};
  c.employees.push(e);c.computers.push({id:'pc'+index,tier,costCents:api.COMPANY_COMPUTERS[tier].price*100,assignee:e.id,seatIndex:index+1});
 }
 s.locationId=api.companyStage(stage).location;assert(api.startCompanyProject(s,'design','界面设计',scale,true,'contract').ok);c.accounting=api.createCompanyAccounting(c.cursor);
 const start=c.cursor,startTotal=s.developmentHistory.total;let approvedLeave=0,vacationDays=0,firstPaymentMinute=null;const cashSnapshots=[];
 for(let day=1;day<=90;day++){setTime(s,start+day*1440);if(firstPaymentMinute===null){const entry=c.ledger.find(entry=>entry.kind==='income'&&entry.amountCents>0);if(entry)firstPaymentMinute=entry.minute;}if(day<=10||day%30===0)cashSnapshots.push({day,cash:c.balanceCents/100,debt:c.liabilities.reduce((n,d)=>n+d.amountCents,0)/100});for(const e of [...c.employees])for(const request of api.companyEmployeeRequests(e)){assert(api.respondCompanyRequest(s,e.id,true,request.kind).ok);if(request.kind==='leave'){approvedLeave++;vacationDays+=request.leaveDays.length;}}}
 const a=totalAccounting(c),cost=a.wage+a.rent+a.other,ratio=a.income/cost;assert([a.income,cost,ratio].every(Number.isFinite));
 const r={candidate:p.id,profile,seed,startDay,billsInDays,founderWorks,stage,skill,tier,factor,headcount,maintenancePeople,scale,royalty,maintenance,days:90,initialCash:initialCashCents/100,firstPaymentDays:firstPaymentMinute===null?null:(firstPaymentMinute-start)/1440,cashSnapshots,endingCash:c.balanceCents/100,endingDebt:c.liabilities.reduce((n,d)=>n+d.amountCents,0)/100,...a,cost,profit:a.income-cost,ratio,targetMet:ratio>=1.3&&ratio<=1.5,approvedLeave,vacationDays,weeklyRoyaltyAtEnd:c.royaltyCents/100,staffAtEnd:c.employees.length,deliveries:s.developmentHistory.total-startTotal,endingAverageSkill:c.employees.reduce((n,e)=>n+Math.max(e.programming,e.design),0)/Math.max(1,c.employees.length)};
 console.log(JSON.stringify(r));return r;
}
function founderLifeCase(p, initialCompanyCash) {
 apply(p);
 const s=api.createInitialState(149726);s.mode='eternal';s.player.money=100000;s.developmentHistory.total=1;s.locationId='municipal_hall';
 Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+2),{hour:9,minute:0});assert(api.registerCompany(s,'主角实际工作对照',1).ok);
 const c=s.company;c.balanceCents=initialCompanyCash*100;c.royaltyCents=0;c.fundingPolicy.enabled=false;
 const e={id:'e0',name:'员工A',hired:true,programming:3,design:3,stars:2,quoteFactor:1,salaryCents:api.companyFairSalary({programming:3,design:3,quoteFactor:1}),role:'design',secondaryRole:'idle',joinedMinute:c.cursor,accruedUnits:0,programmingXp:0,designXp:0,satisfaction:80,underpaidDays:0,lastRaiseDay:-14,nextLeaveDay:20,leaveDays:[],requests:{}};
 c.employees=[e];c.computers=[{id:'employee-pc',tier:'mid',costCents:150000,assignee:e.id,seatIndex:1},{id:'founder-pc',tier:'mid',costCents:150000,assignee:'founder',seatIndex:0}];
 s.player.skills.programming=s.player.skills.design=3;s.locationId='dev_incubator';assert(api.startCompanyProject(s,'design','界面设计','short',true,'contract').ok);
 c.accounting=api.createCompanyAccounting(c.cursor);
 const start=c.cursor, startDay=api.gameDay(s.time),personalBudgetAfterRegistration=15000;
 s.player.money=personalBudgetAfterRegistration-initialCompanyCash-3000;
 // Pre-purchased ordinary groceries are paid for, then consumed through the real item API.
 const groceries=180*api.getItem('bento').cost+90*api.getItem('fruit').cost;s.player.money-=groceries;
 api.addItem(s,'bento',180);api.addItem(s,'fruit',90);
 s.living.mode='nightly';s.living.govDaysLeft=0;assert(api.selectLodging(s,'hostel'));
 let workHours=0,attempts=0,fullShifts=0,firstPaymentMinute=null,showerFailures=0,approvedRequests=0;const failures=[],snapshots=[];
 function meal(item){const result=api.useItem(s,item);if(!result.ok)failures.push({day:api.gameDay(s.time)-startDay,kind:'food',reason:result.reason});}
 function move(target){const result=api.moveTo(s,target);if(!result.ok)failures.push({day:api.gameDay(s.time)-startDay,kind:'travel',target,reason:result.reason});return result.ok;}
 function requests(){for(const employee of [...c.employees])for(const request of api.companyEmployeeRequests(employee)){const result=api.respondCompanyRequest(s,employee.id,true,request.kind);if(result.ok)approvedRequests++;else failures.push({day:api.gameDay(s.time)-startDay,kind:'request',reason:result.reason});}}
 for(let iteration=0;iteration<90&&api.gameDay(s.time)<startDay+90;iteration++){
  meal('bento');meal('fruit');
  const weekday=api.weekdayOf(s.time),needsVisit=weekday<5||c.employees.some(employee=>api.companyEmployeeRequests(employee).length);
  if(needsVisit&&move('dev_incubator')){
   requests();
   if(weekday<5){
    if(s.time.hour<9)api.advanceHours(s,9-s.time.hour-s.time.minute/60);
    const before=c.cursor;attempts++;const result=api.founderCompanyWork(s,'design',8);const hours=(c.cursor-before)/60;
    if(result.ok){workHours+=hours;if(hours>=7.99)fullShifts++;}else failures.push({day:api.gameDay(s.time)-startDay,kind:'work',reason:result.reason,attrs:{...s.player.attrs}});
   }
  }
  move('hostel');meal('bento');
  if(s.player.attrs.hygiene<65){const result=api.performAction(s,'shower_home');if(!result.ok)showerFailures++;}
  const clock=s.time.hour*60+s.time.minute;
  if(clock<23*60)api.advanceHours(s,(23*60-clock)/60);
  api.sleep(s,8);
  if(firstPaymentMinute===null){const receipt=c.ledger.find(row=>row.kind==='income'&&row.amountCents>0);if(receipt)firstPaymentMinute=receipt.minute;}
  const day=api.gameDay(s.time)-startDay;if(day<=10||day%30===0)snapshots.push({day,cash:c.balanceCents/100,debt:c.liabilities.reduce((n,d)=>n+d.amountCents,0)/100,personalCash:s.player.money,attrs:{...s.player.attrs}});
 }
 const target=start+90*1440;if(c.cursor<target)api.advanceHours(s,(target-c.cursor)/60);
 const a=totalAccounting(c),cost=a.wage+a.rent+a.other;
 const r={candidate:p.id,profile:'first-employee-with-real-founder',initialCompanyCash,elapsedDays:(c.cursor-start)/1440,
  firstPaymentDays:firstPaymentMinute===null?null:(firstPaymentMinute-start)/1440,workHours,attempts,fullShifts,failures,showerFailures,approvedRequests,employeesAtEnd:c.employees.length,
  ...a,cost,profit:a.income-cost,ratio:a.income/cost,endingCompanyCash:c.balanceCents/100,endingDebt:c.liabilities.reduce((n,d)=>n+d.amountCents,0)/100,
  personalBudgetAfterRegistration,initialCompanyInjection:initialCompanyCash,initialTwoComputers:3000,groceriesPaid:groceries,
  additionalLivingAndTravelSpent:personalBudgetAfterRegistration-initialCompanyCash-3000-groceries-s.player.money,
  endingPersonalCash:s.player.money,endingAttrs:{...s.player.attrs},endingId:s.endingId,snapshots,
  method:'Real founderCompanyWork calls with 8h maximum on weekdays, real movement, sleep, food use and shower actions. No stamina/health/mood resets. A separately paid 15000-yuan personal budget after registration funds company injection, both mid PCs, pre-purchased groceries, real lodging and transport; no company withdrawals or auto owner cover. Fixture starts with an established qualified company; it does not certify the pre-registration journey or shop acquisition UI.'};
 console.log(JSON.stringify(r));return r;
}
const samples=[],founderCases=[];
try{
 if(cashRiskOnly){samples.push(simulate(ordinaryCandidate,{stage:1,skill:3,tier:'mid',headcount:1,maintenance:false,royalty:false,scale:'short',profile:'existing-lease-friday-before-bills',initialCashCents:50000,startDay:6,billsInDays:1}));}
 else if(sensitivityOnly){for(const seed of [149727,149728,20261026])for(const skill of [5,10])samples.push(simulate(ordinaryCandidate,{stage:4,skill,tier:'mid',seed}));}
 else if(ordinaryMode){for(const stage of [1,2,3,4])for(const skill of [5,10])for(const tier of ['mid','high'])samples.push(simulate(ordinaryCandidate,{stage,skill,tier}));
for(const stage of [1,2,3,4]){samples.push(simulate(ordinaryCandidate,{stage,factor:.8,profile:'cheap-expert-high'}));samples.push(simulate(ordinaryCandidate,{stage,factor:1.2,skill:5,tier:'mid',profile:'expensive-average-mid'}));samples.push(simulate(ordinaryCandidate,{stage,maintenance:false,royalty:false,scale:stage===1?'small':stage===2?'medium':'large',profile:'cash-orders-no-royalty'}));}
samples.push(simulate(ordinaryCandidate,{stage:1,skill:3,tier:'mid',headcount:1,maintenance:false,royalty:false,scale:'short',profile:'first-employee-real-cash',initialCashCents:200000}));
samples.push(simulate(ordinaryCandidate,{stage:1,skill:1,tier:'low',headcount:1,maintenance:false,royalty:false,scale:'short',profile:'low-pc-transition-real-cash',initialCashCents:200000}));
if(finalMode)for(const cash of [50000,200000,300000])samples.push(simulate(ordinaryCandidate,{stage:1,skill:3,tier:'mid',headcount:1,maintenance:false,royalty:false,scale:'short',profile:'first-employee-cash-'+cash/100,initialCashCents:cash}));
if(refinedMode)for(const seed of [149727,20261026])for(const stage of [1,3])samples.push(simulate(ordinaryCandidate,{stage,skill:5,tier:'mid',seed,profile:'vacation-seed-sensitivity'}));
if(finalMode)for(const cash of [500,2000,3000])founderCases.push(founderLifeCase(ordinaryCandidate,cash));
}else{for(const candidate of candidates)for(const stage of [1,2,3,4])samples.push(simulate(candidate,{stage}));
 const p=candidates[1];
 for(const stage of [1,4]){
  samples.push(simulate(p,{stage,maintenance:false,scale:'short',factor:.8}));
  samples.push(simulate(p,{stage,maintenance:false,royalty:false,scale:'short',factor:1}));
  samples.push(simulate(p,{stage,skill:1,tier:'low',factor:1.2,maintenance:false,scale:'short',royalty:false}));
  samples.push(simulate(p,{stage,skill:3,tier:'mid',factor:1,maintenance:false,scale:'short',royalty:false,headcount:1}));
 }}
}finally{restore();}
const labor=candidates.map(p=>({candidate:p.id,rows:Array.from({length:10},(_,index)=>{const skill=index+1,salary=p.salaryBase+p.salaryPerSkill*index;return{skill,salary,tiers:Object.fromEntries(['low','mid','high'].map(tier=>[tier,Object.fromEntries(['short','small','medium','large'].map((scale,index)=>[scale,api.companyDailyWork(skill,tier)*20*p.prices[index]/baseline.scales[scale].work-salary]))]))};})}));
const proof={standardWorkdaysOver90:weekdays,ordinaryDailyPoints:5,expertHighDailyPoints:15,conservativeWorkdaysPer30:boundDays,
 salaryBaseUpperBound:'salaryBase <= 5 × 20 × lowest sustainable order price per point',
 salaryGrowthUpperBound:'salaryPerSkill <= (5/18) × 20 × lowest price per point',
 expertSalaryUpperBound:'salary10 <= 1.5 × salaryBase when entry wages are pushed to full low-tier revenue and per-level net contribution must not fall',
 pureContractsLowerBound:'N × 15 × actualWeekdays90 × P / [3 × (N × 150 × P + rent)]',
 explanation:'These bounds apply when the same orders can be performed by all skills, point prices do not fall as orders grow, and the low-tier ordinary employee is viable on those orders. If mature maintenance pays at least contract point value (maintenanceDivisor >= P), adding a fully maintained royalty portfolio cannot lower the pure-contract bound. Lowering the divisor below contract point value can force one chosen maintenance mix into target, while pure-contract play remains stronger.',
 minimumUsablePointPriceFor2000EntrySalary:20,
 bestGrid:grid.slice(0,15),legalGridCount:grid.length,legalGridAllContractTargetCount:grid.filter(r=>r.passesAllContractUpperBound).length,
 stagePriceUpperBoundsForAllContractRatioAtMost15:baseline.stages.map(stage=>({stage:stage.stage,maxPointPrice:4.5*stage.rent/((15*weekdays-675)*(stage.capacity-1)),entrySalaryAtMost:100*4.5*stage.rent/((15*weekdays-675)*(stage.capacity-1))}))};
const report={generatedAt:new Date().toISOString(),readOnly:true,method:'Two-level search: analytical wage/viability/monotonic-growth bounds, then actual processCompany 90-day minute settlement for four candidate parameter sets and independent strong/weak stress profiles. All changes confined to this process memory; production source, old quotes and previous reports untouched. Every leave/raise request approved daily, founder never works, sufficient cash isolates operations. Skill growth remains enabled for weak profiles.',
 target:[1.3,1.5],baseline,proof,candidates,labor,samples,founderCases,
 decisions:{parameterOnlyFullyConstrainedSolutionFound:false,
 minimalSafeCandidate:'smooth-pay-and-contracts is a smaller parameter-only improvement, not a target-compliant solution. Do not ship it as meeting 1.3–1.5.',
 preservedLegacyRule:'Any implemented future policy must freeze existing quote values and earned royalty. Existing saves with grandfathered high royalty are explicitly exempt from new-portfolio mature ratio targets.',
 nextDecision:'Either relax the global profit target while keeping 5→15 productivity and viable low-tier labor, or add a transparent skill/value difference that allows higher salary without making growth worse. Do not add hidden taxes/fees merely to absorb surplus.'}};
if(ordinaryMode){report.target={ordinaryMid:[1.3,1.5],fairQuotedHighMaximum:2.2,cheapHigh:'Report extra advantage without capping to force a pass'};report.proof.scope='Earlier stronger requirement, including viable ordinary low PC and high PC target <=1.5; does not describe the final mid-PC reference target.';report.decisions={candidateEvaluated:ordinaryCandidate,ordinaryMidAllMet:samples.filter(s=>s.profile==='mature'&&s.tier==='mid').every(s=>s.ratio>=1.3&&s.ratio<=1.5),fairQuotedHighAllAtMost22:samples.filter(s=>s.tier==='high'&&s.factor===1).every(s=>s.ratio<=2.2),allHighIncludingCheapAtMost22:samples.filter(s=>s.tier==='high').every(s=>s.ratio<=2.2),note:'Low PCs are a temporary transition; fair quoted mid/high normal contribution must increase each skill. Existing earned royalties/contracts/wages remain grandfathered and outside new-policy portfolio targets.'};report.growthMarginPerSkillPer20Days=Object.fromEntries(['low','mid','high'].map(tier=>[tier,Object.fromEntries([.8,1,1.2].map(factor=>[factor,(api.companyDailyWork(2,tier)-api.companyDailyWork(1,tier))*20*ordinaryCandidate.prices[0]/40-ordinaryCandidate.salaryPerSkill*factor]))]));}
writeFileSync(out+(cashRiskOnly?'/cash-timing-risk.json':sensitivityOnly?(slope125?'/final-slope125-sensitivity.json':'/final-sensitivity.json'):finalMode?(slope125?'/final-slope125-matrix.json':'/final-matrix.json'):refinedMode?'/refined-candidate.json':ordinaryMode?'/ordinary-candidate.json':'/independent-search.json'),JSON.stringify(report,null,2));
if(!ordinaryMode)writeFileSync(out+'/parameter-grid.json',JSON.stringify(grid,null,2));
console.log('Evidence: '+out+(cashRiskOnly?'/cash-timing-risk.json':sensitivityOnly?(slope125?'/final-slope125-sensitivity.json':'/final-sensitivity.json'):finalMode?(slope125?'/final-slope125-matrix.json':'/final-matrix.json'):refinedMode?'/refined-candidate.json':ordinaryMode?'/ordinary-candidate.json':'/independent-search.json'));






