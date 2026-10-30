// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import MainMapView from "../src/components/layout/MainMapView.svelte";
import RegionMapView from "../src/components/layout/RegionMapView.svelte";
import ScenePanel from "../src/components/layout/ScenePanel.svelte";
import IntercityTransitModal from "../src/components/layout/IntercityTransitModal.svelte";
import { createInitialState } from "../src/game/core/state";
import { enterRegion, childrenOf, locationsOfRegion, getRegion } from "../src/game/core/regions";
import { getLocation, moveTo } from "../src/game/core/actions";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { setGameMode, setSceneMode, uiState } from "../src/stores/uiStore.svelte";
import { mapAnchor } from "../src/lib/mapAtlas";
import * as audio from "../src/lib/audio";

// Navigation and fare assertions remain real; overlay paint/timing has its own integration tests.
vi.mock('../src/stores/sceneLoading.svelte',()=>({
  sceneLoading:{current:null},
  beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),
  markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn(),
}));

vi.mock('../src/lib/venueStill',async()=>{
  const {STORE_FACILITIES}=await import('../src/lib/convenienceStore/facilities'),{CAFE_FACILITIES}=await import('../src/lib/cafeRoom/facilities');
  const factory=(definitions:any,id:string)=>(_host:HTMLElement,options:any)=>{options.onLabels?.([{id,title:definitions[id].title,x:50,y:50,visible:true}]);return{ready:Promise.resolve(),update(){},setResolution(){},selectFacility(key:string|null){options.onSelect?.(key?{id:key,...definitions[key],x:50,y:50,visible:true}:null);},dispose(){}};};
  return{createStoreStill:factory(STORE_FACILITIES,'checkout'),createCafeStill:factory(CAFE_FACILITIES,'counter')};
});

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
  window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as any;
});
beforeEach(() => {
  vi.spyOn(audio, "playSound").mockImplementation(() => {});
  setGameMode("pc");
  const state = createInitialState(148);
  state.player.money = 1000;
  state.time.hour = 10;
  state.time.minute = 15;
  replaceState(state);
  target = document.createElement("div");
  document.body.append(target);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
  uiState.modal = null;
  vi.restoreAllMocks();
  setGameMode("pc");
});
function showScene() {
  component = mount(ScenePanel, { target });
  flushSync();
}
function pin(id: string) {
  return target.querySelector<HTMLButtonElement>(`.map-pin[data-location-id="${id}"]`)!;
}

