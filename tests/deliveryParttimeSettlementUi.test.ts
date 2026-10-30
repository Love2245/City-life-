// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PhoneScreen from "../src/components/PhoneScreen.svelte";
import MiniGameModal from "../src/components/layout/MiniGameModal.svelte";
import GameView from "../src/views/GameView.svelte";
import { createInitialState } from "../src/game/core/state";
import { migrateSave } from "../src/game/core/migrate";
import { moveTo, performAction } from "../src/game/core/actions";
import { completeWork, deliveryOrdersRemaining, deliveryParttime, nowWorkMinute, performJob, takeJobOffer } from "../src/game/core/jobs";
import { gameDay } from "../src/game/core/calendar";
import { getMiniGameConfig, type MiniGameConfig } from "../src/game/core/minigame";
import type { TrafficIncident } from "../src/game/core/deliveryShift";
import type { GameState } from "../src/game/types";
import { loadGame, saveGame } from "../src/lib/save";
import { currentView, gameState, replaceState } from "../src/stores/gameStore.svelte";
import { presentWorkSession, uiState } from "../src/stores/uiStore.svelte";

type HostProps = {
  cfg?: MiniGameConfig;
  sceneKey?: string;
  seed?: number;
  paused?: boolean;
  initialProgress?: unknown;
  onProgress: (snapshot: unknown) => void;
  onPause: () => void;
  onFinish: (ratio: number, completedOrders?: number, final?: boolean, reason?: string, earnedFare?: number) => void;
  onIncident: (incident: TrafficIncident) => void;
};

// The host alone is replaced: its public callbacks still exercise the real phone,
// modal, work session, settlement, serialization, migration and UI stores.
const host = vi.hoisted(() => ({ props: undefined as HostProps | undefined, flush: vi.fn<() => Promise<void>>() }));
vi.mock("../src/components/layout/MiniGameHost.svelte", () => ({
  default: (_anchor: unknown, props: HostProps) => {
    host.props = props;
    return { flushProgress: () => host.flush() };
  },
}));
vi.mock("../src/lib/audio", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/lib/audio")>(), playSound: vi.fn(), unlockAudio: vi.fn(),
}));

const components: Array<ReturnType<typeof mount>> = [];
let phoneTarget: HTMLDivElement, modalTarget: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  host.props = undefined;
  host.flush.mockReset().mockResolvedValue(undefined);
  uiState.modal = null; uiState.modalStack = []; uiState.minigamePayload = null; uiState.resultPayload = null; uiState.workDialogue = null;
  const state = createInitialState(1708);
  state.time.hour = 5; state.time.minute = 0; state.player.money = 1000.18;
  Object.assign(state.player.attrs, { stamina: 100, satiety: 100, hygiene: 100 });
  // A perfect score, fame and certificates must not multiply the displayed fare.
  state.player.stats.fame = 100;
  Object.assign(state.flags, { app_delivery: true, item_tricycle: true, skill_certificate_level: 3, item_training_cert: true });
  replaceState(state); currentView.name = "game";
  phoneTarget = document.createElement("div"); modalTarget = document.createElement("div");
  document.body.append(phoneTarget, modalTarget);
});

