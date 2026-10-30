import * as THREE from 'three';
import type { HomeDecorMaterials } from './homeDecorModels';
export interface HomeCat { uid:string;catId:string;name:string }
export type HomeCatSupply='bowls'|'litter'|'bed'|'toy'|'train'|'device';
export interface HomeCatItem { kind:HomeCatSupply;item?:string }
function part(g:THREE.Group,geo:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0){const mesh=new THREE.Mesh(geo,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);return mesh;}
function box(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){return part(g,new THREE.BoxGeometry(w,h,d),m,x,y,z);}
function ellipsoid(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,a:number,b:number,c:number){const mesh=part(g,new THREE.SphereGeometry(1,14,10),m,x,y,z);mesh.scale.set(a,b,c);return mesh;}
function cylinder(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,r:number,h:number,top=r){return part(g,new THREE.CylinderGeometry(top,r,h,20),m,x,y,z);}
type CatPalette={fur:string;light:string;shade:string;innerEar:string;eye:string;iris:string;nose:string;gold:string;leaf:string};

const CAT_PALETTES:Record<string,CatPalette>={
  orange:{fur:'#d88948',light:'#f5e1c7',shade:'#a74f2c',innerEar:'#e5a2a0',eye:'#49352e',iris:'#c48b39',nose:'#d27d80',gold:'#bd782d',leaf:'#6f9c58'},
  mint:{fur:'#78b89b',light:'#f4eadb',shade:'#438c70',innerEar:'#d99a98',eye:'#3f3b38',iris:'#b69049',nose:'#d8888b',gold:'#bd933c',leaf:'#4d9b5c'},
  golden:{fur:'#e6b447',light:'#f7e4c1',shade:'#ae6a24',innerEar:'#e7a09a',eye:'#49352b',iris:'#bd862e',nose:'#cf7779',gold:'#d8942e',leaf:'#799854'},
  roundhead:{fur:'#b6b7bb',light:'#f1f0e9',shade:'#666b78',innerEar:'#cc9298',eye:'#393942',iris:'#bd8624',nose:'#d58489',gold:'#c89434',leaf:'#71925f'},
};

