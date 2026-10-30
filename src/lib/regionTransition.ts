interface ViewTransitionHandle {finished:Promise<void>;updateCallbackDone:Promise<void>;skipTransition():void}
interface TransitionDocument {startViewTransition?:(update:()=>Promise<void>)=>ViewTransitionHandle;documentElement:{dataset:Record<string,string|undefined>}}
interface Options {document?:TransitionDocument;reduced?:()=>boolean;settle?:()=>Promise<void>}
/** One short visual transaction around navigation; never computes fare, time, or destination. */
export function createRegionTransition(options:Options={}){
  let active:ViewTransitionHandle|undefined;
  const document=options.document??(typeof globalThis.document!=='undefined'?globalThis.document as unknown as TransitionDocument:undefined);
  const reduced=options.reduced??(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  function run(change:()=>void){
    if(active)return false;
    if(!document?.startViewTransition||reduced()){change();return true;}
    let changed=false;
    const update=async()=>{if(changed)return;changed=true;change();await options.settle?.();};
    document.documentElement.dataset.regionTransition='active';
    try{
      const transition=document.startViewTransition(update);active=transition;
      // Update failure remains visible to the application's normal error path; animation errors never rerun travel.
      void transition.updateCallbackDone.catch(()=>{});
      void transition.finished.catch(()=>{}).finally(()=>{if(active===transition){active=undefined;delete document.documentElement.dataset.regionTransition;}});
    }catch{delete document.documentElement.dataset.regionTransition;if(!changed)change();}
    return true;
  }
  return{run,get active(){return !!active;},cancel(){active?.skipTransition();}};
}
export function nativeRegionTransitionActive(){return typeof document!=='undefined'&&document.documentElement.dataset.regionTransition==='active';}
