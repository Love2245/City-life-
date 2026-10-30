import type { StockDefinition, StockRisk } from '../stockTypes';
const risk = { stable:{scale:.02,limit:.06,eventLimit:.12}, medium:{scale:.04,limit:.10,eventLimit:.20}, high:{scale:.06,limit:.15,eventLimit:.30} };
function stock(id:string,name:string,sector:string,level:StockRisk,price:number,goodNews:string,badNews:string):StockDefinition {
  return {id,name,sector,risk:level,initialPriceCents:price*100,...risk[level],goodNews,badNews};
}
export const STOCKS:readonly StockDefinition[] = [
  stock('SS001','朝夕食品','食品','stable',12,'朝夕食品拿下连锁商超长期供货订单。','朝夕食品部分产品召回，短期成本上升。'),
  stock('SS002','东月银行','银行','stable',10,'东月银行季度经营稳健，新增企业客户。','东月银行坏账准备上调，利润承压。'),
  stock('SS003','紫羊农产','农业','stable',8,'紫羊农产丰收，农产品外销订单增加。','紫羊农产遭遇局部灾害，收成预期下调。'),
  stock('SS004','树堰物流','物流','medium',16,'树堰物流新分拨中心投入运营。','树堰物流运输线路受阻，配送成本增加。'),
  stock('SS005','树堰基建','基建','stable',20,'树堰基建中标城市公共设施工程。','树堰基建项目延期，回款周期延长。'),
  stock('SS006','泊月科技','科技','high',40,'泊月科技新产品获得大批企业采购订单。','泊月科技新产品延期，研发支出超预期。'),
  stock('SS007','星璇科技','科技','high',60,'星璇科技公布关键技术突破。','星璇科技核心项目测试未达预期。'),
  stock('SS008','苏打娱乐','娱乐','high',25,'苏打娱乐新作热销，票房与口碑走高。','苏打娱乐重点作品表现不佳，推广成本增加。'),
  stock('SS009','紫羊重工','重工','medium',24,'紫羊重工新增大型设备出口合同。','紫羊重工原材料成本上升，生产计划调整。'),
  stock('SS010','泊月航空','航空','medium',32,'泊月航空新增航线客座率超预期。','泊月航空多条航线调整，运营成本上升。'),
  stock('SS011','沸点能源','能源','high',30,'沸点能源新项目投产，能源需求走强。','沸点能源供应项目受阻，现货需求回落。'),
  stock('SS012','晨星传媒','传媒','medium',18,'晨星传媒签下年度广告与内容合作。','晨星传媒主要广告客户缩减预算。'),
];
export const STOCK_MAP = Object.fromEntries(STOCKS.map(s=>[s.id,s])) as Record<string,StockDefinition>;
export const STOCK_RISK_LABEL:Record<StockRisk,string> = {stable:'稳定',medium:'中等',high:'高波动'};
