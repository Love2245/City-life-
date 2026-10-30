// @vitest-environment jsdom
import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import BattleView from '../src/components/BattleView.svelte';
import {createInitialState} from '../src/game/core/state';
import {adoptCat} from '../src/game/core/cat';
import {startBattle,buildPlayerDeck} from '../src/game/core/catBattle';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';
vi.mock('../src/lib/audio',()=>({playSound:vi.fn(),beginMinigameMusic:()=>()=>{}}));
let target:HTMLDivElement,comp:ReturnType<typeof mount>|undefined;
beforeAll(()=>{Element.prototype.animate??=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;window.matchMedia??=(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as any;});
beforeEach(()=>{vi.useFakeTimers();const s=createInitialState(11);adoptCat(s,'orange');replaceState(s);startBattle(gameState,'wild_stray');uiState.gameMode='pc';uiState.modal='battle';target=document.createElement('div');document.body.appendChild(target);});
afterEach(async()=>{if(comp)await unmount(comp);comp=undefined;target.remove();uiState.modal=null;uiState.gameMode='pc';vi.useRealTimers();});
function open():void{comp=mount(BattleView,{target});flushSync();}
function pointer(node:Element,type:string,x:number,y:number):void{const e=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(e,{pointerId:{value:1},pointerType:{value:'mouse'}});node.dispatchEvent(e);flushSync();}
function dragCard(card=target.querySelector('.play-card')!,x=500,y=380,cancel?:'pointercancel'|'lostpointercapture'|'escape'):void{
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,x:left,y:top,width,height,right:left+width,bottom:top+height,toJSON(){}});
 vi.spyOn(target.querySelector('.duel-battle')!,'getBoundingClientRect').mockReturnValue(rect(0,0,1000,800));
 vi.spyOn(target.querySelector('.hand-zone')!,'getBoundingClientRect').mockReturnValue(rect(0,600,1000,200));
 vi.spyOn(target.querySelector('.battle-top')!,'getBoundingClientRect').mockReturnValue(rect(0,0,1000,70));
 vi.spyOn(card.querySelector('.card-motion')!,'getBoundingClientRect').mockReturnValue(rect(400,560,200,292));
 pointer(card,'pointerdown',500,610);pointer(card,'pointermove',x,y);if(cancel){expect(target.querySelector('.drop-guide.valid')).toBeTruthy();if(cancel==='escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else pointer(card,cancel,x,y);flushSync();}pointer(card,'pointerup',x,y);
}
function twoScratches():void{const b=gameState.catBattle!;const keys=Object.entries(b.duel!.cards).filter(([,id])=>id==='scratch').map(([uid])=>uid);b.playerHand=keys;b.playerDrawPile=Object.keys(b.duel!.cards).filter(uid=>!keys.includes(uid));b.playerDiscardPile=[];}
describe('1.498 战斗界面回归',()=>{
 it('侧身立绘面向场内，镜像只作用于图片层且正面立绘不强制翻转',()=>{open();expect((target.querySelector('.player .portrait-facing') as HTMLElement).style.transform).toBe('scaleX(-1)');expect((target.querySelector('.enemy .portrait-facing') as HTMLElement).style.transform).toBe('scaleX(1)');gameState.pets[0].catId='cow';gameState.catBattle!.opponentId='t1_rookie';flushSync();expect((target.querySelector('.player .portrait-facing') as HTMLElement).style.transform).toBe('scaleX(1)');expect((target.querySelector('.enemy .portrait-facing') as HTMLElement).style.transform).toBe('scaleX(-1)');});
 it('电脑单击只选中，不扣能量也不伤害对手',()=>{twoScratches();open();const energy=gameState.catBattle!.playerEnergy,hp=gameState.catBattle!.opponent.hp;(target.querySelector('.play-card') as HTMLButtonElement).click();flushSync();expect(target.querySelector('.play-card.selected')).toBeTruthy();expect(gameState.catBattle!.playerEnergy).toBe(energy);expect(gameState.catBattle!.opponent.hp).toBe(hp);});
 it('抓取时保持原位置，拖动跟随指针，取消后平滑回到手牌',()=>{
  twoScratches();open();const card=target.querySelector('.play-card')!;
  const rect=(left:number,top:number,width:number,height:number)=>({left,top,x:left,y:top,width,height,right:left+width,bottom:top+height,toJSON(){}});
  vi.spyOn(target.querySelector('.duel-battle')!,'getBoundingClientRect').mockReturnValue(rect(0,0,1000,800));
  vi.spyOn(target.querySelector('.hand-zone')!,'getBoundingClientRect').mockReturnValue(rect(0,600,1000,200));
  vi.spyOn(target.querySelector('.battle-top')!,'getBoundingClientRect').mockReturnValue(rect(0,0,1000,70));
  vi.spyOn(card.querySelector('.card-motion')!,'getBoundingClientRect').mockReturnValue(rect(400,560,200,292));
  card.dispatchEvent(new MouseEvent('mouseenter'));flushSync();expect(target.querySelector('.play-card.selected')).toBeNull();
  pointer(card,'pointerdown',500,610);expect(target.querySelector('.play-card.selected')).toBeNull();
  pointer(card,'pointermove',525,400);const ghost=target.querySelector<HTMLElement>('.drag-layer')!;
  expect(ghost.style.transform).toContain('52.5%');expect(ghost.style.transform).toContain('62%');
  pointer(card,'pointercancel',525,400);expect(target.querySelector('.drag-layer')).toBeNull();expect(target.querySelector('.return-layer')).toBeTruthy();
  expect(gameState.catBattle!.playerHand).toHaveLength(2);vi.advanceTimersByTime(190);flushSync();expect(target.querySelector('.return-layer')).toBeNull();
 });
 it('取消指针后松手不出牌，能量不足的有效拖拽不耗卡',()=>{twoScratches();open();const card=target.querySelector('.play-card')!;for(const cancel of ['pointercancel','lostpointercapture','escape'] as const)dragCard(card,500,380,cancel);expect(gameState.catBattle!.playerHand).toHaveLength(2);expect(gameState.catBattle!.playerEnergy).toBe(3);gameState.catBattle!.playerEnergy=0;dragCard(card);expect(gameState.catBattle!.playerHand).toHaveLength(2);expect(gameState.catBattle!.playerEnergy).toBe(0);expect(target.textContent).toContain('能量不足');});
 it('拖回手牌或在战场边界外释放会取消，不消耗卡牌和能量',()=>{twoScratches();open();const card=target.querySelector('.play-card')!;dragCard(card,500,650);dragCard(card,1005,380);expect(gameState.catBattle!.playerHand).toHaveLength(2);expect(gameState.catBattle!.playerEnergy).toBe(3);expect(target.querySelector('.drag-layer')).toBeNull();});
 it('起始牌组允许两张同名基础牌',()=>{expect(buildPlayerDeck('orange',[]).filter(id=>id==='scratch')).toHaveLength(2);});
 it('重复基础牌以独立实例渲染，出一张不影响另一张',()=>{twoScratches();open();expect(target.querySelectorAll('.play-card')).toHaveLength(2);const before=gameState.catBattle!.playerEnergy;dragCard();expect(target.querySelectorAll('.play-card')).toHaveLength(1);expect(gameState.catBattle!.playerEnergy).toBe(before-1);});
 it('拖拽松手后的点击与重复松手不重复出牌，播放完恢复操作',()=>{twoScratches();open();const card=target.querySelector('.play-card') as HTMLButtonElement;dragCard(card);card.click();card.click();pointer(card,'pointerup',500,380);flushSync();expect(gameState.catBattle!.playerEnergy).toBe(2);expect(gameState.catBattle!.playerHand).toHaveLength(1);expect(target.querySelector('.duel-battle')?.getAttribute('data-animating')).toBe('true');vi.advanceTimersByTime(900);flushSync();expect(target.querySelector('.duel-battle')?.getAttribute('data-animating')).toBe('false');});
 it('先切攻击立绘，命中时再切受击立绘并更新显示生命',()=>{twoScratches();open();const hp=gameState.catBattle!.opponent.hp;dragCard();expect(gameState.catBattle!.opponent.hp).toBe(hp-6);expect(target.querySelector('.enemy .health-line')?.textContent).toContain(`${hp} /`);vi.advanceTimersByTime(75);flushSync();expect(target.querySelector('.player')?.getAttribute('data-pose')).toBe('attack');expect(target.querySelector('.player svg.action-portrait image')).toBeTruthy();vi.advanceTimersByTime(135);flushSync();expect(target.querySelector('.enemy')?.getAttribute('data-pose')).toBe('hurt');expect(target.querySelector('.enemy .health-line')?.textContent).toContain(`${hp-6} /`);});
 it('最后一次命中演出完成后再展示结算，重载不重播历史事件',()=>{gameState.catBattle!.opponent.hp=1;twoScratches();open();dragCard();expect(gameState.catBattle!.finished).toBe(true);expect(target.querySelector('.result-overlay')).toBeNull();vi.advanceTimersByTime(1000);flushSync();expect(target.querySelector('.result-overlay')).toBeTruthy();});
 it('载入已有事件的当前场次时，展示当前生命而不重新播放旧命中',()=>{const b=gameState.catBattle!;b.opponent.hp=17;b.duel!.events.push({id:++b.duel!.sequence,type:'damage',side:'opponent',source:'player',attack:true,amount:6,hpAfter:17,text:'历史命中'});open();expect(target.querySelector('.duel-battle')?.getAttribute('data-motion')).toBe('idle');expect(target.querySelector('.enemy .health-line')?.textContent).toContain('17 /');vi.advanceTimersByTime(1000);flushSync();expect(b.opponent.hp).toBe(17);expect(target.querySelector('.duel-battle')?.getAttribute('data-motion')).toBe('idle');});
 it('敌方行动时不提前显示下一回合手牌、能量或回合数',()=>{gameState.catBattle!.playerEnergy=0;open();(target.querySelector('.end-turn') as HTMLButtonElement).click();flushSync();expect(target.querySelectorAll('.play-card')).toHaveLength(0);vi.advanceTimersByTime(160);flushSync();vi.advanceTimersByTime(135);flushSync();expect(gameState.catBattle!.turn).toBe(2);expect(target.querySelector('.round')?.textContent).toContain('第 1 回合');expect(target.querySelector('.energy>strong')?.textContent).toContain('0/3');expect(target.querySelectorAll('.play-card')).toHaveLength(0);vi.advanceTimersByTime(180);flushSync();expect(target.querySelector('.energy>strong')?.textContent).toContain('3/3');expect(target.querySelectorAll('.play-card')).toHaveLength(5);expect(target.querySelector('.round')?.textContent).toContain('第 2 回合');vi.advanceTimersByTime(1000);flushSync();expect(target.querySelector('.duel-battle')?.getAttribute('data-animating')).toBe('false');});
 it('双方立绘、清晰意图、生命、能量与结构化战报可见',()=>{open();expect(target.querySelectorAll('.portrait')).toHaveLength(2);expect(target.querySelector('.enemy-intent')?.getAttribute('aria-label')).toMatch(/^敌方下次行动：攻击，每段 \d+ 点/);expect(target.textContent).toContain('结束回合');expect(target.querySelector('.health')?.getAttribute('max')).toBe('80');expect(target.querySelector('.battle-log')?.textContent).toContain('统一80生命');});
 it('意图只公开攻击数值和段数，防御与特殊图标及无障碍标签不泄漏数值或行动名',()=>{
  open();const b=gameState.catBattle!,box=()=>target.querySelector('.enemy-intent')!;
  b.enemyIntent={kind:'attack',name:'攻击行动长名称',icon:'🐾',value:10,hits:2};flushSync();
  expect(box().textContent).toContain('10×2🗡');expect(box().getAttribute('aria-label')).toContain('每段 10 点，共 2 段');expect(box().textContent).not.toContain('攻击行动长名称');
  b.enemyIntent={kind:'defend',name:'秘密防御行动',icon:'🛡️',value:777};flushSync();
  expect(box().textContent).toBe('🛡️');expect(box().getAttribute('aria-label')).toBe('敌方下次行动：防御');expect(box().outerHTML).not.toMatch(/777|秘密防御行动/);
  b.enemyIntent={kind:'skill',name:'蛛网：虚弱 22 回合',icon:'🕸️',value:999,status:'paralysis'};flushSync();
  expect(box().textContent).toBe('🕸️');expect(box().getAttribute('aria-label')).toBe('敌方下次行动：特殊行动');expect(box().outerHTML).not.toMatch(/999|22|虚弱/);
  expect(target.querySelectorAll('.health-line')).toHaveLength(2);
 });
 it('减少动态效果时，取消直接回到手牌且不出牌',()=>{
  const media=vi.spyOn(window,'matchMedia').mockReturnValue({matches:true,media:'(prefers-reduced-motion: reduce)',addEventListener(){},removeEventListener(){}} as any);
  twoScratches();open();dragCard(target.querySelector('.play-card')!,500,380,'pointercancel');
  expect(target.querySelector('.return-layer')).toBeNull();expect(gameState.catBattle!.playerHand).toHaveLength(2);media.mockRestore();
 });
 it('滚轮放大立绘并阻止穿透，双击恢复',()=>{open();const area=target.querySelector('.player .portrait-wrap')!,img=area.querySelector('img')!;const event=new WheelEvent('wheel',{deltaY:-400,bubbles:true,cancelable:true});area.dispatchEvent(event);flushSync();expect(event.defaultPrevented).toBe(true);expect(img.style.transform).not.toBe('scale(1)');area.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));flushSync();expect(img.style.transform).toBe('scale(1)');});
 it('手机点卡只选择，明确点击出牌后才扣能量',()=>{twoScratches();uiState.gameMode='pe';open();const energy=gameState.catBattle!.playerEnergy;(target.querySelector('.play-card') as HTMLButtonElement).click();flushSync();expect(gameState.catBattle!.playerEnergy).toBe(energy);expect(target.querySelector('.play-card.selected')).toBeTruthy();(target.querySelector('.play-selected') as HTMLButtonElement).click();flushSync();expect(gameState.catBattle!.playerEnergy).toBe(energy-1);});
 it('牌堆弹窗可用Escape关闭，结束回合连点不会执行两次',()=>{open();(target.querySelector('.piles button') as HTMLButtonElement).click();flushSync();expect(target.querySelector('.pile-viewer')).toBeTruthy();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));flushSync();expect(target.querySelector('.pile-viewer')).toBeNull();const end=target.querySelector('.end-turn') as HTMLButtonElement;end.click();end.click();vi.advanceTimersByTime(400);flushSync();expect(gameState.catBattle!.turn).toBe(2);});
});
