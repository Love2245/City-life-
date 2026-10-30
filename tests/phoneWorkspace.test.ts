// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PhoneScreenWorkspace from "../src/components/PhoneScreenWorkspace.svelte";
import JobBoard from "../src/components/layout/JobBoard.svelte";
import ScenePanel from "../src/components/layout/ScenePanel.svelte";
import { createInitialState } from "../src/game/core/state";
import { applyForJob, getJobDef } from "../src/game/core/jobs";
import { gameDay } from "../src/game/core/calendar";
import { placeOrder } from "../src/game/core/orders";
import { netWorth } from "../src/game/core/difficulty";
import { getDifficulty } from "../src/game/core/minigame";
import type { Quest } from "../src/game/types";
import { formatMoney } from "../src/lib/format";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { uiState, resolveConfirm } from "../src/stores/uiStore.svelte";
import { addContact, smsContact } from "../src/game/core/contacts";

import {markLoadingCovered,cancelSceneLoading,sceneLoading} from '../src/stores/sceneLoading.svelte';
vi.mock('../src/lib/venueStill',async()=>{
  const {STORE_FACILITIES}=await import('../src/lib/convenienceStore/facilities');
  return{createStoreStill:(_host:HTMLElement,options:any)=>{options.onLabels?.([{id:'checkout',title:'收银台',x:50,y:50,visible:true}]);return{ready:Promise.resolve(),update(){},selectFacility(id:string|null){options.onSelect?.(id?{id,...STORE_FACILITIES[id as keyof typeof STORE_FACILITIES],x:50,y:50,visible:true}:null);},setResolution(){},dispose(){}};}};
});

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({
      finished: Promise.resolve(),
      cancel() {},
      play() {},
      pause() {},
    })) as any;
  }
});

function mountPhone(): HTMLElement {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const component = mount(PhoneScreenWorkspace, { target });
  mounted.push({ component, target });
  flushSync();
  return target;
}

function openApp(target: HTMLElement, label: string): void {
  target.querySelector<HTMLButtonElement>('button[aria-label="转到第 1 页应用"]')?.click();
  flushSync();
  let button: HTMLButtonElement | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    button = [...target.querySelectorAll<HTMLButtonElement>(".phone-home .app")]
      .find(candidate => candidate.querySelector(".a-name")?.textContent?.trim() === label);
    if (button) break;
    const next = target.querySelector<HTMLButtonElement>('button[aria-label="下一页应用"]');
    if (!next || next.disabled) break;
    next.click(); flushSync();
  }
  expect(button, `手机桌面缺少「${label}」入口`).toBeDefined();
  button!.click();
  flushSync();
}

afterEach(() => {
  cancelSceneLoading();
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
  replaceState(createInitialState(1));
  uiState.modal = null;
  uiState.minigamePayload = null;
  if (uiState.confirmRequest) resolveConfirm(false);
});

