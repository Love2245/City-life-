// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Box3,BoxGeometry,Group,Mesh,MeshStandardMaterial,Scene} from 'three';
import {homePlanFor} from '../src/game/core/homeInterior';
import {createSceneExterior} from '../src/lib/sceneExterior';
import {homeEntryLanding} from '../src/lib/sceneExterior/layout';
import {HOME_EXTERIOR_PROFILES,homeExteriorProfile,homeGroundY} from '../src/lib/sceneExterior/housingProfiles';
import {districtBlocks} from '../src/lib/sceneExterior/weather';

vi.mock('three/addons/loaders/GLTFLoader.js',()=>({GLTFLoader:class{
  async loadAsync(){const group=new Group();group.add(new Mesh(new BoxGeometry(1,1,1),new MeshStandardMaterial()));return {scene:group};}
}}));

beforeEach(()=>{
  const context={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){},measureText(text:string){return {width:text.length*16};},createLinearGradient(){return {addColorStop(){}};}};
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(()=>vi.restoreAllMocks());

describe('each single-room accommodation has an architectural exterior',()=>{
  for(const [id,profile]of Object.entries(HOME_EXTERIOR_PROFILES))it(id,async()=>{
    const plan=homePlanFor(id),landing=homeEntryLanding(plan),host=document.createElement('div'),scene=new Scene();
    expect(homeExteriorProfile(plan).id).toBe(id);
    expect(landing.groundY).toBe(homeGroundY(profile));
    const view=createSceneExterior(scene,{kind:'home',width:plan.size[0],depth:plan.size[1],height:2.65,detail:'light',anisotropy:1,host,plan,request(){}});
    await view.ready;
    const rendered=JSON.parse(host.dataset.homeExterior!),district=JSON.parse(host.dataset.homeBackdrop!),stairs=JSON.parse(host.dataset.homeStairs!);
    expect(rendered.residenceId).toBe(id);expect(rendered.type).toBe(profile.entry);expect(district.type).toBe(profile.district);
    expect(rendered.groundY).toBe(district.groundY);expect(district.groundY).toBe(landing.groundY);
    expect(stairs.steps).toBe(profile.entry==='stairwell'?20:0);
    if(profile.entry==='stairwell')expect(stairs.inside).toBe(true);
    if(profile.entry==='elevator-hall'||profile.entry==='hotel-corridor')expect(JSON.parse(host.dataset.homeElevator!).floor).toBe(profile.floor+1);
    const lower=scene.getObjectByName('residence-lower-storeys'),core=scene.getObjectByName('residence-entrance-core');
    if(profile.floor>0){
      expect(lower).toBeDefined();expect(core).toBeDefined();
      for(const object of [lower!,core!]){const bounds=new Box3().setFromObject(object);expect(bounds.min.y).toBeCloseTo(landing.groundY,4);expect(bounds.max.y).toBeCloseTo(-.22,4);}
    }else{expect(lower).toBeUndefined();expect(core).toBeUndefined();}
    view.syncWalls({}, {front:.65,left:.65,right:.65,back:.65});
    view.dispose();expect(scene.children).toHaveLength(0);
  });
});

it('keeps the centre hotel building consistent across two room grades',()=>{
  const cheap=HOME_EXTERIOR_PROFILES.hotel_budget,luxury=HOME_EXTERIOR_PROFILES.hotel;
  expect(cheap.buildingLabel).toBe(luxury.buildingLabel);expect(cheap.facade).toBe(luxury.facade);
  expect(cheap.entry).toBe('hotel-corridor');expect(luxury.entry).toBe('hotel-corridor');expect(cheap.floor).not.toBe(luxury.floor);
});

it('uses low houses at the edge and a taller city skyline from an elevator apartment',()=>{
  const city=districtBlocks(10,8,false,'city-center'),suburb=districtBlocks(10,8,false,'suburban-edge');
  expect(suburb.filter(block=>!block.far).every(block=>block.height<=4.1)).toBe(true);
  expect(city.filter(block=>!block.far).every(block=>block.height>=11)).toBe(true);
  expect(HOME_EXTERIOR_PROFILES.suburb_room.floor).toBe(0);expect(HOME_EXTERIOR_PROFILES.own_apartment.entry).toBe('elevator-hall');
  for(const id of ['atm','hostel','temple','worker_dorm','camping_lodging','gov'])expect(HOME_EXTERIOR_PROFILES[id]).toBeUndefined();
});
