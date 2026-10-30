import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';import {createServer} from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});let api;
try{api=Object.assign({},...await Promise.all(['/src/game/core/state.ts','/src/game/core/company.ts','/src/game/core/companyConfig.ts','/src/game/core/companyOverview.ts','/src/game/core/calendar.ts'].map(p=>server.ssrLoadModule(p))));}finally{await server.close();}
const profiles=[
 {id:'solo-basic',stage:1,level:1,tier:'low',roles:[],scale:'small'},
 {id:'incubator-team',stage:1,level:3,tier:'mid',roles:['programming','maintenance'],scale:'small'},
 {id:'single-office-team',stage:2,level:5,tier:'mid',roles:['programming','programming','maintenance','maintenance','design'],scale:'medium'},
 {id:'large-office-team',stage:3,level:10,tier:'high',roles:[...Array(3).fill('programming'),...Array(3).fill('maintenance'),...Array(3).fill('design')],scale:'large'},
 {id:'floor-mixed-team',stage:4,level:10,tier:'high',roles:[...Array(5).fill('programming'),...Array(6).fill('maintenance'),...Array(4).fill('design')],scale:'large'},
 {id:'floor-code-only',stage:4,level:10,tier:'high',roles:Array(15).fill('programming'),scale:'large'},
];
function clock(s,day,hour){Object.assign(s.time,api.fromLinearDay(api.START_EPOCH+day),{hour,minute:0});api.processCompany(s);}
const samples=[];
for(const profile of profiles){
 const s=api.createInitialState(149725);s.mode='eternal';s.time.day=3;s.time.hour=10;s.player.money=2e7;s.developmentHistory.total=75;s.locationId='municipal_hall';assert(api.registerCompany(s,'经营核算样本',2).ok);const c=s.company;c.stage=profile.stage;s.locationId='electronics_store';assert(api.buyCompanyComputers(s,profile.tier,profile.roles.length+1).ok);s.locationId=api.companyStage(c.stage).location;api.assignCompanyComputer(s,c.computers[0].id,'founder');
 while(c.employees.length<profile.roles.length){assert(api.interviewCompany(s).ok);for(const candidate of c.candidates){if(c.employees.length>=profile.roles.length)break;assert(api.hireCompanyEmployee(s,candidate.id).ok);}if(c.employees.length<profile.roles.length)clock(s,api.gameDay(s.time)+1,10);}
 s.player.skills.programming=s.player.skills.design=profile.level;
 c.employees.forEach((e,i)=>{e.programming=e.design=profile.level;e.programmingXp=e.designXp=0;e.stars=api.employeeStars(profile.level,profile.level);e.quoteFactor=1;e.salaryCents=api.COMPANY_RULES.salaries[e.stars-1]*100;e.role=profile.roles[i];});
 const start=api.gameDay(s.time)+1;clock(s,start,9);c.employees.forEach(e=>e.accruedUnits=0);c.nextPayDay=c.nextRentDay=start+30;
 assert(api.startCompanyProject(s,'programming','工具软件',profile.scale,true).ok);if(profile.roles.includes('design'))assert(api.startCompanyProject(s,'design','界面设计',profile.scale,true).ok);
 const before={earned:c.earnedCents,spent:c.spentCents,total:s.developmentHistory.total};const checkpoints=[];
 for(let day=0;day<180;day++){if(day)clock(s,start+day,9);for(const e of c.employees)if(e.request)assert(api.respondCompanyRequest(s,e.id,true).ok);Object.assign(s.player.attrs,{stamina:100,health:100,mood:100,satiety:100,hygiene:100});s.player.stress=0;assert(api.founderCompanyWork(s,'programming',8).ok);if((day+1)%30===0){const o=api.companyOverview(s);checkpoints.push({days:day+1,weeklyRoyalty:c.royaltyCents/100,earned:(c.earnedCents-before.earned)/100,paid:(c.spentCents-before.spent)/100,accruedWages:o.accruedCents/100,deliveries:s.developmentHistory.total-before.total});}}
 clock(s,start+180,9);const o=api.companyOverview(s);assert.equal(o.debtCents,0);
 samples.push({...profile,standardDailyWork:api.companyDailyWork(profile.level,profile.tier),monthlyWages:o.monthlyPayrollCents/100,monthlyRent:o.stage.rent,checkpoints,
   after180Days:{earned:(c.earnedCents-before.earned)/100,paid:(c.spentCents-before.spent)/100,accruedWages:o.accruedCents/100,operatingNetAfterAccrual:(c.earnedCents-before.earned-c.spentCents+before.spent-o.accruedCents)/100,weeklyRoyalty:c.royaltyCents/100,coverage:o.coverage,deliveries:s.developmentHistory.total-before.total}});
 console.log(profile.id,JSON.stringify(samples.at(-1).after180Days));
}
const labor=[{stars:1,skill:1,tier:'low'},{stars:1,skill:1,tier:'high'},{stars:3,skill:5,tier:'mid'},{stars:5,skill:10,tier:'high'}].map(p=>({...p,daily:api.companyDailyWork(p.skill,p.tier),salary:api.COMPANY_RULES.salaries[p.stars-1],designGrossPer22Workdays:Object.fromEntries(Object.entries(api.COMPANY_SCALES).map(([scale,def])=>[scale,Math.round(api.companyDailyWork(p.skill,p.tier)*22/def.work*def.design)]))}));
const report={passed:true,method:'Actual company commands and minute settlement over 180 calendar days; controlled initial roster, sufficient owner cash, founder works 8h every calendar day. Raise and paid-leave requests approved on the next morning. Life attributes restored by fixture; wages/rent/royalty/maintenance/growth are real core processing. Does not simulate player living costs or financing constraints. Net includes accrued unpaid salary; startup deposit/equipment excluded.',scales:api.COMPANY_SCALES,computers:api.COMPANY_COMPUTERS,labor,samples};
writeFileSync('docs/company-balance-ui-1497-20261025/economy.json',JSON.stringify(report,null,2));
