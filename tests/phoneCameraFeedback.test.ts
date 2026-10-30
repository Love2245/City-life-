import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {allNpcs} from '../src/game/core/npcs';
import {addContactFromNpc} from '../src/game/core/contacts';
import {ensureRelationship} from '../src/game/core/relationships';
import {migrateSave} from '../src/game/core/migrate';
import {momentsPostsOf,tickMoments,NPC_MOMENT_COOLDOWN_DAYS,NPC_MOMENT_DAILY_CAP,createPost} from '../src/game/core/moments';
import {gameDay,fromLinearDay,START_EPOCH} from '../src/game/core/calendar';
import {homeCameraPose,moveHomeCameraTarget,pointInsideHome} from '../src/lib/homeRoom3D';
import {HOME_LOW_WALL_HEIGHT,homeExteriorWallHeight} from '../src/lib/homeWallView';
import {HOME_FLOOR_PLANS} from '../src/game/core/homeFloorPlans';
import {ACTIONS,getAction,performShoppingCart,purchasePriceOf} from '../src/game/core/actions';
import {getItem,itemCount} from '../src/game/core/items';
import {RECIPES} from '../src/game/core/cooking';
import {installFridge,cookingItemCount,cookingCategoryOf,FRIDGE_TIERS} from '../src/game/core/fridge';
import {signLease} from '../src/game/core/housing';
import {isFacilityProduct,productCategory} from '../src/game/core/facilityShopping';
import {dialogueGlyphs} from '../src/lib/dialogueReveal';

