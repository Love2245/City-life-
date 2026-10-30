// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeSceneLabelGestures } from '../src/lib/scenePointerBridge';
afterEach(() => { document.body.innerHTML = ''; });
describe('scene facility labels and camera gestures', () => {
  it.each(['data-cafe-facility', 'data-store-facility'])('%s forwards right drag and wheel without stealing left clicks', attribute => {
    const host = document.createElement('div');
    host.innerHTML = `<canvas></canvas><button ${attribute}="desk"><span>桌子</span></button>`;
    document.body.append(host);
    const canvas = host.querySelector('canvas')!, button = host.querySelector('button')!, label = host.querySelector('span')!;
    const pointer = vi.fn(), wheel = vi.fn(), click = vi.fn();
    canvas.addEventListener('pointerdown', pointer); canvas.addEventListener('wheel', wheel); button.addEventListener('click', click);
    const stop = bridgeSceneLabelGestures(host, canvas);
    const right = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, buttons: 2, pointerId: 45, clientX: 101, clientY: 77 });
    label.dispatchEvent(right);
    expect(right.defaultPrevented).toBe(true); expect(pointer).toHaveBeenCalledOnce();
    expect(pointer.mock.calls[0][0]).toMatchObject({ button: 2, buttons: 2, pointerId: 45, clientX: 101, clientY: 77 });
    label.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); button.click();
    expect(pointer).toHaveBeenCalledOnce(); expect(click).toHaveBeenCalledOnce();
    const scroll = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 123 });
    label.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(true); expect(wheel.mock.calls[0][0].deltaY).toBe(123);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); label.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    stop();
    label.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2 }));
    expect(pointer).toHaveBeenCalledOnce();
  });
});
