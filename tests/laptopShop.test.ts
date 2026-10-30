// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import LaptopDesktopView from "../src/components/layout/LaptopDesktopView.svelte";
import ShoppingWorkspace from "../src/components/ShoppingWorkspace.svelte";
import { createInitialState } from "../src/game/core/state";
import { getShopItemPrices } from "../src/game/core/shop";
import { installLaptopApp } from "../src/game/core/apps";
import { PROGRAMMING_PASSIVE_CAP } from "../src/game/core/projects";
import { formatMoney } from "../src/lib/format";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
  replaceState(createInitialState(1));
});

describe("笔记本网购商城价格", () => {
  it("展示按当前物价计算的价格，并以同一金额下单扣款", () => {
    const state = createInitialState(702);
    state.player.money = 5000;
    state.economy.priceIndex = 1.25;
    installLaptopApp(state, "shop");
    replaceState(state);

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(LaptopDesktopView, { target });
    mounted.push({ component, target });
    flushSync();

    const shopIcon = [...target.querySelectorAll<HTMLButtonElement>(".desk-icon")]
      .find((button) => button.textContent?.includes("网购商城"));
    expect(shopIcon).toBeDefined();
    shopIcon!.click();
    flushSync();

    const shirtRow = [...target.querySelectorAll<HTMLElement>(".shop-row")]
      .find((row) => row.querySelector(".shop-name")?.textContent?.includes("衬衫"));
    expect(shirtRow).toBeDefined();
    const expectedPrice = getShopItemPrices(gameState, "shirt")!.price;
    expect(shirtRow!.querySelector(".shop-now")?.textContent).toBe(formatMoney(expectedPrice));

    const before = gameState.player.money;
    shirtRow!.querySelector<HTMLButtonElement>(".mini-btn")!.click();
    flushSync();

    expect(gameState.orders?.[0].price).toBe(expectedPrice);
    expect(gameState.player.money).toBe(before - expectedPrice);
    expect(target.querySelector<HTMLButtonElement>(".shop-tabs button:nth-child(2)")).not.toBeNull();
    target.querySelector<HTMLButtonElement>(".shop-tabs button:nth-child(2)")!.click();
    flushSync();
    expect(target.querySelector(".order-row")?.textContent).toContain("衬衫");
    expect(target.querySelector(".order-status")?.textContent).toContain("配送中");

    // 第二个设备使用同一商城组件与订单状态，不产生副本订单。
    const secondTarget = document.createElement("div");
    document.body.appendChild(secondTarget);
    const secondComponent = mount(ShoppingWorkspace, { target: secondTarget, props: { state: gameState } });
    mounted.push({ component: secondComponent, target: secondTarget });
    flushSync();
    secondTarget.querySelector<HTMLButtonElement>(".shop-tabs button:nth-child(2)")!.click();
    flushSync();
    expect(secondTarget.querySelector(".order-row")?.textContent).toContain("衬衫");
    expect(gameState.orders).toHaveLength(1);
  });

  it("按分类和名称搜索，电脑商城只显示一个已安装图标", () => {
    const state = createInitialState(703);
    installLaptopApp(state, "shop");
    state.flags.app_game_minesweeper = true;
    replaceState(state);
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(LaptopDesktopView, { target });
    mounted.push({ component, target });
    flushSync();

    expect(target.querySelectorAll('.desk-icon[data-app-id="shop"]')).toHaveLength(1);
    expect(target.querySelectorAll('.desk-icon[data-app-id="app_game_minesweeper"]')).toHaveLength(0);
    target.querySelector<HTMLButtonElement>('.desk-icon[data-app-id="shop"]')!.click();
    flushSync();
    const furniture = [...target.querySelectorAll<HTMLButtonElement>(".shop-categories button")]
      .find((button) => button.textContent === "家具")!;
    furniture.click();
    flushSync();
    expect(target.querySelectorAll(".shop-products .shop-row")).toHaveLength(4);
    const search = target.querySelector<HTMLInputElement>('.shop-search input')!;
    search.value = "暖光";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(target.querySelectorAll(".shop-products .shop-row")).toHaveLength(1);
    expect(target.querySelector(".shop-products .shop-row")?.textContent).toContain("暖光灯");
  });

  it("电脑商城隐藏直播，安装网购应用仍独立于手机记录", () => {
    const state = createInitialState(704);
    state.flags.item_laptop = true;
    state.flags.laptop_app_live = true;
    replaceState(state);
    const target = document.createElement("div"); document.body.appendChild(target);
    const component = mount(LaptopDesktopView, { target }); mounted.push({ component, target }); flushSync();
    expect(target.querySelectorAll(".desk-icon")).toHaveLength(5);
    expect(target.querySelector('.desk-icon[data-app-id="live"]')).toBeNull();
    target.querySelector<HTMLButtonElement>('.desk-icon[data-app-id="store"]')!.click(); flushSync();
    expect(target.querySelectorAll(".win-body .shop-row")).toHaveLength(5);
    expect(target.querySelector(".win-body")?.textContent).not.toContain("自媒体直播");
    const row = [...target.querySelectorAll<HTMLElement>(".win-body .shop-row")]
      .find(e => e.querySelector(".shop-name")?.textContent === "网购商城")!;
    row.querySelector<HTMLButtonElement>(".mini-btn")!.click(); flushSync();
    expect(target.querySelectorAll('.desk-icon[data-app-id="shop"]')).toHaveLength(1);
    expect(gameState.flags.app_shop).toBeFalsy();
    expect(gameState.flags.laptop_app_live).toBe(true);
    expect(row.querySelector(".mini-btn")?.textContent?.trim()).toBe("打开");
    row.querySelector<HTMLButtonElement>(".mini-btn")!.click(); flushSync();
    expect(target.querySelector(".win-body .shop-products")).not.toBeNull();
  });

  it("编程工作台显示版税衰减、单项目上线规则和累计上限", () => {
    const state = createInitialState(705);
    installLaptopApp(state, "dev");
    state.career.passiveIncome = 1250;
    replaceState(state);

    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(LaptopDesktopView, { target });
    mounted.push({ component, target });
    flushSync();

    target.querySelector<HTMLButtonElement>('.desk-icon[data-app-id="dev"]')!.click();
    flushSync();
    const royaltyPanel = target.querySelector<HTMLElement>(".royalty-panel")!;
    expect(royaltyPanel.textContent).toContain("1,250");
    expect(royaltyPanel.textContent).toContain("每周减少 10%");
    expect(royaltyPanel.textContent).toContain("每个编程项目只能上线一次");
    expect(royaltyPanel.textContent).toContain("不再增加收益");
    expect(royaltyPanel.textContent).toContain(`${PROGRAMMING_PASSIVE_CAP} 元 / 周`);

    gameState.career.passiveIncome = 1350;
    flushSync();
    expect(royaltyPanel.textContent).toContain("1,350");

    gameState.career.passiveIncome = PROGRAMMING_PASSIVE_CAP + 200;
    flushSync();
    expect(royaltyPanel.querySelector(".royalty-panel-head strong")?.textContent).toContain("1,500");
    expect(royaltyPanel.textContent).toContain("达到上限后，新完成的编程作品不再增加收益");
  });
});