function catBall(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,rx:number,ry:number,rz:number){
  const mesh=part(g,new THREE.SphereGeometry(1,28,20),m,x,y,z);mesh.scale.set(rx,ry,rz);return mesh;
}
function catStroke(g:THREE.Group,points:THREE.Vector3[],m:THREE.Material,radius=.003){
  if(points.length<2)return;
  const curve=new THREE.CatmullRomCurve3(points);
  return part(g,new THREE.TubeGeometry(curve,Math.max(8,points.length*4),radius,6,false),m);
}
function catLimb(g:THREE.Group,m:THREE.Material,start:THREE.Vector3,end:THREE.Vector3,radius:number){
  const delta=end.clone().sub(start),mesh=part(g,new THREE.SphereGeometry(1,20,14),m);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  mesh.scale.set(radius,delta.length()*.5+radius*.62,radius);return mesh;
}
function catFrontZ(center:THREE.Vector3,radii:THREE.Vector3,x:number,y:number,offset=0){
  const nx=(x-center.x)/radii.x,ny=(y-center.y)/radii.y;
  return center.z-radii.z*Math.sqrt(Math.max(.08,1-nx*nx-ny*ny))-offset;
}
function catFrontPatch(g:THREE.Group,m:THREE.Material,center:THREE.Vector3,radii:THREE.Vector3,x:number,y:number,rx:number,ry:number){
  const segments=32,rings=4,positions:number[]=[x,y,catFrontZ(center,radii,x,y,.004)],indices:number[]=[];
  for(let ring=1;ring<=rings;ring++){
    const radius=ring/rings;
    for(let segment=0;segment<segments;segment++){
      const angle=segment/segments*Math.PI*2,px=x+Math.cos(angle)*rx*radius,py=y+Math.sin(angle)*ry*radius;
      positions.push(px,py,catFrontZ(center,radii,px,py,.004));
    }
  }
  for(let segment=0;segment<segments;segment++){
    const current=1+segment,next=1+(segment+1)%segments;
    indices.push(0,next,current);
  }
  for(let ring=2;ring<=rings;ring++){
    const inner=1+(ring-2)*segments,outer=1+(ring-1)*segments;
    for(let segment=0;segment<segments;segment++){
      const next=(segment+1)%segments,a=inner+segment,b=inner+next,c=outer+segment,e=outer+next;
      indices.push(a,e,c,a,b,e);
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();part(g,geometry,m);
}
function catEar(g:THREE.Group,fur:THREE.Material,inner:THREE.Material,x:number,y:number,z:number,tilt:number){
  const outer=new THREE.Shape();
  outer.moveTo(-.049,-.016);outer.lineTo(-.013,.077);outer.quadraticCurveTo(-.008,.082,-.004,.074);outer.lineTo(.043,-.015);outer.closePath();
  const inside=new THREE.Shape();
  inside.moveTo(-.032,-.005);inside.lineTo(-.011,.055);inside.lineTo(.024,-.005);inside.closePath();
  const outerMesh=part(g,new THREE.ExtrudeGeometry(outer,{depth:.014,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.002,bevelThickness:.002,curveSegments:6}),fur,x,y,z);
  outerMesh.rotation.set(0,Math.PI,tilt);
  const innerMesh=part(g,new THREE.ExtrudeGeometry(inside,{depth:.006,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.001,bevelThickness:.001,curveSegments:6}),inner,x,y,z-.016);
  innerMesh.rotation.set(0,Math.PI,tilt);
}
function addCatFace(g:THREE.Group,d:HomeDecorMaterials,p:CatPalette,catId:string,sleeping:boolean){
  const round=catId==='roundhead',headCenter=sleeping?new THREE.Vector3(.075,.211,-.151):new THREE.Vector3(0,.463,-.174);
  const headRadii=round?new THREE.Vector3(.163,.13,.14):new THREE.Vector3(.153,.123,.135);
  if(sleeping){headCenter.set(.07,.2,-.15);headRadii.set(round?.153:.138,round?.119:.112,.126);}
  const fur=d.color(p.fur),light=d.color(p.light),shade=d.color(p.shade),inner=d.color(p.innerEar),eye=d.color(p.eye),iris=d.color(p.iris),nose=d.color(p.nose);
  catBall(g,fur,headCenter.x,headCenter.y,headCenter.z,...headRadii.toArray());
  if(round){
    const maskY=headCenter.y-.026;
    catFrontPatch(g,light,headCenter,headRadii,headCenter.x,maskY,.094,.078);
  }
  const earY=headCenter.y+headRadii.y*.70;
  for(const side of [-1,1]){
    const x=headCenter.x+side*headRadii.x*.70;
    catEar(g,fur,inner,x,earY,catFrontZ(headCenter,headRadii,x,earY,.005),side*(sleeping?.25:.12));
  }

  const eyeY=headCenter.y-(sleeping?.008:.004);
  for(const side of [-1,1]){
    const x=headCenter.x+side*headRadii.x*.40,z=catFrontZ(headCenter,headRadii,x,eyeY,.008);
    if(sleeping){
      catStroke(g,[new THREE.Vector3(x-.026,eyeY-.003,z),new THREE.Vector3(x,eyeY+.006,z-.001),new THREE.Vector3(x+.026,eyeY-.003,z)],eye,.0028);
    }else{
      catBall(g,eye,x,eyeY,z,.024,.028,.009);
      catBall(g,iris,x+side*.001,eyeY-.001,z-.007,.015,.020,.006);
      catBall(g,eye,x,eyeY-.001,z-.012,.0045,.015,.003);
      catBall(g,light,x-side*.005,eyeY+.009,z-.015,.004,.0045,.002);
    }
  }
  const muzzleY=headCenter.y-.050,muzzleZ=catFrontZ(headCenter,headRadii,headCenter.x,muzzleY,.012);
  for(const side of [-1,1])catBall(g,light,headCenter.x+side*.027,muzzleY,muzzleZ-.004,.034,.022,.013);
  catBall(g,nose,headCenter.x,headCenter.y-.049,muzzleZ-.018,.012,.008,.006);
  const mouthTop=new THREE.Vector3(headCenter.x,headCenter.y-.058,muzzleZ-.031);
  catStroke(g,[mouthTop,new THREE.Vector3(headCenter.x,headCenter.y-.073,muzzleZ-.03)],shade,.002);
  for(const side of [-1,1])catStroke(g,[new THREE.Vector3(headCenter.x,headCenter.y-.072,muzzleZ-.03),new THREE.Vector3(headCenter.x+side*.014,headCenter.y-.080,muzzleZ-.028),new THREE.Vector3(headCenter.x+side*.027,headCenter.y-.074,muzzleZ-.026)],shade,.0018);
  for(const side of [-1,1]){
    for(const dot of [-1,1])catBall(g,shade,headCenter.x+side*(.052+Math.abs(dot)*.004),muzzleY+dot*.009,muzzleZ-.02,.0025,.0025,.0025);
    for(const row of [-1,0,1]){
      const start=new THREE.Vector3(headCenter.x+side*.054,muzzleY+row*.008,muzzleZ-.025);
      const end=new THREE.Vector3(headCenter.x+side*(.158+Math.abs(row)*.006),muzzleY+row*.022,muzzleZ-.024);
      catStroke(g,[start,new THREE.Vector3(start.x+side*.042,start.y+row*.004,start.z-.001),end],light,.0012);
    }
  }

  if(catId==='orange'||catId==='golden'||round){
    const mark=shade,markPoints:[number,number][]=[];
    for(const side of [-1,0,1]){
      const x=headCenter.x+side*(round?.028:.021),y0=headCenter.y+.019;
      markPoints.push([x,y0]);
    }
    for(const [index,[x,y]]of markPoints.entries()){
      const pts=[];for(let step=0;step<4;step++){
        const py=y+step*.016,px=x+(index===1?0:(index===0?1:-1))*(step*.002);
        pts.push(new THREE.Vector3(px,py,catFrontZ(headCenter,headRadii,px,py,.009)));
      }
      catStroke(g,pts,mark,round?.004:.0032);
    }
  }
  if(catId==='mint'){
    const sproutY=headCenter.y+headRadii.y*.91,sproutZ=headCenter.z-.006;
    catStroke(g,[new THREE.Vector3(headCenter.x,sproutY-.012,sproutZ),new THREE.Vector3(headCenter.x,sproutY+.031,sproutZ)],d.color(p.leaf),.003);
    for(const side of [-1,1]){const leaf=catBall(g,d.color(p.leaf),headCenter.x+side*.019,sproutY+.022,sproutZ-.002,.014,.027,.007);leaf.rotation.z=side*.52;}
  }
  if(round&&!sleeping){
    const gold=d.color(p.gold);cylinder(g,gold,headCenter.x,headCenter.y+headRadii.y*.99,headCenter.z-.019,.061,.012);
    for(const side of [-1,0,1]){const spike=part(g,new THREE.ConeGeometry(.012,.038,6),gold,headCenter.x+side*.045,headCenter.y+headRadii.y+ .024,headCenter.z-.019);if(side!==0)spike.rotation.z=side*-.14;}
    for(const side of [-1,1])catBall(g,d.color('#f0ce71'),headCenter.x+side*.045,headCenter.y+headRadii.y+.014,headCenter.z-.025,.006,.006,.004);
  }
}

function addSittingCat(g:THREE.Group,d:HomeDecorMaterials,catId:string,p:CatPalette){
  const fur=d.color(p.fur),light=d.color(p.light),shade=d.color(p.shade);
  const body=new THREE.Vector3(0,.205,.045),bodyRadii=new THREE.Vector3(.154,.183,.207);
  catBall(g,fur,body.x,body.y,body.z,...bodyRadii.toArray());
  for(const side of [-1,1])catBall(g,fur,side*.084,.132,.11,.064,.092,.088);
  catBall(g,fur,0,.294,-.047,.113,.148,.11);
  catBall(g,light,0,.244,-.151,.078,.108,.012);
  for(const side of [-1,1]){
    catLimb(g,fur,new THREE.Vector3(side*.071,.319,-.17),new THREE.Vector3(side*.075,.058,-.231),.029);
    catBall(g,light,side*.075,.035,-.253,.04,.035,.054);
    for(const toe of [-1,0,1])catStroke(g,[new THREE.Vector3(side*.075+toe*.016,.026,-.31),new THREE.Vector3(side*.075+toe*.016,.034,-.304)],shade,.0013);
  }
  for(const side of [-1,1]){
    for(const stripeZ of [-.035,.045,.125]){
      const points:THREE.Vector3[]=[];
      for(let step=0;step<=5;step++){
        const y=.17+step*.031,z=stripeZ+Math.sin(step/5*Math.PI)*.018;
        const nx=Math.sqrt(Math.max(.12,1-((y-body.y)/bodyRadii.y)**2-((z-body.z)/bodyRadii.z)**2));
        points.push(new THREE.Vector3(side*(body.x+bodyRadii.x*nx+.003),y,z));
      }
      if(catId==='orange'||catId==='golden'||catId==='roundhead')catStroke(g,points,shade,catId==='golden'?.004:.005);
    }
  }
  const tailPoints=[new THREE.Vector3(.085,.151,.187),new THREE.Vector3(.175,.115,.249),new THREE.Vector3(.247,.104,.223),new THREE.Vector3(.264,.106,.157),new THREE.Vector3(.236,.127,.102)];
  catStroke(g,tailPoints,fur,catId==='mint'?.039:catId==='roundhead'?.041:catId==='golden'?.036:.033);
  if(catId==='orange'||catId==='golden'||catId==='roundhead'){
    for(const index of [1,3]){
      const start=tailPoints[index].clone().lerp(tailPoints[index+1],.32),end=tailPoints[index].clone().lerp(tailPoints[index+1],.56);
      catStroke(g,[start,end],shade,.035);
    }
  }
  if(catId==='golden'){
    const collar=part(g,new THREE.TorusGeometry(.105,.008,7,30),d.color(p.gold),0,.344,-.079);collar.rotation.x=Math.PI/2;collar.scale.set(1,.82,1);
    catBall(g,d.color('#f4d16c'),0,.293,-.188,.014,.017,.009);
  }
  addCatFace(g,d,p,catId,false);
}

function addSleepingCat(g:THREE.Group,d:HomeDecorMaterials,catId:string,p:CatPalette){
  const fur=d.color(p.fur),light=d.color(p.light),shade=d.color(p.shade);
  const body=new THREE.Vector3(-.012,.137,.026),bodyRadii=new THREE.Vector3(.207,.126,.238);
  catBall(g,fur,body.x,body.y,body.z,...bodyRadii.toArray());
  catBall(g,fur,-.104,.112,.092,.106,.088,.117);
  catBall(g,light,-.018,.133,-.198,.12,.066,.014);
  catLimb(g,fur,new THREE.Vector3(-.012,.151,-.105),new THREE.Vector3(.035,.055,-.206),.035);
  catLimb(g,fur,new THREE.Vector3(.071,.136,-.082),new THREE.Vector3(.101,.051,-.191),.032);
  catBall(g,light,-.012,.035,-.218,.056,.034,.045);
  catBall(g,light,.085,.035,-.206,.051,.033,.043);
  for(const side of [-1,1])for(const stripeZ of [-.025,.075,.158]){
    const points:THREE.Vector3[]=[];
    for(let step=0;step<=4;step++){
      const y=.095+step*.02,z=stripeZ+Math.sin(step/4*Math.PI)*.012;
      const nx=Math.sqrt(Math.max(.12,1-((y-body.y)/bodyRadii.y)**2-((z-body.z)/bodyRadii.z)**2));
      points.push(new THREE.Vector3(side*(body.x+bodyRadii.x*nx+.003),y,z));
    }
    if(catId==='orange'||catId==='golden'||catId==='roundhead')catStroke(g,points,shade,.0045);
  }
  catStroke(g,[new THREE.Vector3(.112,.1,.188),new THREE.Vector3(.211,.079,.167),new THREE.Vector3(.238,.061,.082),new THREE.Vector3(.217,.05,-.035),new THREE.Vector3(.158,.055,-.113)],fur,.029);
  addCatFace(g,d,p,catId,true);
}

type CatNestOpening={frontZ:number;width:number;tailY:number;shadowY:number;shadowZ:number;eyeY:number;eyeZ:number};

function nestBox(g:THREE.Group,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number){return box(g,m,x,y,z,w,h,d);}

function archBandShape(width:number,top:number,spring:number,openingWidth:number,openingTop:number,openingSpring:number,openingBase:number){
  const shape=new THREE.Shape();
  shape.moveTo(-width/2,0);shape.lineTo(-width/2,spring);shape.quadraticCurveTo(-width/2,top,0,top);shape.quadraticCurveTo(width/2,top,width/2,spring);shape.lineTo(width/2,0);shape.closePath();
  const hole=new THREE.Path();
  hole.moveTo(openingWidth/2,openingBase);hole.lineTo(openingWidth/2,openingSpring);hole.quadraticCurveTo(openingWidth/2,openingTop,0,openingTop);hole.quadraticCurveTo(-openingWidth/2,openingTop,-openingWidth/2,openingSpring);hole.lineTo(-openingWidth/2,openingBase);hole.closePath();
  shape.holes.push(hole);return shape;
}

function addNestArchBand(g:THREE.Group,m:THREE.Material,frontZ:number,depth:number,width:number,top:number,spring:number,openingWidth:number,openingTop:number,openingSpring:number,openingBase:number,baseY:number,bevel:number){
  const geo=new THREE.ExtrudeGeometry(archBandShape(width,top,spring,openingWidth,openingTop,openingSpring,openingBase),{depth,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:12});
  return part(g,geo,m,0,baseY,frontZ);
}

function addNestDoorTrim(g:THREE.Group,m:THREE.Material,frontZ:number,halfWidth:number,base:number,spring:number,top:number,radius:number){
  const leftSpring=new THREE.Vector3(-halfWidth,spring,frontZ),apex=new THREE.Vector3(0,top,frontZ),rightSpring=new THREE.Vector3(halfWidth,spring,frontZ);
  const left=new THREE.QuadraticBezierCurve3(leftSpring,new THREE.Vector3(-halfWidth,top,frontZ),apex);
  const right=new THREE.QuadraticBezierCurve3(apex,new THREE.Vector3(halfWidth,top,frontZ),rightSpring);
  const points=[new THREE.Vector3(-halfWidth,base,frontZ),leftSpring,...left.getPoints(10).slice(1),...right.getPoints(10).slice(1),new THREE.Vector3(halfWidth,base,frontZ)];
  catStroke(g,points,m,radius);
}

function addNestCushion(g:THREE.Group,d:HomeDecorMaterials,m:THREE.Material,w:number,depth:number,z=0){
  ellipsoid(g,m,0,.087,z,w/2,.057,depth/2);
  const seam=d.color('#e8ddc9');
  catStroke(g,[new THREE.Vector3(-w*.35,.115,z-depth*.31),new THREE.Vector3(-w*.18,.133,z-depth*.39),new THREE.Vector3(0,.137,z-depth*.41),new THREE.Vector3(w*.18,.133,z-depth*.39),new THREE.Vector3(w*.35,.115,z-depth*.31)],seam,.0022);
}

function addCardboardCatNest(g:THREE.Group,d:HomeDecorMaterials):CatNestOpening{
  const card=d.color('#b68d60'),front=d.color('#c7a579'),edge=d.color('#9e7952'),tape=d.color('#ddc79f'),inside=d.color('#171514'),cushion=d.color('#c4b39a');
  const width=.78,depth=.72,frontZ=-.35;
  nestBox(g,front,0,.04,0,width,.08,depth);
  for(const side of [-1,1])nestBox(g,card,side*.37,.28,0,.04,.40,.68);
  nestBox(g,card,0,.28,.33,.74,.40,.04);
  nestBox(g,front,0,.515,0,width,.07,depth);
  for(const side of [-1,1])nestBox(g,front,side*.315,.195,frontZ,.15,.23,.04);
  nestBox(g,front,0,.40,frontZ,width,.16,.04);
  nestBox(g,inside,0,.275,.302,.66,.35,.006);
  ellipsoid(g,cushion,0,.105,.015,.285,.035,.255);
  // A folded tape seam and a tiny paw stamp make the box read as a cozy carton.
  nestBox(g,tape,0,.552,.015,.085,.006,.58);
  nestBox(g,tape,0,.426,-.377,.12,.035,.004);
  ellipsoid(g,edge,0,.431,-.380,.018,.009,.003);
  for(const side of [-1,1])ellipsoid(g,edge,side*.018,.442,-.380,.008,.008,.003);
  catStroke(g,[new THREE.Vector3(-.31,.489,-.377),new THREE.Vector3(-.18,.492,-.377),new THREE.Vector3(0,.492,-.377),new THREE.Vector3(.18,.492,-.377),new THREE.Vector3(.31,.489,-.377)],edge,.0025);
  return{frontZ,width:.48,tailY:.18,shadowY:.18,shadowZ:-.04,eyeY:.225,eyeZ:-.14};
}

function addPlushCatNest(g:THREE.Group,d:HomeDecorMaterials):CatNestOpening{
  const fabric=d.color('#819b89'),light=d.color('#a8b4a2'),pipe=d.color('#e6dac3'),inside=d.color('#302c29'),cushion=d.color('#c5bda9');
  const frontZ=-.275;
  ellipsoid(g,light,0,.048,0,.34,.048,.33);
  const bolster=[new THREE.Vector3(-.26,.13,-.27),new THREE.Vector3(-.34,.14,-.17),new THREE.Vector3(-.33,.16,.12),new THREE.Vector3(-.22,.17,.27),new THREE.Vector3(0,.18,.31),new THREE.Vector3(.22,.17,.27),new THREE.Vector3(.33,.16,.12),new THREE.Vector3(.34,.14,-.17),new THREE.Vector3(.26,.13,-.27)];
  catStroke(g,bolster,fabric,.067);
  addNestArchBand(g,fabric,frontZ,.55,.70,.69,.39,.44,.49,.34,.09,.06,.018);
  nestBox(g,inside,0,.31,.255,.42,.48,.008);
  addNestCushion(g,d,cushion,.51,.46,.015);
  addNestDoorTrim(g,pipe,frontZ-.014,.22,.15,.40,.55,.008);
  // A subtle stitched seam follows the crown of the padded hood.
  catStroke(g,[new THREE.Vector3(0,.758,-.20),new THREE.Vector3(0,.764,-.04),new THREE.Vector3(0,.764,.12),new THREE.Vector3(0,.758,.245)],light,.0025);
  return{frontZ,width:.44,tailY:.205,shadowY:.18,shadowZ:.02,eyeY:.325,eyeZ:-.075};
}

function addCastleCatNest(g:THREE.Group,d:HomeDecorMaterials):CatNestOpening{
  const stone=d.color('#c9b99b'),rose=d.color('#ad8578'),trim=d.color('#e3d4b4'),gold=d.color('#c99a4b'),inside=d.color('#292624'),cushion=d.color('#bbb19f'),window=d.color('#56443e');
  nestBox(g,d.color('#d9c9aa'),0,.045,0,.78,.09,.74);
  nestBox(g,trim,0,.101,0,.69,.035,.65);
  const frontZ=-.235;
  addNestArchBand(g,stone,frontZ,.49,.64,.67,.39,.31,.45,.29,.04,.115,.012);
  nestBox(g,inside,0,.34,.247,.53,.54,.008);
  addNestCushion(g,d,cushion,.47,.42,.035);
  addNestDoorTrim(g,gold,frontZ-.012,.155,.155,.405,.565,.006);

  for(const side of [-1,1]){
    const x=side*.285,z=-.215;
    cylinder(g,rose,x,.48,z,.087,.78,.09);
    cylinder(g,trim,x,.89,z,.103,.055,.101);
    for(const dx of [-.044,.044])for(const dz of [-.043,.043])nestBox(g,rose,x+dx,.944,z+dz,.044,.075,.044);
    nestBox(g,window,x,.565,z-.091,.027,.09,.006);
    nestBox(g,trim,x,.706,z-.09,.018,.035,.006);
  }
  for(const x of [-.21,0,.21])nestBox(g,rose,x,.825,frontZ-.018,.085,.085,.09);
  const crest=nestBox(g,gold,0,.685,frontZ-.02,.045,.045,.018);crest.rotation.z=Math.PI/4;
  return{frontZ,width:.31,tailY:.205,shadowY:.18,shadowZ:.04,eyeY:.325,eyeZ:-.065};
}

function addCatNestShell(g:THREE.Group,d:HomeDecorMaterials,bedItem='cat_bed_basic'):CatNestOpening{
  if(bedItem==='cat_bed_lux')return addCastleCatNest(g,d);
  if(bedItem==='cat_bed_good'||bedItem==='cat_bed')return addPlushCatNest(g,d);
  return addCardboardCatNest(g,d);
}

function addNestShadow(g:THREE.Group,d:HomeDecorMaterials,opening:CatNestOpening){
  const dark=d.color('#171514'),scale=Math.min(1,opening.width/.44);
  catBall(g,dark,-.015,opening.shadowY,opening.shadowZ,.17*scale,.052*scale,.105*scale);
  catBall(g,dark,.085*scale,opening.shadowY+.012*scale,opening.shadowZ-.025*scale,.068*scale,.04*scale,.066*scale);
}

function addNestTailTip(g:THREE.Group,d:HomeDecorMaterials,p:CatPalette,opening:CatNestOpening){
  const fur=d.color(p.fur),shade=d.color(p.shade),frontZ=opening.frontZ;
  const y=opening.tailY;
  catStroke(g,[new THREE.Vector3(-.005,y-.005,frontZ+.16),new THREE.Vector3(.045,y-.009,frontZ+.105),new THREE.Vector3(.10,y-.002,frontZ+.052),new THREE.Vector3(.125,y+.018,frontZ+.016),new THREE.Vector3(.105,y+.042,frontZ+.023)],fur,.012);
  if(p.fur!=='#78b89b')catStroke(g,[new THREE.Vector3(.086,y-.003,frontZ+.062),new THREE.Vector3(.109,y+.006,frontZ+.037),new THREE.Vector3(.123,y+.027,frontZ+.021)],shade,.003);
}

function addNestEyes(g:THREE.Group,d:HomeDecorMaterials,opening:CatNestOpening){
  const glow=d.color('#fff0a8');glow.emissive.set('#ffc650');glow.emissiveIntensity=.72;
  const pupil=d.color('#2a201b');
  for(const side of [-1,1]){
    const x=side*.024;
    ellipsoid(g,glow,x,opening.eyeY,opening.eyeZ,.014,.018,.006);
    ellipsoid(g,pupil,x,opening.eyeY,opening.eyeZ-.006,.0032,.011,.0025);
  }
}

/** Adds one of the three front-facing, cat-sized hideouts; cat features stay inside the opening. */
export function addHomeCatNest(g:THREE.Group,d:HomeDecorMaterials,cat:HomeCat,bedItem='cat_bed_basic',awake=false){
  const opening=addCatNestShell(g,d,bedItem),p=CAT_PALETTES[cat.catId]??CAT_PALETTES.orange;
  addNestShadow(g,d,opening);
  addNestTailTip(g,d,p,opening);
  if(awake)addNestEyes(g,d,opening);
}

export function addHomeCat(g:THREE.Group,d:HomeDecorMaterials,cat:HomeCat,sleeping=false){
  const p=CAT_PALETTES[cat.catId]??CAT_PALETTES.orange;
  if(sleeping)addSleepingCat(g,d,cat.catId,p);else addSittingCat(g,d,cat.catId,p);
}
export function addHomeCatSupply(g:THREE.Group,d:HomeDecorMaterials,s:HomeCatItem){
  const sage=d.color('#93a399'),linen=d.color('#d0c5ac'),sand=d.color('#aaa18f');
  if(s.kind==='bowls'){
    box(g,sage,0,.012,0,.65,.024,.34);
    for(const x of [-.17,.17]){cylinder(g,d.cream,x,.064,0,.115,.085,.13);cylinder(g,x<0?d.color('#877055'):d.color('#8cbdc7'),x,.109,0,.099,.009);}
    for(let i=0;i<7;i++)ellipsoid(g,d.darkWood,-.19+(i%3)*.023,.119,-.04+Math.floor(i/3)*.023,.012,.008,.012);
  }else if(s.kind==='litter'){
    box(g,sage,0,.035,0,.61,.07,.48);box(g,sand,0,.075,0,.52,.04,.4);
    for(const x of [-.295,.295])box(g,sage,x,.13,0,.04,.18,.48);
    for(const z of [-.22,.22])box(g,sage,0,.13,z,.61,.18,.04);
  }else if(s.kind==='bed'){
    addCatNestShell(g,d,s.item??'cat_bed_basic');
  }else if(s.kind==='toy'){
    if(s.item==='cat_toy_basic'){ellipsoid(g,d.fabric,0,.09,0,.095,.085,.09);part(g,new THREE.TorusGeometry(.085,.005,4,16),linen,0,.09,0).rotation.z=.6;}
    else if(s.item==='cat_toy_good'){box(g,d.wood,0,.04,0,.52,.017,.017);ellipsoid(g,sage,-.26,.054,.04,.05,.016,.11);}
    else{cylinder(g,sage,0,.065,0,.19,.11);ellipsoid(g,d.color('#cc9966'),.13,.06,.13,.035,.035,.035);}
  }else if(s.kind==='train'){
    box(g,sage,0,.017,0,.61,.025,.48);
    if(s.item!=='cat_train_basic'){cylinder(g,d.wood,0,.28,0,.06,.53);box(g,linen,0,.55,0,.42,.05,.38);part(g,new THREE.TorusGeometry(.15,.025,6,20),d.fabric,0,.37,-.15);}
  }else if(s.kind==='device'){
    box(g,d.white,0,.27,.05,.32,.52,.27);box(g,sage,0,.53,.05,.33,.035,.28);cylinder(g,d.cream,0,.056,-.18,.13,.07);cylinder(g,d.color('#8cbdc7'),.24,.05,.04,.1,.06);box(g,d.color('#6c9b8c'),0,.37,-.092,.08,.05,.012);
  }
}
