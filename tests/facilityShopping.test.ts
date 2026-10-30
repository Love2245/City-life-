import {describe,it,expect} from 'vitest';
import {createInitialState} from '../src/game/core/state';
import {performShoppingCart,purchasePriceOf,getAction,facilityPurchaseCheck} from '../src/game/core/actions';
import {itemCount,addItem} from '../src/game/core/items';
import {signLease} from '../src/game/core/housing';
import {installFridge,FRIDGE_TIERS} from '../src/game/core/fridge';

function shopper(locationId='convenience_store',money=10000){const s=createInitialState(781);s.locationId=locationId;s.time.hour=10;s.time.minute=15;s.player.money=money;return s;}
const minutes=(s:ReturnType<typeof shopper>)=>s.time.hour*60+s.time.minute;
describe('facility shopping atomic checkout',()=>{
  it('preserves dining in as one shared meal and leaves uncooked ingredients for home',()=>{
    const s=shopper(),satiety=s.player.attrs.satiety,start=minutes(s);const r=performShoppingCart(s,[{actionId:'buy_lunch_convenience',quantity:1},{actionId:'buy_drink_convenience',quantity:1},{actionId:'buy_salt_convenience',quantity:1}],{dine:'eat'});expect(r.ok,r.reason).toBe(true);expect(minutes(s)-start).toBe(45);expect(s.player.attrs.satiety).toBeGreaterThan(satiety);expect(itemCount(s,'bento')).toBe(0);expect(itemCount(s,'drink')).toBe(0);expect(itemCount(s,'salt')).toBe(1);
  });
  it('packs convenience foods in the requested quantities without consuming time or eating them',()=>{
    const s=shopper(),before=minutes(s),satiety=s.player.attrs.satiety,money=s.player.money;
    const r=performShoppingCart(s,[{actionId:'buy_lunch_convenience',quantity:2},{actionId:'buy_drink_convenience',quantity:3}]);
    expect(r.ok,r.reason).toBe(true);expect(minutes(s)).toBe(before);expect(s.player.attrs.satiety).toBe(satiety);expect(itemCount(s,'bento')).toBe(2);expect(itemCount(s,'drink')).toBe(3);expect(s.player.money).toBe(money-33);expect(r.result?.deltas.find(d=>d.key==='money')?.value).toBe(-33);
  });
  it('combines foods and seasonings into one 15-minute trip, including the second convenience store',()=>{
    for(const location of ['convenience_store','boyue_convenience_store']){const s=shopper(location),before=minutes(s),prefix=location.startsWith('boyue')?'boyue_':'';const r=performShoppingCart(s,[{actionId:prefix+'buy_salt_convenience',quantity:4},{actionId:prefix+'buy_sugar_convenience',quantity:2},{actionId:prefix+'buy_lunch_convenience',quantity:1}]);expect(r.ok,r.reason).toBe(true);expect(minutes(s)-before).toBe(15);expect(r.result?.duration).toBe(.25);expect(itemCount(s,'salt')).toBe(4);expect(itemCount(s,'sugar')).toBe(2);}
  });
  it('rejects invalid quantities, foreign stores and competing equipment tiers without mutation',()=>{
    for(const lines of [[{actionId:'buy_salt_convenience',quantity:0}],[{actionId:'buy_salt_convenience',quantity:1.2}],[{actionId:'buy_salt_convenience',quantity:100}],[{actionId:'buy_salt_convenience',quantity:99},{actionId:'buy_sugar_convenience',quantity:1}],[{actionId:'buy_fruit_market',quantity:1}]]){const s=shopper(),before=JSON.stringify(s);expect(performShoppingCart(s,lines).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
    const s=shopper('electronics_store'),before=JSON.stringify(s);expect(performShoppingCart(s,[{actionId:'buy_laptop_mid',quantity:1},{actionId:'buy_laptop_pro',quantity:1}]).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);
  });
  it('rolls the whole transaction back when a later quantity is unaffordable or the fridge fills',()=>{
    const poor=shopper('convenience_store',15),before=JSON.stringify(poor);expect(performShoppingCart(poor,[{actionId:'buy_drink_convenience',quantity:1},{actionId:'buy_lunch_convenience',quantity:2}]).ok).toBe(false);expect(JSON.stringify(poor)).toBe(before);
    const s=shopper();signLease(s,'old_apartment');installFridge(s,'small');s.locationId='convenience_store';s.fridge!.items={salt:FRIDGE_TIERS.small.capacity-1};const snapshot=JSON.stringify(s);expect(performShoppingCart(s,[{actionId:'buy_salt_convenience',quantity:2}]).ok).toBe(false);expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('keeps grocery-trip duration rules and the old string-ID deduplication contract',()=>{
    const s=shopper('market'),start=minutes(s);expect(performShoppingCart(s,[{actionId:'buy_cabbage_market',quantity:3}]).ok).toBe(true);expect(minutes(s)-start).toBe(60);expect(itemCount(s,'cabbage')).toBe(3);
    const legacy=shopper('market');expect(performShoppingCart(legacy,['buy_fruit_market','buy_fruit_market']).ok).toBe(true);expect(itemCount(legacy,'fruit')).toBe(1);
  });
  it('uses actual fridge upgrade differences, preserves ingredients and combines installation time once',()=>{
    const s=shopper();signLease(s,'old_apartment');installFridge(s,'small');s.fridge!.items={carrot:2};s.locationId='furniture_store';const start=minutes(s),money=s.player.money;expect(purchasePriceOf(s,getAction('buy_fridge_medium')!)).toBe(400);
    const r=performShoppingCart(s,[{actionId:'buy_fridge_medium',quantity:1},{actionId:'buy_lamp',quantity:1}]);expect(r.ok,r.reason).toBe(true);expect(s.player.money).toBe(money-1000);expect(s.fridge!.tier).toBe('medium');expect(s.fridge!.items.carrot).toBe(2);expect(minutes(s)-start).toBe(60);expect(facilityPurchaseCheck(s,getAction('buy_fridge_small')!).ok).toBe(false);
  });
  it('treats bait quantities as purchased buckets and refuses duplicate durable goods',()=>{
    const s=shopper('camping_base');s.region='boyue_camping';const r=performShoppingCart(s,[{actionId:'buy_fishing_bait',quantity:2}]);expect(r.ok,r.reason).toBe(true);expect(itemCount(s,'fishing_bait')).toBe(50);
    const e=shopper('electronics_store');addItem(e,'camera');const before=JSON.stringify(e);expect(performShoppingCart(e,[{actionId:'buy_camera',quantity:1}]).ok).toBe(false);expect(JSON.stringify(e)).toBe(before);
  });
});
