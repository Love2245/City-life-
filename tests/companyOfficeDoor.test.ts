// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import * as THREE from 'three';
import CompanyInterior from '../src/components/layout/CompanyInterior.svelte';
import {COMPANY_OFFICES} from '../src/game/core/companyOffice';
import {buildCompanyOffice} from '../src/lib/companyOffice3D';
import {createInitialState} from '../src/game/core/state';
import {registerCompany} from '../src/game/core/company';
import {companyStage} from '../src/game/core/companyConfig';
import {replaceState,gameState} from '../src/stores/gameStore.svelte';
import {uiState} from '../src/stores/uiStore.svelte';

vi.mock('../src/stores/sceneLoading.svelte',()=>({sceneLoading:{current:null},beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn()}));
vi.mock('../src/lib/companyStillView',async()=>{
  const {COMPANY_OFFICES}=await import('../src/game/core/companyOffice');
  return{createCompanyStill:(_host:HTMLElement,stage:number,onLabels:(labels:any[])=>void)=>({ready:Promise.resolve(),update(){onLabels([...COMPANY_OFFICES[stage-1].desks.map((_,index)=>({index,x:20+index*3,y:40,visible:true})),{index:-1,x:45,y:80,visible:true}]);},setWalls(){},setQuality(){},setResolution(){},rotate(){},reset(){},dispose(){}})};
});

const apps:ReturnType<typeof mount>[]=[];
afterEach(async()=>{for(const app of apps.splice(0))await unmount(app);document.body.replaceChildren();localStorage.clear();});
describe('办公室实体门与2D截图出口',()=>{
  it.each(COMPANY_OFFICES)('阶段 $stage 有真实门扇、门把和始终完整的可点击门',async plan=>{
    const model=buildCompanyOffice(plan);
    try{
      const leaf=model.entry.getObjectByName('office-door-leaf')!,handle=leaf.getObjectByName('door-pull-handle');
      if(plan.stage===4){expect(model.entry.userData.elevator).toBe(true);expect(leaf.getObjectByName('elevator-sliding-door')).toBeDefined();}else expect(handle).toBeDefined();expect(model.entry.userData.seat).toBe(-1);
      expect(new THREE.Box3().setFromObject(leaf).getSize(new THREE.Vector3()).y).toBeGreaterThan(2.2);
      const before=new THREE.Box3().setFromObject(model.entry);
      for(const wall of model.walls)wall.group.scale.y=.65/2.8;
      const low=new THREE.Box3().setFromObject(model.entry);expect(low.min.toArray()).toEqual(before.min.toArray());expect(low.max.toArray()).toEqual(before.max.toArray());
      await model.prepare(async()=>{});model.root.updateMatrixWorld(true);
      const center=leaf.localToWorld(new THREE.Vector3(.615,1.48,0));
      const ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,0,3)),new THREE.Vector3(0,0,-1));
      const hit=ray.intersectObjects([...model.workstations,model.entry],true)[0];expect(hit).toBeDefined();
      let owner:THREE.Object3D|null=hit!.object;while(owner&&owner.userData.seat===undefined)owner=owner.parent;
      expect(owner?.userData.seat).toBe(-1);
    }finally{model.dispose();}
  });
  it.each([1,2,3,4])('阶段 %i 截图门提供回家与普通离开选项，不打开经营面板',async stage=>{
    const s=createInitialState(1497);s.player.money=10000;s.time.hour=10;s.locationId='municipal_hall';s.developmentHistory!.total = 1; Object.assign(s.developmentHistory!.byType, { indie_game: 5 });
    expect(registerCompany(s,'门测试')).toEqual({ok:true});s.company!.stage=stage;s.locationId=companyStage(stage).location;
    uiState.sceneMode='2d';uiState.modal=null;replaceState(s);const onExit=vi.fn(),before=JSON.stringify(gameState.company);
    const target=document.createElement('div');document.body.append(target);apps.push(mount(CompanyInterior,{target,props:{onExit}}));flushSync();
    await vi.waitFor(()=>{flushSync();expect(target.querySelector('[data-office-door]')).not.toBeNull();});
    const door=target.querySelector<HTMLButtonElement>('[data-office-door]')!;expect(door).toBeTruthy();flushSync(()=>door.click());
    expect(onExit).not.toHaveBeenCalled();expect(target.querySelector('[data-company-return-home]')).toBeTruthy();
    flushSync(()=>target.querySelector<HTMLButtonElement>('[data-company-normal-exit]')!.click());
    expect(onExit).toHaveBeenCalledOnce();expect(document.querySelector('[aria-label="公司经营面板"]')).toBeNull();expect(JSON.stringify(gameState.company)).toBe(before);
  });
});
