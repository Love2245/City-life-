/** Escape scene clipping while retaining the app's UI zoom and safe-area units. */
export function overlayPortal(node: HTMLElement): { destroy(): void } {
  const host = node.closest('.app-zoom') ?? document.querySelector('.app-zoom') ?? document.body;
  host.appendChild(node);
  return { destroy() { node.remove(); } };
}
