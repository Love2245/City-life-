import {afterEach,describe,expect,it,vi} from 'vitest';
import {createSceneReadiness,createSceneWorkBudget,createSceneModelQueue,sceneRenderIsCovered} from '../src/lib/sceneLoadWork';

afterEach(()=>vi.useRealTimers());

it('pauses an outgoing renderer without blocking the incoming scene first frame, and resumes when the cover leaves',()=>{
  let cover:{dataset:{loadingId:string}}|null={dataset:{loadingId:'new'}};
  vi.stubGlobal('document',{querySelector:(selector:string)=>selector==='[data-scene-loading-overlay]'?cover:null});
  try{
    expect(sceneRenderIsCovered({dataset:{sceneLoadingOwner:'old'}} as unknown as HTMLElement)).toBe(true);
    expect(sceneRenderIsCovered({dataset:{sceneLoadingOwner:'new'}} as unknown as HTMLElement)).toBe(false);
    expect(sceneRenderIsCovered({dataset:{}} as HTMLElement)).toBe(false);
    cover=null;expect(sceneRenderIsCovered({dataset:{sceneLoadingOwner:'old'}} as unknown as HTMLElement)).toBe(false);
  }finally{vi.unstubAllGlobals();}
});

it('suspends rooms under full-screen work apps, but still presents a restored scene before releasing its loading cover',()=>{
  let app:object|null={},loading:{dataset:{loadingId:string}}|null=null;
  vi.stubGlobal('document',{querySelector:(selector:string)=>selector==='[data-scene-loading-overlay]'?loading:app});
  try{
    const host={dataset:{sceneLoadingOwner:'room'}} as unknown as HTMLElement;
    expect(sceneRenderIsCovered(host)).toBe(true);
    expect(sceneRenderIsCovered({dataset:{}} as HTMLElement)).toBe(true);
    loading={dataset:{loadingId:'room'}};expect(sceneRenderIsCovered(host)).toBe(false);
    loading=null;expect(sceneRenderIsCovered(host)).toBe(true);
    app=null;expect(sceneRenderIsCovered(host)).toBe(false);
  }finally{vi.unstubAllGlobals();}
});

describe('scene readiness',()=>{
  it('requires assets and a subsequent frame with non-zero viewport dimensions',async()=>{
    const gate=createSceneReadiness(),done=vi.fn();void gate.promise.then(done);
    expect(gate.rendered(800,600)).toBe(false);
    gate.assetsReady();await Promise.resolve();expect(done).not.toHaveBeenCalled();
    expect(gate.rendered(1,600)).toBe(false);expect(gate.rendered(800,0)).toBe(false);
    expect(gate.rendered(800,600)).toBe(true);await gate.promise;expect(done).toHaveBeenCalledOnce();
  });
  it('settles cancellation immediately and ignores resources or frames finishing after teardown',async()=>{
    const gate=createSceneReadiness();gate.cancel();
    await expect(gate.promise).rejects.toMatchObject({name:'AbortError'});
    gate.assetsReady();expect(gate.rendered(800,600)).toBe(false);
  });
  it('reports a failed render or model load without converting it into readiness',async()=>{
    const gate=createSceneReadiness(),error=new Error('shader compilation failed');gate.assetsReady();gate.fail(error);
    expect(gate.rendered(800,600)).toBe(false);await expect(gate.promise).rejects.toBe(error);
  });
});

describe('scene construction budget',()=>{
  it('uses a later task rather than only a microtask when the budget is exhausted',async()=>{
    vi.useFakeTimers();let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
    const checkpoint=createSceneWorkBudget(()=>false);now=9;let finished=false;
    const waiting=checkpoint().then(()=>{finished=true;});await Promise.resolve();expect(finished).toBe(false);
    await vi.runAllTimersAsync();await waiting;expect(finished).toBe(true);vi.restoreAllMocks();
  });
  it('does not resume a construction batch after disposal during a yield',async()=>{
    vi.useFakeTimers();let cancelled=false;const checkpoint=createSceneWorkBudget(()=>cancelled);
    const waiting=checkpoint(true);cancelled=true;const rejection=expect(waiting).rejects.toMatchObject({name:'AbortError'});
    await vi.runAllTimersAsync();await rejection;
  });
  it('waits until after a visible animation frame before resuming construction',async()=>{
    vi.useFakeTimers();let animation:FrameRequestCallback|undefined,finished=false;
    vi.stubGlobal('document',{visibilityState:'visible'});
    vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{animation=callback;return 1;}));
    vi.stubGlobal('cancelAnimationFrame',vi.fn());
    try{
      const waiting=createSceneWorkBudget(()=>false)(true).then(()=>{finished=true;});
      await Promise.resolve();expect(finished).toBe(false);
      animation!(performance.now());await Promise.resolve();expect(finished).toBe(false);
      await vi.runAllTimersAsync();await waiting;expect(finished).toBe(true);
    }finally{vi.unstubAllGlobals();}
  });
});

describe('shared scene model queue',()=>{
  it('keeps decoding bounded across simultaneous interior and exterior callers',async()=>{
    vi.useFakeTimers();const load=createSceneModelQueue(2),release:(()=>void)[]=[],started:number[]=[];
    const jobs=Array.from({length:5},(_,id)=>load(async()=>{started.push(id);await new Promise<void>(done=>release.push(done));return id;}));
    await vi.runAllTimersAsync();expect(started).toEqual([0,1]);
    release.shift()!();await vi.runAllTimersAsync();expect(started).toEqual([0,1,2]);
    release.shift()!();await vi.runAllTimersAsync();expect(started).toEqual([0,1,2,3]);
    release.shift()!();await vi.runAllTimersAsync();expect(started).toEqual([0,1,2,3,4]);
    release.splice(0).forEach(done=>done());await expect(Promise.all(jobs)).resolves.toEqual([0,1,2,3,4]);
  });
  it('skips a disposed scene before loading its queued models and continues after failures',async()=>{
    vi.useFakeTimers();const load=createSceneModelQueue(1),cancelledFactory=vi.fn(),goodFactory=vi.fn(async()=>42);
    let cancel=false;
    const failing=load(async()=>{throw new Error('model unavailable');}),discarded=load(cancelledFactory,()=>cancel),good=load(goodFactory);
    const rejection=expect(failing).rejects.toThrow('model unavailable'),cancellation=expect(discarded).rejects.toMatchObject({name:'AbortError'});
    cancel=true;await vi.runAllTimersAsync();await rejection;await cancellation;
    await expect(good).resolves.toBe(42);expect(cancelledFactory).not.toHaveBeenCalled();expect(goodFactory).toHaveBeenCalledOnce();
  });
});
