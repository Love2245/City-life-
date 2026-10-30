import * as THREE from 'three';
import type {HomeDecorMaterials} from './homeDecorModels';
import {homeMesh,homeSoftBox,homeTube,homeLathe} from './homeObjectShapes';

export function addHomeSofa(parent:THREE.Object3D,m:HomeDecorMaterials):void {
  const seam=m.color('#929b87');
  for(const x of [-.70,.70])for(const z of [-.28,.28]){
    const foot=homeMesh(parent,`sofa-foot-${x}-${z}`,new THREE.CylinderGeometry(.035,.025,.16,12),m.darkWood);foot.position.set(x,.08,z);
  }
  homeSoftBox(parent,'sofa-frame',0,.25,0,1.7,.23,.78,m.darkWood);
  homeSoftBox(parent,'sofa-back-frame',0,.65,-.34,1.64,.7,.18,m.fabric,.055);
  for(const x of [-.39,.39]){
    homeSoftBox(parent,`sofa-seat-${x}`,x,.44,.015,.72,.2,.65,m.fabric,.055);
    const back=homeSoftBox(parent,`sofa-back-cushion-${x}`,x,.76,-.245,.72,.43,.19,m.fabric,.06);back.rotation.x=-.08;
    homeTube(parent,`sofa-seat-piping-${x}`,[[x-.30,.49,-.26],[x+.30,.49,-.26],[x+.34,.49,-.21],[x+.34,.49,.25],[x+.30,.49,.29],[x-.30,.49,.29],[x-.34,.49,.25],[x-.34,.49,-.21],[x-.30,.49,-.26]],.003,seam);
  }
  for(const x of [-.82,.82])homeSoftBox(parent,`sofa-arm-${x}`,x,.5,0,.15,.48,.86,m.fabric,.055);
  const pillow=homeSoftBox(parent,'sofa-throw-pillow',-.54,.72,-.11,.32,.34,.14,m.cream,.055);pillow.rotation.z=.16;pillow.rotation.x=-.12;
}

export function addHomeWardrobe(parent:THREE.Object3D,m:HomeDecorMaterials):void {
  homeSoftBox(parent,'wardrobe-plinth',0,.045,0,.86,.09,.41,m.darkWood,.01);
  homeSoftBox(parent,'wardrobe-carcass',0,1.08,-.015,.9,2.04,.42,m.wood,.018);
  for(const x of [-.22,.22]){
    homeSoftBox(parent,`wardrobe-door-${x}`,x,1.09,.213,.418,1.94,.048,m.wood,.012);
    homeSoftBox(parent,`wardrobe-door-inset-${x}`,x,1.1,.24,.354,1.83,.012,m.darkWood,.01);
    const hx=x>0?.062:-.062;
    homeTube(parent,`wardrobe-pull-${x}`,[[hx,.96,.249],[hx,.98,.286],[hx,1.18,.286],[hx,1.2,.249]],.009,m.metal);
  }
  homeSoftBox(parent,'wardrobe-cornice',0,2.075,-.008,.9,.045,.45,m.wood,.01);
}

export function addHomeFridge(parent:THREE.Object3D,m:HomeDecorMaterials,height:number,width:number):void {
  homeSoftBox(parent,'fridge-body',0,height/2,0,width,height,.61,m.white,.045);
  const seal=m.color('#747d75');
  for(const [cy,h]of [[height*.66,height*.62],[height*.16,height*.25]]){
    homeSoftBox(parent,`fridge-gasket-${cy}`,0,cy,.31,width-.045,h+.008,.025,seal,.014);
    homeSoftBox(parent,`fridge-door-${cy}`,0,cy,.33,width-.055,h,.038,m.white,.022);
    const hx=width*.32;
    homeTube(parent,`fridge-handle-${cy}`,[[hx,cy-.07,.351],[hx,cy-.06,.389],[hx,cy+.11,.389],[hx,cy+.12,.351]],.011,m.metal);
  }
  if(height>1.5){homeSoftBox(parent,'fridge-display',-width*.16,height*.75,.351,.115,.066,.004,m.color('#475e58'),.008);homeSoftBox(parent,'fridge-display-reading',-width*.16,height*.75,.354,.05,.009,.002,m.color('#a1b4a8'),.001);}
  for(let i=0;i<6;i++)homeSoftBox(parent,`fridge-plinth-vent-${i}`,-width*.26+i*width*.105,.047,.308,width*.068,.005,.004,seal,.001);
}

