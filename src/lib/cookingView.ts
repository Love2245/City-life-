import type { Effects } from '../game/types';

/** 与结算使用同一份效果，品质倍率和四舍五入由 cooking core 统一计算。 */
export function mealEffectText(effects: Effects): string {
  return (['satiety', 'health', 'mood', 'stress'] as const)
    .filter(key => effects[key] !== undefined && effects[key] !== 0)
    .map(key => `${({ satiety: '饱腹', health: '健康', mood: '心情', stress: '压力' })[key]} ${effects[key]! > 0 ? '+' : ''}${effects[key]}`)
    .join(' · ');
}
