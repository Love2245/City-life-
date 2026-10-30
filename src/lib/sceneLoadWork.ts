/** A cancelled scene still settles its public ready promise, including callers that never await it. */
export function sceneLoadAbort(): Error {
  const error = new Error('Scene loading was cancelled');
  error.name = 'AbortError';
  return error;
}

/** Keep first-frame readiness working, then stop GPU work behind opaque full-screen apps. */
export function sceneRenderIsCovered(host:HTMLElement):boolean {
  const owner=host.dataset.sceneLoadingOwner;
  const cover=document.querySelector<HTMLElement>('[data-scene-loading-overlay]');
  // A restored work game may already cover the new room. Its first frame must
  // still release the loading overlay before we suspend background rendering.
  if(owner&&cover?.dataset.loadingId===owner)return false;
  return !!document.querySelector('[data-scene-render-cover]')||!!owner&&!!cover;
}

/** Resources alone are insufficient: reveal only after a real frame at a useful viewport size. */
export function createSceneReadiness() {
  let assets = false, settled = false, complete = false;
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  // Preview callers can dispose without observing ready. Keep the original promise rejecting for awaiters.
  void promise.catch(() => {});
  return {
    promise,
    assetsReady() { if (!settled) assets = true; },
    rendered(width: number, height: number) {
      if (!settled && assets && width > 1 && height > 1) {
        complete = settled = true;
        resolve();
      }
      return complete;
    },
    fail(error: unknown) { if (!settled) { settled = true; reject(error); } },
    cancel() { if (!settled) { settled = true; reject(sceneLoadAbort()); } },
  };
}

/** Give a visible loading cover a paint opportunity before resuming CPU work.
 * A timer alone can resume several batches before the next frame. The timeout
 * also keeps hidden tabs and test/preview environments from waiting on rAF. */
function yieldSceneWork():Promise<void> {
  return new Promise(done=>{
    if(typeof requestAnimationFrame!=='function'||typeof document==='undefined'||document.visibilityState!=='visible'){
      setTimeout(done,0);return;
    }
    let frame=0,timer:ReturnType<typeof setTimeout>|undefined,settled=false;
    const finish=()=>{if(settled)return;settled=true;cancelAnimationFrame(frame);clearTimeout(timer);done();};
    timer=setTimeout(finish,50);
    frame=requestAnimationFrame(()=>{clearTimeout(timer);timer=setTimeout(finish,0);});
  });
}

/** Yield between construction batches so CSS animation can paint while models are assembled. */
export function createSceneWorkBudget(isCancelled: () => boolean, budgetMs = 8) {
  let started = performance.now();
  return async function checkpoint(force = false) {
    if (isCancelled()) throw sceneLoadAbort();
    if (force || performance.now() - started >= budgetMs) {
      await yieldSceneWork();
      if (isCancelled()) throw sceneLoadAbort();
      started = performance.now();
    }
  };
}

/** Bound parsing across the interior and exterior together. Starting every GLB
 * at once makes cached files and portable data URLs finish in one main-thread
 * burst. Each slot gives the loading cover a frame before decoding another file. */
export function createSceneModelQueue(concurrency=2) {
  type Job={cancelled:()=>boolean;run:()=>Promise<void>;reject:(error:unknown)=>void};
  const pending:Job[]=[];
  let active=0;
  const limit=Math.max(1,Math.floor(concurrency)||1);
  async function start(job:Job){
    active++;
    try{await yieldSceneWork();if(job.cancelled())throw sceneLoadAbort();await job.run();}
    catch(error){job.reject(error);}
    finally{active--;drain();}
  }
  function drain(){
    while(active<limit&&pending.length){const job=pending.shift()!;if(job.cancelled())job.reject(sceneLoadAbort());else void start(job);}
  }
  return function load<T>(factory:()=>Promise<T>,isCancelled:()=>boolean=()=>false):Promise<T>{
    return new Promise<T>((resolve,reject)=>{pending.push({cancelled:isCancelled,run:async()=>{resolve(await factory());},reject});drain();});
  };
}

export const loadSceneModel=createSceneModelQueue();
