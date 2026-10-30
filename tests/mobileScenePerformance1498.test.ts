import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createMobileSceneProfile,createMobileSelection} from '../src/lib/mobileSceneProfile';
import {createOfficeInstances} from '../src/lib/officeInstancing';
import {homePixelRatio,homeSceneQuality} from '../src/lib/homeQuality';
import {qualityForDevice} from '../src/lib/sceneMode';
import {createSceneCanvas} from '../src/lib/sceneTextureCanvas';

describe('mobile 3D workload without sacrificing readable resolution',()=>{
  it('bounds procedural upload pixels while keeping artwork coordinates and aspect ratio',()=>{
    const scale=vi.fn(),context={scale},draw=vi.fn();vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>context})});
    try{const canvas=createSceneCanvas(1024,1536,draw,768);expect([canvas.width,canvas.height]).toEqual([512,768]);expect(scale).toHaveBeenCalledWith(.5,.5);expect(draw).toHaveBeenCalledWith(context);}finally{vi.unstubAllGlobals();}
  });
  it('uses the phone preset even when WebView pointer detection is incomplete',()=>{
    expect(qualityForDevice('auto','pe')).toBe('light');expect(qualityForDevice('auto','tablet')).toBe('light');expect(qualityForDevice('fine','pe')).toBe('fine');expect(qualityForDevice('auto','pc')).toBe('auto');
  });
  it('bounds active light types, disables shadow work, and restores the fine profile',()=>{
    const renderer={shadowMap:{enabled:true,needsUpdate:true}} as unknown as THREE.WebGLRenderer;
    const scene=new THREE.Scene(),environment=new THREE.Texture();scene.environment=environment;
    const hemi=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight(),secondary=new THREE.DirectionalLight(),area=new THREE.RectAreaLight(),point=new THREE.PointLight(),hidden=new THREE.SpotLight();hidden.visible=false;
    scene.add(hemi,sun,secondary,area,point,hidden);
    const profile=createMobileSceneProfile(renderer,scene);profile.prepare();
    expect(renderer.shadowMap.enabled).toBe(false);expect(renderer.shadowMap.needsUpdate).toBe(false);expect(scene.environment).toBeNull();
    expect(sun.visible).toBe(true);expect(hemi.visible).toBe(true);expect([secondary,area,point,hidden].every(light=>!light.visible)).toBe(true);
    const later=new THREE.RectAreaLight();scene.add(later);profile.prepare();expect(later.visible).toBe(false);
    profile.dispose();expect(renderer.shadowMap.enabled).toBe(true);expect(scene.environment).toBe(environment);expect([secondary,area,point,later].every(light=>light.visible)).toBe(true);expect(hidden.visible).toBe(false);expect(scene.getObjectByName('mobile-soft-fill')).toBeUndefined();environment.dispose();
  });
  it('highlights only selected surfaces and follows source opacity without changing shared materials',()=>{
    const material=new THREE.MeshStandardMaterial({color:'#678999',emissive:'#000000'}),geometry=new THREE.BoxGeometry();
    const a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material),group=new THREE.Group();group.add(a);
    const selection=createMobileSelection(),before=material.color.clone();selection.select([group]);
    expect(a.material).not.toBe(material);expect(b.material).toBe(material);expect(material.color.equals(before)).toBe(true);
    material.opacity=.2;selection.update();expect(a.material.opacity).toBe(.2);selection.select([]);expect(a.material).toBe(material);selection.dispose();material.dispose();geometry.dispose();
  });
  it('preserves workstation raycast IDs and refreshed equipment when surfaces are instanced',()=>{
    const root=new THREE.Group(),geometry=new THREE.BoxGeometry(.8,.8,.8),material=new THREE.MeshBasicMaterial(),stations:THREE.Group[]=[];
    for(let i=0;i<4;i++){const g=new THREE.Group();g.position.x=i*2;g.userData.seat=i;g.add(new THREE.Mesh(geometry,material));stations.push(g);root.add(g);}
    const before=new THREE.Box3().setFromObject(root),instances=createOfficeInstances(root,stations);
    expect(instances.rebuild()).toBe(3);expect(instances.pickables()).toHaveLength(1);root.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(4,0,3),new THREE.Vector3(0,0,-1));
    const hit=ray.intersectObjects(instances.pickables(),true)[0];expect(hit.object.userData.officeSeats[hit.instanceId!]).toBe(2);
    const after=new THREE.Box3().setFromObject(root);expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
    instances.restore();stations[2].clear();instances.rebuild();root.updateMatrixWorld(true);expect(ray.intersectObjects(instances.pickables(),true)).toHaveLength(0);
    instances.dispose();expect(root.children.some(o=>o instanceof THREE.InstancedMesh)).toBe(false);geometry.dispose();material.dispose();
  });
  it('keeps at least display-sized phone buffers under old 50% preferences and UI zoom',()=>{
    const quality=homeSceneQuality('light','mobile',3);
    for(const zoom of [.5,.7,1,1.25]){
      const w=932/zoom,h=430/zoom,ratio=homePixelRatio(quality,w,h,.5,'auto',zoom);
      expect(w*ratio).toBeGreaterThanOrEqual(932-1e-6);expect(h*ratio).toBeGreaterThanOrEqual(430-1e-6);expect(w*h*ratio*ratio).toBeLessThanOrEqual(1_000_001);
    }
  });
});
