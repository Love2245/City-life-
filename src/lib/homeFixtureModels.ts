import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {HomeFixture} from '../game/core/homeInterior';
import type {HomeDecorMaterials} from './homeDecorModels';
import {addHomeLifeDetails} from './homeLifeDetails';
import {homeLathe,homeTube,homeSoftBox,homeMesh,addHomeWashBasin} from './homeObjectShapes';

/** Built-in fittings belong to the residence, with separate bounds for circulation checks. */
export function addHomeFixture(parent:THREE.Object3D,fixture:HomeFixture,m:HomeDecorMaterials):THREE.Group {
  const group=new THREE.Group();group.name=`fixture-${fixture.kind}`;group.position.set(fixture.position[0],0,fixture.position[1]);group.rotation.y=fixture.rotation??0;parent.add(group);
  const [w,d]=fixture.size;
  group.userData.decorative=fixture.decorative??fixture.kind==='rug';
  function box(x:number,y:number,z:number,width:number,height:number,depth:number,material:THREE.Material,rounded=false){
    const g=rounded?new RoundedBoxGeometry(width,height,depth,2,Math.min(.04,width/6,height/6,depth/6)):new THREE.BoxGeometry(width,height,depth);
    const mesh=new THREE.Mesh(g,material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  }
  if(fixture.kind==='counter'||fixture.kind==='island'){
    const island=fixture.kind==='island',finish=m.color(island?'#78857a':'#b6baa9');
    box(0,.46,-.018,w-.08,.80,d-.10,finish,true);box(0,.9,0,w+.06,.08,d+.06,m.cream,true);
    box(0,.045,-.025,w-.14,.09,d-.15,m.darkWood,true);
    const doors=Math.max(2,Math.round(w/.6));for(let i=0;i<doors;i++){const width=(w-.12)/doors,x=-w/2+.06+width*(i+.5);box(x,.38,d/2-.007,width-.025,.57,.026,finish,true);box(x,.76,d/2-.007,width-.025,.15,.026,finish,true);homeTube(group,`counter-pull-${i}`,[[x-.065,.755,d/2+.008],[x-.055,.755,d/2+.032],[x+.055,.755,d/2+.032],[x+.065,.755,d/2+.008]],.006,m.metal);}
    if(island)box(0,.44,-d/2,w-.16,.7,.022,m.wood);
    addHomeLifeDetails(group,m,'kitchen',{width:w,depth:d,surfaceY:.94,level:'rich'});
  }else if(fixture.kind==='dining'||fixture.kind==='coffeeTable'){
    const dining=fixture.kind==='dining',top=dining?.77:.44;
    box(0,top,0,w,.07,d,m.wood,true);
    for(const x of [-w*.4,w*.4])for(const z of [-d*.36,d*.36]){const leg=homeMesh(group,`table-leg-${x}-${z}`,new THREE.CylinderGeometry(.045,.029,top-.035,4),m.darkWood);leg.rotation.y=Math.PI/4;leg.position.set(x,(top-.035)/2,z);}
    for(const z of [-d*.36,d*.36])box(0,top-.105,z,w*.8,.14,.032,m.darkWood,true);
    for(const x of [-w*.4,w*.4])box(x,top-.105,0,.032,.14,d*.72,m.darkWood,true);
    if(!dining)box(0,.18,0,w*.78,.035,d*.67,m.wood,true);
    if(dining){
      const chairs:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[[-w/2-.3,0,-Math.PI/2],[w/2+.3,0,Math.PI/2],[0,-d/2-.33,Math.PI],[0,d/2+.33,0]];
      for(const [x,z,angle]of chairs){const chair=new THREE.Group();chair.position.set(x,0,z);chair.rotation.y=angle;group.add(chair);
        const seat=new THREE.Mesh(new RoundedBoxGeometry(.42,.09,.42,2,.035),m.fabric);seat.position.y=.43;seat.castShadow=seat.receiveShadow=true;chair.add(seat);
        const back=new THREE.Mesh(new RoundedBoxGeometry(.42,.46,.075,2,.03),m.fabric);back.position.set(0,.74,.19);back.rotation.x=-.08;back.castShadow=back.receiveShadow=true;chair.add(back);
        for(const lx of [-.16,.16])for(const lz of [-.16,.16]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.035,.42,.035),m.darkWood);leg.position.set(lx,.21,lz);leg.castShadow=true;chair.add(leg);}
        for(const lx of [-.16,.16]){homeSoftBox(chair,`chair-back-rail-${lx}`,lx,.69,.19,.026,.52,.025,m.darkWood,.005);homeSoftBox(chair,`chair-side-stretcher-${lx}`,lx,.22,0,.022,.025,.32,m.darkWood,.005);}
        homeSoftBox(chair,'chair-underseat-frame',0,.365,0,.37,.045,.37,m.darkWood,.012);
        homeTube(chair,'chair-seat-piping',[[-.17,.458,-.17],[.17,.458,-.17],[.19,.458,-.15],[.19,.458,.15],[.17,.458,.17],[-.17,.458,.17],[-.19,.458,.15],[-.19,.458,-.15],[-.17,.458,-.17]],.0025,m.color('#89927f'));
      }
    }
    addHomeLifeDetails(group,m,dining?'dining':'coffee',{width:w,depth:d,surfaceY:top+.035,level:'rich'});
  }else if(fixture.kind==='bathVanity'){
    box(0,.4,0,w-.05,.8,d-.05,m.wood,true);box(0,.84,0,w,.07,d,m.cream,true);
    for(const x of w<1.4?[0]:[-w*.25,w*.25])addHomeWashBasin(group,m,`vanity-${x}`,x,-.005,Math.min(.44,w*.55),Math.min(.32,d*.55),.875);
    for(const x of [-w*.25,w*.25])box(x,.45,d/2,.15,.016,.025,m.metal);
    addHomeLifeDetails(group,m,'vanity',{width:w,depth:d,surfaceY:.875,level:'rich'});
  }else if(fixture.kind==='bathTub'){
    const tub=homeLathe(group,'bathtub-shell',[[0,.02],[.34,.02],[.43,.10],[.48,.30],[.50,.51],[.493,.55],[.455,.55],[.445,.51],[.41,.30],[.31,.18],[0,.18]],m.white,48);tub.scale.set(w,1,d);
    homeTube(group,'bathtub-faucet',[[-w*.38,.34,-d*.25],[-w*.38,.72,-d*.25],[-w*.35,.77,-d*.25],[-w*.27,.77,-d*.25],[-w*.26,.70,-d*.25]],.013,m.metal);
    const drain=homeMesh(group,'bathtub-drain',new THREE.CylinderGeometry(.025,.025,.004,24),m.metal);drain.position.set(-w*.20,.184,0);
    box(w*.22,.558,d*.44,w*.22,.025,.15,m.cream,true);
  }else if(fixture.kind==='media'){
    box(0,.27,0,w,.48,d,m.wood,true);box(0,.53,0,w+.03,.04,d+.02,m.cream,true);
    for(const x of [-w*.25,w*.25]){box(x,.29,d*.51,w*.44,.32,.025,m.darkWood);box(x,.39,d*.54,.12,.012,.02,m.metal);}
    box(0,.63,0,.23,.12,.1,m.metal);box(0,.572,0,.5,.015,.21,m.metal);
    box(0,1.06,0,w*.82,.76,.055,m.darkWood,true);box(0,1.06,.03,w*.77,.69,.007,m.color('#667971'));
    // Simple dim landscape on a blank screen; no animated media or additional UI.
    box(0,.93,.035,w*.77,.16,.008,m.color('#8d9581'));box(-w*.18,1.19,.036,w*.16,.06,.009,m.color('#c7b796'));
    box(w*.32,.697,.035,.018,.004,.004,m.color('#91ad9a'),true);
    homeSoftBox(group,'media-remote',w*.35,.564,d*.25,.045,.012,.13,m.color('#49554f'),.008);
    for(let i=0;i<4;i++)homeSoftBox(group,`media-remote-key-${i}`,w*.35,.572,d*.25-.035+i*.018,.014,.004,.007,m.cream,.002);
  }else if(fixture.kind==='dressingTable'){
    box(0,.77,0,w,.07,d,m.wood,true);
    for(const x of [-w*.43,w*.43])for(const z of [-d*.34,d*.34])box(x,.38,z,.055,.76,.055,m.darkWood);
    box(0,.66,0,w*.82,.16,d*.86,m.wood,true);box(0,.66,d*.44,.13,.014,.02,m.metal);
    box(0,1.32,-d*.42,w*.72,.88,.045,m.darkWood,true);box(0,1.32,-d*.42+.026,w*.66,.8,.007,m.color('#b5c5be'));
    for(const side of [-1,1])box(side*w*.343,1.32,-d*.42+.031,.01,.82,.008,m.metal,true);
    box(0,.43,d*.5+.34,.42,.09,.4,m.fabric,true);
    for(const x of [-.16,.16])for(const z of [d*.5+.19,d*.5+.49])box(x,.21,z,.035,.42,.035,m.darkWood);
    addHomeLifeDetails(group,m,'vanity',{width:w,depth:d,surfaceY:.805,level:'rich'});
  }else if(fixture.kind==='nightstand'||fixture.kind==='sideTable'){
    const bedside=fixture.kind==='nightstand';
    box(0,.3,0,w-.035,.49,d-.025,m.wood,true);box(0,.545,0,w,.04,d,m.wood,true);
    if(bedside){box(0,.37,d*.5,w*.85,.15,.018,m.darkWood);box(0,.4,d*.53,.08,.012,.015,m.metal);}
    for(const x of [-w*.37,w*.37])for(const z of [-d*.35,d*.35])box(x,.04,z,.035,.08,.035,m.darkWood,true);
    addHomeLifeDetails(group,m,bedside?'bedside':'coffee',{width:w,depth:d,surfaceY:.565,level:w>.5?'rich':'simple'});
  }else if(fixture.kind==='rug'){
    const mat=m.color(w<1.5?'#8c8a77':'#b1b09c');box(0,.012,0,w,.018,d,mat,true);
    const trim=m.color('#d6ccba');
    for(const z of [-d/2+.06,d/2-.06])box(0,.022,z,w-.05,.003,.03,trim);
    for(const x of [-w/2+.06,w/2-.06])box(x,.022,0,.03,.003,d-.12,trim);
  }else{
    box(0,.43,0,w,.16,d,m.fabric,true);for(const x of [-w*.4,w*.4])for(const z of [-d*.32,d*.32])box(x,.2,z,.06,.4,.06,m.darkWood);
    box(-w*.25,.518,0,w*.3,.016,d*.82,m.cream,true);
  }
  const kind=group.userData.decorative?undefined:fixture.owner??(fixture.kind==='bathTub'||fixture.kind==='bathVanity'?'shower':fixture.kind==='coffeeTable'||fixture.kind==='media'?'sofa':fixture.kind==='nightstand'?'bed':fixture.kind==='sideTable'?'bookshelf':fixture.kind==='bench'||fixture.kind==='dressingTable'?'wardrobe':'kitchen');
  group.traverse(o=>{o.userData.kind=kind;});
  return group;
}
