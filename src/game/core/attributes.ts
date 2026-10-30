/** 角色与宠物通用的百分比属性钳制。所有 0–100 属性统一从这里收敛。 */
export function clampAttr(value: number): number {
  return Math.max(0, Math.min(100, value));
}
