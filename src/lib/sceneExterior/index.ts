import * as THREE from 'three';
import {createSceneWorkBudget,loadSceneModel} from '../sceneLoadWork';
import {sceneTextureCanvas} from '../sceneTextureCanvas';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HomePlan } from '../../game/core/homeInterior';
import type {WeatherId} from '../../game/types';
import {createDistrictBackdrop} from './district';
import { homeEntryLanding, insideOutline, venueExteriorLayout, type ExteriorKind, type ExteriorRect, type ExteriorSide } from './layout';
import {homeExteriorProfile} from './housingProfiles';

type Vec = [number, number, number];
type Detail = 'fine' | 'light';
type Prop = { id: string; at: Vec; height?: number; width?: number; yaw?: number; side?: ExteriorSide };
const modelUrls = import.meta.glob('../../assets/scenes/exterior/*.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Two material groups keep the exterior finish separate from player-owned wallpaper. */
export function cladExteriorBox(mesh: THREE.Mesh, outside: THREE.Material, normal: THREE.Vector3) {
  const geometry = mesh.geometry, indices = geometry.index;
  if (!indices) return;
  const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const normals = geometry.getAttribute('normal'), positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const inner: number[] = [], outer: number[] = [];
  for (const group of geometry.groups) {
    const vertex = indices.getX(group.start), n = new THREE.Vector3().fromBufferAttribute(normals, vertex);
    const exterior = n.dot(normal) > .9, list = exterior ? outer : inner;
    for (let i = group.start; i < group.start + group.count; i++) {
      const v = indices.getX(i); list.push(v);
      if (exterior) uv.setXY(v, (Math.abs(normal.x) > .5 ? positions.getZ(v) : positions.getX(v)) / 2, positions.getY(v) / 2);
    }
  }
  geometry.setIndex([...inner, ...outer]); geometry.clearGroups();
  geometry.addGroup(0, inner.length, 0); geometry.addGroup(inner.length, outer.length, 1); uv.needsUpdate = true;
  mesh.material = [source, outside];
}

/** A compact, render-only exterior. It owns its resources and never registers gameplay pickables. */
export function createSceneExterior(scene: THREE.Scene, options: {
  kind: ExteriorKind; width: number; depth: number; height: number; detail: Detail;
  anisotropy: number; host: HTMLElement; request: () => void; plan?: HomePlan;
}) {
  const { kind, width: w, depth: d, height: h, host } = options;
  const root = new THREE.Group(); root.name = `${kind}-exterior`; scene.add(root);
  const attachments: Partial<Record<ExteriorSide, THREE.Group>> = {};
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const glows: THREE.MeshStandardMaterial[] = [], lamps: THREE.PointLight[] = [], templates = new Map<string, THREE.Group>();
  const props: Prop[] = [], failures: string[] = [];
  let detail = options.detail, disposed = false, night = false, epoch = 0;
  const checkpoint=createSceneWorkBudget(()=>disposed);
  let weatherId:WeatherId='sunny';
  const geometryBatches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const own = <T extends THREE.Material>(m: T) => { materials.add(m); return m; };
  const mat = (color: string, roughness = .85, metalness = 0) => own(new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  const charcoal = mat('#364140', .7, .22), concrete = mat('#a5a49a'), edge = mat('#b5b5aa'), soil = mat('#686653'), foliage = mat('#62795b');
  const accent = mat(kind === 'store' ? '#0877c1' : '#304e3c');
  let tactile:THREE.MeshStandardMaterial|undefined;
  function texture(key:string,draw: (c: CanvasRenderingContext2D) => void, color = true) {
    const map = new THREE.CanvasTexture(sceneTextureCanvas(key,512,512,draw));
    if (color) map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = options.anisotropy; textures.add(map); return map;
  }
  const brick = kind === 'cafe';
  const facadeMap = texture(`exterior-facade-${kind}`,c => {
    c.fillStyle = brick ? '#bba58a' : kind === 'store' ? '#c7c9bf' : '#b8b5a8'; c.fillRect(0, 0, 512, 512);
    const bw = brick ? 64 : kind === 'store' ? 128 : 256, bh = brick ? 32 : kind === 'store' ? 64 : 128;
    for (let y = 0, row = 0; y < 512; y += bh, row++) for (let x = -bw; x < 512; x += bw) {
      const shade = (Math.round(x / bw) * 13 + row * 11 + 41) % 7;
      c.fillStyle = brick ? ['#af8670','#b18b74','#b58e77','#ad836c','#b28b74','#b78e76','#ae866f'][Math.abs(shade)] : kind === 'store' ? ['#e0e0d4','#e8e7dd','#e6e4d9','#dddcd1','#e1e1d7','#e8e8df','#e2e1d6'][Math.abs(shade)] : ['#d1cbbc','#d3cdbf','#d0cabb','#d4cec0','#d2ccbd','#d0cbbc','#d3cdbf'][Math.abs(shade)];
      c.fillRect(x + (row % 2 ? bw / 2 : 0) + 1, y + 1, bw - 2, bh - 2);
    }
    for (let i = 0; i < 8500; i++) { c.fillStyle = i % 2 ? '#ffffff0b' : '#2b261a09'; c.fillRect((i * 173 + 19) % 512, (i * 131 + Math.floor(i / 512) * 37) % 512, i % 3 + 1, 1); }
  });
  const facadeMaterial = own(new THREE.MeshStandardMaterial({ map: facadeMap, roughness: .92, bumpScale: brick ? .016 : .007 }));
  if(kind==='home'&&options.plan)facadeMaterial.color.set(homeExteriorProfile(options.plan).facade);
  facadeMaterial.userData.exteriorSurface=kind;
  const bumpMap = texture(`exterior-bump-${kind}`,c => { c.fillStyle = '#cccccc'; c.fillRect(0,0,512,512); c.strokeStyle = '#444444'; c.lineWidth = brick ? 2 : 1;
    const bw = brick ? 64 : kind === 'store' ? 128 : 256, bh = brick ? 32 : kind === 'store' ? 64 : 128;
    for (let y=0,row=0;y<512;y+=bh,row++) { c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();for(let x=-bw;x<512;x+=bw){const xx=x+(row%2?bw/2:0);c.beginPath();c.moveTo(xx,y);c.lineTo(xx,y+bh);c.stroke();} }
  }, false);
  const pavingMap = texture('exterior-paving',c => { c.fillStyle='#8d938d';c.fillRect(0,0,512,512);for(let y=0;y<4;y++)for(let x=0;x<4;x++){const t=168+((x*5+y*11)%7)*2;c.fillStyle=`rgb(${t+6},${t+7},${t})`;c.fillRect(x*128+1,y*128+1,126,126);}for(let i=0;i<6000;i++){c.fillStyle=i%2?'#ffffff0c':'#343b350b';c.fillRect((i*113)%512,(i*193+Math.floor(i/19))%512,1,1);}});
  const asphaltMap = texture('exterior-asphalt',c=>{c.fillStyle='#596161';c.fillRect(0,0,512,512);for(let i=0;i<23000;i++){c.fillStyle=i%3===0?'#b9c2bc29':'#111e2122';c.fillRect((i*137+13)%512,(i*251+Math.floor(i/512)*29)%512,1,1);}});
  const paving = own(new THREE.MeshStandardMaterial({map:pavingMap,roughness:.94})), asphalt=own(new THREE.MeshStandardMaterial({map:asphaltMap,roughness:.97}));
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D, at: Vec, cast = false) { const o=new THREE.Mesh(g,m);o.position.set(...at);o.castShadow=cast;o.receiveShadow=true;p.add(o);geometries.add(g);return o; }
  function box(p:THREE.Object3D,at:Vec,size:Vec,m:THREE.Material,cast=false){return mesh(new THREE.BoxGeometry(...size),m,p,at,cast);}
  function batch(at:Vec,size:Vec,m:THREE.Material,parent?:THREE.Object3D){const g=new THREE.BoxGeometry(...size);g.translate(...at);if(parent){parent.updateWorldMatrix(true,false);g.applyMatrix4(parent.matrixWorld);}const list=geometryBatches.get(m)??[];list.push(g);geometryBatches.set(m,list);}
  function planeRect(rect:ExteriorRect,y:number,m:THREE.Material){const [x,z,rw,rd]=rect,g=new THREE.PlaneGeometry(rw,rd);g.rotateX(-Math.PI/2);const uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*rw/2,uv.getY(i)*rd/2);return mesh(g,m,root,[x+rw/2,y,z+rd/2]);}
  function line(p:THREE.Object3D,points:Vec[],r:number,m:THREE.Material){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),16,r,6,false),m,p,[0,0,0]);}
  function attached(side:ExteriorSide){let group=attachments[side];if(!group){group=new THREE.Group();group.name=`exterior-${side}-attachments`;attachments[side]=group;root.add(group);}return group;}
  function plaque(p:THREE.Object3D,at:Vec,width:number,height:number,text:string,yaw=0,bg='#304b40',fg='#e9e3ce'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.max(96,Math.round(512*height/width));const c=canvas.getContext('2d')!;
    c.fillStyle=bg;c.fillRect(0,0,canvas.width,canvas.height);c.strokeStyle=fg;c.lineWidth=2;c.strokeRect(12,12,488,canvas.height-24);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';let fs=canvas.height*.35;c.font=`600 ${fs}px "Microsoft YaHei",sans-serif`;fs*=Math.min(1,456/c.measureText(text).width);c.font=`600 ${fs}px "Microsoft YaHei",sans-serif`;c.fillText(text,256,canvas.height/2);
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=options.anisotropy;textures.add(t);const m=own(new THREE.MeshStandardMaterial({map:t,roughness:.8}));const o=mesh(new THREE.PlaneGeometry(width,height),m,p,at);o.rotation.y=yaw;return o;
  }
  function planter(at:Vec,size:Vec,flowers=false){box(root,[at[0],at[1]+size[1]/2,at[2]],size,concrete,true);box(root,[at[0],at[1]+size[1]+.01,at[2]],[size[0]-.09,.025,size[2]-.09],soil);
    const leaves=flowers?mat('#869473'):foliage;for(let i=0;i<7;i++){const x=at[0]+Math.sin(i*2.4)*size[0]*.31,z=at[2]+Math.cos(i*2.4)*size[2]*.31;const g=new THREE.IcosahedronGeometry(.19+(i%3)*.035,0);g.scale(1,1.25,1);g.translate(x,at[1]+size[1]+.18,z);const list=geometryBatches.get(leaves)??[];list.push(g);geometryBatches.set(leaves,list);}}
  function sconce(side:ExteriorSide,at:Vec,yaw=0){const p=attached(side),g=new THREE.Group();g.position.set(...at);g.rotation.y=yaw;p.add(g);box(g,[0,0,0],[.16,.27,.10],charcoal);const glow=mat('#f5e4bb');glow.emissive.set('#ffdc99');glows.push(glow);box(g,[0,-.06,.056],[.115,.10,.016],glow);const l=new THREE.PointLight('#ffd49a',0,2.7,2);l.position.set(0,-.15,.18);g.add(l);lamps.push(l);}

  const lot=venueExteriorLayout(w,d,kind==='store'?4.55:9.8,kind==='store'?2.6:1.8);
  if(kind!=='home'){
    // Replace the former isolated slab with a continuous threshold, pavement, curb and lane.
    const rampCenter=lot.entry[0]+lot.entry[2]/2,rampWidth=1.6,left=-.75,rightEdge=w+2.05;
    box(root,[w/2+.65,-.18,d+1.025],[w+2.8,.26,1.9],concrete);
    planeRect([left,d+.12,w+2.8,1.86],-.039,paving);
    for(const [a,b]of [[left,rampCenter-rampWidth/2],[rampCenter+rampWidth/2,rightEdge]]){
      box(root,[(a+b)/2,-.18,d+2.35],[b-a,.26,.75],concrete);planeRect([a,d+1.98,b-a,.75],-.039,paving);batch([(a+b)/2,-.10,d+2.76],[b-a,.22,.18],edge);
    }
    const ramp=new THREE.BufferGeometry();ramp.setAttribute('position',new THREE.Float32BufferAttribute([rampCenter-rampWidth/2,-.038,d+1.98,rampCenter+rampWidth/2,-.038,d+1.98,rampCenter-rampWidth/2,-.143,d+2.85,rampCenter+rampWidth/2,-.143,d+2.85],3));ramp.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,.8,0,0,.44,.8,.44],2));ramp.setIndex([0,2,1,1,2,3]);ramp.computeVertexNormals();mesh(ramp,paving,root,[0,0,0]);
    planeRect(lot.alley,-.055,paving);planeRect(lot.backPath,-.055,paving);
    box(root,[w/2+.425,-.24,d+3.95],[w+3.25,.18,2.2],charcoal);planeRect(lot.road,-.144,asphalt);
    for(let x=-.6;x<w+1.9;x+=.6)if(Math.abs(x-rampCenter)>rampWidth/2+.25)batch([x,.006,d+2.34],[.50,.018,.27],matTactile());
    // A flush ramp keeps the entry path open; props live outside this rectangle.
    const [ex,,ew]=lot.entry;
    const paint=mat('#d4d6c6');for(let x=-.4;x<w+1;x+=2.4)batch([x,-.139,d+4.08],[1.1,.006,.045],paint);
    for(let i=0;i<4;i++)batch([Math.min(w-.5,ex+ew/2),-.137,d+2.99+i*.48],[Math.min(1.5,ew),.006,.22],paint);
    const drain=mat('#454f4e',.64,.28);for(const x of [.45,w+1.2]){batch([x,-.132,d+2.94],[.62,.012,.18],drain);for(let i=0;i<6;i++)batch([x-.23+i*.09,-.123,d+2.94],[.025,.009,.15],charcoal);}
    for(let z=.2;z<d+.6;z+=1.25)batch([w+1.72,-.037,z],[.09,.02,.48],edge);
    // Maintenance side: drainpipe, meter, condenser and delivery marking.
    const right=attached('right');line(right,[[w+.21,2.9,.35],[w+.24,.30,.35],[w+.41,.14,.35]],.028,concrete);
    box(right,[w+.22,1.36,2.4],[.13,.47,.34],charcoal);box(right,[w+.296,1.40,2.4],[.012,.18,.23],edge);
    props.push({id:'air-conditioner',at:[w+.48,1.8,1.25],height:.60,side:'right'});
    sconce('right',[w+.22,2.4,d-1.6],Math.PI/2);
    plaque(right,[w+.172,.8,3.6],.70,.20,'请勿堆物',Math.PI/2,'#dddccf','#596259');
    props.push({id:'road-hatch',at:[w+1.05,-.048,d*.58],width:.55});
    props.push({id:'street-lamp',at:[w+1.15,-.035,d+2.11],height:3.45,yaw:Math.PI/2});
    const lampGlow=mat('#fff2ce');lampGlow.emissive.set('#ffe3a8');glows.push(lampGlow);box(root,[w+1.15,3.39,d+2.11],[.10,.025,.28],lampGlow);
    const streetLight=new THREE.PointLight('#ffdcab',0,6,2);streetLight.position.set(w+1.15,3.05,d+2.11);root.add(streetLight);lamps.push(streetLight);
    if(kind==='cafe'){
      planter([1.12,-.028,d+.69],[1.45,.40,.58],true);planter([6.7,-.028,d+.73],[1.35,.40,.58]);
      props.push({id:'street-bench',at:[3.9,-.025,d+.69],height:.48,yaw:Math.PI/2});
      props.push({id:'bicycle',at:[w+1.04,-.05,d-1.08],height:1.08});
      for(const z of [d-1.7,d-.6])line(root,[[w+.6,-.025,z],[w+.6,.64,z],[w+1.28,.64,z],[w+1.28,-.025,z]],.023,charcoal);
      // Restrained corner pilasters and an entrance canopy; no roof over the interior.
      for(const x of [-.12,w+.12])box(root,[x,1.48,d+.10],[.22,2.96,.22],accent);
      const awning=box(root,[9.8,2.81,d+.44],[2.28,.09,.85],accent);awning.rotation.x=.08;
      for(const x of [8.73,10.87])line(root,[[x,2.47,d+.11],[x,2.74,d+.82]],.016,charcoal);
      plaque(root,[9.8,2.70,d+.87],1.9,.19,'一隅 · COFFEE',0,'#304e3c');
      sconce('front',[8.52,2.28,d+.18]);sconce('front',[11.18,2.28,d+.18]);
    }else{
      for(const x of [-.12,w+.12])box(root,[x,1.44,d+.13],[.22,2.88,.24],edge);
      const canopy=box(root,[4.55,2.80,d+.41],[3.0,.08,.78],accent);canopy.rotation.x=.05;
      box(root,[4.55,2.75,d+.80],[3,.10,.08],accent);
      planter([.30,-.029,d+.80],[.85,.40,.65]);
      props.push({id:'bicycle',at:[w+1.0,-.05,d-1.12],height:1.08});
      const bins=new THREE.Group();bins.position.set(w+.91,-.05,4.0);root.add(bins);
      for(const [i,tint]of ['#586962','#587181'].entries()){box(bins,[0,.35,i*.54],[.48,.70,.45],mat(tint),true);box(bins,[0,.72,i*.54],[.50,.055,.48],charcoal);box(bins,[-.248,.52,i*.54],[.012,.14,.27],edge);}
      plaque(root,[.30,.69,d+1.14],.58,.14,'文明街区',0,'#dbdfd3','#526454');
      sconce('front',[7.95,2.26,d+.19]);
    }
  }else if(options.plan){
    const outline=options.plan.outline;
    const shape=new THREE.Shape(outline.map(([x,z])=>new THREE.Vector2(x,-z)));
    const base=new THREE.ExtrudeGeometry(shape,{depth:.20,bevelEnabled:false});base.rotateX(-Math.PI/2);mesh(base,edge,root,[0,-.22,0]);
    // A narrow apron closes the foundation edge; upper-floor homes get a service ledge.
    const housing=homeExteriorProfile(options.plan),atGround=housing.floor===0;
    const margin=atGround?.50:.20;
    const expanded=outline.map((a,i)=>{const prev=outline[(i+outline.length-1)%outline.length],next=outline[(i+1)%outline.length];
      const outward=(b:number[],c:number[])=>{const dx=c[0]-b[0],dz=c[1]-b[1],len=Math.hypot(dx,dz);let n=[-dz/len,dx/len];if(insideOutline(outline,(b[0]+c[0])/2+n[0]*.1,(b[1]+c[1])/2+n[1]*.1))n=[-n[0],-n[1]];return n;};
      const n=outward(prev,a),m=outward(a,next),scale=margin/(1+n[0]*m[0]+n[1]*m[1]);return new THREE.Vector2(a[0]+(n[0]+m[0])*scale,-a[1]-(n[1]+m[1])*scale);
    });
    const apron=new THREE.Shape(expanded);apron.holes.push(new THREE.Path(outline.map(([x,z])=>new THREE.Vector2(x,-z))));const apronGeometry=new THREE.ShapeGeometry(apron);apronGeometry.rotateX(-Math.PI/2);const apronUv=apronGeometry.getAttribute('uv'),apronPositions=apronGeometry.getAttribute('position');for(let i=0;i<apronUv.count;i++)apronUv.setXY(i,apronPositions.getX(i)/2,apronPositions.getZ(i)/2);mesh(apronGeometry,paving,root,[0,-.026,0]);
    const entry=homeEntryLanding(options.plan),p=new THREE.Group();p.name=`entry-${housing.entry}`;root.add(p);
    // Local +z points away from the actual entrance, including mirrored plans.
    p.position.set(entry.center[0],0,entry.center[1]);p.rotation.y=Math.atan2(entry.outward[0],entry.outward[1]);
    const span=entry.span,depth=entry.corridorWidth,landingShift=entry.shift;
    const landing=new THREE.Group();landing.position.x=landingShift;p.add(landing);
    box(landing,[0,-.14,depth/2+.10],[span,.25,depth],concrete);
    const slab=mesh(new THREE.PlaneGeometry(span,depth),paving,landing,[0,-.009,depth/2+.1]);slab.rotation.x=-Math.PI/2;const uv=slab.geometry.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*span/2,uv.getY(i)*depth/2);
    const entrySide:ExteriorSide=entry.outward[0]<-.5?'left':entry.outward[0]>.5?'right':entry.outward[1]<0?'back':'front';
    const doorDecor=new THREE.Group();doorDecor.position.copy(p.position);doorDecor.rotation.copy(p.rotation);attached(entrySide).add(doorDecor);
    box(doorDecor,[0,2.28,.08],[1.10,.10,.14],edge);for(const x of [-.515,.515])box(doorDecor,[x,1.12,.08],[.07,2.20,.14],edge);
    // One shared entrance leaf is mounted by the home renderer, inside this frame.
    plaque(doorDecor,[.90,1.63,.10],housing.id==='minsu'?.65:.42,.20,housing.doorLabel,0,housing.trim);
    const glow=mat('#f7e7bf');glow.emissive.set('#ffdc99');glows.push(glow);box(doorDecor,[0,2.34,.11],[.38,.07,.14],glow);
    const entranceLight=new THREE.PointLight('#ffd49a',0,3.3,2);entranceLight.position.set(0,2.20,.38);doorDecor.add(entranceLight);lamps.push(entranceLight);
    host.dataset.homeStairs=JSON.stringify({flights:0,steps:0,groundY:entry.groundY,landingY:0,inside:false});
    if(atGround){
      const grass=mat('#879174'),min=landingShift-span/2,max=landingShift+span/2;
      for(const [lo,hi]of [[min+.12,-.90],[.90,max-.12]]){if(hi-lo<.25)continue;box(p,[(lo+hi)/2,-.015,depth*.56],[hi-lo,.12,depth*.86],grass);const shrubX=lo<0?lo+.30:hi-.30;for(const z of [.55,depth*.72]){const shrub=mesh(new THREE.IcosahedronGeometry(.27,1),foliage,p,[shrubX,.28,z],true);shrub.scale.set(1,1.1,1);}}
      for(const x of [-span/2,span/2]){box(landing,[x,.36,depth*.55],[.11,.73,depth],edge);for(let z=.2;z<depth;z+=.30)box(landing,[x,.66,z],[.045,.34,.045],charcoal);}
      const pathLength=housing.entry==='ground-cottage'?2.4:1.8;
      box(p,[0,-.12,depth+pathLength/2],[1.4,.09,pathLength],concrete);
      for(const x of [-.88,.88]){box(p,[x,.19,depth-.35],[.11,.38,.11],charcoal);box(p,[x,.39,depth-.35],[.09,.04,.09],glow);}
      if(housing.entry==='ground-cottage'){
        // A simple lean-to covers only the outdoor threshold, never the room.
        const canopy=box(doorDecor,[0,2.48,.63],[2.6,.10,1.2],mat('#6d7567'));canopy.rotation.x=.08;
        for(const x of [-1.15,1.15])box(doorDecor,[x,1.21,1.12],[.07,2.42,.07],mat('#92917f'));
        plaque(doorDecor,[-1.5,1.55,.11],.66,.25,'城边 12号',0,housing.trim);
      }else{
        box(p,[-1.1,.64,depth+.56],[.15,1.28,.18],edge);box(p,[1.1,.64,depth+.56],[.15,1.28,.18],edge);
        for(const x of [-.85,.85])box(p,[x,.47,depth+.56],[.035,.94,.035],charcoal);
        plaque(p,[-1.1,.95,depth+.67],.22,.15,housing.doorLabel,0,housing.trim);
      }
    }else{
      // These are enclosed common spaces. Their cutaway walls track the room
      // wall instead of inventing an open-air balcony at every front door.
      const hall=new THREE.Group();hall.position.copy(p.position);hall.rotation.copy(p.rotation);attached(entrySide).add(hall);
      const hallWall=mat(housing.entry==='hotel-corridor'?'#c9bda8':'#d7d4c5'),hallTrim=mat(housing.trim,.65,.12);
      box(hall,[landingShift,1.28,depth+.11],[span,2.56,.14],hallWall);
      box(hall,[landingShift,.13,depth+.025],[span,.20,.035],hallTrim);
      for(const x of housing.entry==='stairwell'?[landingShift-span/2]:[landingShift-span/2,landingShift+span/2])box(hall,[x,1.28,depth*.55],[.13,2.56,depth],hallWall);
      p.updateMatrixWorld(true);const mailboxAt=p.localToWorld(new THREE.Vector3(1.38,.98,.20));
      if(housing.entry!=='hotel-corridor')props.push({id:'mailbox',at:mailboxAt.toArray() as Vec,height:.38,yaw:p.rotation.y+Math.PI/2,side:entrySide});
      if(housing.entry==='elevator-hall'||housing.entry==='hotel-corridor'){
        const x=landingShift-span/2+1.05,z=depth+.015;
        box(hall,[x,1.16,z-.04],[1.55,2.32,.15],charcoal);
        for(const dx of [-.34,.34])box(hall,[x+dx,1.10,z-.13],[.67,2.15,.025],mat('#939f9b',.4,.52));
        box(hall,[x+.91,1.23,z-.07],[.12,.25,.04],hallTrim);box(hall,[x+.91,1.24,z-.095],[.034,.034,.014],glow);
        plaque(hall,[x,2.37,z-.14],.68,.14,`${housing.floor+1} F`,Math.PI,'#42534f');
        plaque(hall,[landingShift+span/2-1.15,1.62,z-.08],1.3,.24,housing.entry==='hotel-corridor'?'客房 ←  电梯':'电梯厅',Math.PI,housing.trim);
        if(housing.entry==='hotel-corridor'){
          box(landing,[0,.002,depth*.52],[span-.22,.014,.86],mat(housing.id==='hotel'?'#857b64':'#8d8b7b'));
          box(hall,[landingShift+span/2-.5,1.12,depth-.02],[.27,.48,.12],mat('#9b5448'));
        }
        host.dataset.homeElevator=JSON.stringify({floor:housing.floor+1,entry:housing.entry,position:[x,depth]});
      }else{
        const edgeX=landingShift+span/2,run=.25,rise=3.05/20;
        // A single storey of the enclosed stair core is visible in the cutaway;
        // the building core beneath it continues down to the actual ground.
        for(let i=0;i<10;i++){
          batch([edgeX+(i+.5)*run,-(i+1)*rise-.065,.55],[run+.015,.13,.91],concrete,p);
          batch([edgeX+(9.5-i)*run,-1.525-(i+1)*rise-.065,1.58],[run+.015,.13,.91],concrete,p);
        }
        box(p,[edgeX+2.72,-1.59,1.06],[.45,.13,2.0],concrete);
        box(hall,[edgeX+2.95,-.22,1.06],[.13,3.0,2.15],hallWall);
        box(hall,[edgeX+1.4,-.22,2.13],[2.95,3.0,.13],hallWall);
        line(p,[[edgeX,.86,.06],[edgeX+2.5,-.665,.06],[edgeX+2.88,-.665,.06],[edgeX+2.88,-.665,2.03],[edgeX+2.5,-.665,2.03],[edgeX,-2.19,2.03]],.025,hallTrim);
        plaque(hall,[landingShift,1.70,depth-.01],1.2,.24,`${housing.floor+1}层 · 楼梯间`,Math.PI,housing.trim);
        host.dataset.homeStairs=JSON.stringify({flights:2,steps:20,groundY:entry.groundY,landingY:0,riser:rise,run,inside:true});
      }
    }
    host.dataset.homeExterior=JSON.stringify({type:housing.entry,residenceId:housing.id,district:housing.district,floor:housing.floor,groundY:entry.groundY,entry:entry.center,outward:entry.outward,span,depth});
    // Shallow sill/trim on each real window, with drainage service details kept on the exterior side.
    for(const win of options.plan.windows){const nx=win.wall==='left'?-1:win.wall==='right'?1:0,nz=win.wall==='back'?-1:win.wall==='front'?1:0;
      const horizontal=nx===0,side:ExteriorSide=win.wall;const owner=attached(side);
      box(owner,[win.x+nx*.095,1.015,win.z+nz*.095],horizontal?[win.width+.15,.065,.21]:[.21,.065,win.width+.15],edge);
      box(owner,[win.x+nx*.077,2.425,win.z+nz*.077],horizontal?[win.width+.16,.08,.10]:[.10,.08,win.width+.16],edge);
    }
    const service=options.plan.windows.find(win=>win.wall==='right')??options.plan.windows[0];
    if(service){const side=service.wall,nx=side==='left'?-1:side==='right'?1:0,nz=side==='back'?-1:side==='front'?1:0;
      props.push({id:'air-conditioner',at:[service.x+nx*.38,.29,service.z+nz*.38],height:.50,yaw:nx?0:Math.PI/2,side});
    }
  }
  function matTactile(){return tactile??=mat('#b5a169');}
  // Merge repeated paving marks and planting into a few static draws.
  for(const [m,parts]of geometryBatches){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(g)mesh(g,m,root,[0,0,0]);}geometryBatches.clear();
  const modelRoot=new THREE.Group();modelRoot.name='exterior-library-props';root.add(modelRoot);
  async function loadProps(){
    const run=++epoch,level=detail,loader=new GLTFLoader(),placed=new THREE.Group();
    await checkpoint(true);
    const ids=[...new Set(props.map(p=>level==='light'&&['air-conditioner','bicycle','street-lamp'].includes(p.id)?p.id+'-light':p.id))];
    await Promise.all(ids.map(async id=>{if(templates.has(id))return;try{const url=Object.entries(modelUrls).find(([path])=>path.endsWith('/'+id+'.glb'))?.[1];if(!url)throw Error('Missing exterior model '+id);const gltf=await loadSceneModel(()=>loader.loadAsync(url),()=>disposed||run!==epoch);
      const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){gs.add(o.geometry);o.castShadow=false;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){ms.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture){value.anisotropy=options.anisotropy;ts.add(value);}}}});
      if(disposed){gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());return;}gs.forEach(g=>geometries.add(g));ms.forEach(m=>materials.add(m));ts.forEach(t=>textures.add(t));templates.set(id,gltf.scene);
    }catch(error){failures.push(String(error));}}));
    if(disposed||run!==epoch)return;
    for(const spec of props){await checkpoint();if(run!==epoch)return;const id=level==='light'&&['air-conditioner','bicycle','street-lamp'].includes(spec.id)?spec.id+'-light':spec.id,template=templates.get(id);if(!template)continue;
      const o=template.clone(true);o.name='exterior-'+spec.id;o.rotation.y=spec.yaw??0;o.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());o.scale.setScalar(spec.height?spec.height/size.y:spec.width?spec.width/Math.max(size.x,size.z):1);o.position.set(...spec.at);o.userData.exteriorSide=spec.side;o.traverse(child=>{if(child instanceof THREE.Mesh)child.castShadow=level==='fine'&&!spec.side;});placed.add(o);
    }
    modelRoot.clear();modelRoot.add(placed);host.dataset[`${kind}ExteriorAssets`]=JSON.stringify({detail:level,models:props.map(p=>p.id),errors:failures});options.request();
  }
  const district=createDistrictBackdrop(scene,{width:w,depth:d,height:h,kind,villa:options.plan?.id==='house',plan:options.plan,detail,host,roadMap:asphaltMap,pavingMap});
  const ready=loadProps();void ready.catch(()=>{});
  function setNight(value:boolean){night=value;for(const m of glows)m.emissiveIntensity=night?1.25:.08;for(const light of lamps)light.intensity=night?(detail==='light'?1.3:3.2):0;
    const p=district.weather(weatherId,night);asphalt.color.set(p.snow?'#a5b6b6':p.wet?'#687d84':'#ffffff');asphalt.roughness=p.wet?.34:.97;paving.color.set(p.snow?'#e8efea':p.wet?'#a7babc':'#ffffff');paving.roughness=p.wet?.48:.94;foliage.color.set(p.snow?'#b6c7ba':'#62795b');return p;}
  function setWeather(value:WeatherId,valueNight=night){weatherId=value;return setNight(valueNight);}
  function setDetail(value:Detail,anisotropy=options.anisotropy){const changed=detail!==value;detail=value;options.anisotropy=anisotropy;
    const update=(m:THREE.Material)=>{if(m instanceof THREE.MeshStandardMaterial&&m.userData.exteriorSurface===kind){m.bumpMap=detail==='fine'?bumpMap:null;m.needsUpdate=true;}};
    update(facadeMaterial);scene.traverse(o=>{if(o instanceof THREE.Mesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(update);});
    textures.forEach(t=>{t.anisotropy=anisotropy;t.needsUpdate=true;});district.setDetail(value);setNight(night);if(changed)void loadProps().catch(error=>{if(!disposed)host.dataset[`${kind}ExteriorError`]=String(error);});}
  setDetail(detail);
  const fadeEntries=new WeakMap<THREE.Object3D,{material:THREE.Material;opacity:number;transparent:boolean;depthWrite:boolean;plane:THREE.Plane}[]>();
  function fadeAttached(object:THREE.Object3D,opacity:number,height?:number){
    let entries=fadeEntries.get(object);
    if(!entries){entries=[];object.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const clone=(source:THREE.Material)=>{const m=own(source.clone()),plane=new THREE.Plane(new THREE.Vector3(0,-1,0),h);if(m instanceof THREE.MeshStandardMaterial&&glows.includes(source as THREE.MeshStandardMaterial))glows.push(m);entries!.push({material:m,opacity:source.opacity,transparent:source.transparent,depthWrite:source.depthWrite,plane});return m;};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);o.castShadow=false;});fadeEntries.set(object,entries);}
    for(const entry of entries){const transparent=entry.transparent||opacity<.999;const clipped=height!==undefined;if(entry.material.transparent!==transparent||!!entry.material.clippingPlanes?.length!==clipped){entry.material.transparent=transparent;entry.material.clippingPlanes=clipped?[entry.plane]:null;entry.material.needsUpdate=true;}entry.material.opacity=entry.opacity*opacity;entry.material.depthWrite=entry.depthWrite&&opacity>=.999;if(clipped)entry.plane.constant=height;}
  }
  return {root,attachments,facadeMaterial,ready,lot,setNight,setWeather,setDetail,weatherLayer:district.weatherLayer,updateEnvironment:district.update,scheduleWeatherFrame:district.scheduleFrame,
    /** Attachments track the same faded wall; exterior objects never get gameplay callbacks. */
    syncWalls(opacity:Partial<Record<ExteriorSide,number>>,heights?:Partial<Record<ExteriorSide,number>>){
      for(const [side,group]of Object.entries(attachments))fadeAttached(group!,opacity[side as ExteriorSide]??1,heights?.[side as ExteriorSide]);
      modelRoot.traverse(o=>{if(o.userData.exteriorSide){const side=o.userData.exteriorSide as ExteriorSide;fadeAttached(o,opacity[side]??1,heights?.[side]);}});
    },
    dispose(){disposed=true;epoch++;district.dispose();root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());templates.clear();lamps.forEach(l=>l.dispose());},
  };
}
