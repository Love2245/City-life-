// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import ScenePanel from "../src/components/layout/ScenePanel.svelte";
import { createInitialState } from "../src/game/core/state";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { setGameMode, setSceneMode, uiState } from "../src/stores/uiStore.svelte";
import { currentResidenceName, selectLodging, signLease } from "../src/game/core/housing";
import { grantTempleStay, grantWorkerDormStay, residenceLocationId, RESIDENCE_TIERS } from "../src/game/core/residence";
import { enterRegion } from "../src/game/core/regions";
import { borrowLibraryBook, borrowedLibraryBook } from "../src/game/core/library";
import * as audio from "../src/lib/audio";
import { addItem } from "../src/game/core/items";
import {HOME_FIXED_IDS} from '../src/game/core/homeInterior';

// The journey and housing actions remain real; the separately tested cover permits lazy scene mounting.
vi.mock('../src/stores/sceneLoading.svelte',()=>({
  sceneLoading:{current:null},
  beginSceneLoading:vi.fn(()=>({id:1,covered:Promise.resolve(true),active:()=>true,ready:vi.fn(),fail:vi.fn(),cancel:vi.fn()})),
  markLoadingCovered:vi.fn(),cancelSceneLoading:vi.fn(),
}));

let component: ReturnType<typeof mount> | undefined;
let target: HTMLDivElement;
beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
  window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as any;
});
beforeEach(() => {
  vi.spyOn(audio, "playSound").mockImplementation(() => {});
  setGameMode("pe");
  // setGameMode('pe') 会把 sceneMode 切成 flat（PE 性能策略）；本组用例验证的是
  // 「从地图进入同一个居家页面」，必须显式指定 3D 场景，否则只会渲染平面场景分支。
  setSceneMode("3d");
  target = document.createElement("div");
  document.body.append(target);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
  uiState.modal = null;
  setGameMode("pc");
  vi.restoreAllMocks();
});
function showScene() {
  component = mount(ScenePanel, { target });
  flushSync();
}

