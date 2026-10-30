/** Labels remain left-clickable; right drags and wheel gestures continue on the canvas. */
export function bridgeSceneLabelGestures(root: HTMLElement, canvas: HTMLCanvasElement): () => void {
  const label = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-cafe-facility],[data-store-facility]');
  const down = (event: PointerEvent) => {
    if (event.button !== 2 || !label(event.target)) return;
    event.preventDefault(); event.stopPropagation();
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: event.pointerId, pointerType: event.pointerType,
      isPrimary: event.isPrimary, button: event.button, buttons: event.buttons,
      clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey,
      altKey: event.altKey, metaKey: event.metaKey,
    }));
  };
  const wheel = (event: WheelEvent) => {
    if (!label(event.target)) return;
    event.preventDefault(); event.stopPropagation();
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
      deltaX: event.deltaX, deltaY: event.deltaY, deltaZ: event.deltaZ, deltaMode: event.deltaMode,
      clientX: event.clientX, clientY: event.clientY, ctrlKey: event.ctrlKey }));
  };
  const context = (event: Event) => { if (event.target === canvas || label(event.target)) event.preventDefault(); };
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('wheel', wheel, { capture: true, passive: false });
  root.addEventListener('contextmenu', context);
  return () => {
    root.removeEventListener('pointerdown', down, true); root.removeEventListener('wheel', wheel, true);
    root.removeEventListener('contextmenu', context);
  };
}