/** A real opening through the worktop, with a recessed bowl below its rim. */
export function addHomeKitchen(parent:THREE.Object3D,m:HomeDecorMaterials,level:'basic'|'standard'|'premium'):void {
  const premium=level==='premium',cabinet=m.color(premium?'#61766b':level==='standard'?'#a4a38d':'#8c7256');
  homeSoftBox(parent,'kitchen-plinth',0,.045,-.012,1.03,.09,.55,m.darkWood,.008);
  homeSoftBox(parent,'kitchen-back',0,.45,-.28,1.08,.8,.035,m.wood,.005);
  for(const x of [-.515,.515])homeSoftBox(parent,`kitchen-side-${x}`,x,.46,0,.05,.78,.6,m.wood,.006);
  for(const x of [-.27,.27]){
    homeSoftBox(parent,`kitchen-door-${x}`,x,.43,.295,.5,.72,.045,cabinet,.012);
    homeTube(parent,`kitchen-pull-${x}`,[[x-.078,.73,.32],[x-.067,.73,.345],[x+.067,.73,.345],[x+.078,.73,.32]],.007,m.metal);
  }
  const top=new THREE.Shape();top.moveTo(-.575,-.33);top.lineTo(.575,-.33);top.lineTo(.575,.33);top.lineTo(-.575,.33);top.closePath();
  const hole=new THREE.Path();hole.absellipse(-.30,.05,.185,.19,0,Math.PI*2,true);top.holes.push(hole);
  const worktop=homeMesh(parent,'kitchen-worktop',new THREE.ExtrudeGeometry(top,{depth:.08,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.003,bevelThickness:.003,curveSegments:24}),premium?m.white:m.cream);worktop.rotation.x=-Math.PI/2;worktop.position.y=.85;
  const sink=homeLathe(parent,'kitchen-sink-bowl',[[0,-.135],[.1,-.135],[.175,-.10],[.19,-.01],[.204,.0],[.207,.012],[.193,.018],[.184,.007],[.17,-.08],[.10,-.12],[0,-.12]],m.metal,32);sink.scale.z=1.025;sink.position.set(-.30,.936,-.05);
  const drain=homeMesh(parent,'kitchen-sink-drain',new THREE.CylinderGeometry(.018,.018,.003,16),m.color('#485451'));drain.position.set(-.3,.818,-.05);
  // Side-mount the faucet in front of the window sill clearance zone.
  homeTube(parent,'kitchen-tap',[[-.54,.93,.07],[-.54,1.15,.07],[-.49,1.20,.025],[-.32,1.19,0],[-.30,1.14,-.02]],.012,m.metal);
  homeSoftBox(parent,'kitchen-tap-lever',-.51,1.02,.075,.065,.014,.022,m.metal,.005);
  homeSoftBox(parent,'kitchen-hob',.24,.942,-.06,.49,.016,.42,m.color('#303a38'),.014);
  for(const x of [.12,.36])for(const z of [-.16,.04]){
    const burner=homeMesh(parent,`kitchen-burner-${x}-${z}`,new THREE.TorusGeometry(.052,.006,6,24),m.metal);burner.rotation.x=Math.PI/2;burner.position.set(x,.959,z);
    const cap=homeMesh(parent,`kitchen-burner-cap-${x}-${z}`,new THREE.CylinderGeometry(.033,.036,.012,20),m.color('#46504b'));cap.position.set(x,.959,z);
    for(const angle of [0,Math.PI/2]){const grate=homeSoftBox(parent,`kitchen-pan-support-${x}-${z}-${angle}`,x,.967,z,.136,.009,.012,m.color('#4b5550'),.003);grate.rotation.y=angle;}
  }
  for(const x of [.08,.24,.40]){const knob=homeMesh(parent,`kitchen-knob-${x}`,new THREE.CylinderGeometry(.018,.018,.017,16),m.metal);knob.rotation.x=Math.PI/2;knob.position.set(x,.80,.327);homeSoftBox(parent,`kitchen-knob-index-${x}`,x,.807,.338,.003,.014,.003,m.color('#46504b'),.001);}
  if(premium){
    homeSoftBox(parent,'kitchen-oven-frame',.27,.39,.322,.40,.38,.023,m.color('#343f3b'),.014);
    homeSoftBox(parent,'kitchen-oven-glass',.27,.39,.337,.335,.265,.008,m.color('#52615c'),.012);
    homeTube(parent,'kitchen-oven-pull',[[.13,.62,.337],[.145,.62,.37],[.395,.62,.37],[.41,.62,.337]],.009,m.metal);
    for(let i=0;i<4;i++)homeSoftBox(parent,`kitchen-oven-vent-${i}`,.27,.54+i*.012,.342,.28,.003,.003,m.color('#28342e'),.001);
  }
}
