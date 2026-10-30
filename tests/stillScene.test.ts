// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { containStillFrame, createStillScene, projectStillWorld } from '../src/lib/stillScene';

class ControlledImage {
  static all: ControlledImage[] = [];
  src = '';
  decoding = '';
  naturalWidth = 1600;
  naturalHeight = 1000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { ControlledImage.all.push(this); }
  load() { this.onload?.(); }
  fail() { this.onerror?.(); }
}
let sequence = 0;
const asset = (name: string) => `still-test-${++sequence}-${name}.webp`;
const image = (src: string) => ControlledImage.all.findLast(item => item.src === src)!;
const active: ReturnType<typeof createStillScene>[] = [];
let observer: { callback: () => void; disconnect: ReturnType<typeof vi.fn> };
let drawImage: ReturnType<typeof vi.fn>, context: CanvasRenderingContext2D, getContext: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ControlledImage.all = [];
  drawImage = vi.fn();
  context = {
    setTransform: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), scale: vi.fn(), drawImage,
  } as unknown as CanvasRenderingContext2D;
  getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((type: string) => {
    if (type !== '2d') throw new Error('Phone stills must not request WebGL');
    return context;
  });
  vi.stubGlobal('Image', ControlledImage);
  vi.stubGlobal('devicePixelRatio', 3);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => { throw new Error('Still scenes must not run an animation loop'); }));
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn();
    constructor(callback: () => void) { observer = { callback, disconnect: this.disconnect }; }
    observe() { /* The compositor also measures synchronously at creation. */ }
  });
});
afterEach(() => {
  active.splice(0).forEach(scene => scene.dispose());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(width = 800, height = 800, options: Parameters<typeof createStillScene>[1] = {}) {
  const host = document.createElement('div'); document.body.append(host);
  let currentWidth = width, currentHeight = height;
  Object.defineProperties(host, {
    clientWidth: { get: () => currentWidth }, clientHeight: { get: () => currentHeight },
  });
  const scene = createStillScene(host, options); active.push(scene);
  scene.canvas.getBoundingClientRect = () => ({ left: 40, top: 70, width: currentWidth, height: currentHeight, right: 40 + currentWidth, bottom: 70 + currentHeight, x: 40, y: 70, toJSON() {} });
  return { host, scene, resize(w: number, h: number) { currentWidth = w; currentHeight = h; observer.callback(); } };
}
const shown = () => drawImage.mock.calls.map(call => (call[0] as ControlledImage).src);
function pointer(canvas: HTMLCanvasElement, kind: 'pointerdown' | 'pointerup', x: number, y: number) {
  canvas.dispatchEvent(new MouseEvent(kind, { clientX: x, clientY: y }));
}

describe('mobile still scene geometry', () => {
  it('presents a partial large photograph at native desktop resolution rather than a fitted thumbnail',async()=>{
    const {scene,host}=mount(1920,1080),src=asset('4k');const update=scene.update({src,width:4096,height:3072,camera:{key:'room',center:[2048,1536],viewHeight:1600},fit:'cover'});image(src).load();await update;
    const viewport=JSON.parse(host.dataset.stillViewport!);expect(viewport.width).toBeGreaterThan(1920);expect(viewport.height).toBeGreaterThan(1080);expect(scene.canvas.width).toBeGreaterThanOrEqual(1920);expect(scene.canvas.height).toBeGreaterThanOrEqual(1080);
    expect(scene.hostToImage(0,0).x).toBeGreaterThan(0);expect(scene.hostToImage(1920,1080).x).toBeLessThan(4096);
  });
  it('pans and zooms a cover photograph, moves facility anchors with it, and suppresses drag clicks',async()=>{
    const onClick=vi.fn(),{scene}=mount(800,400,{onClick}),src=asset('navigation');const update=scene.update({src,width:1600,height:1000,fit:'cover'});image(src).load();await update;
    const before=scene.imageToHost(1000,500);scene.zoom(1.5);const enlarged=scene.imageToHost(1000,500);expect(enlarged.x).toBeGreaterThan(before.x);
    pointer(scene.canvas,'pointerdown',440,270);scene.canvas.dispatchEvent(new MouseEvent('pointermove',{clientX:520,clientY:270}));pointer(scene.canvas,'pointerup',520,270);
    expect(scene.imageToHost(1000,500).x).toBeGreaterThan(enlarged.x);expect(onClick).not.toHaveBeenCalled();
    const point=scene.imageToHost(1000,500);pointer(scene.canvas,'pointerdown',40+point.x*8,70+point.y*4);pointer(scene.canvas,'pointerup',40+point.x*8,70+point.y*4);expect(onClick).toHaveBeenLastCalledWith(1000,500);
    scene.resetView();expect(scene.imageToHost(1000,500)).toEqual(before);
  });
  it('accepts two-finger pinch and converts client coordinates through a scaled UI',async()=>{
    const onClick=vi.fn(),{scene}=mount(800,400,{onClick}),src=asset('pinch');const update=scene.update({src,width:1600,height:1000,fit:'cover'});image(src).load();await update;
    const send=(type:string,id:number,x:number,y:number)=>{const event=new MouseEvent(type,{clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:id});scene.canvas.dispatchEvent(event);};
    const before=scene.imageToHost(1000,500).x;send('pointerdown',1,340,270);send('pointerdown',2,540,270);send('pointermove',1,290,270);send('pointermove',2,590,270);send('pointerup',1,290,270);send('pointerup',2,590,270);expect(scene.imageToHost(1000,500).x).toBeGreaterThan(before);expect(onClick).not.toHaveBeenCalled();
    scene.resetView();scene.canvas.getBoundingClientRect=()=>({left:40,top:70,width:400,height:200,right:440,bottom:270,x:40,y:70,toJSON(){}});send('pointerdown',3,240,170);send('pointerup',3,240,170);expect(onClick).toHaveBeenLastCalledWith(800,500);
  });
  it('projects baked world anchors into the image and rejects points outside the camera', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(projectStillWorld([0, 0, 0], identity, 1600, 1000)).toEqual({ x: 800, y: 500, depth: 0, visible: true });
    expect(projectStillWorld([1, -1, .5], identity, 1600, 1000)).toEqual({ x: 1600, y: 1000, depth: .5, visible: true });
    expect(projectStillWorld([1.01, 0, 0], identity, 1600, 1000).visible).toBe(false);
    expect(projectStillWorld([0, 0, 1.01], identity, 1600, 1000).visible).toBe(false);
    expect(projectStillWorld([0, 0, 0], identity.map((n, i) => i === 15 ? -1 : n), 1600, 1000).visible).toBe(false);
    expect(projectStillWorld([0, 0, 0], identity.map((n, i) => i === 15 ? 0 : n), 1600, 1000).visible).toBe(false);
  });

  it('contains the whole photograph and maps anchors/clicks through letterboxing after rotation and resize', async () => {
    expect(containStillFrame(800, 800, 1600, 1000)).toEqual({ scale: .5, x: 0, y: 150, width: 800, height: 500 });
    const onClick = vi.fn(), { scene, resize } = mount(800, 800, { onClick }), src = asset('wide');
    const update = scene.update({ src, width: 1600, height: 1000 }); image(src).load(); await update;
    expect(scene.imageToHost(800, 500)).toEqual({ x: 50, y: 50, visible: true });
    expect(scene.imageToHost(0, 0)).toEqual({ x: 0, y: 18.75, visible: true });
    expect(scene.hostToImage(400, 400)).toEqual({ x: 800, y: 500 });
    pointer(scene.canvas, 'pointerdown', 440, 470); pointer(scene.canvas, 'pointerup', 440, 470);
    expect(onClick).toHaveBeenLastCalledWith(800, 500);
    pointer(scene.canvas, 'pointerdown', 440, 100); pointer(scene.canvas, 'pointerup', 440, 100);
    expect(onClick).toHaveBeenCalledTimes(1); // Top letterbox is not an interactive part of the room.
    pointer(scene.canvas, 'pointerdown', 440, 470); pointer(scene.canvas, 'pointerup', 490, 470);
    expect(onClick).toHaveBeenCalledTimes(1); // A swipe is not a facility click.
    resize(1600, 600);
    expect(scene.imageToHost(0, 0)).toEqual({ x: 20, y: 0, visible: true });
    expect(scene.hostToImage(800, 300)).toEqual({ x: 800, y: 500 });
  });
});

describe('mobile still scene rendering lifecycle', () => {
  it('recolors photographed sky once with only a depth frame, while leaving the finite-depth building intact',async()=>{
    let last:ControlledImage|undefined;
    drawImage.mockImplementation(source=>{last=source;});
    const src=asset('background'),depth=asset('depth'),base=[120,134,129,255,90,80,70,255],z=[255,255,0,255,0,200,0,255];
    Object.assign(context,{clearRect:vi.fn(),putImageData:vi.fn(),getImageData:vi.fn(()=>({data:new Uint8ClampedArray(last?.src===depth?z:base)}))});
    vi.stubGlobal('ImageData',class {constructor(public data:Uint8ClampedArray,public width:number,public height:number){}});
    const {scene}=mount(),frame={src,depthSrc:depth,width:2,height:1,photographBackground:[18,32,57] as const};
    const update=scene.update(frame);image(src).load();image(depth).load();await update;
    expect(context.putImageData).toHaveBeenCalledOnce();expect([...vi.mocked(context.putImageData).mock.calls[0]![0].data]).toEqual([18,32,57,255,90,80,70,255]);
    await scene.update(frame);expect(context.putImageData).toHaveBeenCalledOnce();expect(ControlledImage.all).toHaveLength(2);expect(getContext.mock.calls.every(call=>call[0]==='2d')).toBe(true);
  });
  it('draws only Canvas2D, orders furniture by camera depth, then covers it with foreground walls', async () => {
    const { scene } = mount(), src = asset('base'), near = asset('near'), far = asset('far'), foreground = asset('wall');
    const update = scene.update({ src, foreground, width: 1600, height: 1000 }, [
      { src: near, x: 100, y: 200, width: 50, height: 70, depth: -.5 },
      { src: far, x: 200, y: 300, width: 40, height: 60, depth: .5 },
    ]);
    [src, near, far, foreground].forEach(src => image(src).load());
    await expect(update).resolves.toBe(true); await scene.ready;
    expect(shown()).toEqual([src, far, near, foreground]);
    expect(getContext.mock.calls.every(call => call[0] === '2d')).toBe(true);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    const count = drawImage.mock.calls.length; await Promise.resolve();
    expect(drawImage).toHaveBeenCalledTimes(count); // No background render loop while idle.
    expect(scene.canvas.width * scene.canvas.height).toBeLessThanOrEqual(8_388_608);
  });

  it('shares a pending identical request and does not signal readiness before the complete first picture', async () => {
    const { scene } = mount(), src = asset('base'), overlay = asset('overlay'), frame = { src, width: 1600, height: 1000 }, layers = [{ src: overlay, x: 0, y: 0, width: 10, height: 10 }];
    let ready = false; void scene.ready.then(() => { ready = true; });
    const first = scene.update(frame, layers), same = scene.update({ ...frame }, layers.map(layer => ({ ...layer })));
    expect(same).toBe(first); expect(ControlledImage.all).toHaveLength(2);
    image(src).load(); await Promise.resolve(); expect(drawImage).not.toHaveBeenCalled(); expect(ready).toBe(false);
    image(overlay).load(); await expect(first).resolves.toBe(true); await same; await scene.ready;
    expect(ready).toBe(true); expect(shown()).toEqual([src, overlay]);
    await expect(scene.update(frame, layers)).resolves.toBe(true);
    expect(shown()).toEqual([src, overlay]); expect(ControlledImage.all).toHaveLength(2);
  });

  it('commits the newest angle even when an older photograph finishes loading last', async () => {
    const onLayout = vi.fn(), { scene } = mount(800, 800, { onLayout }), old = asset('old-angle'), next = asset('next-angle');
    const first = scene.update({ src: old, width: 1600, height: 1000 });
    const latest = scene.update({ src: next, width: 1000, height: 1600 });
    await expect(first).resolves.toBe(false); // Cancellation does not wait for a stalled old network request.
    image(next).load(); await expect(latest).resolves.toBe(true);
    expect(scene.imageToHost(0, 0)).toEqual({ x: 18.75, y: 0, visible: true });
    image(old).load(); await expect(first).resolves.toBe(false);
    expect(shown()).toEqual([next]); expect(onLayout).toHaveBeenCalledOnce();
    expect(scene.imageToHost(0, 0)).toEqual({ x: 18.75, y: 0, visible: true });
  });

  it('waits for a visible viewport before declaring a decoded picture drawn', async () => {
    const { scene, resize } = mount(0, 0), src = asset('hidden'), frame = { src, width: 1600, height: 1000 };
    let ready = false, drawn = false; void scene.ready.then(() => { ready = true; });
    const pending = scene.update(frame); void pending.then(() => { drawn = true; });
    image(src).load(); await new Promise<void>(done => queueMicrotask(() => queueMicrotask(done)));
    expect(drawImage).not.toHaveBeenCalled(); expect(drawn).toBe(false); expect(ready).toBe(false);
    expect(scene.update(frame)).toBe(pending);
    resize(800, 800); await expect(pending).resolves.toBe(true); await scene.ready;
    expect(shown()).toEqual([src]); expect(drawn).toBe(true); expect(ready).toBe(true);
  });

  it('keeps old photograph coordinates while a hidden next angle waits, then cancels it cleanly on teardown', async () => {
    const { scene, resize } = mount(), old = asset('visible'), next = asset('hidden-next');
    const first = scene.update({ src: old, width: 1600, height: 1000 }); image(old).load(); await first;
    resize(1, 1);
    let drawn = false;
    const waiting = scene.update({ src: next, width: 1000, height: 1600 }); void waiting.then(() => { drawn = true; });
    image(next).load(); await new Promise<void>(done => queueMicrotask(() => queueMicrotask(done)));
    expect(drawn).toBe(false); expect(shown()).toEqual([old]);
    expect(scene.imageToHost(0, 0)).toEqual({ x: 0, y: 18.75, visible: true });
    scene.dispose(); await expect(waiting).resolves.toBe(false); expect(shown()).toEqual([old]);
  });

  it('keeps the last complete picture on image failure and allows retrying the same requested angle', async () => {
    const onError = vi.fn(), { scene } = mount(800, 800, { onError }), original = asset('original'), next = asset('failed-next');
    const initial = scene.update({ src: original, width: 1600, height: 1000 }); image(original).load(); await initial;
    const update = scene.update({ src: next, width: 1000, height: 1600 }), failure = expect(update).rejects.toThrow('无法载入场景图片'); image(next).fail(); await failure;
    expect(shown()).toEqual([original]); expect(onError).toHaveBeenCalledOnce();
    expect(scene.imageToHost(0, 0)).toEqual({ x: 0, y: 18.75, visible: true });
    const retry = scene.update({ src: next, width: 1000, height: 1600 });
    expect(ControlledImage.all.filter(item => item.src === next)).toHaveLength(2);
    image(next).load(); await expect(retry).resolves.toBe(true);
    expect(shown()).toEqual([original, next]);
  });

  it('does not complete a new configuration requested by the layout callback before its photograph is available', async () => {
    const original = asset('layout-first'), next = asset('layout-next'); let replacement: Promise<boolean> | undefined, done = false;
    const { scene } = mount(800, 800, { onLayout() {
      if (replacement) return;
      replacement = scene.update({ src: next, width: 1000, height: 1600 });
      void replacement.then(() => { done = true; });
    } });
    const first = scene.update({ src: original, width: 1600, height: 1000 }); image(original).load();
    await expect(first).resolves.toBe(false); await Promise.resolve();
    expect(done).toBe(false); expect(shown()).toEqual([original]);
    image(next).load(); await expect(replacement).resolves.toBe(true); expect(shown()).toEqual([original, next]);
  });

  it('ignores failures belonging to a superseded angle rather than failing the active scene', async () => {
    const onError = vi.fn(), { scene } = mount(800, 800, { onError }), old = asset('obsolete'), next = asset('current');
    const first = scene.update({ src: old, width: 1600, height: 1000 }), latest = scene.update({ src: next, width: 1600, height: 1000 });
    image(next).load(); await latest; image(old).fail(); await expect(first).resolves.toBe(false);
    expect(onError).not.toHaveBeenCalled(); expect(shown()).toEqual([next]); await scene.ready;
  });

  it('removes pointer/resize listeners and never draws or reports image errors after disposal', async () => {
    const onClick = vi.fn(), onError = vi.fn(), { scene, host } = mount(800, 800, { onClick, onError }), src = asset('late');
    const update = scene.update({ src, width: 1600, height: 1000 }), ready = expect(scene.ready).rejects.toMatchObject({ name: 'AbortError' });
    scene.dispose(); scene.dispose(); await ready; await expect(update).resolves.toBe(false);
    expect(host.querySelector('canvas')).toBeNull(); expect(observer.disconnect).toHaveBeenCalledOnce();
    image(src).load(); await expect(update).resolves.toBe(false);
    scene.refresh(); observer.callback(); pointer(scene.canvas, 'pointerdown', 440, 470); pointer(scene.canvas, 'pointerup', 440, 470);
    expect(drawImage).not.toHaveBeenCalled(); expect(onClick).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
    await expect(scene.update({ src: asset('disposed'), width: 1000, height: 1000 })).resolves.toBe(false);
    expect(ControlledImage.all).toHaveLength(1);
  });
});