describe("手机消费与资产 UI 回归", () => {
  it("网约车需从市场下载，直播即使旧档已装也隐藏入口", () => {
    const state = createInitialState(599);
    state.flags.app_live = true;
    replaceState(state);
    const target = mountPhone();
    const homeNames = () => [...target.querySelectorAll(".phone-home .a-name")].map(e => e.textContent?.trim());
    expect(homeNames()).not.toContain("直播");
    expect(homeNames()).not.toContain("网约车");
    openApp(target, "应用市场");
    expect(target.querySelector(".job-list")?.textContent).not.toContain("自媒体直播");
    const ride = [...target.querySelectorAll<HTMLElement>(".job-item")].find(e => e.textContent?.includes("网约车接单"))!;
    expect(ride.textContent).toContain("10 小时");
    ride.querySelector<HTMLButtonElement>(".mini-btn")!.click(); flushSync();
    expect(gameState.flags.app_ride_hailing).toBe(true);
  });
  it("手机桌面显示完整应用网格，小游戏从桌面打开，底栏保留四个常用入口", () => {
    replaceState(createInitialState(600));
    const target = mountPhone();

    const firstPage = [...target.querySelectorAll(".phone-home .app")].map(button => button.getAttribute("aria-label"));
    expect(firstPage).toHaveLength(8);
    expect(firstPage).not.toContain("手机游戏");
    target.querySelector<HTMLButtonElement>('button[aria-label="下一页应用"]')!.click(); flushSync();
    expect(target.querySelector(".phone-home")?.getAttribute("data-desktop-page")).toBe("2");
    const secondPage = [...target.querySelectorAll(".phone-home .app")].map(button => button.getAttribute("aria-label"));
    const desktopApps = [...firstPage, ...secondPage];
    expect(firstPage[1]).toBe("招聘");
    expect(desktopApps).not.toContain("Moments");expect(desktopApps).not.toContain("朋友圈");
    expect(desktopApps.filter(name=>name==="招聘")).toHaveLength(1);
    expect(desktopApps).toEqual(expect.arrayContaining(["消息与通话", "待办", "资产", "关系", "招聘", "学习", "手机游戏", "应用市场"]));
    expect(new Set(desktopApps).size).toBe(desktopApps.length);
    expect(target.querySelector(".p-camera")).not.toBeNull();
    expect(target.querySelector(".home-indicator")).not.toBeNull();
    expect(target.querySelectorAll(".p-dock .dock-btn")).toHaveLength(4);
    expect(target.querySelector(".p-dock")?.textContent).not.toContain("🎮");
    openApp(target, "手机游戏");
    expect(target.querySelector(".page-title")?.textContent).toContain("手机游戏");
  });

  it("手机桌面支持手指横向滑动翻页", () => {
    replaceState(createInitialState(601));
    const target = mountPhone();
    const home = target.querySelector<HTMLElement>(".phone-home")!;
    const firstApp = home.querySelector<HTMLElement>(".app")!;
    const dispatchPointer = (type: "pointerdown" | "pointerup", x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: x }, clientY: { value: 120 }, pointerType: { value: "touch" },
        pointerId: { value: 7 }, button: { value: 0 },
      });
      firstApp.dispatchEvent(event);
    };

    expect(home.dataset.desktopPage).toBe("1");
    dispatchPointer("pointerdown", 260);
    dispatchPointer("pointerup", 170);
    flushSync();
    expect(home.dataset.desktopPage).toBe("2");
  });

  it("更新日志默认只显示最新三条，其余可以展开再收起", () => {
    replaceState(createInitialState(6001));
    const target = mountPhone();
    openApp(target, "设置");

    expect(target.querySelectorAll(".cl-entry")).toHaveLength(3);
    const toggle = target.querySelector<HTMLButtonElement>(".changelog-toggle")!;
    expect(toggle.textContent).toContain("展开历史更新");
    toggle.click();
    flushSync();
    expect(target.querySelectorAll(".cl-entry").length).toBeGreaterThan(3);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    flushSync();
    expect(target.querySelectorAll(".cl-entry")).toHaveLength(3);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("设置页的小游戏难度选择会写入存档并立即生效", () => {
    replaceState(createInitialState(6002));
    const target = mountPhone();
    openApp(target, "设置");

    const select = target.querySelector<HTMLSelectElement>(".difficulty-row select")!;
    expect(select.value).toBe("normal");
    select.value = "hard";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(getDifficulty(gameState)).toBe("hard");
    expect(gameState.flags["difficulty_tier"]).toBe(2);
    expect(target.querySelector<HTMLSelectElement>(".difficulty-row select")?.value).toBe("hard");
  });

  it("手机贪吃蛇切到后台暂停，离开游戏后清除计时器", async () => {
    const state = createInitialState(603);
    state.flags.app_game_snake = true;
    replaceState(state);
    const target = mountPhone();
    openApp(target, "手机游戏");
    const snakeApp = [...target.querySelectorAll<HTMLButtonElement>(".job-item")]
      .find((button) => button.textContent?.includes("贪吃蛇"));
    expect(snakeApp).toBeDefined();
    snakeApp!.click();
    flushSync();

    const descriptor = Object.getOwnPropertyDescriptor(document, "hidden");
    vi.useFakeTimers();
    try {
      document.querySelector<HTMLButtonElement>(".sn-head .sn-btn")!.click();
      await vi.advanceTimersByTimeAsync(420);
      flushSync();
      const head = () => document.querySelector<HTMLElement>(".sn-cell.head")!;
      const position = () => [
        [...head().parentElement!.children].indexOf(head()),
        [...head().parentElement!.parentElement!.children].indexOf(head().parentElement!),
      ].join(",");
      const beforeBackground = position();

      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      flushSync();
      await vi.advanceTimersByTimeAsync(700);
      flushSync();
      expect(position()).toBe(beforeBackground);

      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
      flushSync();
      await vi.advanceTimersByTimeAsync(280);
      flushSync();
      expect(position()).not.toBe(beforeBackground);

      document.querySelector<HTMLButtonElement>('button[aria-label="返回手机游戏列表"]')!.click();
      flushSync();
      expect(document.querySelector(".sn-board")).toBeNull();
      await vi.advanceTimersByTimeAsync(700);
      expect(document.querySelector(".sn-board")).toBeNull();
    } finally {
      vi.useRealTimers();
      if (descriptor) Object.defineProperty(document, "hidden", descriptor);
      else delete (document as Document & { hidden?: boolean }).hidden;
    }
  });

  it("联系人聊天使用具体话题，已送达的自动回复不再产生未读提醒", () => {
    const state = createInitialState(6002);
    expect(smsContact(state, "parent_mother", "family_news").ok).toBe(true);
    replaceState(state);
    const target = mountPhone();
    openApp(target, "消息与通话");

    expect(target.textContent).not.toContain("积极");
    expect(target.textContent).not.toContain("平淡");
    expect(target.querySelectorAll(".sms-item")).toHaveLength(1);
    target.querySelector<HTMLButtonElement>(".sms-item")!.click();
    flushSync();

    target.querySelector<HTMLButtonElement>(".composer-toggle")!.click(); flushSync();
    const topicButtons = [...target.querySelectorAll<HTMLButtonElement>(".wc-topic")];
    expect(topicButtons.map((button) => button.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining("问问家里近况"),
      expect.stringContaining("说说最近工作"),
      expect.stringContaining("提醒对方保重身体"),
    ]));
    expect(target.textContent).not.toContain("收到后回复");
  });

  it("通讯录中新会话发送后立即显示双方消息，稳定会话键仍可通话", () => {
    replaceState(createInitialState(6003));
    const target = mountPhone();
    openApp(target, "消息与通话");
    [...target.querySelectorAll<HTMLButtonElement>(".wc-tab")]
      .find(button => button.textContent?.includes("通讯录"))!.click();
    flushSync();
    target.querySelector<HTMLButtonElement>('.addr-item button[aria-label="打开与妈妈的会话"]')!.click();
    flushSync();
    expect(target.querySelector(".social-chat-bar strong")?.textContent).toBe("妈妈");
    expect(target.textContent).toContain("还没有消息");
    target.querySelector<HTMLButtonElement>(".composer-toggle")!.click(); flushSync();
    target.querySelector<HTMLButtonElement>(".wc-topic")!.click();
    flushSync();
    expect(target.querySelectorAll(".wc-bubble")).toHaveLength(2);
    expect(target.textContent).not.toContain("还没有消息");
    const moodAfterFirst = gameState.player.attrs.mood;
    target.querySelector<HTMLButtonElement>(".wc-topic")!.click();
    flushSync();
    expect(target.querySelectorAll(".wc-bubble")).toHaveLength(4);
    expect(gameState.player.attrs.mood).toBe(moodAfterFirst);
    target.querySelector<HTMLButtonElement>(".wc-call")!.click();
    flushSync();
    expect(gameState.flags.call_parent_mother_day).toBe(gameDay(gameState.time));
  });

  it("通讯录只显示已认识的人，并可按身份、最近联系和搜索筛选", () => {
    replaceState(createInitialState(60031));
    const target = mountPhone();
    openApp(target, "消息与通话");
    [...target.querySelectorAll<HTMLButtonElement>(".wc-tab")]
      .find(button => button.textContent?.includes("通讯录"))!.click();
    flushSync();

    expect(target.querySelectorAll(".addr-item")).toHaveLength(2);
    expect(target.querySelector(".addr-list")?.textContent).toContain("妈妈");
    expect(target.querySelector(".addr-list")?.textContent).toContain("爸爸");
    expect(target.querySelector(".addr-list")?.textContent).not.toContain("棋摊大爷");
    expect(target.querySelector(".addr-explainer")?.textContent).toContain("已经认识");

    addContact(gameState, "cafe_clerk");
    flushSync();
    expect(target.querySelectorAll(".addr-item")).toHaveLength(3);
    expect(target.querySelector(".addr-list")?.textContent).toContain("咖啡店店员");

    target.querySelector<HTMLInputElement>(".addr-search")!.value = "咖啡";
    target.querySelector<HTMLInputElement>(".addr-search")!.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(target.querySelectorAll(".addr-item")).toHaveLength(1);
    expect(target.querySelector(".addr-item")?.textContent).toContain("咖啡店店员");

    target.querySelector<HTMLInputElement>(".addr-search")!.value = "";
    target.querySelector<HTMLInputElement>(".addr-search")!.dispatchEvent(new Event("input", { bubbles: true }));
    [...target.querySelectorAll<HTMLButtonElement>(".addr-filter")]
      .find(button => button.textContent?.trim() === "最近联系")!.click();
    flushSync();
    expect(target.querySelectorAll(".addr-item").length).toBeGreaterThan(0);
    expect(target.querySelector(".addr-list")?.textContent).toContain("咖啡店店员");
    expect(target.querySelector(".addr-list")?.textContent).not.toContain("爸爸");
  });

  it("净资产显示现金加投资组合当前市值", () => {
    const state = createInitialState(601);
    state.player.money = 1234;
    state.economy.investments.push({
      id: "inv_phone_ui",
      productId: "deposit_1m",
      principal: 500,
      value: 650,
      boughtDay: 0,
    });
    replaceState(state);
    const target = mountPhone();

    openApp(target, "资产");

    expect(target.querySelector(".ast-cash")?.textContent).toContain("现金 + 投资市值");
    expect(target.querySelector(".ast-net-value")?.textContent).toContain(formatMoney(netWorth(gameState)));
    expect(target.querySelector(".ast-net-value")?.textContent).toContain(formatMoney(1884));
  });

  it("手机不再展示或安装消费软件，已有订单仍能从资产领取", () => {
    const state = createInitialState(602);
    state.player.money = 10000;
    state.flags.app_takeout = true;
    state.flags.app_shop = true;
    expect(placeOrder(state, { kind: "takeout", itemId: "farm_milk", price: 10, etaDays: 0 }).ok).toBe(true);
    expect(placeOrder(state, { kind: "shop", itemId: "shirt", price: 150, etaDays: 3 }).ok).toBe(true);
    replaceState(state);
    const target = mountPhone();
    openApp(target, "应用市场");
    expect(target.textContent).not.toContain("外卖到家");
    expect(target.textContent).not.toContain("网购商城");
    target.querySelector<HTMLButtonElement>(".back")!.click(); flushSync();
    for (let index = 0; index < 2; index++) {
      expect(target.querySelector(".phone-home")?.textContent).not.toMatch(/外卖到家|网购商城/);
      target.querySelector<HTMLButtonElement>('button[aria-label="下一页应用"]')!.click(); flushSync();
    }
    openApp(target, "资产");
    expect(target.textContent).toContain("待收货订单");
    expect(target.textContent).toContain("配送中");
    const claim = [...target.querySelectorAll<HTMLButtonElement>(".mini-btn")].find(button => button.textContent === "领取（入包）")!;
    claim.click(); flushSync();
    expect(gameState.orders).toHaveLength(1);
    expect(gameState.inventory.farm_milk).toBe(1);
    expect(gameState.orders![0].itemId).toBe("shirt");
  });

  it("待办使用一份正式工班次面板，旧预约不重复出现", () => {
    const state = createInitialState(604);
    state.time.day = 3;
    state.time.hour = 7;
    const job = getJobDef("job_factory_qc")!;
    expect(applyForJob(state, job).ok).toBe(true);
    const today = gameDay(state.time);
    const futureShift: Quest = {
      id: `q_${today + 1}_job_factory_qc`,
      type: "job",
      title: "明日班次测试",
      icon: "💼",
      desc: "",
      startHour: 9,
      endHour: 17,
      day: today + 1,
      status: "pending",
      jobId: "job_factory_qc",
    };
    const laterToday: Quest = {
      ...futureShift,
      id: `q_${today}_job_factory_qc`,
      title: "今天稍后的班次测试",
      startHour: 10,
      day: today,
    };
    state.quests = [futureShift, laterToday];
    state.questsGeneratedDay = today;
    state.living.mode = "lease";
    state.living.lease = { housingId: "old_apartment", rent: 900, rentGrowthCount: 0 };
    state.flags.lease_prepaid_month = "2026-08";
    state.flags.lease_first_month_prepaid = true;
    replaceState(state);
    const target = mountPhone();

    openApp(target, "待办");

    expect(target.querySelectorAll(".work-panel")).toHaveLength(1);
    expect(target.textContent).toContain("待发工资");
    expect(target.textContent).toContain("下次发薪");
    expect(target.textContent).not.toContain("明日班次测试");
    expect(target.textContent).not.toContain("今天稍后的班次测试");

    const leaseText = target.querySelector(".commitment-item")?.textContent ?? "";
    expect(leaseText).toContain("30 天后续缴");
    expect(leaseText).toContain("每 30 天 900 元");
    expect(leaseText).not.toContain("免租");
    expect(leaseText).not.toContain("下月");
  });

  it("当前周结岗位招聘卡使用原生禁用，误点后仍留在招聘页", () => {
    const state = createInitialState(605);
    state.career.jobId = "job_factory_qc";
    state.career.kind = "weekly";
    replaceState(state);
    const target = mountPhone();

    openApp(target, "招聘");

    const card = [...target.querySelectorAll<HTMLButtonElement>(".recruit-card")]
      .find((button) => button.querySelector(".recruit-heading")?.textContent?.includes("质检"));
    expect(card).toBeDefined();
    expect(card!.disabled).toBe(true);
    card!.click();
    flushSync();

    expect(target.querySelector(".page-title")?.textContent).toContain("正式工招聘");
    expect(target.querySelector(".work-panel")?.textContent).toContain("质检");
  });

  it("全部正式岗位共用列表，当前岗位不能重复应聘", () => {
    const state = createInitialState(606);
    state.career.jobId = "job_convenience_clerk";
    state.career.kind = "weekly";
    replaceState(state);
    const target = mountPhone();

    openApp(target, "招聘");

    const card = [...target.querySelectorAll<HTMLButtonElement>(".recruit-card")]
      .find((button) => button.querySelector(".recruit-heading")?.textContent?.includes("便利店正式店员"));
    expect(card).toBeDefined();
    expect(card!.disabled).toBe(true);
    expect(card!.textContent).toContain("在职");
    card!.click();
    flushSync();

    expect(target.querySelector(".page-title")?.textContent).toContain("正式工招聘");
    expect(target.textContent).not.toContain("无证书可实习");
  });

  it("未满足技能与证书要求时招聘页会禁用申请", async () => {
    const state = createInitialState(607);
    state.time.day = 3;
    state.time.hour = 7;
    state.player.skills.service = 0;
    delete state.flags.item_certificate;
    replaceState(state);
    const target = mountPhone();
    openApp(target, "招聘");

    const card = [...target.querySelectorAll<HTMLButtonElement>(".recruit-card")]
      .find((button) => button.querySelector(".recruit-heading")?.textContent?.includes("便利店正式店员"));
    expect(card).toBeDefined();
    expect(card!.disabled).toBe(true);
    expect(card!.textContent).toContain("服务技能不足");
    card!.click();
    await Promise.resolve();
    flushSync();

    expect(gameState.career.jobId).toBeNull();
  });

  it("招聘换岗先展示待发工资，确认后一次结清旧岗并入职新岗", async () => {
    const state = createInitialState(610);
    state.time.day = 3;
    state.time.hour = 7;
    state.flags.item_training_cert = true;
    expect(applyForJob(state, getJobDef("job_cafe_staff")!).ok).toBe(true);
    state.career.periodBaseWages = 95;
    state.career.accruedWages = 95;
    state.career.periodScheduled = 1;
    const startingMoney = state.player.money;
    replaceState(state);
    const target = mountPhone();
    openApp(target, "招聘");

    const replacement = [...target.querySelectorAll<HTMLButtonElement>(".recruit-card")]
      .find((button) => button.querySelector(".recruit-heading")?.textContent?.includes("质检员"));
    replacement!.click();
    flushSync();
    expect(uiState.confirmRequest?.message).toContain("待发工资 95 元");
    expect(gameState.career.jobId).toBe("job_cafe_staff");
    resolveConfirm(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    flushSync();
    expect(gameState.career.jobId, uiState.toast ?? "换岗未完成").toBe("job_factory_qc");
    expect(gameState.player.money).toBe(startingMoney + 95);
    expect(gameState.career.accruedWages).toBe(0);
  });

  it("劳务市场日结一键开工后先进入小游戏，不提前领工资", () => {
    const state = createInitialState(608);
    state.locationId = "labor_market";
    state.laborMarket.generatedDay = gameDay(state.time);
    state.laborMarket.offers = [{ uid: "ui_offer", jobId: "job_delivery", quota: 1 }];
    replaceState(state);
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(JobBoard, { target });
    mounted.push({ component, target });
    flushSync();

    expect(target.textContent).toContain("开始工作");
    expect(target.textContent).not.toContain("抢活");
    const before = gameState.player.money;
    const button = [...target.querySelectorAll<HTMLButtonElement>(".job-card button")]
      .find((item) => item.textContent?.includes("开始工作"));
    button!.click();
    flushSync();
    expect(gameState.work?.active?.jobId).toBe("job_delivery");
    expect(gameState.player.money).toBe(before);
    expect(uiState.modal).toBe("minigame");
  });

  it("单位现场早到一键候场，班次只创建一次且不提前发薪", async () => {
    // The new 2D facility menu must preserve the ordinary early-shift journey.
    uiState.sceneMode = '2d';
    const state = createInitialState(609);
    state.time.day = 3;
    state.time.hour = 7;
    state.locationId = "convenience_store";
    state.flags.item_training_cert = true;
    const job = getJobDef("job_convenience_clerk")!;
    expect(applyForJob(state, job).ok).toBe(true);
    replaceState(state);
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(ScenePanel, { target });
    mounted.push({ component, target });
    flushSync();

    await vi.waitFor(()=>expect(sceneLoading.current).not.toBeNull());markLoadingCovered(sceneLoading.current!.id);
    await vi.waitFor(()=>{flushSync();expect(target.querySelector('[data-store-facility="checkout"]')).not.toBeNull();});
    flushSync(()=>target.querySelector<HTMLButtonElement>('[data-store-facility="checkout"]')!.click());
    const card=target.querySelector<HTMLButtonElement>(`[data-store-job="${job.id}"]`);
    expect(card).not.toBeNull();expect(card!.textContent).toContain(job.name);expect(card!.disabled).toBe(false);
    const money = gameState.player.money;
    card!.click();
    flushSync();

    expect(gameState.time.hour).toBe(9);
    expect(gameState.work?.active?.jobId).toBe(job.id);
    expect(gameState.player.money).toBe(money);
    expect(gameState.career.accruedWages).toBe(0);
    expect(uiState.modal).toBe("minigame");
  });
});
