import type {HomeAnchor,HomePlan,HomePoint,HomeScale} from './homeInterior';

function anchor(x:number,z:number,width:number,height:number,rotation=0,alternatives?:HomePoint[],alternativeRotation=rotation,scale?:HomeScale):HomeAnchor {
  return {position:[x,z],width,height,rotation,alternatives,alternativeRotation,scale};
}

/** Fixed architectural plans: furniture never occupies the marked door approaches. */
export const HOME_FLOOR_PLANS:Record<string,HomePlan>={
  studio:{
    id:'studio',title:'独卫单间',size:[6.4,5.3],outline:[[0,0],[6.4,0],[6.4,5.3],[0,5.3]],
    rooms:[{name:'起居',rect:[0,0,6.4,5.3],type:'living'},{name:'独卫',rect:[0,3.85,1.45,1.45],type:'bath'},{name:'料理角',rect:[3.8,3.7,2.6,1.6],type:'kitchen'}],
    partitions:[],windows:[{x:2.3,z:0,width:1.6,wall:'back',room:'起居'}],
    fixtures:[{kind:'nightstand',position:[3.08,.85],size:[.44,.44],owner:'bed'},{kind:'rug',position:[2.1,4.8],size:[1.0,.6],decorative:true}],
    passages:[{name:'入户通道',rect:[1.5,4.35,1.25,.85]},{name:'中央通道',rect:[1.5,2.2,1.0,2.15]}],
    anchors:{bed:anchor(4.2,1.27,1.85,1.82),computer:anchor(2.2,.62,1.15,1.1),shower:anchor(.62,4.65,.8,1.25),kitchen:anchor(5.62,4.9,.88,1.16,Math.PI),fridge:anchor(4.42,4.93,.7,1.25,Math.PI),wardrobe:anchor(6.1,1.25,.75,1.52,-Math.PI/2),bookshelf:anchor(.23,1.25,.55,1.4,Math.PI/2),door:anchor(2.1,5.23,.95,.52,Math.PI),storage:anchor(3.4,5.03,.65,.7,Math.PI),sofa:anchor(.48,2.65,1.35,1.06,Math.PI/2),lamp:anchor(5.7,2.7,.42,1.25,0,[[.7,.44]]),plant:anchor(5.9,3.7,.5,.8,0,[[1.3,1.94]]),gym:anchor(2.85,3.7,.7,1.1)},
  },
  apartment:{
    id:'apartment',title:'一室一厅 · 独立玄关',size:[8.8,7.4],outline:[[0,0],[8.8,0],[8.8,5.4],[6,5.4],[6,7.4],[0,7.4]],
    rooms:[{name:'卧室',rect:[0,0,4.5,5.4],type:'bedroom'},{name:'客厅',rect:[4.5,0,4.3,5.4],type:'living'},{name:'玄关',rect:[0,5.4,6,2],type:'entry'},{name:'浴室',rect:[6.7,0,2.1,2.3],type:'bath'},{name:'厨房',rect:[6.7,2.3,2.1,3.1],type:'kitchen'}],
    partitions:[[4.5,0,4.5,3.45],[0,5.4,2.2,5.4],[6.7,0,6.7,2.3],[6.7,2.3,7,2.3],[8.15,2.3,8.8,2.3]],
    windows:[{x:2.0,z:0,width:1.8,wall:'back',room:'卧室'},{x:5.55,z:0,width:1.6,wall:'back',room:'客厅'}],
    fixtures:[{kind:'nightstand',position:[2.42,1.0],size:[.42,.42],owner:'bed'},{kind:'rug',position:[2.8,6.85],size:[1.05,.65],decorative:true}],
    passages:[{name:'入户玄关',rect:[2.2,6.2,1.25,1.1]},{name:'卧室门口',rect:[2.2,4.65,1.2,1.5]},{name:'客厅入口',rect:[4.45,4.0,1.1,1.35]},{name:'浴室入口',rect:[7.05,1.8,1.0,1.05]}],
    anchors:{bed:anchor(1.25,1.55,2.15,2.02),computer:anchor(3.4,.68,1.22,1.12),shower:anchor(8.15,.67,.75,1.3),kitchen:anchor(8.38,4.55,.84,1.2,-Math.PI/2),fridge:anchor(8.43,3.32,.68,1.26,-Math.PI/2),wardrobe:anchor(4.17,2.5,.72,1.55,-Math.PI/2),bookshelf:anchor(.3,3.6,.55,1.45,Math.PI/2),door:anchor(2.8,7.33,.95,.52,Math.PI),storage:anchor(.28,6.45,.6,.8,Math.PI/2),sofa:anchor(5.0,2.8,1.7,1.1,Math.PI/2,[[5.28,.84]],0),lamp:anchor(6.35,4.7,.42,1.35,0,[[.6,4.65]]),plant:anchor(1.1,4.45,.48,.75,0,[[2.65,3.5]]),gym:anchor(5.12,6.45,.65,1.0)},
  },
  compact:{
    id:'compact',title:'一室一厅 · 窗边工作区',size:[10,8],outline:[[1.2,0],[10,0],[10,6],[7,6],[7,8],[0,8],[0,3.5],[1.2,3.5]],
    rooms:[{name:'卧室',rect:[1.2,0,4,5.5],type:'bedroom'},{name:'客厅',rect:[5.2,0,4.8,6],type:'living'},{name:'玄关',rect:[0,5.5,7,2.5],type:'entry'},{name:'窗边休闲区',rect:[0,3.5,1.2,2],type:'living'},{name:'浴室',rect:[7.8,0,2.2,2.4],type:'bath'},{name:'厨房',rect:[7.8,2.4,2.2,3.6],type:'kitchen'}],
    partitions:[[5.2,0,5.2,3.7],[1.2,5.5,2.5,5.5],[7.8,0,7.8,2.4],[7.8,2.4,8.1,2.4],[9.3,2.4,10,2.4]],
    windows:[{x:3.05,z:0,width:2.3,wall:'back',room:'卧室'},{x:6.5,z:0,width:1.6,wall:'back',room:'客厅'},{x:0,z:4.45,width:1.2,wall:'left',room:'窗边休闲区'}],
    fixtures:[{kind:'nightstand',position:[1.52,.85],size:[.38,.42],owner:'bed'},{kind:'rug',position:[3.2,7.4],size:[1.1,.7],decorative:true}],
    passages:[{name:'玄关',rect:[2.55,6.8,1.35,1.1]},{name:'卧室入口',rect:[2.5,4.8,1.3,1.5]},{name:'起居通道',rect:[5.25,4.5,1.3,1.4]},{name:'浴室入口',rect:[8.15,1.95,1.1,1.05]}],
    anchors:{bed:anchor(2.65,1.5,2.15,2.0),computer:anchor(4.35,.7,1.2,1.12),shower:anchor(9.35,.75,.8,1.3),kitchen:anchor(9.57,5.15,.84,1.2,-Math.PI/2),fridge:anchor(9.62,3.72,.68,1.26,-Math.PI/2),wardrobe:anchor(4.88,2.8,.72,1.55,-Math.PI/2),bookshelf:anchor(.3,6.6,.55,1.45,Math.PI/2),door:anchor(3.2,7.93,.95,.52,Math.PI),storage:anchor(1.15,7.7,.7,.8,Math.PI),sofa:anchor(5.7,2.65,1.7,1.1,Math.PI/2),lamp:anchor(7.15,5.35,.42,1.35,0,[[1.9,3.1]]),plant:anchor(2.0,4.4,.48,.75,0,[[6.55,1.55]]),gym:anchor(6.1,7.0,.65,1.0)},
  },
  premium:{
    id:'premium',title:'宽景套宅 · 书房与开放餐厨',openKitchen:true,size:[14.4,11.4],
    outline:[[0,0],[10.8,0],[10.8,1.3],[14.4,1.3],[14.4,9],[12,9],[12,11.4],[1.4,11.4],[1.4,8.4],[0,8.4]],
    rooms:[{name:'主卧',rect:[0,0,5.2,5.4],type:'bedroom'},{name:'衣帽区',rect:[0,5.4,5.2,3],type:'dressing',viewYaw:Math.PI/2},{name:'书房',rect:[5.2,0,3.8,5.4],type:'study'},{name:'卫浴',rect:[9,1.3,5.4,3.6],type:'bath'},{name:'客厅',rect:[5.2,5.4,6.8,3.6],type:'living'},{name:'开放式厨房',rect:[12,4.9,2.4,4.1],type:'kitchen',viewYaw:-Math.PI/2},{name:'玄关',rect:[1.4,8.4,4.6,3],type:'entry'},{name:'餐厅',rect:[6,9,6,2.4],type:'dining'}],
    partitions:[[5.2,0,5.2,5.4],[5.2,5.4,6.25,5.4],[9,1.3,9,4.9],[9,4.9,10,4.9],[11.35,4.9,14.4,4.9]],
    windows:[{x:2.45,z:0,width:2.6,wall:'back',room:'主卧'},{x:7.05,z:0,width:2.2,wall:'back',room:'书房'},{x:14.4,z:3.1,width:1.7,wall:'right',room:'卫浴'},{x:14.4,z:6.8,width:2.4,wall:'right',room:'开放式厨房'},{x:9,z:11.4,width:3.2,wall:'front',room:'餐厅'}],
    passages:[{name:'入户玄关',rect:[2.85,10.15,1.45,1.15]},{name:'主卧门口',rect:[1.8,4.65,1.35,1.5]},{name:'衣帽区到客厅',rect:[4.55,6.35,1.45,1.2]},{name:'书房门口',rect:[6.3,4.75,1.3,1.5]},{name:'浴室门口',rect:[10.05,4.15,1.25,1.5]},{name:'客餐厅通道',rect:[5.6,8.35,1.5,2.7]}],
    fixtures:[{kind:'counter',position:[14.01,8.05],size:[1.5,.65],rotation:-Math.PI/2},{kind:'counter',position:[12.05,8.62],size:[2.7,.65],rotation:Math.PI},{kind:'island',position:[11.5,6.75],size:[2.1,.85]},{kind:'dining',position:[9,10.2],size:[2.2,1.1]},{kind:'bathVanity',position:[11.0,1.68],size:[2.8,.6]},{kind:'bathTub',position:[12.85,3.95],size:[2.0,1.0]},{kind:'coffeeTable',position:[8.7,6.65],size:[1.3,.7],requires:'sofa'},{kind:'media',position:[8.7,5.75],size:[1.7,.45],requires:'sofa'},{kind:'rug',position:[8.7,7.25],size:[3.6,3.2],requires:'sofa',decorative:true},{kind:'nightstand',position:[.92,.9],size:[.55,.48],owner:'bed'},{kind:'nightstand',position:[3.9,.9],size:[.55,.48],owner:'bed'},{kind:'rug',position:[3.55,10.65],size:[1.2,.8],decorative:true},{kind:'bench',position:[2.05,6.8],size:[1.6,.5]},{kind:'dressingTable',position:[.43,3.85],size:[1.3,.65],rotation:Math.PI/2,owner:'wardrobe'},{kind:'rug',position:[2.4,2.0],size:[3.9,3.7],decorative:true},{kind:'rug',position:[2.05,6.8],size:[2.7,1.9],decorative:true}],
    anchors:{bed:anchor(2.4,1.65,2.35,2.14,0,undefined,0,[1.3,1,1.16]),computer:anchor(7.1,.72,1.45,1.4,0,undefined,0,[1.15,1,1]),shower:anchor(13.8,2.0,.9,1.4),kitchen:anchor(14.0,6.6,1.1,1.45,-Math.PI/2),fridge:anchor(14.0,5.45,.8,1.4,-Math.PI/2),wardrobe:anchor(.42,6.8,.74,1.6,Math.PI/2,undefined,0,[1.2,1,1]),bookshelf:anchor(8.72,3.3,.7,1.5,-Math.PI/2),door:anchor(3.55,11.33,1,.55,Math.PI),storage:anchor(2.0,10.98,.75,.85,Math.PI),sofa:anchor(8.7,8.2,2.15,1.28,Math.PI,undefined,0,[1.35,1,1.1]),lamp:anchor(10.25,8.25,.48,1.4,0,[[4.5,3.3]]),plant:anchor(5.95,1.0,.65,.95,0,[[3.7,6.5]]),gym:anchor(6.05,3.7,.9,1.15)},
  },
  house:{
    id:'house',title:'城市大宅 · 独立书房与岛台餐厨',openKitchen:true,size:[18,14.5],
    outline:[[0,1.2],[6.8,1.2],[6.8,0],[14,0],[14,2.1],[18,2.1],[18,12],[15.4,12],[15.4,14.5],[3,14.5],[3,11],[0,11]],
    rooms:[{name:'主卧',rect:[0,1.2,6.8,5.2],type:'bedroom'},{name:'衣帽与休闲区',rect:[0,6.4,6.8,4.6],type:'dressing',viewYaw:Math.PI/2},{name:'书房',rect:[6.8,0,4.2,6.4],type:'study'},{name:'卫浴',rect:[11,2.1,7,4.3],type:'bath'},{name:'客厅',rect:[6.8,6.4,6.2,5.6],type:'living'},{name:'开放式厨房',rect:[13,6.4,5,5.6],type:'kitchen',viewYaw:-Math.PI/2},{name:'玄关',rect:[3,11,4.5,3.5],type:'entry'},{name:'餐厅',rect:[7.5,12,7.9,2.5],type:'dining'}],
    partitions:[[6.8,1.2,6.8,6.4],[6.8,6.4,8.2,6.4],[11,2.1,11,6.4],[11,6.4,12.1,6.4],[13.7,6.4,18,6.4]],
    windows:[{x:3.3,z:1.2,width:3.5,wall:'back',room:'主卧'},{x:8.9,z:0,width:2.5,wall:'back',room:'书房'},{x:18,z:3.9,width:2.4,wall:'right',room:'卫浴'},{x:0,z:8.6,width:2.5,wall:'left',room:'衣帽与休闲区'},{x:18,z:9.1,width:3.0,wall:'right',room:'开放式厨房'},{x:11,z:14.5,width:3.6,wall:'front',room:'餐厅'}],
    passages:[{name:'入户玄关',rect:[5.15,13.1,1.5,1.3]},{name:'主卧门口',rect:[2.2,5.65,1.4,1.5]},{name:'衣帽区到客厅',rect:[6.15,7.5,1.45,1.4]},{name:'书房门口',rect:[8.25,5.65,1.4,1.5]},{name:'卫浴门口',rect:[12.2,5.65,1.4,1.5]},{name:'玄关到起居区',rect:[6.5,10.6,1.4,2.5]}],
    fixtures:[{kind:'counter',position:[17.6,9.7],size:[1.65,.65],rotation:-Math.PI/2},{kind:'counter',position:[15.1,11.5],size:[4.0,.65],rotation:Math.PI},{kind:'island',position:[14.45,8.9],size:[2.7,1.0]},{kind:'dining',position:[11.3,13.15],size:[2.65,1.2]},{kind:'bathVanity',position:[15.2,2.52],size:[2.6,.6]},{kind:'bathTub',position:[16.35,5.25],size:[2.2,1.15]},{kind:'coffeeTable',position:[10.7,8.5],size:[1.5,.8],requires:'sofa'},{kind:'media',position:[10.7,7.3],size:[1.8,.45],requires:'sofa'},{kind:'rug',position:[10.7,8.6],size:[3.6,3.6],requires:'sofa',decorative:true},{kind:'nightstand',position:[1.65,2.1],size:[.62,.54],owner:'bed'},{kind:'nightstand',position:[4.98,2.1],size:[.62,.54],owner:'bed'},{kind:'bench',position:[.66,8.65],size:[2.0,.6],rotation:Math.PI/2},{kind:'sideTable',position:[1.15,10.25],size:[.55,.55],owner:'bookshelf'},{kind:'rug',position:[5.9,13.7],size:[1.25,.8],decorative:true},{kind:'dressingTable',position:[6.37,4.65],size:[1.45,.65],rotation:-Math.PI/2,owner:'wardrobe'},{kind:'rug',position:[3.3,3.25],size:[4.8,3.7],decorative:true},{kind:'rug',position:[1.6,8.7],size:[2.5,3.4],decorative:true}],
    anchors:{bed:anchor(3.3,2.96,2.35,2.14,0,undefined,0,[1.5,1,1.24]),computer:anchor(8.7,.72,1.45,1.4,0,undefined,0,[1.2,1,1.1]),shower:anchor(17.15,3.0,.9,1.4),kitchen:anchor(17.6,8.0,1.1,1.45,-Math.PI/2),fridge:anchor(17.65,6.95,.8,1.4,-Math.PI/2),wardrobe:anchor(.42,6.1,.74,1.6,Math.PI/2,undefined,0,[2.1,1,1.15]),bookshelf:anchor(10.72,3.7,.7,1.5,-Math.PI/2),door:anchor(5.9,14.43,1,.55,Math.PI),storage:anchor(4.1,14.0,.75,.85,Math.PI),sofa:anchor(10.7,9.8,2.15,1.28,Math.PI,undefined,0,[1.5,1,1.1]),lamp:anchor(11.7,10.9,.48,1.4,0,[[1.65,7.7]]),plant:anchor(7.55,1.0,.65,.95,0,[[5.1,10.3]]),gym:anchor(8.1,4.9,.9,1.15,0,[[4.9,9.5]])},
  },
};
