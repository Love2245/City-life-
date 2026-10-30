import type { ZoneId } from './layout';

/** Existing game contracts only. This preview never dispatches an action. */
export const GAMEPLAY_STOPS = [
  { id: 'meal', label: '买一份简餐', tag: '冷藏鲜食', zone: 'cold', title: '选一餐，打包或堂食', copy: '盒饭、三明治和沙拉对应现有购物目录。默认打包进背包；选择堂食时立即食用，并额外花费 0.5 小时。', actionIds: ['buy_lunch_convenience', 'buy_sandwich_convenience', 'buy_salad_convenience'] },
  { id: 'drink', label: '补充饮料', tag: '饮品冷柜', zone: 'cold', title: '普通饮料与能量饮料', copy: '普通饮料和能量饮料提供路上的补给。陈列采用不同包装，选购时仍归入这两种商品；价格以当天物价和折扣后的购物车结算为准。', actionIds: ['buy_drink_convenience', 'convenience_store_energy_drink'] },
  { id: 'pantry', label: '带点速食和调料', tag: '双排货架', zone: 'shelves', title: '从货架到家里的厨房', copy: '泡面、盐、糖、酱油、辣椒粉和沙拉酱对应现有采购项目。调料采购耗时 0.25 小时，结算由同一购物车完成。', actionIds: ['buy_noodles_convenience', 'buy_salt_convenience', 'buy_sugar_convenience', 'buy_soy_sauce_convenience', 'buy_chili_powder_convenience', 'buy_salad_dressing_convenience'] },
  { id: 'dining', label: '看看用餐服务', tag: '加热 · 热水', zone: 'services', title: '设备服务于这一餐', copy: '微波炉、热水、纸杯和餐具，让即食食品与临窗座位连成一处完整服务区。咖啡与热食设备先作为环境陈设保留。堂食仍沿用购买时的用餐选择。', actionIds: [] },
  { id: 'blindbox', label: '夜间盲盒', tag: '22:00—06:00', zone: 'checkout', title: '深夜，带走一份小惊喜', copy: '22:00—06:00 可购买夜间盲盒，基础价 10 元、耗时 0.5 小时，随机得到两个不同的食物或食材。实际价格随物价调整；这与有条件的下班福利分开。', actionIds: ['convenience_blind_box'] },
  { id: 'work', label: '了解店员工作', tag: '招聘 · 排班', zone: 'checkout', title: '先入职，再来柜台上班', copy: '正式店员先通过手机招聘入职，再到便利店按 09:00—17:00 班次上班。收银小游戏按扫码、应收、找零进行；日结岗位继续由劳务市场提供。', actionIds: [], jobId: 'job_convenience_clerk' },
] as const satisfies readonly { id: string; label: string; tag: string; zone: ZoneId; title: string; copy: string; actionIds: readonly string[]; jobId?: string }[];
export type StopId = typeof GAMEPLAY_STOPS[number]['id'];
