<script lang="ts">
  import PhoneAppIcon from '../PhoneAppIcon.svelte';
  import {formatMoney} from '../../lib/format';
  import {phonePocketPosition,setPhonePocketPosition} from '../../lib/phonePocketPosition.svelte';
  let {time,date,balance,skin='default',unread=0,expanded=false,onOpen}:{time:string;date:string;balance:number;skin?:string;unread?:number;expanded?:boolean;onOpen:()=>void}=$props();
  const apps=[{id:'call',name:'通信'},{id:'moments',name:'Moments'},{id:'todo',name:'待办'},{id:'assets',name:'资产'},{id:'relation',name:'关系'},{id:'goals',name:'目标'},{id:'settings',name:'设置'},{id:'market',name:'应用市场'}];
  let pocket=$state<HTMLButtonElement>();
  let dragging=$state(false);
  let gesture:{id:number;y:number;top:number;scale:number;range:number}|null=null;
  let ignoreClick=false;
  function place(){
    const parent=pocket?.offsetParent as HTMLElement|null,ratio=phonePocketPosition.ratio;
    if(pocket&&parent&&ratio!==null)pocket.style.top=`${8+Math.max(0,parent.clientHeight-pocket.offsetHeight-16)*ratio}px`;
  }
  $effect(()=>{void phonePocketPosition.ratio;place();});
  function watchSize(node:HTMLElement){
    if(typeof ResizeObserver==='undefined')return{destroy(){}};
    const observer=new ResizeObserver(place);observer.observe(node);if(node.offsetParent)observer.observe(node.offsetParent);place();
    return{destroy(){observer.disconnect();}};
  }
  function down(e:PointerEvent){
    if(e.button!==0||!pocket)return;const parent=pocket.offsetParent as HTMLElement|null;if(!parent)return;
    e.stopPropagation();ignoreClick=false;dragging=false;
    gesture={id:e.pointerId,y:e.clientY,top:pocket.offsetTop,scale:parent.getBoundingClientRect().height/Math.max(1,parent.clientHeight),range:Math.max(1,parent.clientHeight-pocket.offsetHeight-16)};
    pocket.setPointerCapture(e.pointerId);
  }
  function move(e:PointerEvent){
    if(!gesture||e.pointerId!==gesture.id)return;
    const delta=e.clientY-gesture.y;if(!dragging&&Math.abs(delta)<6)return;
    dragging=true;ignoreClick=true;e.preventDefault();e.stopPropagation();
    setPhonePocketPosition((gesture.top+delta/Math.max(.1,gesture.scale)-8)/gesture.range);
  }
  function end(e:PointerEvent){
    if(!gesture||e.pointerId!==gesture.id)return;e.stopPropagation();
    if(pocket?.hasPointerCapture(e.pointerId))pocket.releasePointerCapture(e.pointerId);
    if(dragging&&phonePocketPosition.ratio!==null)setPhonePocketPosition(phonePocketPosition.ratio,true);
    gesture=null;dragging=false;
  }
  function open(e:MouseEvent){if(ignoreClick){e.preventDefault();ignoreClick=false;return;}onOpen();}
  function keyboard(e:KeyboardEvent){
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown')return;const parent=pocket?.offsetParent as HTMLElement|null;if(!pocket||!parent)return;
    e.preventDefault();e.stopPropagation();const range=Math.max(1,parent.clientHeight-pocket.offsetHeight-16);
    setPhonePocketPosition((pocket.offsetTop-8+(e.key==='ArrowUp'?-24:24))/range,true);
  }
