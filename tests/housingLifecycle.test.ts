import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { selectLodging, signLease, canSleepHere, expireTempleStay } from "../src/game/core/housing";
import { afterTempleVolunteer } from "../src/game/core/religion";
import { isResidenceBuildingVisible, grantTempleStay, hasTempleStay, residenceLocationId, TEMPLE_STAY_UNTIL, RESIDENCE_TIERS, currentResidence, WORKER_DORM_STAY_UNTIL } from "../src/game/core/residence";
import { canPerform, getAction, getLocation, isLocationVisible, isLocationUnlocked, moveTo, visibleActionsAtLocation, actionsAtLocation, performAction } from "../src/game/core/actions";
import { advanceHours, sleep } from "../src/game/core/time";
import { migrateSave } from "../src/game/core/migrate";
import { enterRegion, getRegion, isRegionUnlocked } from "../src/game/core/regions";
import { currentResidenceName } from "../src/game/core/housing";
import { mapAnchor } from "../src/lib/mapAtlas";

const PUBLIC_HOUSING_ENTRIES = [
  ["hostel", "stay_hostel"],
  ["minsu", "stay_minsu"],
  ["old_apartment", "sign_lease_at_residence"],
  ["camping_base", "camping_stay"],
] as const;
const PRIVATE_LEASE_ACTIONS = {
  rental_apartment: "sign_lease_apartment_at_residence",
  suburb_room: "sign_lease_suburb_at_residence",
  boyue_talent_apartment: "sign_lease_boyue_talent_apartment",
} as const;

