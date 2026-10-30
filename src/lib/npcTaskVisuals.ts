/** 按节点引用独立运行图片；URL 表不会预先解码整批事件插画。 */
const images = import.meta.glob('/src/assets/npc-tasks/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const NPC_TASK_ART_IDS = [
  'zhao-toy-item', 'zhao-toy-box', 'zhao-toy-poster', 'zhao-toy-ticket',
  'zhao-counter-scene', 'zhao-pickup-scene', 'zhao-delivery-scene',
  'xiaoyu-proof-icon', 'xiaoyu-original', 'xiaoyu-proof-good', 'xiaoyu-proof-wrong',
  'xiaoyu-print-receipt', 'xiaoyu-print-scene', 'xiaoyu-delivery-scene',
  'farmer-crate-item', 'farmer-appointment', 'farmer-receipt',
  'farmer-loading-scene', 'farmer-delivery-scene', 'farmer-return-scene',
] as const;

export function npcTaskImage(artId?: string): string | undefined {
  return artId ? images[`/src/assets/npc-tasks/${artId}.png`] : undefined;
}

export const NPC_TASK_ART_LABELS: Record<string, string> = {
  'zhao-toy-item': '快餐联名小熊摆件', 'zhao-toy-box': '小熊包装细节',
  'zhao-toy-poster': '联名小熊活动海报', 'zhao-toy-ticket': '预约取货单',
  'zhao-counter-scene': '陈姐的柜台', 'zhao-pickup-scene': '把小熊收好', 'zhao-delivery-scene': '交到赵刚手里',
  'xiaoyu-proof-icon': '招牌样张', 'xiaoyu-original': '街角招牌设计原稿',
  'xiaoyu-proof-good': 'A3哑光整图样张', 'xiaoyu-proof-wrong': 'A4亮面错印样张',
  'xiaoyu-print-receipt': '打印凭据', 'xiaoyu-print-scene': '网咖打印柜台', 'xiaoyu-delivery-scene': '林小雨验收样张',
  'farmer-crate-item': '受托鲜蔬筐', 'farmer-appointment': '送货约定单', 'farmer-receipt': '两筐菜签收回执',
  'farmer-loading-scene': '农场装货', 'farmer-delivery-scene': '马师傅签收', 'farmer-return-scene': '交回回执',
};
