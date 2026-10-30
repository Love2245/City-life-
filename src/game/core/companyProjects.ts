import type { CompanyLane, CompanyProject, CompanyProjectMode, CompanyProjectQuote, CompanyScale } from '../companyTypes';
import { COMPANY_SCALES, companyStage } from './companyConfig';

/** 合同在立项时冻结工作量和报价，之后调参数不会改写已验收款项。 */
export function companyProjectQuote(lane: CompanyLane, topic: string, scale: CompanyScale, mode: CompanyProjectMode = lane === 'design' ? 'contract' : 'product'): CompanyProjectQuote {
  const def = COMPANY_SCALES[scale];
  const contract = lane === 'design' || mode === 'contract' || scale === 'short';
  // 首轮只区分自研题材：工具维护/回报稳定，游戏需要更长投入并有更高交付回报。
  const workFactor = !contract && topic === '游戏' ? 1.2 : !contract && topic === '手机 App' ? 1.05 : 1;
  const royaltyFactor = !contract && topic === '游戏' ? 1.25 : !contract && topic === '手机 App' ? 1.1 : 1;
  const work = def.work * workFactor, priceCents = contract ? def.design * 100 : 0;
  const ratios = scale === 'medium' ? [[.5, .3], [1, .7]] : scale === 'large' ? [[.25, .2], [.6, .3], [1, .5]] : [[1, 1]];
  const milestones = priceCents ? ratios.map(([progress, fraction]) => ({ progress: progress! * work, amountCents: Math.round(priceCents * fraction!) })) : [];
  return { work, priceCents, royaltyCents: contract ? 0 : Math.round(def.royalty * royaltyFactor * 100), growthPoints: def.work, milestones };
}
export function companyProjectTerms(project: CompanyProject): CompanyProjectQuote {
  return project.quote ?? companyProjectQuote(project.lane, project.topic, project.scale, project.mode);
}
export function companyProjectRoyaltyAddition(currentCents: number, stage: number, project: CompanyProject): number {
  const cap = Math.max(companyStage(stage).cap * 100,companyProjectTerms(project).minimumRoyaltyCapCents??0);
  const factor = currentCents < cap / 3 ? 1 : currentCents < cap * 2 / 3 ? .7 : currentCents < cap ? .4 : 0;
  return Math.max(0, Math.min(cap - currentCents, Math.round(companyProjectTerms(project).royaltyCents * factor)));
}
export function companyNextMilestone(project: CompanyProject) {
  const terms = companyProjectTerms(project);
  const index = terms.milestones.findIndex((_, i) => !project.paidMilestones?.includes(i));
  return index < 0 ? null : { ...terms.milestones[index]!, index };
}
