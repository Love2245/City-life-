import * as THREE from 'three';

type Finish='floor'|'wallpaper'|'wainscot'|'wood'|'steel'|'stone'|'ceiling';

/** Shared offline finishes and small building fixtures, separate from interactive office furniture. */
export function createCompanyCorridorArt(stage:number){
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Map<string,THREE.MeshStandardMaterial>(),textures=new Set<THREE.Texture>();
  const indicators:THREE.MeshStandardMaterial[]=[],campus=stage===1,accent=campus?'#456c63':stage===2?'#405c64':'#3c535c';
  function color(paint:string){let m=materials.get(paint);if(!m){m=new THREE.MeshStandardMaterial({color:paint,roughness:.85});materials.set(paint,m);}return m;}
  function finish(kind:Finish){
    const key='finish-'+kind;let material=materials.get(key);if(material)return material;
    const n=128,data=new Uint8Array(n*n*4);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const noise=((x*37+y*19+x*y*3)%23)-11;let rgb:number[];
      if(kind==='floor'){
        const joint=x<2||y<2,vein=Math.sin(x*.065+y*.14)*1.8,speck=(x*17+y*29)%127<4?-24:0;
        rgb=joint?[148,155,149]:(campus?[203,204,185]:[209,205,192]).map(v=>v+noise*.28+vein+speck);
      }else if(kind==='wallpaper'){
        const weave=(x%3===0?-4:0)+(y%5===0?-2:0);rgb=(campus?[222,222,201]:stage===2?[222,215,198]:[211,217,209]).map(v=>v+weave+noise*.18);
      }else if(kind==='wainscot')rgb=(campus?[137,160,144]:[164,168,155]).map(v=>v+noise*.23+(x%32<1?-8:0));
      else if(kind==='wood'){const grain=Math.sin(x*.42+Math.sin(y*.025)*2)*7+Math.sin(x*1.8+y*.035)*2;rgb=(campus?[144,163,140]:[146,116,85]).map(v=>v+grain+noise*.15);}
      else if(kind==='steel'){const grain=((y*41)%17)-8;rgb=[164,176,175].map(v=>v+grain*.45+noise*.08);}
      else if(kind==='stone'){const vein=Math.sin(x*.06+y*.15+Math.sin(y*.025)*3)*5;rgb=[174,181,173].map(v=>v+vein+noise*.2);}
      else{
        const seam=x<3||y<3,perforation=x%12===6&&y%12===6,edge=x===3||y===3;
        rgb=seam?[91,112,129]:perforation?[122,141,154]:edge?[192,204,210]:[161+noise*.15,177+noise*.15,188+noise*.15];
      }
      const i=(y*n+x)*4;for(let c=0;c<3;c++)data[i+c]=rgb[c]!;data[i+3]=255;
    }
    const map=new THREE.DataTexture(data,n,n);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.needsUpdate=true;textures.add(map);
    material=new THREE.MeshStandardMaterial({map,roughness:kind==='steel'?.55:kind==='floor'?.8:.95,metalness:kind==='steel'?.15:0});materials.set(key,material);return material;
  }
  function mesh(parent:THREE.Object3D,name:string,geometry:THREE.BufferGeometry,paint:string|THREE.Material,x:number,y:number,z:number){
    geometries.add(geometry);const object=new THREE.Mesh(geometry,typeof paint==='string'?color(paint):paint);object.name=name;object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
  }
  function box(parent:THREE.Object3D,name:string,x:number,y:number,z:number,w:number,h:number,d:number,paint:string|THREE.Material){return mesh(parent,name,new THREE.BoxGeometry(w,h,d),paint,x,y,z);}
  function surface(parent:THREE.Object3D,name:string,x:number,y:number,z:number,w:number,h:number,d:number,kind:Finish,repeat=.6){
    const object=box(parent,name,x,y,z,w,h,d,finish(kind)),uv=object.geometry.getAttribute('uv'),p=object.geometry.getAttribute('position'),normal=object.geometry.getAttribute('normal');
    for(let i=0;i<uv.count;i++){const top=Math.abs(normal.getY(i))>.5;uv.setXY(i,(Math.abs(normal.getX(i))>.5?p.getZ(i)+z:p.getX(i)+x)/repeat,(top?p.getZ(i)+z:p.getY(i)+y)/repeat);}
    object.userData.finish=kind;return object;
  }
  function cylinder(parent:THREE.Object3D,name:string,x:number,y:number,z:number,r:number,h:number,paint:string|THREE.Material){return mesh(parent,name,new THREE.CylinderGeometry(r,r,h,12),paint,x,y,z);}
  function sign(parent:THREE.Object3D,name:string,text:string,x:number,y:number,z:number,width=1.2,background=accent){
    const key='sign-'+background+'-'+text;let material=materials.get(key);
    if(!material){
      material=new THREE.MeshStandardMaterial({color:'#eee8d6',roughness:.82});materials.set(key,material);
      if(typeof document!=='undefined'&&typeof CanvasRenderingContext2D!=='undefined'){
        const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
        if(ctx){ctx.fillStyle=background;ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#ffffff40';ctx.lineWidth=3;ctx.strokeRect(12,12,1000,232);ctx.fillStyle='#f5efdd';ctx.font='500 96px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,135,954);const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;textures.add(map);material.map=map;material.color.set('#ffffff');}
      }
    }
    const object=box(parent,name,x,y,z,width,width/4,.028,material);object.userData.text=text;return object;
  }
  function wall(parent:THREE.Object3D,name:string,x:number,z:number,width:number){
    const group=new THREE.Group();group.name=name;group.position.set(x,0,z);parent.add(group);
    surface(group,name+'-wallpaper',0,1.82,0,width,1.92,.16,'wallpaper',.45);surface(group,name+'-wainscot',0,.46,-.01,width,.92,.18,'wainscot',.5);
    box(group,name+'-chair-rail',0,.93,-.025,width,.045,.205,accent);box(group,name+'-skirting',0,.065,-.025,width,.13,.21,'#64746b');box(group,name+'-cornice',0,2.79,0,width,.075,.21,'#d0d4c6');return group;
  }
  function door(parent:THREE.Object3D,name:string,x:number,z:number,room:string,company:string,facing=0){
    const group=new THREE.Group();group.name=name;group.position.set(x,0,z);group.rotation.y=facing;group.userData.room=room;group.userData.company=company;parent.add(group);
    for(const side of [-1,1]){
      surface(group,'door-wallpaper-pier',side*.83,1.43,.065,.36,2.86,.15,'wallpaper',.45);
      for(const face of [-1,1])surface(group,'door-pier-wainscot',side*.83,.43,.065+face*.1,.36,.86,.045,'wainscot',.5);
      box(group,'door-frame',side*.64,1.19,-.055,.095,2.38,.23,accent);box(group,'door-pier-skirting',side*.83,.065,-.07,.36,.13,.09,'#64746b');
    }
    surface(group,'door-wallpaper-header',0,2.66,.065,1.3,.4,.15,'wallpaper',.45);box(group,'door-frame-lintel',0,2.4,-.055,1.37,.1,.23,accent);
    surface(group,'neighbour-door',0,1.16,-.005,1.18,2.32,.09,'wood',.8);
    // Both sides remain legible in the architectural cutaway, without exposing a neighbouring interior.
    for(const face of [-1,1]){
      box(group,'door-frosted-panel',0,1.58,face*.068,.92,.94,.027,campus?'#b8c7ae':'#c2cec8');
      box(group,'door-panel-top-rule',0,2.07,face*.085,.98,.025,.025,'#d9decd');box(group,'door-kickplate',0,.17,face*.068,1.08,.2,.027,'#6f7c72');
      box(group,'door-pull-handle',.44,1.04,face*.13,.036,.3,.042,'#e0dfcd');for(const y of [.91,1.17])box(group,'door-handle-standoff',.44,y,face*.09,.038,.034,.09,'#a5aea1');
      sign(group,'neighbour-room-number-'+room,room,0,2.65,.065+face*.1,.65,accent);sign(group,'neighbour-company-name-'+room,company,0,1.6,face*.092,1.02,accent);
    }
    return group;
  }
  function glow(name:string){let m=materials.get(name);if(!m){m=new THREE.MeshStandardMaterial({color:'#e3d39d',emissive:'#f9d48f',emissiveIntensity:.2,roughness:.5});materials.set(name,m);indicators.push(m);}return m;}
  function callPanel(parent:THREE.Object3D,name:string,x:number,y:number,z:number){
    const panel=new THREE.Group();panel.name=name;panel.position.set(x,y,z);parent.add(panel);surface(panel,'lift-call-panel-plate',0,0,0,.18,.44,.045,'steel',.25);
    for(const[i,dy]of [.095,-.095].entries()){
      const button=cylinder(panel,'lift-call-button',0,dy,-.037,.044,.024,i===0?glow('call-button-light'):'#7f8f8b');button.rotation.x=Math.PI/2;
      const triangle=new THREE.Shape([new THREE.Vector2(-.018,-.012),new THREE.Vector2(.018,-.012),new THREE.Vector2(0,.018)]),icon=mesh(panel,'lift-button-arrow',new THREE.ShapeGeometry(triangle),'#354c50',0,dy,-.052);if(i)icon.rotation.z=Math.PI;icon.rotation.y=Math.PI;
    }
    return panel;
  }
  function elevator(parent:THREE.Object3D,name:string,x:number,z:number,floor:number){
    const group=new THREE.Group();group.name=name;group.position.set(x,0,z);parent.add(group);
    surface(group,'lift-stone-header',0,2.64,0,2.28,.32,.24,'stone',1);
    for(const side of [-1,1]){
      surface(group,'lift-stone-jamb',side*1.05,1.25,0,.18,2.5,.24,'stone',1);
      surface(group,'shared-lift-door-'+(side<0?'left':'right'),side*.405,1.18,0,.795,2.33,.06,'steel',.65);surface(group,'lift-jamb',side*.91,1.22,0,.1,2.44,.12,'steel',.5);
      for(const face of [-1,1])box(group,'lift-door-edge',side*.015,1.18,face*.038,.018,2.33,.014,'#596e72');
    }
    for(const face of [-1,1]){
      sign(group,'shared-lift-floor-display',String(floor)+' ↑',0,2.59,face*.15,.63,'#233c47');const panel=callPanel(group,'shared-lift-call-panel',1.29,1.23,face*.13);if(face>0)panel.rotation.y=Math.PI;
    }
    box(group,'lift-threshold',0,.026,0,1.87,.05,.38,'#87978f');return group;
  }
  function fireStation(parent:THREE.Object3D,name:string,x:number,z:number,facing=0){
    const group=new THREE.Group();group.name=name;group.position.set(x,0,z);group.rotation.y=facing;parent.add(group);
    for(const side of [-1,1])box(group,'fire-station-post',side*.22,.64,.065,.045,1.28,.06,'#a14e42');
    box(group,'fire-station-header',0,1.13,.065,.49,.24,.06,'#a14e42');box(group,'fire-station-plinth',0,.045,-.06,.53,.09,.37,'#7f554a');
    cylinder(group,'fire-extinguisher-body',0,.4,-.075,.12,.55,'#ba4035');cylinder(group,'fire-extinguisher-neck',0,.71,-.075,.054,.1,'#a9b3aa');
    for(const face of [-1,1])box(group,'fire-extinguisher-label',0,.42,-.075+face*.117,.15,.18,.015,'#eadfbc');box(group,'fire-extinguisher-handle',.025,.78,-.075,.22,.045,.065,'#3b4541');
    const hose=new THREE.CatmullRomCurve3([new THREE.Vector3(.06,.73,-.075),new THREE.Vector3(.19,.67,-.08),new THREE.Vector3(.2,.4,-.08),new THREE.Vector3(.15,.3,-.12)]);mesh(group,'fire-extinguisher-hose',new THREE.TubeGeometry(hose,8,.015,5,false),'#303d39',0,0,0);
    for(const face of [-1,1])sign(group,'fire-extinguisher-sign','灭火器',0,1.13,.065+face*.047,.45,'#a8483b');return group;
  }
  function bench(parent:THREE.Object3D,x:number,z:number){
    const group=new THREE.Group();group.name='corridor-waiting-bench';group.position.set(x,0,z);parent.add(group);
    for(const side of [-1,1]){box(group,'bench-leg',side*.66,.2,0,.07,.4,.38,accent);box(group,'bench-back-support',side*.66,.58,.19,.05,.85,.045,accent);}
    for(let i=0;i<4;i++)surface(group,'bench-seat-slat',0,.43,-.18+i*.11,1.7,.07,.088,'wood',.6);for(const y of [.66,.84])surface(group,'bench-back-slat',0,y,.2,1.7,.14,.055,'wood',.6);return group;
  }
  function planter(parent:THREE.Object3D,x:number,z:number){
    const group=new THREE.Group();group.name='corridor-planter';group.position.set(x,0,z);parent.add(group);cylinder(group,'planter-pot',0,.23,0,.22,.46,'#a9a99a');cylinder(group,'planter-soil',0,.46,0,.185,.015,'#5e6652');cylinder(group,'plant-stem',0,.83,0,.027,.76,'#5a6e4b');
    for(let i=0;i<5;i++){const a=i*Math.PI*.8,leaf=mesh(group,'corridor-plant-leaf',new THREE.IcosahedronGeometry(.26,0),'#587b59',Math.cos(a)*.13,.73+i*.11,Math.sin(a)*.13);leaf.scale.set(.6,1.35,.55);leaf.rotation.z=Math.sin(a)*.7;}
  }
  function waterStation(parent:THREE.Object3D,x:number,z:number){
    const group=new THREE.Group();group.name='corridor-water-station';group.position.set(x,0,z);parent.add(group);box(group,'water-cooler-body',0,.5,0,.42,.95,.38,'#d2d7c9');box(group,'water-cooler-recess',0,.75,-.202,.3,.23,.025,'#6d8484');
    for(const side of [-1,1])box(group,'water-tap',side*.08,.76,-.23,.045,.045,.08,side<0?'#a35b4c':'#567c91');cylinder(group,'water-bottle',0,1.17,0,.16,.38,'#7cabb4');cylinder(group,'water-bottle-cap',0,1.39,0,.08,.055,'#527984');cylinder(group,'corridor-waste-bin',.57,.27,0,.17,.54,'#718278');cylinder(group,'bin-lid',.57,.55,0,.18,.06,'#4e655d');
  }
  function noticeBoard(parent:THREE.Object3D,x:number,z:number,floor:number){
    const group=new THREE.Group();group.name='corridor-notice-board';group.position.set(x,0,z);parent.add(group);for(const side of [-1,1])box(group,'notice-board-post',side*.55,1.05,.08,.045,2.1,.045,accent);
    box(group,'notice-board-frame',0,1.65,0,1.45,1.03,.095,accent);
    for(const face of [-1,1]){
      box(group,'notice-board-cork',0,1.65,face*.057,1.33,.91,.025,'#b8ac82');sign(group,'floor-wayfinding',floor+'F · 办公导览',0,2.08,face*.08,1.28,accent);
      for(const[i,paint]of ['#e1dbc0','#bac8bd','#d8c5a5'].entries()){box(group,'notice-paper',-.42+i*.4,1.65,face*.08,.31,.5,.015,paint);for(let k=0;k<4;k++)box(group,'notice-text-rule',-.42+i*.4,1.82-k*.08,face*.092,.22-(k%2)*.055,.012,.006,'#85928a');}
    }
    return group;
  }
  let disposed=false;
  return{box,surface,sign,wall,door,elevator,callPanel,fireStation,bench,planter,waterStation,noticeBoard,accent,
    setNight(night:boolean){for(const m of indicators)m.emissiveIntensity=night?.65:.2;},
    dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());},
  };
}