describe("v1.48 开发区地图入口", () => {
  it("泊月夜图加载失败后仍优先回退同一时段底图", () => {
    gameState.time.hour = 21;
    enterRegion(gameState, "boyue");
    component = mount(RegionMapView, { target, props: { parentRegionId: "boyue", onSelect: vi.fn() } });
    flushSync();
    const board = target.querySelector<HTMLElement>('.map-board[data-map-id="boyue"]')!;
    const image = board.querySelector<HTMLImageElement>(".map-image")!;
    expect(image.src).toContain("boyue_night.webp");
    expect(board.dataset.nativeLighting).toBe("true");
    image.dispatchEvent(new Event("error"));
    flushSync();
    expect(image.src).toContain("/atlas/boyue_cloudy-night.webp");
    expect(board.dataset.nativeLighting).toBe("false");
    expect(board.dataset.period).toBe("night");
  });
  it("一级地图有四个可定位的区域，并保留旧地标坐标", () => {
    component = mount(MainMapView, { target });
    flushSync();
    expect([...target.querySelectorAll<HTMLButtonElement>(".map-pin")].map(el => el.dataset.locationId)).toEqual(["downtown", "suburb", "development", "boyue"]);
    expect(mapAnchor("main", "downtown")).toEqual({ x: 43, y: 43 });
    expect(mapAnchor("main", "suburb")).toEqual({ x: 81, y: 37 });
    expect(pin("development").disabled).toBe(false);
    expect([...target.querySelectorAll<HTMLButtonElement>(".map-pin")].every(el => el.classList.contains("cross-region"))).toBe(true);
    expect(pin("development").textContent).toContain("长途地铁");
    expect(pin("development").textContent).toContain("5 元");
  });

  it("一级区域列表中的树堰—伯月巴士说明与售票处一致", () => {
    enterRegion(gameState, "downtown");
    component = mount(RegionMapView, { target, props: { parentRegionId: "downtown", onSelect: vi.fn() } });
    flushSync();
    expect(pin("development").textContent).toContain("长途地铁");
    expect(pin("development").textContent).not.toContain("树堰—伯月巴士直达");
    expect(pin("development").title).toContain("树堰—伯月巴士直达 8 元 / 45 分钟");
    target.querySelector<HTMLButtonElement>(".list-toggle")!.click();
    flushSync();
    const development = [...target.querySelectorAll<HTMLElement>(".list-item")]
      .find(item => item.textContent?.includes("伯月新区"));
    expect(development?.textContent).toContain("树堰—伯月巴士直达 8 元 / 45 分钟");
  });

  for (const top of ["downtown", "suburb", "development", "boyue"]) {
    it(`${top} 总览和列表保留实际道路入口`, () => {
      enterRegion(gameState, top);
      const select = vi.fn();
      component = mount(RegionMapView, { target, props: { parentRegionId: top, onSelect: select } });
      flushSync();
      target.querySelector<HTMLButtonElement>(".list-toggle")!.click();
      flushSync();
      for (const other of ["downtown", "suburb", "development", "boyue"].filter(id => id !== top)) {
        const separated = top === "suburb" && ["development", "boyue"].includes(other)
          || ["development", "boyue"].includes(top) && other === "suburb";
        expect([...target.querySelectorAll<HTMLElement>(".list-item strong")].some(title => title.textContent?.trim().startsWith(getRegion(other)!.name))).toBe(!separated);
        if (separated) expect(target.querySelector(`.map-pin[data-location-id="${other}"]`)).toBeNull();
      }
      if (top === "suburb") {
        expect(pin("downtown").disabled).toBe(true); // 仍需到车站，跨城票务不变。
        return;
      }
      const unlocked = top === "development" ? "downtown" : "development";
      const entry = pin(unlocked) ?? [...target.querySelectorAll<HTMLElement>(".list-item strong")].find(title => title.textContent?.trim().startsWith(getRegion(unlocked)!.name))!.closest<HTMLButtonElement>("button")!;
      expect(entry.disabled).toBe(false);
      entry.click();
      expect(select).toHaveBeenCalledWith(unlocked);
    });
  }

  it("伯月与泊月的八个二级区域、三十三个地图入口都有固定地图锚点", () => {
    const regions = [...childrenOf("development"), ...childrenOf("boyue")];
    expect(childrenOf("development").map(r => r.id)).toEqual(["development_culture", "development_university", "development_reserve"]);
    expect(childrenOf("boyue").map(r => r.id).sort()).toEqual(["boyue_university", "boyue_mall", "boyue_olympic", "boyue_night_market", "development_airport"].sort());
    let facilities = 0;
    for (const region of regions) {
      expect(mapAnchor(region.parent!, region.id)).toBeDefined();
      for (const facility of locationsOfRegion(region.id)) {
        facilities += 1;
        expect(mapAnchor(region.id, facility.id), `${region.id}/${facility.id}`).toBeDefined();
      }
    }
    expect(facilities).toBe(28);
    expect(getLocation("hotel_boyue_quick")).toBeUndefined();
    expect(mapAnchor("development_university", "hotel_boyue_quick")).toBeUndefined();
    expect(mapAnchor("boyue_night_market", "hotel_boyu_nightmarket")).toEqual({ x: 80, y: 28 });
  });

  it("跨一级区域入口在地图标牌和地点列表都有独立样式，两个酒店落在所属区域", () => {
    enterRegion(gameState, "downtown");
    component = mount(RegionMapView, { target, props: { parentRegionId: "downtown", onSelect: vi.fn() } });
    flushSync();
    expect(pin("development").classList.contains("cross-region")).toBe(true);
    target.querySelector<HTMLButtonElement>(".list-toggle")!.click();
    flushSync();
    expect(target.querySelector(".list-item.cross-region")).not.toBeNull();

    unmount(component!);
    component = undefined;
    target.replaceChildren();
    gameState.time.year = 2026;
    gameState.time.month = 10;
    gameState.time.day = 1;
    expect(enterRegion(gameState, "development_university").ok).toBe(true);
    showScene();
    expect(pin("hotel_boyue_quick")).toBeNull();
    expect(pin("campus_teacher").disabled).toBe(true);
    expect(pin("campus_teacher").textContent).toContain("需要学生通行证");
    expect(pin("campus_teacher").textContent).not.toContain("即刻到达");
    target.querySelector<HTMLButtonElement>(".list-toggle")!.click();
    flushSync();
    expect([...target.querySelectorAll<HTMLElement>(".list-item")].some(item => item.textContent?.includes("伯月快捷酒店"))).toBe(false);
    const incubatorEntry = [...target.querySelectorAll<HTMLElement>(".list-item")]
      .find(item => item.textContent?.includes("师范学院"));
    expect(incubatorEntry?.textContent).toContain("需要学生通行证");

    gameState.flags.item_student_pass=true;enterRegion(gameState,"campus_teacher");
    flushSync();
    expect(pin("dev_incubator")).not.toBeNull();
    expect(pin("dev_incubator").classList.contains("home")).toBe(false);
    const listToggle = pin("dev_incubator").closest(".atlas")!.querySelector<HTMLButtonElement>(".list-toggle[aria-expanded]")!;
    if (listToggle.getAttribute("aria-expanded") !== "true") listToggle.click();
    flushSync();
    expect(target.querySelector(".list-item.home")).toBeNull();

    unmount(component!);
    component = undefined;
    target.replaceChildren();
    expect(enterRegion(gameState, "boyue_night_market").ok).toBe(true);
    showScene();
    expect(pin("hotel_boyu_nightmarket")).not.toBeNull();
  });

  it("开发区总览对应A2实图地标，不放置通向紫羊区的道路入口", () => {
    expect(mapAnchor("development", "downtown")).toEqual({ x: 33, y: 19 });
    expect(mapAnchor("development", "development_university")).toEqual({ x: 66, y: 31 });
    expect(mapAnchor("development", "development_reserve")).toEqual({ x: 30, y: 63 });
    expect(mapAnchor("development", "development_culture")).toEqual({ x: 76, y: 56 });
    expect(mapAnchor("development", "development_airport")).toBeUndefined();
    expect(mapAnchor("development", "boyue")).toEqual({ x: 97, y: 37 });
    expect(mapAnchor("development", "suburb")).toBeUndefined();
  });

  it("泊月道路和树堰区边角入口向地图内部展开", () => {
    enterRegion(gameState, "development");
    showScene();
    expect(target.querySelector(".atlas.development-atlas")).not.toBeNull();
    expect(pin("boyue").classList.contains("edge-right")).toBe(true);
    expect(pin("boyue").style.top).toBe("37%");
    expect(pin("boyue").classList.contains("shortcut")).toBe(true);
    expect(pin("downtown").style.left).toBe("33%");
    expect(pin("downtown").style.top).toBe("19%");
  });

  it("二级地图设施对应最终A2放大图的真实入口", () => {
    expect(mapAnchor("development_culture", "dev_museum")).toEqual({ x: 30, y: 32 });
    expect(mapAnchor("development_culture", "dev_science_museum")).toEqual({ x: 72, y: 37 });
    expect(mapAnchor("development_culture", "dev_art_gallery")).toEqual({ x: 68, y: 66 });
    expect(mapAnchor("development_culture", "development_bus_station")).toEqual({ x: 28, y: 65 });
    expect(mapAnchor("development_university", "dev_university")).toEqual({ x: 53, y: 50 });
    expect(mapAnchor("development_university", "dev_food_street")).toEqual({ x: 66, y: 84 });
    expect(mapAnchor("campus_teacher", "dev_incubator")).toEqual({ x: 73, y: 15 });
    expect(mapAnchor("development_reserve", "moon_mountain")).toEqual({ x: 36, y: 17 });
    expect(mapAnchor("development_reserve", "treasure_lake")).toEqual({ x: 50, y: 66 });
    expect(mapAnchor("development_reserve", "camping_base")).toEqual({ x: 70, y: 70 });
  });

  it("机场入口迁到泊月区，直接进入机场并回到当前parent总览", () => {
    enterRegion(gameState, "boyue");
    showScene();
    expect(pin("development_airport").disabled).toBe(true);
    expect(pin("development_airport").textContent).toContain("尚未开放");
    pin("development_airport").click();
    flushSync();
    expect(gameState.locationId).toBe("map");
    expect(gameState.region).toBe("boyue");
  });

  it("旧版隐藏一级图的地图总览仍能从市区乘地铁进入开发区", () => {
    gameState.locationId = "map";
    gameState.region = undefined;
    gameState.navStack = ["map"];
    showScene();
    pin("development").click();
    flushSync();
    expect(gameState.region).toBe("development");
    expect(gameState.player.money).toBe(995);
    expect([gameState.time.hour, gameState.time.minute]).toEqual([11, 15]);
    for (const child of childrenOf("development")) expect(pin(child.id)).not.toBeNull();
  });

  it("无region的地图态按最近区域显示开发区，不回到市区住处", () => {
    gameState.locationId = "map";
    gameState.region = undefined;
    gameState.area = "development_culture";
    gameState.navStack = ["map"];
    showScene();
    expect(target.querySelector(".map-board")?.getAttribute("data-map-id")).toBe("development");
    expect(pin("development_culture")).not.toBeNull();
  });

  it("地图入口仍服从住院禁行", () => {
    enterRegion(gameState, "downtown");
    gameState.flags.hospitalized = true;
    showScene();
    const money = gameState.player.money;
    pin("development").click();
    flushSync();
    expect(gameState.region).toBe("downtown");
    expect(gameState.player.money).toBe(money);
  });

  it("树堰区的伯月入口移到工业园区右下道路", () => {
    expect(mapAnchor("downtown", "development")).toEqual({ x: 91, y: 43 });
    enterRegion(gameState, "downtown");
    showScene();
    expect(pin("development").classList.contains("edge-right")).toBe(true);
  });

  it("泊月总图入口与正式素材的五处区域和左侧道路对齐", () => {
    expect(mapAnchor("boyue", "boyue_university")).toEqual({ x: 29, y: 28 });
    expect(mapAnchor("boyue", "boyue_mall")).toEqual({ x: 74, y: 29 });
    expect(mapAnchor("boyue", "boyue_night_market")).toEqual({ x: 32, y: 56 });
    expect(mapAnchor("boyue", "boyue_olympic")).toEqual({ x: 76, y: 56 });
    expect(mapAnchor("boyue", "development_airport")).toEqual({ x: 56, y: 88 });
    expect(mapAnchor("boyue", "development")).toEqual({ x: 3, y: 36 });
  });

  it("泊月三张二级正式图的十三处入口落在实际设施上", () => {
    const expected: Record<string, Record<string, { x: number; y: number }>> = {
      boyue_university: {
        boyue_engineering_college: { x: 54, y: 65 }, boyue_talent_apartment: { x: 84, y: 24 },
        boyue_food_street: { x: 42, y: 87 }, boyue_internet_cafe: { x: 86, y: 81 },
        boyue_convenience_store: { x: 68, y: 72 },
      },
      boyue_mall: {
        boyue_cafe: { x: 30, y: 34 }, boyue_convenience_store: { x: 36, y: 57 }, boyue_fast_food: { x: 54, y: 54 },
        boyue_gym: { x: 70, y: 35 }, boyue_western_restaurant: { x: 76, y: 48 },
      },
      boyue_olympic: {
        boyue_swimming_pool: { x: 84, y: 74 }, boyue_football_field: { x: 58, y: 37 },
        boyue_basketball_court: { x: 29, y: 73 }, boyue_sports_store: { x: 52, y: 86 },
      },
    };
    for (const [region, facilities] of Object.entries(expected)) {
      for (const [id, anchor] of Object.entries(facilities)) expect(mapAnchor(region, id), `${region}/${id}`).toEqual(anchor);
    }
  });

  it("伯月与泊月一级相邻道路入口免费即刻切换，无长途购票锁定", () => {
    enterRegion(gameState, "development");
    showScene();
    expect(pin("boyue").disabled).toBe(false);
    expect(pin("boyue").textContent).not.toContain("长途");
    pin("boyue").click();
    flushSync();
    expect(gameState.region).toBe("boyue");
    expect(gameState.player.money).toBe(1000);
    expect([gameState.time.hour, gameState.time.minute]).toEqual([10, 15]);
    expect(pin("development").disabled).toBe(false);
    pin("development").click();
    flushSync();
    expect(gameState.region).toBe("development");
    expect(gameState.player.money).toBe(1000);
  });

  it("两座大学城显示各自的学院名称", () => {
    gameState.time.month = 9; gameState.time.day = 1;
    expect(getRegion("campus_teacher")?.name).toBe("师范学院");
    expect(getRegion("campus_engineering")?.name).toBe("工程学院");
    enterRegion(gameState, "development_university");
    showScene();
    expect(pin("campus_teacher").textContent).toContain("师范学院");
    expect(pin("campus_teacher").disabled).toBe(true);
    expect(pin("campus_teacher").textContent).toContain("需要学生通行证");
    expect(pin("campus_teacher").textContent).not.toContain("即刻到达");
    enterRegion(gameState, "boyue_university");
    flushSync();
    expect(pin("campus_engineering").textContent).toContain("工程学院");
    expect(pin("campus_engineering").disabled).toBe(true);
    expect(pin("campus_engineering").textContent).toContain("需要学生通行证");
  });
});