</script>
<button bind:this={pocket} use:watchSize class="phone-pocket" class:dragging data-home-phone-pocket data-skin={skin} data-pocket-y={phonePocketPosition.ratio??'auto'} aria-label="打开手机" aria-expanded={expanded} title="点击打开手机；上下拖动可调整位置，方向键也可移动" onpointerdown={down} onpointermove={move} onpointerup={end} onpointercancel={end} onkeydown={keyboard} onclick={open}>
  <span class="pocket-surface" aria-hidden="true">
    <span class="pocket-status">{time}<i></i><span>▮▮▮ ▰</span></span>
    <span class="pocket-clock">{time}<small>{date}</small></span>
    <span class="pocket-balance"><small>我的都市 · 可用资金</small><strong>¥ {formatMoney(balance)}</strong></span>
    <span class="pocket-apps">{#each apps as app}<span class="pocket-app"><PhoneAppIcon id={app.id}/><small>{app.name}</small>{#if app.id==='call'&&unread>0}<i>{unread}</i>{/if}</span>{/each}</span>
    <span class="pocket-dock">{#each ['home','todo','call','settings'] as id}<PhoneAppIcon {id} compact/>{/each}</span>
    <span class="pocket-homebar"></span>
  </span>
  <span class="pocket-hint" aria-hidden="true">‹ 手机</span>
</button>
<style>
  .phone-pocket{position:absolute;right:-96px;top:122px;width:140px;height:290px;max-height:calc(100% - 16px);padding:4px;border:1px solid #9ab6cf;border-radius:22px;background:linear-gradient(140deg,#28495e,#588096);box-shadow:-4px 5px 20px #101b2233;z-index:6;cursor:pointer;touch-action:none;user-select:none;transition:right .18s,box-shadow .18s;text-shadow:none;overflow:hidden;transform:rotate(-2deg);transform-origin:right center;font-family:inherit}
  .phone-pocket.dragging{cursor:grabbing;transition:none;right:-82px}
  .phone-pocket:hover,.phone-pocket:focus-visible{right:-82px;box-shadow:-8px 5px 24px #101b2244}.phone-pocket:focus-visible{outline:2px solid #dfd8bb;outline-offset:3px}
  .pocket-surface{display:block;position:relative;width:340px;height:722px;transform:scale(.388);transform-origin:left top;color:#eef4ff;background:radial-gradient(at 15% 0%,#19324e,transparent 70%),linear-gradient(145deg,#6678a1,#253a59 65%,#466c80);border-radius:47px;overflow:hidden;pointer-events:none;text-align:center;padding:16px 14px;box-sizing:border-box}
  [data-skin="rice"] .pocket-surface{background:linear-gradient(160deg,#60446f,#a68ca8)}[data-skin="flower"] .pocket-surface{background:linear-gradient(160deg,#446566,#8bafa2)}[data-skin="fruit"] .pocket-surface{background:linear-gradient(160deg,#495963,#8999b0)}
  .pocket-status{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:600}.pocket-status i{position:absolute;left:50%;top:13px;transform:translateX(-50%);width:58px;height:14px;border-radius:12px;background:#09131e}
  .pocket-clock{display:block;margin-top:33px;font-size:42px;font-weight:300}.pocket-clock small{display:block;font-size:11px;margin-top:4px}.pocket-balance{display:block;margin:20px 4px 16px;padding:17px;text-align:left;border:1px solid #e4ecff44;border-radius:20px;background:#edf2ff12}.pocket-balance small{display:block;font-size:10px}.pocket-balance strong{display:block;font-size:25px;margin-top:10px}
  .pocket-apps{display:grid;grid-template-columns:repeat(4,1fr);gap:17px 9px;padding:0 11px}.pocket-app{position:relative;display:flex;align-items:center;flex-direction:column;gap:7px}.pocket-app small{font-size:9px;white-space:nowrap}.pocket-app i{position:absolute;right:1px;top:-4px;background:#db6d7e;border-radius:8px;font-style:normal;padding:2px 4px;font-size:9px}.pocket-dock{position:absolute;bottom:22px;left:14px;right:14px;display:flex;justify-content:space-around;padding:14px;background:#ecf2ff16;border-radius:27px;border:1px solid #dde8ff33}.pocket-homebar{position:absolute;bottom:10px;left:38%;width:24%;height:3px;border-radius:3px;background:#d8e5ed}.pocket-hint{position:absolute;left:7px;top:45%;writing-mode:vertical-rl;font-size:11px;letter-spacing:3px;color:#e3edf2;background:#2b4157d9;padding:11px 6px;border-radius:15px}
  :global(:root[data-game-mode="mobile"]) .phone-pocket{width:140px;right:-77px;top:106px;transform:rotate(-2deg);height:245px}.phone-pocket .pocket-hint{pointer-events:none}
  :global(:root[data-game-mode="mobile"]) .phone-pocket:hover,:global(:root[data-game-mode="mobile"]) .phone-pocket:focus-visible{right:-65px}
</style>
