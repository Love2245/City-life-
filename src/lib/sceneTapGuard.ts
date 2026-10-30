/** A touch can open a menu before its compatibility click; that click must not press the new menu. */
export function createSceneTapGuard(canvas:HTMLCanvasElement){
  const doc=canvas.ownerDocument;let tap:{x:number;y:number;until:number}|undefined;
  const freshPointer=()=>{tap=undefined;};
  const compatibilityClick=(event:MouseEvent)=>{if(!tap||event.detail===0||performance.now()>tap.until||Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>12)return;tap=undefined;event.preventDefault();event.stopImmediatePropagation();};
  doc.addEventListener('pointerdown',freshPointer,true);doc.addEventListener('click',compatibilityClick,true);
  return{arm(event:PointerEvent){if(event.pointerType==='touch')tap={x:event.clientX,y:event.clientY,until:performance.now()+700};},dispose(){doc.removeEventListener('pointerdown',freshPointer,true);doc.removeEventListener('click',compatibilityClick,true);tap=undefined;}};
}