describe("泊月夜市营业与隐藏入口", () => {
  it("同构昼夜地图的六处设施标牌落在各自建筑或喷泉入口", () => {
    const expected = {
      boyue_nightclub: { x: 50, y: 41 }, boyue_snack_street: { x: 24, y: 56 }, boyue_arcade: { x: 76, y: 47 },
      boyue_bathhouse: { x: 22, y: 26 },
      boyue_lounge_bar: { x: 78, y: 78 }, boyue_texas_shop: { x: 37, y: 65 },
    };
    for (const [id, anchor] of Object.entries(expected)) expect(mapAnchor("boyue_night_market", id), id).toEqual(anchor);
  });

  it("周末夜间显示德州小店，图标与地点列表均可进入", () => {
    gameState.time.day = 1; // 游戏日历：2026-08-01 为周六。
    gameState.time.hour = 20;
    enterRegion(gameState, "boyue_night_market");
    showScene();
    expect(pin("boyue_texas_shop").disabled).toBe(false);
    target.querySelector<HTMLButtonElement>(".list-toggle")!.click();
    flushSync();
    expect([...target.querySelectorAll(".list-item")].some(item => item.textContent?.includes("德州小店"))).toBe(true);
    pin("boyue_texas_shop").click();
    flushSync();
    expect(gameState.locationId).toBe("boyue_texas_shop");
  });

  for (const [day, hour, scenario] of [[3, 20, "工作日夜间"], [1, 10, "周末白天"]] as const) {
    it(`${scenario} 完全隐藏德州入口并拒绝闭店进入`, () => {
      gameState.time.day = day;
      gameState.time.hour = hour;
      enterRegion(gameState, "boyue_night_market");
      showScene();
      expect(pin("boyue_texas_shop")).toBeNull();
      target.querySelector<HTMLButtonElement>(".list-toggle")!.click();
      flushSync();
      expect([...target.querySelectorAll(".list-item")].some(item => item.textContent?.includes("德州小店"))).toBe(false);
      const money = gameState.player.money;
      expect(moveTo(gameState, "boyue_texas_shop").ok).toBe(false);
      expect(gameState.locationId).toBe("map");
      expect(gameState.player.money).toBe(money);
    });
  }

  it("白天夜总会与清吧禁用并显示18点营业提示，其余店铺保持可达", () => {
    gameState.time.hour = 10;
    enterRegion(gameState, "boyue_night_market");
    showScene();
    for (const id of ["boyue_nightclub", "boyue_lounge_bar"]) {
      expect(pin(id).disabled).toBe(true);
      expect(pin(id).querySelector(".pin-disabled-reason")?.textContent).toContain("18");
    }
    for (const id of ["boyue_snack_street", "boyue_arcade", "boyue_bathhouse"]) expect(pin(id).disabled).toBe(false);
  });
});