describe("PE 模式真实地图入口与居家页面", () => {
  // 创业孵化基地当前仅展示“敬请期待”，即使旧存档留下租约也不能进入居家页面。
  for (const tier of RESIDENCE_TIERS.filter(tier => tier.id !== "dev_incubator")) {
    it(`${tier.name} 从所在地地图进入同一个居家页面`, async () => {
      const state = createInitialState(951);
      state.time.month = 9;
      state.time.day = 1;
      state.player.money = 999999;
      if (tier.id === "gov") state.living.mode = "gov";
      else if ("buyPrice" in tier) {
        state.living.mode = "own";
        state.living.ownedId = tier.id;
      } else if ("rentGrowthRate" in tier) signLease(state, tier.id);
      else {
        if (tier.id === "camping_lodging") state.locationId = "camping_base";
        if (tier.id === "worker_dorm") {
          state.flags.route_heavy_industry = true;
          state.flags.industrial_dorm_qualified = true;
        }
        if (tier.id === "temple") {
          state.locationId = "temple";
          grantTempleStay(state);
        }
        selectLodging(state, tier.id);
      }
      if (tier.id === "worker_dorm") grantWorkerDormStay(state);
      const formal = state.living.mode === "lease" || state.living.mode === "own";
      const fixedRoom=HOME_FIXED_IDS.has(tier.id),modeledHome=formal||fixedRoom;
      if (modeledHome) addItem(state, "laptop");
      if(fixedRoom){addItem(state,'gym_equipment');addItem(state,'plant');}
      enterRegion(state, tier.region!);
      replaceState(state);
      showScene();
      const pin = target.querySelector<HTMLButtonElement>(`.map-pin[data-location-id="${tier.locationId}"]`);
      expect(pin).not.toBeNull();
      expect(pin!.disabled).toBe(false);
      expect(pin!.classList.contains("home")).toBe(true);
      expect(pin!.textContent).toContain("家在这里");
      expect(pin!.querySelector("svg path")!.getAttribute("d")).toContain("m3 11 9-8");
      pin!.click();
      flushSync();
      expect(gameState.locationId).toBe(tier.locationId);
      expect(gameState.region).toBe(tier.region);
      if (modeledHome) {
        // ScenePanel 用 {#await import('./HomeInterior.svelte')} 懒加载居家页（内含 three.js 依赖），
        // 同步 flushSync 等不到动态 import 落定 —— 有界轮询等到 .home-interior 出现再断言。
        for (let i = 0; i < 100 && !target.querySelector('.home-interior'); i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          flushSync();
        }
        expect(target.querySelector('.home-interior')?.getAttribute('data-home-id')).toBe(tier.id);
        expect(target.querySelector('.home-interior')?.getAttribute('data-home-editable')).toBe(String(formal));
        expect(target.querySelector('.home-address h2')?.textContent).toBe(currentResidenceName(gameState));
        target.querySelector<HTMLButtonElement>('[data-home-object="bed"]')!.click();flushSync();
        expect(target.querySelector('.action-roots')?.textContent).toContain('睡觉');
        if(formal||tier.id==='minsu'){
          target.querySelector<HTMLButtonElement>('[data-home-object="bookshelf"]')!.click();flushSync();
          target.querySelector<HTMLButtonElement>('.action-roots button')!.click();flushSync();
          target.querySelector<HTMLButtonElement>('.action-branch button')!.click();flushSync();
          expect(uiState.modal).toBe('bookshelf');uiState.modal=null;
        }
        if(fixedRoom){
          expect(target.querySelector('[data-home-object="gym"]')).toBeNull();
          expect(target.querySelector('[data-home-object="kitchen"]')).toBeNull();
          target.querySelector<HTMLButtonElement>('.personal-toggle')!.click();flushSync();
          expect(target.querySelector('.personal-fold')!.textContent).not.toMatch(/添置家具|墙面与地面|猫咪/);
          target.querySelector<HTMLButtonElement>('[data-home-object="shower"]')!.click();flushSync();
          target.querySelector<HTMLButtonElement>('.action-roots button')!.click();flushSync();
          const shower=[...target.querySelectorAll<HTMLButtonElement>('.action-branch button')].find(b=>b.textContent?.includes('洗澡'));
          expect(shower).toBeDefined();expect(shower!.disabled).toBe(false);
          expect(target.querySelector('.home-detail')!.textContent).not.toContain('布置与升级');
        }
        target.querySelector<HTMLButtonElement>('[data-home-object="wardrobe"]')!.click();flushSync();
        target.querySelector<HTMLButtonElement>('.action-roots button')!.click();flushSync();
        target.querySelector<HTMLButtonElement>('.action-branch button')!.click();flushSync();
        expect(uiState.modal).toBe('wardrobe');uiState.modal=null;
        target.querySelector<HTMLButtonElement>('[data-home-object="computer"]')!.click();flushSync();
        target.querySelector<HTMLButtonElement>('.action-roots button')!.click();flushSync();
        target.querySelector<HTMLButtonElement>('.action-branch button')!.click();flushSync();
        expect(uiState.modal).toBe('laptop');
      } else {
        expect(target.textContent).toContain("居家功能按住宿设施开放");
        for (const label of ["睡觉", "看看书", "打开衣柜", "使用电脑"]) expect(target.textContent).toContain(label);
      }
    });
  }

  it("寺庙地图标牌和地点列表显示短名称，住处详情保留资格日期", () => {
    const state = createInitialState(956);
    state.locationId = "temple";
    state.region = "suburban_edge";
    grantTempleStay(state);
    expect(selectLodging(state, "temple")).toBe(true);
    expect(enterRegion(state, "suburban_edge").ok).toBe(true);
    replaceState(state);
    showScene();

    const pin = target.querySelector<HTMLButtonElement>('.map-pin[data-location-id="temple"]');
    expect(pin?.querySelector(".pin-name")?.textContent).toBe("寺庙禅房");
    expect(pin?.textContent).not.toContain("可住至");

    const listToggle = [...target.querySelectorAll<HTMLButtonElement>(".list-toggle")]
      .find(button => button.textContent?.includes("地点列表"));
    expect(listToggle).toBeDefined();
    listToggle!.click();
    flushSync();
    const listHome = target.querySelector<HTMLElement>(".atlas-list .list-item.home strong");
    expect(listHome?.textContent).toContain("寺庙禅房");
    expect(listHome?.textContent).not.toContain("可住至");

    pin!.click();
    flushSync();
    expect(target.querySelector(".loc-name")?.textContent).toBe(currentResidenceName(gameState));
    expect(target.querySelector(".loc-name")?.textContent).toContain("可住至");
  });

  it("图书馆的独立还书选项可用且不消耗游戏时间", () => {
    const state = createInitialState(955);
    state.locationId = "library";
    state.region = "downtown_center";
    replaceState(state);
    showScene();

    let returnCard = target.querySelector<HTMLButtonElement>(".library-return-card");
    expect(returnCard).not.toBeNull();
    expect(returnCard!.disabled).toBe(true);
    expect(borrowLibraryBook(gameState, "book_sports").ok).toBe(true);
    flushSync();

    returnCard = target.querySelector<HTMLButtonElement>(".library-return-card");
    expect(returnCard!.disabled).toBe(false);
    expect(returnCard!.textContent).toContain("运动");
    const before = { ...gameState.time };
    returnCard!.click();
    flushSync();

    expect(borrowedLibraryBook(gameState)).toBeUndefined();
    expect(gameState.time).toEqual(before);
    expect(target.querySelector<HTMLButtonElement>(".library-return-card")!.disabled).toBe(true);
  });

  it("未入住青旅仍显示地图和地点列表入口，登记后才显示居家功能", () => {
    const state = createInitialState(952);
    state.player.money = 5000;
    expect(enterRegion(state, "downtown_station").ok).toBe(true);
    replaceState(state);
    showScene();

    expect(target.querySelector('.map-pin[data-location-id="hostel"]')).not.toBeNull();
    const listToggle = [...target.querySelectorAll<HTMLButtonElement>(".list-toggle")]
      .find(button => button.textContent?.includes("地点列表"));
    expect(listToggle).toBeDefined();
    listToggle!.click();
    flushSync();
    const hostelListItem = [...target.querySelectorAll<HTMLButtonElement>(".atlas-list .list-item")]
      .find(button => button.textContent?.includes("青年旅舍"));
    expect(hostelListItem).toBeDefined();
    expect(hostelListItem!.disabled).toBe(false);
    hostelListItem!.click();
    flushSync();

    expect(target.textContent).toContain("尚未入住这里");
    expect(target.textContent).not.toContain("使用电脑");
    const checkIn = [...target.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("入住青年旅舍"));
    expect(checkIn).toBeDefined();
    checkIn!.click();
    flushSync();
    expect(residenceLocationId(gameState)).toBe("hostel");
    expect(target.textContent).not.toContain("尚未入住这里");
    expect(target.textContent).toContain("使用电脑");
    expect(target.textContent).toContain("睡觉");
  });

  it("没有有效租约的旧出租屋说明签约要求，不开放居家功能", () => {
    const state = createInitialState(953);
    state.player.money = 5000;
    signLease(state, "old_apartment");
    signLease(state, "rental_apartment");
    state.locationId = "old_apartment";
    replaceState(state);
    showScene();
    expect(target.textContent).toContain("尚未入住这里");
    expect(target.textContent).toContain("签约普通出租屋");
    expect([...target.querySelectorAll("button")].some(button => button.textContent?.trim() === "睡觉")).toBe(false);
  });
});
