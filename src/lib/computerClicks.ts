import {playInteractionSound} from './audio';
const handled=new WeakSet<Event>();
/** Shared by desktop windows and portalled stock terminals; nested windows sound once. */
export function computerClicks(node:HTMLElement){
  const click=(event:Event)=>{
    if(handled.has(event)||!(event.target instanceof Element))return;
    const control=event.target.closest('button,a,input,select,textarea,summary,[role="button"],[role="tab"],.tieba-bar');
    if(!control||!node.contains(control)||control.matches(':disabled')||control.closest('[aria-disabled="true"]'))return;
    handled.add(event);playInteractionSound('mouse');
  };
  node.dataset.computerClicks='true';node.addEventListener('click',click,true);node.addEventListener('change',click,true);
  return{destroy(){node.removeEventListener('click',click,true);node.removeEventListener('change',click,true);delete node.dataset.computerClicks;}};
}