describe("伯月与泊月设施和巴士面板", () => {
  const facilityIds = [...childrenOf("development"), ...childrenOf("boyue")].flatMap(region => locationsOfRegion(region.id).map(loc => loc.id));
  for (const id of facilityIds) {
    it(`${id} 展示场景介绍或2D设施服务入口`, async () => {
      setSceneMode("2d");
      const region = [...childrenOf("development"), ...childrenOf("boyue")].find(r => locationsOfRegion(r.id).some(l => l.id === id))!;
      gameState.time.month = 9; gameState.time.day = 5; gameState.time.hour = 20;
      enterRegion(gameState, region.id);
      gameState.locationId = id;
      showScene();
      if(id==='boyue_cafe'||id==='boyue_convenience_store'){
        const venue=id==='boyue_cafe'?'cafe':'store',facility=venue==='cafe'?'counter':'checkout';
        await vi.waitFor(()=>{flushSync();expect(target.querySelector(`[data-${venue}-facility="${facility}"]`)).not.toBeNull();});
        expect(target.querySelector('.loc-card')).toBeNull();expect(target.querySelector(`[data-${venue}-exit]`)).not.toBeNull();
        flushSync(()=>target.querySelector<HTMLButtonElement>(`[data-${venue}-facility="${facility}"]`)!.click());
        expect(target.querySelector(`[data-${venue}-selected="${facility}"]`)).not.toBeNull();
      }else{
        expect(target.querySelector(".loc-desc")?.textContent?.trim().length).toBeGreaterThan(5);
        expect(target.querySelector(".exit-chip")).not.toBeNull();
      }
      expect(target.querySelector(".development-preview")).toBeNull();
    });
  }

  for (const [station, destination, destinationLabel] of [
    ["bus_station", "development_bus_station", "伯月新区巴士站"],
    ["development_bus_station", "bus_station", "巴士站"],
  ]) {
    it(`${station} 打开全网交通，确认目的地后支付并抵达`, async () => {
      enterRegion(gameState, station === "bus_station" ? "downtown_station" : "development_culture");
      gameState.locationId = station;
      showScene();
      const action = [...target.querySelectorAll<HTMLButtonElement>(".action-card")]
        .find(button => button.querySelector(".action-name")?.textContent?.includes("城际交通") || button.querySelector(".action-name")?.textContent?.includes("购买/乘坐城际巴士"));
      expect(action).toBeTruthy();
      action!.click();
      flushSync();
      expect(uiState.modal).toBe("intercity");
      await unmount(component!); component = undefined;
      component = mount(IntercityTransitModal, { target });
      flushSync();
      const destinationButton = [...target.querySelectorAll<HTMLButtonElement>(".destination")]
        .find(button => button.textContent?.includes(destinationLabel));
      expect(destinationButton).toBeTruthy();
      destinationButton!.click();
      flushSync();
      const panel = target.querySelector(".route-card")!;
      expect(panel.textContent).toContain("8 元");
      expect(panel.textContent).toContain("11:00");
      expect(panel.textContent).toContain("45 分钟");
      expect(panel.textContent).toContain("30 分钟");
      expect(panel.textContent).toContain("11:45");
      target.querySelector<HTMLButtonElement>(".actions .primary")!.click();
      flushSync();
      expect(gameState.locationId).toBe(destination);
      expect(gameState.player.money).toBe(992);
      expect([gameState.time.hour, gameState.time.minute]).toEqual([11, 45]);
    });
  }

  it("两侧巴士站都使用树堰—伯月 8 元 / 45 分钟说明", () => {
    expect(getLocation("bus_station")?.desc).toContain("票价 8 元、车程 45 分钟");
    expect(getLocation("development_bus_station")?.desc).toContain("票价 8 元、车程 45 分钟");
  });
});