afterEach(async () => {
  for (const component of components.splice(0).reverse()) await unmount(component);
  phoneTarget.remove(); modalTarget.remove();
  uiState.modal = null; uiState.modalStack = []; uiState.minigamePayload = null; uiState.resultPayload = null; uiState.workDialogue = null;
  replaceState(createInitialState(1)); currentView.name = "menu";
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function mountPhone() {
  components.push(mount(PhoneScreen, { target: phoneTarget, props: { variant: "panel" } }));
  flushSync();
  phoneTarget.querySelector<HTMLButtonElement>('button[aria-label="下一页应用"]')!.click(); flushSync();
  const app = phoneTarget.querySelector<HTMLButtonElement>('button[aria-label="外卖接单"]');
  expect(app).not.toBeNull(); app!.click(); flushSync();
}
function deliveryButton() { return phoneTarget.querySelector<HTMLButtonElement>("button.big-action")!; }
function mountModal() {
  const component = mount(MiniGameModal, { target: modalTarget });
  components.push(component); flushSync(); expect(host.props).toBeDefined();
  return component;
}
function openPhoneShift() {
  mountPhone(); expect(deliveryButton().disabled).toBe(false);
  deliveryButton().click(); flushSync();
  expect(uiState.modal).toBe("minigame");
  expect(gameState.work?.active).toMatchObject({ jobId: "job_delivery", source: "delivery", workedMinutes: 480, standardMinutes: 480, baseWage: 0, canSkip: false });
  mountModal();
  return host.props!;
}
function snapshot(delivered = 6, earnedFare = 143.27, mode = "playing") {
  return {
    schema: "urban-life-street-dispatch", version: 1, sceneKey: "job_delivery", kind: "food", mode,
    remaining: mode === "end" ? 0 : 71.375, delivered, earnedFare, money: earnedFare,
    trafficFine: 0, gameplayState: 19450392, orderSerial: 8, worldTime: 23.25,
    player: { x: 817.125, y: 524.5, angle: 1.25, speed: 33.5 }, camera: { x: 752.25, y: 514.75 },
    orders: [{ id: 7, status: "delivery", pickup: { x: 510, y: 610 }, dropoff: { x: 1040, y: 780 }, reward: 14, timeLeft: 42.625 }],
    offers: [], clocks: { offer: .325, traffic: 3.75 }, autoAccept: true, autoLimit: 6,
  };
}
function publish(progress: ReturnType<typeof snapshot>) {
  // DeliveryGame publishes a snapshot followed by its nonfinal income callback.
  const props = host.props!;
  props.onProgress(progress);
  props.onFinish(1, progress.delivered, false, "", progress.earnedFare);
  flushSync();
}
function finish(fare = 143.27, orders = 6, reason = "本班时间已到") {
  host.props!.onFinish(1, orders, true, reason, fare); flushSync();
}
function resume() {
  const button = modalTarget.querySelector<HTMLButtonElement>(".mg-pause-primary");
  expect(button).not.toBeNull(); button!.click(); flushSync();
}
async function saveAndExit() {
  const button = [...modalTarget.querySelectorAll<HTMLButtonElement>(".mg-pause-actions button")].find(b => b.textContent?.includes("保存并返回菜单"));
  expect(button).toBeDefined(); button!.click();
  await vi.waitFor(() => expect(currentView.name).toBe("menu")); flushSync();
  return JSON.parse(localStorage.getItem("urban_life_save_auto")!) as GameState;
}
async function restoreSavedModal() {
  for (const component of components.splice(0).reverse()) await unmount(component);
  phoneTarget.innerHTML = ""; modalTarget.innerHTML = "";
  const saved = await loadGame("auto"); expect(saved).not.toBeNull();
  replaceState(saved!); currentView.name = "game";
  presentWorkSession(); mountModal();
  return host.props!;
}
function expectSettled(cashBefore: number, fare = 143.27, orders = 6) {
  expect(gameState.work?.active).toBeUndefined();
  expect(gameState.player.money).toBeCloseTo(cashBefore + fare + 36, 8);
  expect(gameState.time).toMatchObject({ hour: 13, minute: 0 });
  expect(gameState.work?.wageRecords.at(-1)).toMatchObject({ base: fare + 36, total: fare + 36, gameBonus: 0, attendanceBonus: 0 });
  expect(uiState.resultPayload).toMatchObject({ duration: 8 });
  expect(uiState.resultPayload?.deltas).toContainEqual(expect.objectContaining({ key: "money", value: fare + 36 }));
  expect(uiState.resultPayload?.verdict).toContain(`送达 ${orders} 单`);
}

describe("手机兼职配送的实际收入与八小时班次 UI 集成", () => {
  it('提前结束先索取最新送达收入，只结算提成且不重复领取底薪',async()=>{
    const props=openPhoneShift(),cash=gameState.player.money;
    publish(snapshot(2,42.11));await props.onPause();flushSync();
    host.flush.mockImplementation(async()=>{publish(snapshot(3,59.87));});
    modalTarget.querySelector<HTMLButtonElement>('.mg-end-shift')!.click();
    await vi.waitFor(()=>expect(gameState.work?.active).toBeUndefined());flushSync();
    expect(gameState.player.money).toBeCloseTo(cash+59.87,8);expect(uiState.resultPayload?.verdict).toContain('底薪 ¥0 + 订单提成 ¥59.87');
    expect(uiState.resultPayload?.verdict).toContain('提前结束');expect(gameState.work!.wageRecords).toHaveLength(1);
  });
  it('结束时读取进度失败则保留暂停班次，可重新核对后结算',async()=>{
    const props=openPhoneShift(),cash=gameState.player.money;publish(snapshot(2,42.11));await props.onPause();flushSync();
    host.flush.mockRejectedValueOnce(new Error('no snapshot'));modalTarget.querySelector<HTMLButtonElement>('.mg-end-shift')!.click();
    await vi.waitFor(()=>expect(host.flush).toHaveBeenCalledTimes(2));await Promise.resolve();flushSync();
    expect(gameState.work?.active?.status).toBe('paused');expect(gameState.player.money).toBe(cash);
    host.flush.mockResolvedValue(undefined);modalTarget.querySelector<HTMLButtonElement>('.mg-end-shift')!.click();
    await vi.waitFor(()=>expect(gameState.work?.active).toBeUndefined());expect(gameState.player.money).toBeCloseTo(cash+42.11,8);
  });
  it("没有配送车辆时手机说明原因并禁用开班，不消耗今日班次", () => {
    delete gameState.flags.item_tricycle;
    mountPhone();
    expect(deliveryButton().disabled).toBe(true);
    expect(phoneTarget.textContent).toContain("暂无车辆");
    expect(phoneTarget.textContent).toContain("请先购买自行车");
    deliveryButton().click(); flushSync();
    expect(gameState.work?.active).toBeUndefined(); expect(deliveryOrdersRemaining(gameState)).toBe(1);
    const rejected = deliveryParttime(gameState);
    expect(rejected.ok).toBe(false); expect(rejected.reason).toContain("车辆");
    expect(uiState.minigamePayload).toBeNull();
  });

  it("无钱无车的旧班次可从手机提前结算已送订单，读档不重复发钱且可开始其他工作", async () => {
    expect(deliveryParttime(gameState).ok).toBe(true);
    const active = gameState.work!.active!, id = active.id;
    Object.assign(active, { status: 'paused', completedOrders: 3, deliveryEarnedFare: 51.08, minigameProgress: snapshot(3, 51.08) });
    delete gameState.flags.item_tricycle;
    gameState.player.money = 0;
    replaceState(migrateSave(JSON.parse(JSON.stringify(gameState))));
    const beforeMinutes = nowWorkMinute(gameState);
    uiState.modal = 'phone';
    mountPhone();
    expect(deliveryButton().disabled).toBe(true);
    expect(deliveryParttime(gameState)).toMatchObject({ ok: false, reason: expect.stringContaining('车辆') });
    const end = phoneTarget.querySelector<HTMLButtonElement>('[data-end-delivery-without-vehicle]');
    expect(end).not.toBeNull();
    end!.click(); flushSync();
    expect(gameState.work?.active).toBeUndefined();
    expect(gameState.player.money).toBeCloseTo(51.08, 8);
    expect(nowWorkMinute(gameState) - beforeMinutes).toBe(480);
    expect(gameState.work?.wageRecords).toHaveLength(1);
    expect(gameState.work?.wageRecords[0]).toMatchObject({ base: 51.08, total: 51.08 });
    expect(uiState.resultPayload?.verdict).toContain('提前结束');
    expect(uiState.modal).toBe('result');
    expect(uiState.modalStack.at(-1)?.modal).toBe('phone');
    const after = JSON.stringify(gameState);
    end!.click(); flushSync();
    expect(JSON.stringify(gameState)).toBe(after);
    await saveGame('auto', gameState);
    const reloaded = await loadGame('auto');
    expect(reloaded?.work?.active).toBeUndefined();
    expect(reloaded?.player.money).toBeCloseTo(51.08, 8);
    const saved = JSON.stringify(reloaded);
    expect(completeWork(reloaded!, id, 0, false, true).ok).toBe(false);
    expect(JSON.stringify(reloaded)).toBe(saved);
    reloaded!.locationId = 'farm';
    expect(performJob(reloaded!, 'job_farm_hand').ok).toBe(true);
  });

  it("真实手机开班：进度不发钱，六单 143.27 元超过旧单价上限仍足额结算且只记一次", () => {
    const props = openPhoneShift(), cash = gameState.player.money, id = gameState.work!.active!.id;
    expect(phoneTarget.textContent).toContain("8 小时");
    expect(props.cfg).toMatchObject({ type: "delivery", mode: "food", payPerOrder: 22 });
    expect(props.seed).toBe(gameState.work!.active!.seed);
    publish(snapshot());
    expect(gameState.work?.active).toMatchObject({ completedOrders: 6, deliveryEarnedFare: 143.27 });
    expect(gameState.player.money).toBe(cash); expect(gameState.time.hour).toBe(5);
    expect(143.27).toBeGreaterThan(6 * 22);
    finish(); expectSettled(cash);
    expect(gameState.work?.settledIds.filter(savedId => savedId === id)).toHaveLength(1);
    const records = gameState.work!.wageRecords.length;
    finish(); props.onProgress(snapshot());
    expect(gameState.player.money).toBeCloseTo(cash + 179.27, 8);
    expect(gameState.work!.wageRecords).toHaveLength(records);
    expect(deliveryOrdersRemaining(gameState)).toBe(0);
    expect(deliveryButton().disabled).toBe(true);
  });

  it("暂停与结束同帧发生时保留分币收入，只有点击继续才发工资和推进八小时", () => {
    const props = openPhoneShift(), cash = gameState.player.money;
    props.onPause(); flushSync(); expect(props.paused).toBe(true);
    publish(snapshot(6, 143.27, "end")); finish();
    expect(gameState.work?.active).toMatchObject({ status: "paused", completedOrders: 6, deliveryEarnedFare: 143.27 });
    expect(gameState.player.money).toBe(cash); expect(gameState.time.hour).toBe(5);
    expect(uiState.resultPayload).toBeNull();
    resume(); expectSettled(cash);
    finish(); expect(gameState.work?.wageRecords).toHaveLength(1);
  });

  it("暂停保存索取最新快照，JSON 和读档恢复保留真实位置、订单、随机进度与小数收入", async () => {
    const props = openPhoneShift(), cash = gameState.player.money, id = gameState.work!.active!.id, seed = props.seed;
    publish(snapshot(5, 119.08)); await props.onPause(); flushSync();
    expect(host.flush).toHaveBeenCalledTimes(1);
    host.flush.mockClear();
    const latest = snapshot(); latest.remaining = 69.625; latest.player.x = 933.375;
    host.flush.mockImplementation(async () => { publish(latest); });
    const saved = await saveAndExit();
    expect(host.flush).toHaveBeenCalledTimes(1);
    expect(saved.work?.active).toMatchObject({ id, seed, status: "paused", workedMinutes: 480, completedOrders: 6, deliveryEarnedFare: 143.27, minigameProgress: latest });
    expect(saved.player.money).toBe(cash); expect(saved.time.hour).toBe(5);
    latest.player.x = -1; latest.orders[0].timeLeft = 0;
    const restored = await restoreSavedModal();
    expect(restored.paused).toBe(true); expect(restored.seed).toBe(seed);
    expect(restored.initialProgress).toMatchObject({ remaining: 69.625, earnedFare: 143.27, gameplayState: 19450392, player: { x: 933.375 }, orders: [{ timeLeft: 42.625 }] });
    expect(gameState.player.money).toBe(cash);
    resume(); expect(restored.paused).toBe(false); finish(); expectSettled(cash);
  });

  it("暂停后的终局存档读回时仍不提前发钱，恢复终局回调后继续只结算一次", async () => {
    const props = openPhoneShift(), cash = gameState.player.money;
    props.onPause(); flushSync();
    const end = snapshot(6, 143.27, "end");
    publish(end); finish();
    host.flush.mockImplementation(async () => { publish(end); finish(); });
    const saved = await saveAndExit();
    expect(saved.work?.active?.minigameProgress).toEqual(end); expect(saved.player.money).toBe(cash);
    const restored = await restoreSavedModal();
    expect(restored.initialProgress).toEqual(end); expect(restored.paused).toBe(true);
    // A restored runtime re-emits its terminal result; the modal queues it while paused.
    finish(); expect(gameState.player.money).toBe(cash); expect(gameState.work?.active?.status).toBe("paused");
    resume(); expectSettled(cash);
    finish(); expect(gameState.work?.wageRecords).toHaveLength(1);
  });

  it("碰撞罚款先从钱包扣除，结束仍发实际毛收入，保存里的净额不会再扣一次", () => {
    const props = openPhoneShift(), cash = gameState.player.money;
    props.onIncident({ kind: "collision", fine: 20, message: "车辆碰撞，罚款 ¥20" }); flushSync();
    expect(gameState.player.money).toBeCloseTo(cash - 20, 8);
    const end = snapshot(6, 143.27, "end"); end.trafficFine = 20; end.money = 123.27;
    publish(end); finish(143.27, 6, "碰撞后班次结束");
    expectSettled(cash - 20);
    props.onIncident({ kind: "collision", fine: 20, message: "重复结束消息" });
    finish(); expect(gameState.player.money).toBeCloseTo(cash - 20 + 179.27, 8);
    expect(gameState.work?.wageRecords).toHaveLength(1);
  });

  it("旧档劳务市场班次沿用原工资，只有新开班才采用底薪加提成", () => {
    gameState.locationId = "labor_market";
    gameState.laborMarket.generatedDay = gameDay(gameState.time);
    gameState.laborMarket.offers = [{ uid: "market_delivery", jobId: "job_delivery", quota: 1 }];
    const started = takeJobOffer(gameState, "market_delivery"); expect(started.ok, started.reason).toBe(true);
    const active = gameState.work!.active!, cash = gameState.player.money, base = active.baseWage;
    expect(active.source).toBe("market"); expect(base).toBeGreaterThan(0);
    delete active.deliveryPay;
    const cfg = getMiniGameConfig("job_delivery")!;
    const bonus = Math.round(base * (cfg.perfectBonusRate ?? .05));
    presentWorkSession(); mountModal(); publish(snapshot()); finish();
    expect(gameState.player.money).toBeCloseTo(cash + base + bonus, 8);
    expect(gameState.work?.wageRecords.at(-1)).toMatchObject({ base, gameBonus: bonus, total: base + bonus });
  });

  it("真实城市读回旧徒步班次不会锁死，可到租赁行买车并从原订单和收入继续", () => {
    gameState.time.hour = 8;
    expect(deliveryParttime(gameState).ok).toBe(true);
    const active = gameState.work!.active!, id = active.id, seed = active.seed, start = active.startMinute;
    const progress = snapshot(3, 51.08);
    Object.assign(active, {
      status: "playing", endMinute: start + 60, workedMinutes: 60, standardMinutes: 60,
      baseWage: 22, canSkip: true, completedOrders: 3, deliveryEarnedFare: 51.08, minigameProgress: progress,
    });
    delete active.deliveryPay;
    delete gameState.flags.item_tricycle;
    const loaded = migrateSave(JSON.parse(JSON.stringify(gameState)));
    replaceState(loaded);
    expect(gameState.work?.active).toMatchObject({ id, seed, workedMinutes: 480, baseWage: 0, canSkip: false, minigameProgress: progress });
    components.push(mount(GameView, { target: modalTarget })); flushSync();
    expect(uiState.modal).toBeNull(); expect(uiState.minigamePayload).toBeNull();
    expect(modalTarget.querySelector(".scene")).not.toBeNull();
    expect(modalTarget.querySelector(".mg-card")).toBeNull();
    expect(gameState.work?.active?.status).toBe("paused");

    const phone = [...modalTarget.querySelectorAll<HTMLButtonElement>("button.phone-btn")].find(button => button.textContent?.includes("📱"))!;
    phone.click(); flushSync(); expect(uiState.modal).toBe("phone");
    const fullPhone = modalTarget.querySelector<HTMLElement>(".overlay .phone")!;
    fullPhone.querySelector<HTMLButtonElement>('button[aria-label="下一页应用"]')!.click(); flushSync();
    const apps = [...fullPhone.querySelectorAll<HTMLButtonElement>('button[aria-label="外卖接单"]')];
    apps.at(-1)!.click(); flushSync();
    const entry = modalTarget.querySelector<HTMLButtonElement>("button.big-action")!;
    expect(entry.disabled).toBe(true); expect(entry.textContent).toContain("继续本班");
    expect(gameState.work?.active?.minigameProgress).toEqual(progress);

    const moved = moveTo(gameState, "car_rental"); expect(moved.ok, moved.reason).toBe(true); flushSync();
    expect(gameState.locationId).toBe("car_rental"); expect(uiState.modal).toBe("phone");
    const cashBeforePurchase = gameState.player.money;
    const bought = performAction(gameState, "buy_bicycle_shop"); expect(bought.ok, bought.reason).toBe(true); flushSync();
    expect(gameState.flags.item_bicycle).toBe(true); expect(gameState.vehicles.bicycle.owned).toBe(true);
    expect(gameState.player.money).toBeLessThan(cashBeforePurchase);
    // The real GameView notices the newly available vehicle and opens this same paused shift.
    expect(uiState.modal).toBe("minigame");
    expect(gameState.work?.active).toMatchObject({ id, seed, status: "paused", completedOrders: 3, deliveryEarnedFare: 51.08, minigameProgress: progress });
    expect(host.props!.initialProgress).toEqual(progress); expect(host.props!.seed).toBe(seed);
    expect(host.props!.paused).toBe(true); expect(gameState.work?.sequence).toBe(1);
    expect(deliveryOrdersRemaining(gameState)).toBe(0);
    const blockedWhileEquipped = moveTo(gameState, "home"); expect(blockedWhileEquipped.ok).toBe(false);
    resume(); expect(gameState.work?.active).toMatchObject({ id, seed, status: "playing" });
    expect(host.props!.paused).toBe(false); expect(gameState.work?.active?.minigameProgress).toEqual(progress);
    expect(gameState.work?.wageRecords).toHaveLength(0);
  });
});