function temple() {
  const s = createInitialState(); s.living.mode = "nightly";
  s.living.nightly = { lodgingId: "atm" }; s.locationId = "temple";
  s.region = "suburban_edge"; s.time.hour = 12;
  afterTempleVolunteer(s); return s;
}
describe("住宿解锁、共享地址和到期退房", () => {
  it("新局显示全部公共住宿入口，私人产权住房仍按归属隐藏", () => {
    const s = createInitialState();
    s.time.month = 9;
    s.time.day = 1;
    expect(residenceLocationId(s)).toBe("old_apartment");
    expect(isResidenceBuildingVisible(s, "old_apartment")).toBe(true);
    for (const [id, actionId] of PUBLIC_HOUSING_ENTRIES) {
      const action = getAction(actionId)!;
      expect(isResidenceBuildingVisible(s, id), id).toBe(true);
      expect(isLocationVisible(s, id), id).toBe(true);
      expect(isLocationUnlocked(s, getLocation(id)), id).toBe(true);
      expect(actionsAtLocation(id).some((entry) => entry.id === actionId), id).toBe(true);
      s.locationId = id;
      expect(canPerform(s, action), id).toMatchObject({ ok: true });
    }
    for (const id of ["own_old_unit", "own_apartment"]) {
      expect(isResidenceBuildingVisible(s, id), id).toBe(false);
      expect(isLocationVisible(s, id), id).toBe(false);
      expect(isLocationUnlocked(s, getLocation(id)), id).toBe(false);
      expect(moveTo(s, id).ok, id).toBe(false);
      const owned = createInitialState();
      owned.living.mode = "own";
      owned.living.ownedId = id;
      expect(isResidenceBuildingVisible(owned, id), id).toBe(true);
    }
    expect(isResidenceBuildingVisible(s, "temple")).toBe(true);
    expect(isResidenceBuildingVisible(s, "hotel")).toBe(true);
  });
  it("所有独占月租房只在当前签约时显示，历史解锁标记不会泄露旧房源", () => {
    const s = createInitialState();
    s.flags.residence_unlocked_boyue_talent_apartment = true;
    expect(isResidenceBuildingVisible(s, "boyue_talent_apartment")).toBe(false);
    expect(isLocationVisible(s, "boyue_talent_apartment")).toBe(false);
    expect(isLocationUnlocked(s, getLocation("boyue_talent_apartment"))).toBe(false);
    expect(moveTo(s, "boyue_talent_apartment").ok).toBe(false);
    expect(isResidenceBuildingVisible(s,'boyue_talent_apartment')).toBe(false);
    for (const id of ["rental_apartment", "suburb_room"]) {
      s.flags[`residence_unlocked_${id}`] = true;
      expect(isResidenceBuildingVisible(s, id)).toBe(false);
      expect(isLocationVisible(s, id)).toBe(false);
      expect(moveTo(s, id).ok).toBe(false);
      expect(getAction(PRIVATE_LEASE_ACTIONS[id as keyof typeof PRIVATE_LEASE_ACTIONS])?.locationId).toBe("housing_agency");
    }
    s.living.mode = "lease";
    for (const [id, rent] of [["rental_apartment", 2000], ["suburb_room", 800], ["boyue_talent_apartment", 650]] as const) {
      s.living.lease = { housingId: id, rent, rentGrowthCount: 0 };
      expect(isResidenceBuildingVisible(s, id)).toBe(true);
      expect(isLocationVisible(s, id)).toBe(true);
      for (const otherId of ["rental_apartment", "suburb_room"].filter((other) => other !== id)) {
        expect(isResidenceBuildingVisible(s, otherId), `${id} lease should not reveal ${otherId}`).toBe(false);
      }
    }
  });
  it("住宿入口不依赖先登记；付不起房费时登记失败但地点仍可见", () => {
    const s = createInitialState(); s.player.money = 0;
    expect(selectLodging(s, "hostel")).toBe(false);
    expect(isResidenceBuildingVisible(s, "hostel")).toBe(true);
    s.player.money = 100;
    expect(selectLodging(s, "hostel")).toBe(true);
    expect(isResidenceBuildingVisible(s, "hostel")).toBe(true);
  });
  it("居家行动只在当前实际入住的建筑提供", () => {
    const s = createInitialState();
    const sleepHome = getAction("sleep_home")!;
    s.locationId = "hostel";
    expect(visibleActionsAtLocation(s, "hostel").some((action) => action.id === "sleep_home")).toBe(false);
    expect(canPerform(s, sleepHome).ok).toBe(false);
    s.locationId = residenceLocationId(s);
    expect(visibleActionsAtLocation(s, s.locationId).some((action) => action.id === "sleep_home")).toBe(true);
    expect(canPerform(s, sleepHome).ok).toBe(true);
  });
  it.each(["development_university", "boyue_university"])('%s 开局即可进入公共街区，旧档日期不受限制', (id) => {
    const before = createInitialState();
    before.time.month = 8;
    before.time.day = 30;
    expect(isRegionUnlocked(before, getRegion(id))).toBe(true);
    expect(enterRegion(before, id).ok).toBe(true);
    const opened = createInitialState();
    opened.time.month = 9;
    opened.time.day = 1;
    expect(isRegionUnlocked(opened, getRegion(id))).toBe(true);
    expect(enterRegion(opened, id).ok).toBe(true);
  });
  it("旧档 worker_dorm 身份仍沿用原档位 ID，所有展示名称改为工人集体宿舍", () => {
    const legacy = createInitialState();
    legacy.flags.route_heavy_industry = true;
    legacy.flags[WORKER_DORM_STAY_UNTIL] = 100000;
    legacy.living.mode = "nightly";
    legacy.living.nightly = { lodgingId: "worker_dorm" };
    const migrated = migrateSave(legacy);
    expect(migrated.living.nightly?.lodgingId).toBe("worker_dorm");
    expect(currentResidence(migrated).id).toBe("worker_dorm");
    expect(currentResidenceName(migrated)).toContain("工人集体宿舍");
    expect(getLocation("worker_dormitory")?.name).toBe("工人集体宿舍");
    expect(RESIDENCE_TIERS.find((tier) => tier.id === "worker_dorm")?.name).toBe("工人集体宿舍");
  });
  it("政府住宿转普通月租不会换建筑，原位置立即切换居家设施", () => {
    const s = createInitialState(); s.locationId = residenceLocationId(s); s.player.money = 5000;
    const before = residenceLocationId(s); expect(signLease(s, "old_apartment").ok).toBe(true);
    expect(residenceLocationId(s)).toBe(before); expect(canSleepHere(s)).toBe(true);
    expect(visibleActionsAtLocation(s, before).map(a=>a.id)).toContain("sleep_home");
  });
  it("地图渲染沿用住宿地址坐标，快捷酒店按对应地图建筑定位", () => {
    for (const tier of RESIDENCE_TIERS.filter(t => !["hotel_boyue_quick", "hotel_boyu_nightmarket"].includes(t.id))) {
      expect(mapAnchor(tier.region!,tier.locationId!)).toEqual(tier.mapAnchor);
    }
    expect(mapAnchor("development_university", "hotel_boyue_quick")).toBeUndefined();
    expect(mapAnchor("boyue_night_market", "hotel_boyu_nightmarket")).toEqual({ x: 80, y: 28 });
    const gov=RESIDENCE_TIERS.find(t=>t.id==='gov')!;
    const rental=RESIDENCE_TIERS.find(t=>t.id==='old_apartment')!;
    expect(gov.locationId).toBe(rental.locationId); expect(gov.mapAnchor).toEqual(rental.mapAnchor);
  });
  it("历史义工次数不再提供新住宿或无限素斋", () => {
    const s=createInitialState(); s.locationId='temple'; s.time.hour=12; s.flags.temple_volunteered=10;
    expect(selectLodging(s,'temple')).toBe(false);
    expect(canPerform(s,getAction('temple_lodging')!).ok).toBe(false);
    expect(canPerform(s,getAction('temple_vegetarian')!).ok).toBe(false);
  });
  it("义工住宿可住至完成日后第二天结束，等待到期后取消资格", () => {
    const s=temple(); s.time.hour=23; sleep(s,8);
    expect(s.time.hour).toBe(7); expect(canSleepHere(s)).toBe(true);
    advanceHours(s,5); expect(hasTempleStay(s)).toBe(true);
    advanceHours(s,36); expect(hasTempleStay(s)).toBe(false);
    expect(s.living.nightly?.lodgingId).toBe('atm'); expect(s.locationId).toBe('temple');
    expect(canSleepHere(s)).toBe(false); expect(selectLodging(s,'temple')).toBe(false);
  });
  it("重新登记不延长截止时间，隔天再劳动才能续住", () => {
    const s=temple(); const until=s.flags[TEMPLE_STAY_UNTIL];
    expect(selectLodging(s,'temple')).toBe(true); expect(s.flags[TEMPLE_STAY_UNTIL]).toBe(until);
    advanceHours(s,21); afterTempleVolunteer(s);
    expect(s.flags[TEMPLE_STAY_UNTIL]).toBe(Number(until)+1440);
  });
  it("借宿有效期内保留原租约，期限结束后保留人在寺庙，不瞬移", () => {
    const s=createInitialState(); s.player.money=5000; signLease(s,'rental_apartment');
    const lease={...s.living.lease!}; s.locationId='temple'; s.time.hour=12; afterTempleVolunteer(s);
    advanceHours(s,24); expect(s.living.awayNight?.lodgingId).toBe('temple'); expect(s.living.lease).toEqual(lease);
    advanceHours(s,36); expect(s.living.awayNight).toBeNull();
    expect(s.locationId).toBe('temple'); expect(residenceLocationId(s)).toBe('rental_apartment');
  });
  it("旧档仅获得一次退房缓冲，重读不会续期，过期重读立即退房", () => {
    const s=createInitialState();s.living.mode='nightly';s.living.nightly={lodgingId:'temple'};
    const first=migrateSave(s); const until=first.flags[TEMPLE_STAY_UNTIL];
    expect(typeof until).toBe('number'); expect(migrateSave(first).flags[TEMPLE_STAY_UNTIL]).toBe(until);
    first.time.day+=3; const expired=migrateSave(first);
    expect(expired.living.nightly?.lodgingId).toBe('atm'); expect(expired.flags[TEMPLE_STAY_UNTIL]).toBe(until);
  });
  it("重复到期检查不会重复退房日志或授予新资格", () => {
    const s=temple(); advanceHours(s,60); expireTempleStay(s); const n=s.log.length;
    expireTempleStay(s); expireTempleStay(s); expect(s.log.length).toBe(n); expect(hasTempleStay(s)).toBe(false);
  });
  it("已开始的睡眠可以越过资格期限，醒来后再退房", () => {
    const s=temple(); advanceHours(s,59); sleep(s,8);
    expect(s.time.hour).toBe(7); expect(canSleepHere(s)).toBe(false);
    expect(s.living.nightly?.lodgingId).toBe('atm');
  });
  it("义工和素斋的行动入口每日限一次，重复点击不会刷住宿资格", () => {
    const s=createInitialState(); s.locationId='temple';s.time.hour=8;s.player.attrs.stamina=100;
    expect(performAction(s,'temple_volunteer').ok).toBe(true);
    const until=s.flags[TEMPLE_STAY_UNTIL];
    expect(performAction(s,'temple_volunteer').ok).toBe(false);
    expect(s.flags[TEMPLE_STAY_UNTIL]).toBe(until);
    expect(performAction(s,'temple_vegetarian').ok).toBe(true);
    expect(performAction(s,'temple_vegetarian').ok).toBe(false);
  });
  it("傍晚完成义工先登记禅房，不被打烊逻辑赶走", () => {
    const s=createInitialState();s.locationId='temple';s.region='suburban_edge';s.time.hour=14;s.player.attrs.stamina=100;
    expect(performAction(s,'temple_volunteer').ok).toBe(true);
    expect(s.time.hour).toBe(18);expect(s.locationId).toBe('temple');expect(canSleepHere(s)).toBe(true);
  });
});
