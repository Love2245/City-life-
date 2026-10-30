/** Exercise the actual rent, residence and settlement implementations with isolated saves. */
import assert from "node:assert/strict";
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const server = await createServer({ configFile:false, server:{middlewareMode:true,hmr:false,ws:false}, appType:"custom", optimizeDeps:{noDiscovery:true} });
const results = [];
try {
  const {createInitialState} = await server.ssrLoadModule("/src/game/core/state.ts");
  const {signLease, selectLodging, hasFacility, getEffectiveLodging} = await server.ssrLoadModule("/src/game/core/housing.ts");
  const {sleep, sleepSettlement} = await server.ssrLoadModule("/src/game/core/time.ts");
  const {gameDay,linearDay,fromLinearDay} = await server.ssrLoadModule("/src/game/core/calendar.ts");
  const {applyFamily} = await server.ssrLoadModule("/src/game/core/families.ts");
  const {visibleActionsAtLocation} = await server.ssrLoadModule("/src/game/core/actions.ts");
  for(const [id,base,cap] of [["dev_incubator",800,1400],["boyue_talent_apartment",650,1100]]) {
    for(const family of ["ordinary","destitute"]) {
      const s=createInitialState(148); applyFamily(s,family); Object.assign(s.time,{month:9,day:1,hour:22,minute:0}); s.locationId=id; s.player.money=100000;
      const prepaid = Math.round(base*(family==="destitute"?.85:1));
      assert(!visibleActionsAtLocation(s,id).some(a=>a.id==="sleep_home")); assert(signLease(s,id).ok);
      assert.equal(s.player.money,100000-prepaid); assert.equal(s.living.lease.nextRentDay,gameDay(s.time)+30); assert(visibleActionsAtLocation(s,id).some(a=>a.id==="sleep_home"));
      const startLinear=linearDay(s.time), rents=[];
      for(let n=1;n<=14;n++) {
        Object.assign(s.time,fromLinearDay(startLinear+n*30),{hour:22,minute:0}); s.time.stayedUp=false;
        // This probe jumps the calendar directly; mirror advanceHours' day rollover cleanup.
        delete s.flags.settledToday; delete s.flags.collapseSettledToday;
        s.player.attrs.health=100;s.player.attrs.satiety=100;s.player.attrs.mood=100;s.player.hungryStreak=0;s.flags.ateToday=true;
        const previous=s.living.lease.rent, cash=s.player.money; sleepSettlement(s,{stayedUp:false,hours:8});
        assert.equal(s.player.money,cash-previous); assert(s.living.lease.rent<=cap);assert(s.living.lease.rentGrowthCount<=12);rents.push(s.living.lease.rent);
        const once=s.player.money; sleepSettlement(s,{stayedUp:false,hours:8}); assert.equal(s.player.money,once);
      }
      assert.equal(rents[12],rents[13]);results.push({id,family,prepaid,rents,cap,growthCount:s.living.lease.rentGrowthCount,repeatSettlementCharged:false});
    }
  }
  const s=createInitialState(148);Object.assign(s.time,{month:9,day:1,hour:22,minute:0});s.player.money=5000; assert(signLease(s,"dev_incubator").ok);
  const lease=JSON.stringify(s.living.lease);s.locationId="camping_base";s.region="development_reserve";s.area=s.region;s.weather={id:"coldwave",lastRollDay:gameDay(s.time)};
  assert(selectLodging(s,"camping_lodging"));assert.equal(getEffectiveLodging(s).recovery,.70);assert(hasFacility(s,"shower"));assert(!hasFacility(s,"cook"));
  const money=s.player.money;sleep(s,8);assert.equal(s.player.money,money-39);assert.equal(JSON.stringify(s.living.lease),lease);assert.equal(s.time.hour,6);assert.equal(s.locationId,"camping_base");
  results.push({campingColdWeatherFee:39,normalFee:30,recovery:.70,originalLeasePreserved:true,crossMidnight:true,cooking:false});
} finally {await server.close();}
mkdirSync(resolve("artifacts/v1.48/district-services"),{recursive:true});writeFileSync(resolve("artifacts/v1.48/district-services/housing-verification.json"),JSON.stringify(results,null,2));console.log(`PASS: ${results.length} isolated housing cases`);
