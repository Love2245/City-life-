import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import manifest from '../src/assets/mobile-stills/home/manifest.json';
import {HOME_SCENE_IDS,HOME_FIXED_IDS,homePlanFor} from '../src/game/core/homeInterior';
import {HOME_FURNITURE,type HomeFurnitureKind} from '../src/game/core/homeFurniture';
import {HOME_DECOR_CATALOG} from '../src/game/core/homeDecor';
import {homePreviewRoom} from '../src/lib/homeRoomState';
import {homeReferencePlan,homeReferenceState} from '../src/lib/homeReferencePlan';
import {homeStillDataFor,homeStillResidenceIds,composeHomeStill} from '../src/lib/homeStillView';
import {projectStillWorld} from '../src/lib/stillScene';

describe('phone home photographs retain saved room configuration',()=>{
  it('covers every actual residence and all referenced photographs on disk',()=>{
    expect(new Set(homeStillResidenceIds)).toEqual(new Set(HOME_SCENE_IDS));
    const refs=new Set<string>();
    function visit(value:unknown){if(!value||typeof value!=='object')return;for(const[key,child]of Object.entries(value)){if(key==='src'&&typeof child==='string')refs.add(child);else visit(child);}}
    visit(manifest);expect(refs.size).toBeGreaterThan(2000);
    for(const path of refs)expect(existsSync(new URL('../src/assets/mobile-stills/home/'+path,import.meta.url)),path).toBe(true);
    for(const id of HOME_SCENE_IDS){const home=homeStillDataFor(id)!;expect(home.views,id).toHaveLength(4);expect(home.fixed,id).toBe(HOME_FIXED_IDS.has(id));for(const view of home.views)expect(view.matrix,id).toHaveLength(16);}
  });
  it('has all owned furniture tiers, both supported orientations and every purchasable finish',()=>{
    for(const id of HOME_SCENE_IDS){const home=homeStillDataFor(id)!,plan=homePlanFor(id);if(home.fixed)continue;
      for(const view of home.views){
        for(const[kind,anchor]of Object.entries(plan.anchors)){
          const items=[undefined,...(HOME_FURNITURE[kind as HomeFurnitureKind]?.items??[])];
          for(const item of items){expect(view.sprites[`${kind}:${item??'none'}:0`],`${id}:${kind}:${item}`).toBeDefined();if(anchor?.alternativeRotation!==undefined&&anchor.alternatives?.length&&anchor.alternativeRotation!==anchor.rotation)expect(view.sprites[`${kind}:${item??'none'}:1`]).toBeDefined();}
        }
        for(const style of HOME_DECOR_CATALOG)expect((style.surface==='wall'?view.walls:view.floor)[style.id],`${id}:${style.id}`).toBeDefined();
        expect(view.foreground,`${id}: low walls must be independent from rear walls`).toBeDefined();
      }
    }
  });
  it('changes the image tiers and anchor positions when furniture is upgraded and moved',()=>{
    const plan=homeReferencePlan(homePlanFor('old_apartment')),basic=homeReferenceState(homePreviewRoom(plan,true,12,'auto','sunny','basic'),plan),premium=homeReferenceState(homePreviewRoom(plan,true,12,'auto','sunny','premium'),plan);
    const one=composeHomeStill(plan,basic,0),two=composeHomeStill(plan,premium,0);expect(two.layers.map(l=>l.src)).not.toEqual(one.layers.map(l=>l.src));
    const object=premium.objects.find(o=>plan.anchors[o.kind]?.alternatives?.length)!,anchor=plan.anchors[object.kind]!;
    const moved={...premium,objects:premium.objects.map(o=>o.kind===object.kind?{...o,position:anchor.alternatives![0],rotation:anchor.alternativeRotation??o.rotation}:o)};
    const three=composeHomeStill(plan,moved,0);expect(three.labels.find(l=>l.kind===object.kind)).not.toEqual(two.labels.find(l=>l.kind===object.kind));
    expect(three.layers.map(l=>[l.src,l.x,l.y])).not.toEqual(two.layers.map(l=>[l.src,l.x,l.y]));
    const fourth=composeHomeStill(plan,moved,1);expect(fourth.frame.src).not.toBe(three.frame.src);expect(fourth.labels).not.toEqual(three.labels);
  });
  it('puts rear walls behind furniture, low walls in front, and furniture in camera depth order',()=>{
    const plan=homePlanFor('old_apartment'),state=homePreviewRoom(plan,true,12),composition=composeHomeStill(plan,state,0),home=homeStillDataFor('old_apartment')!,view=home.views[0];
    expect(composition.layers.find(l=>l.src.includes('wall-base-wall'))!.depth).toBeGreaterThan(100);
    expect(composition.layers.find(l=>l.src.includes('foreground-base-wall'))!.depth).toBeLessThan(-100);
    for(const object of state.objects){const layer=composition.layers.find(l=>l.src.includes(`object-${object.kind}-${object.item??'none'}-0`));if(layer)expect(layer.depth).toBeCloseTo(projectStillWorld([object.position[0],0,object.position[1]],view.matrix,home.width,home.height).depth!,8);}
  });
  it('keeps guest-room furnishings fixed and personal pets out of rented guest rooms',()=>{
    for(const id of HOME_FIXED_IDS){const plan=homePlanFor(id),state=homePreviewRoom(plan,true,12);const normal=composeHomeStill(plan,state,0),withPersonal=composeHomeStill(plan,{...state,cats:[{uid:'pet',catId:'orange',name:'Pet'}],catItems:[{kind:'bed',item:'cat_bed_lux'}]},0);expect(withPersonal.frame).toEqual(normal.frame);expect(withPersonal.layers).toEqual([]);}
  });
  it('composes actual pet breeds and purchased supplies without model URLs',()=>{
    const plan=homePlanFor('own_villa'),state={...homePreviewRoom(plan,true,12),cats:[{uid:'one',catId:'mint',name:'Mint'},{uid:'two',catId:'roundhead',name:'Round'}],catItems:[{kind:'bed' as const,item:'cat_bed_lux'},{kind:'toy' as const,item:'cat_toy_good'},{kind:'device' as const,item:'cat_auto_feeder'}]};
    const composed=composeHomeStill(plan,state,2);expect(composed.petHits.filter(h=>h.uid).map(h=>h.uid)).toEqual(['one','two']);expect(composed.layers.some(l=>l.src.includes('cat-mint-cat_bed_lux'))).toBe(true);expect(composed.layers.some(l=>l.src.includes('cat-roundhead-cat_bed_lux'))).toBe(true);expect(composed.layers.some(l=>l.src.includes('supply-device-cat_auto_feeder'))).toBe(true);expect(composed.layers.every(l=>l.src.includes('.webp'))).toBe(true);
  });
  it('loads no 3D runtime through the shared room-state entry',()=>{
    for(const path of ['homeRoomState.ts','homeReferencePlan.ts','homeStillView.ts']){
      const source=readFileSync(new URL('../src/lib/'+path,import.meta.url),'utf8');
      expect(source).not.toMatch(/^import\s+(?!type\b).*\bfrom\s+['"]three/m);
      expect(source).not.toMatch(/^import\s+(?!type\b).*\bfrom\s+['"].*(?:homeRoom3D|homeReferenceVisuals|homeCatModels)['"]/m);
    }
  });
});
