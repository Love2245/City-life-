import type { FactorySnapshot } from './factoryShift';

/** Presentation for the three industrial workstations; state remains in FactoryShift. */
export const INDUSTRIAL_WORKSHOPS = {
  steel: {
    brand: 'S.', subtitle: 'STEEL / HOT ROLLING', title: '钢炉的一班', station: '轧制 S1',
    eyebrow: '轧制 · 切割 · 冷却出货', object: '钢坯', code: 'STEEL', safe: 'HOT ZONE / S1',
    steps: ['点击轧制', '分段切割', '右滑出货'], points: ['第一段', '第二段', '第三段', '第四段'],
    dockAria: '点击钢坯开始轧制', pointAria: ['切割第一段钢坯', '切割第二段钢坯', '切割第三段钢坯', '切割第四段钢坯'],
    ready: ['点击钢坯，开始轧制', '热钢坯通过轧辊后，再依次切割四段。', '等待轧制'],
    docking: ['轧辊正在压延钢坯…', '轧制完成后，四处切割标记会亮起。', '正在轧制'],
    process: '切割', processing: '锯片正在切割…', ship: '切好了！按住钢坯，往右拖',
    output: '切好一件，向右送入冷却区。',
    howto: [['点一下热钢坯', '轧辊将钢坯自动压延到位。'], ['依次点击切割线', '点亮起的标记，切好四段。'], ['按住钢坯往右拖', '冷却出货后，下一件自动到达。']],
  },
  aluminum: {
    brand: 'A.', subtitle: 'ALUMINUM / RECYCLE', title: '铝材回收的一班', station: '压制 A1',
    eyebrow: '回收压制 · 修边 · 码放', object: '铝料', code: 'ALU', safe: 'RECYCLE / A1',
    steps: ['点击压制', '逐段修边', '右滑码放'], points: ['左端', '左中', '右中', '右端'],
    dockAria: '点击铝料开始压制', pointAria: ['修整左端铝材', '修整左中铝材', '修整右中铝材', '修整右端铝材'],
    ready: ['点击铝料，开始压制', '回收边角料压成板材后，依次修整四段边缘。', '等待压制'],
    docking: ['液压机正在压制铝料…', '边角料正在成形，稍后修整边缘。', '正在压制'],
    process: '修边', processing: '正在修整铝材边缘…', ship: '修好了！按住铝料，往右拖',
    output: '修好一件，向右码入成品架。',
    howto: [['点一下回收铝料', '液压机将边角料压成板材。'], ['依次点击修边点', '修整四段边缘，去掉毛刺。'], ['按住铝料往右拖', '码放完成后，下一件自动到达。']],
  },
  glass: {
    brand: 'G.', subtitle: 'GLASS / LIGHT INSPECTION', title: '玻璃质检的一班', station: '灯检 G1',
    eyebrow: '灯检入位 · 四项质检 · 出货', object: '玻璃', code: 'GLASS', safe: 'QUALITY / G1',
    steps: ['点击灯检', '四项质检', '右滑出货'], points: ['气泡', '划痕', '裂纹', '厚度'],
    dockAria: '点击玻璃开始灯检', pointAria: ['检查玻璃气泡', '检查玻璃划痕', '检查玻璃裂纹', '检查玻璃厚度'],
    ready: ['点击玻璃，开始灯检', '灯光扫描后，依次检查气泡、划痕、裂纹和厚度。', '等待灯检'],
    docking: ['灯光正在扫描玻璃…', '扫描完成后，依次确认四项质量检查。', '灯检中'],
    process: '检查', processing: '正在确认质检结果…', ship: '检验合格！按住玻璃，往右拖',
    output: '检好一片，向右送入成品区。',
    howto: [['点一下玻璃', '灯光自动扫描整片玻璃。'], ['依次完成四项质检', '检查气泡、划痕、裂纹和厚度。'], ['按住玻璃往右拖', '合格片出货后，下一片自动到达。']],
  },
} as const;

export function industrialFactoryInfo(profile: typeof INDUSTRIAL_WORKSHOPS[keyof typeof INDUSTRIAL_WORKSHOPS], state: FactorySnapshot): readonly string[] {
  switch (state.stage) {
    case 'ready': return profile.ready;
    case 'docking': return profile.docking;
    case 'solder': return [`${profile.process}亮起的${profile.points[state.activePoint]} · ${state.activePoint + 1}/4`, '点一下，当前工序完成后再处理下一处。', `等待${profile.process}`];
    case 'welding': return [profile.processing, '完成后，下一处标记会亮起。', `${profile.process}中`];
    case 'ship': return [profile.ship, '拖向右边，松开即可完成出货。', '等待出货'];
    case 'shipping': return ['这件完成了，下一件马上到', '下一件会自动进入工位。', '正在出货'];
  }
}
