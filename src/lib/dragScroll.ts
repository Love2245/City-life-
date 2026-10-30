/** Mouse dragging complements native touch scrolling without capturing maps, editors or games. */
export function installDragScroll(root: Document = document): () => void {
  let drag: {id:number; startY:number; startX:number; top:number; node:HTMLElement; moved:boolean} | undefined;
  let suppressClickUntil=0;
  const excluded='input,textarea,select,[contenteditable="true"],canvas,svg,[data-no-drag-scroll],.map-board,.minigame-overlay,.leisure-dialog';
  function down(e:PointerEvent){
    suppressClickUntil=0;
    drag?.node.classList.remove('is-drag-scrolling');drag=undefined;
    if(e.pointerType!=='mouse'||e.button!==0||!(e.target instanceof Element)||e.target.closest(excluded))return;
    let node=e.target as HTMLElement|null;
    while(node&&node!==root.documentElement){
      const style=getComputedStyle(node);
      if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+2){
        drag={id:e.pointerId,startY:e.clientY,startX:e.clientX,top:node.scrollTop,node,moved:false};return;
      }
      node=node.parentElement;
    }
  }
  function move(e:PointerEvent){
    if(!drag||e.pointerId!==drag.id)return;
    const dy=e.clientY-drag.startY;
    if(!drag.moved){
      if(Math.abs(dy)<7||Math.abs(dy)<Math.abs(e.clientX-drag.startX))return;
      drag.moved=true;drag.node.classList.add('is-drag-scrolling');
    }
    e.preventDefault();
    const scale=drag.node.getBoundingClientRect().height/drag.node.offsetHeight||1;
    drag.node.scrollTop=drag.top-dy/scale;
    root.getSelection()?.removeAllRanges();
  }
  function up(e:PointerEvent){if(drag&&e.pointerId===drag.id){if(drag.moved)suppressClickUntil=performance.now()+100;drag.node.classList.remove('is-drag-scrolling');drag=undefined;}}
  function click(e:MouseEvent){if(performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}}
  function cancel(){drag?.node.classList.remove('is-drag-scrolling');drag=undefined;}
  root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,{capture:true,passive:false});
  root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',up,true);root.addEventListener('click',click,true);
  root.defaultView?.addEventListener('blur',cancel);
  return()=>{cancel();root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',up,true);root.removeEventListener('click',click,true);root.defaultView?.removeEventListener('blur',cancel);};
}