describe('自由镜头和外墙剖切',()=>{
  it('凹角附近360度旋转不缩放，目标能平滑穿过户型缺口',()=>{
    const plan=HOME_FLOOR_PLANS.apartment,target:[number,number]=[7,5.8];expect(pointInsideHome(plan,...target)).toBe(false);
    expect(moveHomeCameraTarget(plan,[5.5,5.8],target)).toEqual(target);
    let outside=false;for(let i=0;i<360;i++){const p=homeCameraPose(plan,target,i*Math.PI/180,4.8);expect(p.radius).toBe(4.8);expect(p.height).toBeCloseTo(.62+4.8*.91);outside ||= !pointInsideHome(plan,...p.eye);}expect(outside).toBe(true);
    expect(moveHomeCameraTarget(plan,target,[999,-999])).toEqual([Math.max(...plan.outline.map(p=>p[0]))+.5,Math.min(...plan.outline.map(p=>p[1]))-.5]);
  });
  it('所有户型中正对查看位置的遮挡外墙降为低墙，完整/低墙模式仍可切换',()=>{
    for(const plan of Object.values(HOME_FLOOR_PLANS)){
      const target:[number,number]=[plan.size[0]/2,plan.size[1]/2];
      for(let i=0;i<plan.outline.length;i++){
        const a=plan.outline[i],b=plan.outline[(i+1)%plan.outline.length],segment=[...a,...b];
        const mid:[number,number]=[(a[0]+b[0])/2,(a[1]+b[1])/2],eye:[number,number]=[target[0]+(mid[0]-target[0])*2,target[1]+(mid[1]-target[1])*2];
        expect(homeExteriorWallHeight(segment,target,eye,'cutaway',2.65)).toBe(HOME_LOW_WALL_HEIGHT);
        expect(homeExteriorWallHeight(segment,target,eye,'full')).toBe(2.65);expect(homeExteriorWallHeight(segment,target,eye,'low')).toBe(HOME_LOW_WALL_HEIGHT);
      }
    }
    expect(homeExteriorWallHeight([0,0,4,0],[2,2],[2,6],'cutaway')).toBe(2.65);
  });
});
describe('网名与朋友圈节奏',()=>{
  it('12人都有独立网名，读旧档更新自动名但不覆盖另起的称呼/会话/正文',()=>{
    expect(allNpcs()).toHaveLength(12);expect(new Set(allNpcs().map(n=>n.netName)).size).toBe(12);
    expect(allNpcs().every(n=>!!n.netName)).toBe(true);
    const s=createInitialState(19);addContactFromNpc(s,'npc_zhao_gang');addContactFromNpc(s,'npc_lin_xiaoyu');
    const z=s.contacts.find(c=>c.npcId==='npc_zhao_gang')!;z.name='老炮儿刚子';s.contacts.find(c=>c.npcId==='npc_lin_xiaoyu')!.name='我的小雨';
    s.smsInbox.push({id:'legacy-nickname',conversationId:'sender:'+z.name,sender:z.name,senderIcon:'👤',text:'原文不动',dir:'in',day:0,options:[],replied:false});
    const before=JSON.stringify(s),loaded=migrateSave(s);expect(JSON.stringify(s)).toBe(before);
    expect(loaded.contacts.find(c=>c.id===z.id)?.name).toBe('赵刚（招工）');expect(loaded.contacts.find(c=>c.npcId==='npc_lin_xiaoyu')?.name).toBe('我的小雨');
    const message=loaded.smsInbox.find(m=>m.id==='legacy-nickname')!;expect(message.sender).toBe('赵刚（招工）');expect(message.conversationId).toBe('contact:'+z.id);expect(message.text).toBe('原文不动');
    expect(JSON.stringify(migrateSave(loaded))).toBe(JSON.stringify(loaded));
  });
  it('历史动态/评论跟随网名，读取不修改存档、联系人和旧正文',()=>{
    const s=createInitialState(20);addContactFromNpc(s,'npc_zhao_gang');const c=s.contacts.find(c=>c.npcId==='npc_zhao_gang')!;c.name='老炮儿刚子';
    const post=createPost(s,{text:'原有正文',category:'daily'});Object.assign(post,{author:'contact',contactId:c.id,npcId:c.npcId,authorName:c.name,comments:[{id:'c1',authorId:c.id,authorName:c.name,authorIcon:'👤',text:'旧评论',day:0}]});
    const before=JSON.stringify(s),view=momentsPostsOf(s)[0];expect(view.authorName).toBe('赵刚（招工）');expect(view.comments[0].authorName).toBe('赵刚（招工）');expect(view.text).toBe('原有正文');expect(JSON.stringify(s)).toBe(before);
  });
  it('跨月跨年和反复tick/读档不突破五天间隔、每日两条上限，也不补刷跳过的日期',()=>{
    let s=createInitialState(31);for(const npc of allNpcs()){addContactFromNpc(s,npc.id);ensureRelationship(s,npc.id).affinity=70;}
    const original=gameDay(s.time),last=new Map<string,number>(),ids=new Set<string>();let total=0;
    for(let day=0;day<400;day++){
      Object.assign(s.time,fromLinearDay(START_EPOCH+original+day));
      for(let i=0;i<6;i++)tickMoments(s,[]);
      const posts=momentsPostsOf(s).filter(p=>p.author==='contact'&&p.day===gameDay(s.time));expect(posts.length).toBeLessThanOrEqual(NPC_MOMENT_DAILY_CAP);
      for(const post of posts){if(ids.has(post.id))continue;ids.add(post.id);total++;const previous=last.get(post.contactId!);if(previous!==undefined)expect(post.day-previous).toBeGreaterThanOrEqual(NPC_MOMENT_COOLDOWN_DAYS);last.set(post.contactId!,post.day);}
      if(day%50===0){s=migrateSave(s);const before=JSON.stringify(s);tickMoments(s,[]);expect(JSON.stringify(s)).toBe(before);}
    }
    expect(total).toBeGreaterThan(30);
    const previous=new Set(s.social!.posts.map(p=>p.id));Object.assign(s.time,fromLinearDay(START_EPOCH+original+1500));tickMoments(s,[]);const added=s.social!.posts.filter(p=>!previous.has(p.id));expect(added.length).toBeLessThanOrEqual(2);expect(added.every(p=>p.day===gameDay(s.time))).toBe(true);
  });
});
describe('菜市场食材采购核对',()=>{
  it('米粮上架且没有重复SKU；菜谱主料和调料都可采购',()=>{
    const market=ACTIONS.filter(a=>a.locationId==='market'&&isFacilityProduct(a));
    expect(market.filter(a=>a.itemId==='rice')).toHaveLength(1);expect(productCategory(getAction('buy_rice_market')!)).toBe('米粮');
    expect(new Set(market.map(a=>a.itemId)).size).toBe(market.length);
    const groceries=ACTIONS.filter(a=>['market','convenience_store'].includes(a.locationId)&&isFacilityProduct(a));
    const categories=new Set(groceries.map(a=>cookingCategoryOf(a.itemId!)));
    expect(productCategory(getAction('buy_noodles_convenience')!)).toBe('即食食品');
    for(const recipe of RECIPES){for(const category of Object.keys(recipe.ingredientCategories??{}))expect(categories.has(category),recipe.id+':'+category).toBe(true);for(const item of Object.keys(recipe.needs))expect(market.some(a=>a.itemId===item)).toBe(true);for(const seasoning of recipe.seasonings??[])expect(ACTIONS.some(a=>a.locationId==='convenience_store'&&a.itemId===seasoning&&isFacilityProduct(a))).toBe(true);}
  });
  it('正常购物车买米实际扣款、入库，夜间折扣用实价；不够钱和满冰箱不改变资产',()=>{
    const s=createInitialState(32);s.locationId='market';s.player.money=100;s.time.hour=10;s.time.minute=0;
    expect(performShoppingCart(s,[{actionId:'buy_rice_market',quantity:2}]).ok).toBe(true);expect(itemCount(s,'rice')).toBe(2);expect(s.player.money).toBe(92);
    const poor=createInitialState(32);poor.locationId='market';poor.time.hour=21;poor.time.minute=0;poor.player.money=3;
    expect(purchasePriceOf(poor,getAction('buy_rice_market')!)).toBe(3);expect(performShoppingCart(poor,[{actionId:'buy_rice_market',quantity:1}]).ok).toBe(true);expect(poor.player.money).toBe(0);
    poor.player.money=2;const snapshot=JSON.stringify(poor);expect(performShoppingCart(poor,[{actionId:'buy_rice_market',quantity:1}]).ok).toBe(false);expect(JSON.stringify(poor)).toBe(snapshot);
    const full=createInitialState(33);full.player.money=10000;expect(signLease(full,'old_apartment').ok).toBe(true);expect(installFridge(full,'small').ok).toBe(true);full.fridge!.items={egg:FRIDGE_TIERS.small.capacity};full.locationId='market';full.player.money=100;full.time.hour=10;const before=JSON.stringify(full);
    expect(performShoppingCart(full,[{actionId:'buy_rice_market',quantity:1}]).ok).toBe(false);expect(JSON.stringify(full)).toBe(before);expect(cookingItemCount(full,'rice')).toBe(0);
  });
});
it('字幕保留完整组合字符和表情，旧WebView也不会拆坏组合表情',()=>{
  expect(dialogueGlyphs('好👨‍👩‍👧‍👦e\u0301')).toEqual(['好','👨‍👩‍👧‍👦','e\u0301']);
  const original=Object.getOwnPropertyDescriptor(Intl,'Segmenter')!;Object.defineProperty(Intl,'Segmenter',{value:undefined,configurable:true});
  try{expect(dialogueGlyphs('好👨‍👩‍👧‍👦e\u0301👍🏽🇨🇳')).toEqual(['好','👨‍👩‍👧‍👦','e\u0301','👍🏽','🇨🇳']);}finally{Object.defineProperty(Intl,'Segmenter',original);}
});
