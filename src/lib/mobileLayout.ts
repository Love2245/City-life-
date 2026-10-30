/**
 * 移动端布局的运行时策略。
 *
 * 这里放只依赖输入值的布局决策，UI 组件和回归测试共用同一套规则；
 * 这样测试验证的是实际行为，而不是某个 Svelte/CSS 文件当前恰好写成的字符串。
 */

export const MOBILE_COMPACT_WIDTH = 720;

export type GameMode = "pc" | "pe" | "tablet" | "mobile";

export function isMobileGameMode(mode: GameMode): boolean {
  return mode === "pe" || mode === "mobile";
}

export function mobileLayoutMode(mode: GameMode): "pc" | "mobile" {
  return isMobileGameMode(mode) ? "mobile" : "pc";
}

/** Mobile play is landscape-only, including menus, readers, and mini-games. */
export function shouldShowRotatePrompt(mode: GameMode, portrait: boolean): boolean {
  return isMobileGameMode(mode) && portrait;
}

export function shouldCompactSidebars(viewportWidth: number, portrait: boolean): boolean {
  return portrait || viewportWidth < MOBILE_COMPACT_WIDTH;
}

export function attrWidthRangeFor(mode: GameMode): { min: number; max: number } {
  return isMobileGameMode(mode) ? { min: 104, max: 260 } : { min: 140, max: 260 };
}

export function clampUiZoom(value: number): number {
  return Math.min(1.5, Math.max(0.5, Math.round(value * 10) / 10));
}

export function clampMobileZoom(value: number): number {
  return Math.min(1.3, Math.max(0.7, value));
}

export function clampRenderScale(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0.5, Math.round(value * 20) / 20)) : 1;
}

export function clampAttrWidth(value: number, mode: GameMode): number {
  const range = attrWidthRangeFor(mode);
  return Math.round(Math.min(range.max, Math.max(range.min, value)));
}

export function effectiveMobileZoom(uiZoom: number, _renderScale = 1): number {
  // Resolution affects GPU buffers only; UI size and safe areas follow UI zoom.
  return clampMobileZoom(uiZoom);
}

export function safeAreaTokens(
  insets: { top: number; right: number; bottom: number; left: number },
  uiZoom: number,
  renderScale: number,
): { top: number; right: number; bottom: number; left: number } {
  const scale = effectiveMobileZoom(uiZoom, renderScale);
  return {
    top: insets.top / scale,
    right: insets.right / scale,
    bottom: insets.bottom / scale,
    left: insets.left / scale,
  };
}

export function mobileMapLayout(input: {
  mobile: boolean;
  locationId: string;
  hasParentRegion?: boolean;
}): {
  integrated: boolean;
  showBreadcrumbs: boolean;
  showWaitBar: boolean;
} {
  const isMap = input.locationId === "map";
  const integrated = input.mobile && isMap && !!input.hasParentRegion;
  return {
    integrated,
    showBreadcrumbs: integrated,
    showWaitBar: !input.mobile,
  };
}

export function touchTargetForZoom(uiZoom: number, renderScale = 1): number {
  const effective = Math.min(1, effectiveMobileZoom(uiZoom, renderScale));
  return Math.max(44, 44 / effective);
}
