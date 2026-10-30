// @vitest-environment jsdom
import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import FishingPanel from '../src/components/layout/FishingPanel.svelte';
import InventoryModal from '../src/components/InventoryModal.svelte';
import {createInitialState} from '../src/game/core/state';
import {FISH_SPECIES,fishSpecies,fishingPool,mountFish,normalizeFishing,startFishing} from '../src/game/core/fishing';
import {getItem} from '../src/game/core/items';
import {storedItems} from '../src/game/core/storage';
import {migrateSave} from '../src/game/core/migrate';
import {createRng,weightedDraw} from '../src/game/rng';
import {fishImage} from '../src/lib/fishVisuals';
import {gameState,replaceState} from '../src/stores/gameStore.svelte';
import {setGameMode,setSceneMode,uiState} from '../src/stores/uiStore.svelte';

let component:ReturnType<typeof mount>|undefined;
let target:HTMLDivElement|undefined;
beforeAll(()=>{
  Element.prototype.animate??=(()=>({finished:Promise.resolve(),cancel(){},play(){},pause(){}})) as any;
  globalThis.ResizeObserver??=class{observe(){} unobserve(){} disconnect(){}} as any;
  window.matchMedia??=((media:string)=>({matches:false,media,addEventListener(){},removeEventListener(){}})) as any;
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null as any);
  vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
});
afterEach(async()=>{if(component)await unmount(component);component=undefined;target?.remove();target=undefined;replaceState(createInitialState(148));setGameMode('pc');setSceneMode('3d');});
afterAll(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

function fixture(spot:'treasure_lake'|'lake_park'='treasure_lake'){
  const s=createInitialState(148);s.locationId=spot;s.region=s.area=spot==='lake_park'?'suburban_edge':'development_reserve';
  Object.assign(s.player.attrs,{health:100,stamina:100,satiety:80,mood:40});
  Object.assign(s.inventory,{fishing_rod:1,fishing_bait:3,fishing_bucket:1});return s;
}
function openWithFish(spot:'treasure_lake'|'lake_park',mobile:boolean,scene:'2d'|'3d'='2d'){
  setGameMode(mobile?'pe':'pc');setSceneMode(scene);const s=fixture(spot);expect(startFishing(s).ok).toBe(true);
  Object.assign(s.fishing!.active!.fish,{speciesId:'mandarin',grams:888});replaceState(s);
  target=document.createElement('div');document.body.append(target);component=mount(FishingPanel,{target});flushSync();
  target.querySelector<HTMLButtonElement>('.fishing-panel button')!.click();flushSync();
}
function assertNoFishIdentity(){
  const dialog=document.body.querySelector<HTMLElement>('.fishing-dialog')!;
  expect(dialog.textContent).not.toContain('鳜鱼');
  const attributes=[...dialog.querySelectorAll('*')].flatMap(el=>[el.getAttribute('title'),el.getAttribute('aria-label'),el.getAttribute('alt'),el.getAttribute('src')]);
  expect(attributes.filter(Boolean).join(' ')).not.toMatch(/鳜鱼|mandarin/i);
}

describe('1.498 鱼种和揭晓时机',()=>{
  it('新鱼按地点进入不同鱼池，权重有效且结果可复现',()=>{
    expect(FISH_SPECIES).toHaveLength(12);
    const reservoir=fishingPool('treasure_lake'),park=fishingPool('lake_park');
    expect(reservoir.some(e=>e.item.id==='bighead')).toBe(true);expect(reservoir.some(e=>e.item.id==='tilapia')).toBe(false);
    expect(park.some(e=>e.item.id==='tilapia')).toBe(true);expect(park.some(e=>e.item.id==='bighead')).toBe(false);
    for(const pool of [reservoir,park]){
      expect(pool.every(e=>e.weight>0&&e.item.min<e.item.max&&e.item.rate>0)).toBe(true);
      const draws=(seed:number)=>{const rng=createRng(seed);return Array.from({length:5000},()=>weightedDraw(rng,pool)!.id);};
      const ids=draws(1498);expect(ids).toEqual(draws(1498));
      for(const entry of pool)expect(ids).toContain(entry.item.id);
    }
  });
  it('新鱼可揭晓、制标本并多次迁移，背包物品和鱼记录不会丢失',()=>{
    for(const species of FISH_SPECIES){const item=getItem(`fish_specimen_${species.id}`);expect(item?.desc).not.toContain('珍宝湖');}
    const s=fixture();let id=1;
    for(const key of ['catfish','yellow_catfish','tilapia','bighead']){
      const spec=fishSpecies(key)!;expect(fishImage(key)).toBeTruthy();expect(getItem(`fish_specimen_${key}`)?.name).toBe(`${spec.name}标本`);
      s.fishing!.bucket.push({id:id++,speciesId:key,grams:spec.min});expect(mountFish(s,id-1).ok).toBe(true);
    }
    normalizeFishing(s);const saved=migrateSave(JSON.parse(JSON.stringify(migrateSave(JSON.parse(JSON.stringify(s))))));
    for(const key of ['catfish','yellow_catfish','tilapia','bighead']){
      expect(saved.fishing!.specimens[key]?.speciesId).toBe(key);
      expect(storedItems(saved,'backpack').some(x=>x.item.id===`fish_specimen_${key}`&&x.qty===1)).toBe(true);
    }
  });
  it('环湖公园鱼标本在背包显示重量，不误称捕获自珍宝湖',()=>{
    const s=fixture('lake_park');s.fishing!.bucket.push({id:1,speciesId:'tilapia',grams:800});expect(mountFish(s,1).ok).toBe(true);replaceState(s);
    target=document.createElement('div');document.body.append(target);component=mount(InventoryModal,{target});flushSync();
    const item=[...target.querySelectorAll('.bag-item')].find(el=>el.textContent?.includes('罗非鱼标本'))!;
    expect(item).toBeTruthy();expect(item.querySelector('.b-effect')?.textContent).toBe('垂钓标本 · 0.800 千克');expect(item.textContent).not.toContain('珍宝湖');
    expect(item.querySelector('.specimen-frame img')?.getAttribute('src')).toBe(fishImage('tilapia'));
  });
  it.each([['treasure_lake',false,'2d'],['treasure_lake',false,'3d'],['lake_park',true,'2d'],['lake_park',true,'3d']] as const)('%s、手机=%s、%s 模式下成功前各阶段隐藏实际鱼种',async(spot,mobile,scene)=>{
    openWithFish(spot,mobile,scene);expect(uiState.sceneMode).toBe(scene);
    for(const phase of ['waiting','bite','fighting'] as const){
      gameState.fishing!.active!.phase=phase;flushSync();assertNoFishIdentity();
      if(phase==='fighting')expect(document.body.querySelector('.track svg.fish-marker')?.getAttribute('aria-hidden')).toBe('true');
    }
    gameState.fishing!.active!.phase='ready';gameState.fishing!.active!.won=true;flushSync();await Promise.resolve();flushSync();
    expect(document.body.querySelector('.catch-reveal h2')?.textContent).toBe('鳜鱼');
    expect(document.body.querySelector('.catch-art img')?.getAttribute('src')).toContain('mandarin');
  });
  it('失败及自动下一竿不会泄漏上一条鱼的名称或图像',async()=>{
    openWithFish('treasure_lake',false);gameState.fishing!.active!.phase='ready';gameState.fishing!.active!.won=false;
    flushSync();await Promise.resolve();flushSync();assertNoFishIdentity();
    expect(document.body.querySelector('.catch-reveal')).toBeNull();expect(document.body.textContent).toContain('鱼儿游走了');
    expect(gameState.fishing!.bucket).toHaveLength(0);
  });
});
