import type { GameState } from '../types';
import type { CompanyLane,CompanyProject } from '../companyTypes';
import projects from '../data/projects.json';
import {companyProjectQuote} from './companyProjects';
import {personalDevelopmentRewardQuote,clearPersonalDevelopmentQuote} from './projects';

/** 注册/重新开业时只接收个人现存权益，既有公司版税及已付周次不会重复转入。 */
export function adoptPersonalCompanyProjects(s:GameState):void{
  const c=s.company;if(!c)return;
  c.royaltyCents+=Math.round(Math.max(0,Math.min(1500,s.career.passiveIncome??0))*100);
  s.career.passiveIncome=0;
  if(typeof s.flags.passive_paid_week==='number')c.lastRoyaltyWeek=Math.max(c.lastRoyaltyWeek,s.flags.passive_paid_week);
  const transferred:CompanyProject[]=[];
  for(const def of projects){
    if(def.category!=='programming'&&def.category!=='design')continue;
    const progress=s.career.projects[def.id]??0,max=def.maxProgress??100;
    if(progress<=0||progress>=max)continue;
    const lane=def.category as CompanyLane,mode=lane==='design'||def.id==='personal_programming_order'?'contract':'product',scale=def.id==='personal_programming_order'?'short':'small';
    const quote=companyProjectQuote(lane,def.name,scale,mode),personalQuote=personalDevelopmentRewardQuote(s,def.id);
    if(def.id==='personal_programming_order'){
      quote.priceCents=Math.round(personalQuote.contractFee!*100);quote.milestones=[{progress:quote.work,amountCents:quote.priceCents}];
    }else if(lane==='programming'){
      quote.royaltyCents=Math.max(quote.royaltyCents,Math.round((personalQuote.royalty??0)*100));
      if(personalQuote.legacy)quote.minimumRoyaltyCapCents=Math.round((personalQuote.royaltyCap??1500)*100);
    }
    const p:CompanyProject={id:`project-${++c.sequence}`,lane,topic:def.name,scale,mode,quote,progress:progress/max*quote.work,repeat:false,sourceId:def.id,paidMilestones:[],paidCents:0};
    transferred.push(p);
    s.career.projects[def.id]=0;
    clearPersonalDevelopmentQuote(s,def.id);
  }
  transferred.sort((a,b)=>b.progress/b.quote!.work-a.progress/a.quote!.work);
  for(const p of transferred){if(!c[p.lane])c[p.lane]=p;else c.pending.push(p);}
}
