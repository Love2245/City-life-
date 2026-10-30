/** Frame-rate-independent, reversible wall movement; initial/reduced-motion poses remain immediate. */
export function createWallTransition(initial=1,duration=.24){
  let value=initial,start=initial,target=initial,elapsed=duration;
  return{
    get moving(){return elapsed<duration;},
    step(next:number,seconds:number,instant=false){
      if(instant){value=start=target=next;elapsed=duration;return value;}
      if(next!==target){start=value;target=next;elapsed=0;}
      elapsed=Math.min(duration,elapsed+Math.max(0,seconds));const t=Math.min(1,elapsed/duration),ease=1-(1-t)**3;
      value=elapsed===duration?target:start+(target-start)*ease;return value;
    },
  };
}
