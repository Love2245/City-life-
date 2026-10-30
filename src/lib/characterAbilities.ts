import type { GameState, GrowthStats, Skills } from '../game/types';
import { ATTR_NAMES, SKILL_NAMES } from './icons';
import { growthStatBreakdown } from '../game/core/growthStats';

const STATS: Array<{ key: keyof GrowthStats; detail: string }> = [
  { key: 'intelligence', detail: '学习理解与部分岗位要求' },
  { key: 'charm', detail: '社交表现与部分岗位要求' },
  { key: 'fitness', detail: '身体素质与体力上限' },
  { key: 'fame', detail: '在城市中积累的影响力' },
];
const SKILLS: Array<{ key: keyof Skills; detail: string }> = [
  { key: 'programming', detail: '编程工作与项目开发' },
  { key: 'design', detail: '设计工作与创作项目' },
  { key: 'writing', detail: '文案工作与写作' },
  { key: 'operation', detail: '运营岗位与商业工作' },
  { key: 'cooking', detail: '料理制作与烹饪工作' },
  { key: 'service', detail: '接待、服务与门店工作' },
  { key: 'driving', detail: '驾驶与运输工作' },
  { key: 'management', detail: '管理岗位与团队工作' },
];
export interface CharacterAbility {
  key: string;
  kind: 'stat' | 'skill';
  name: string;
  value: number;
  max: number;
  detail: string;
  breakdown?: string;
}

/** A read-only presentation shared by flat scenes and all three 3D interiors. */
export function characterAbilities(state: GameState): CharacterAbility[] {
  return [
    ...STATS.map(({ key, detail }) => {
      const parts = growthStatBreakdown(state, key);
      return { key, kind: 'stat' as const, name: ATTR_NAMES[key], value: parts.effective, max: 100, detail,
        breakdown: `基础 ${parts.base}${parts.bonus ? ` ＋ 装备 ${parts.bonus}` : ''} ＝ 当前 ${parts.effective}` };
    }),
    ...SKILLS.map(({ key, detail }) => ({ key, kind: 'skill' as const, name: SKILL_NAMES[key], value: state.player.skills[key], max: 10, detail })),
  ];
}

export function abilityNumber(value: number): string {
  // Do not round an unfinished skill up to the next job requirement.
  return String(Math.floor((value + 1e-8) * 100) / 100);
}
