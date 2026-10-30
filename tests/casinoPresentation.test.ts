// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import CasinoTableGame from "../src/components/layout/districtLeisure/CasinoTableGame.svelte";
import DistrictLeisurePanel from "../src/components/layout/DistrictLeisurePanel.svelte";
import { createInitialState } from "../src/game/core/state";
import { enterCasinoRoom, startDistrictLeisure, type CasinoSession } from "../src/game/core/districtLeisure";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { uiState } from "../src/stores/uiStore.svelte";
import { configureFinancialRiskStorage, initializeFinancialRisk, type FinancialRiskJournal } from "../src/game/core/financialRisk";

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | undefined;
let restoreRisk: (() => void) | undefined;
beforeAll(() => {
  Element.prototype.animate ??= (() => ({ finished:Promise.resolve(),cancel(){},play(){},pause(){} })) as any;
  window.matchMedia ??= (() => ({ matches:false,addEventListener(){},removeEventListener(){} })) as any;
});
beforeEach(() => {
  vi.useFakeTimers();
  const state = createInitialState(148);
  state.locationId = "boyue_texas_shop"; state.region = "boyue_night_market";
  state.time = { ...state.time,year:2026,month:9,day:6,hour:20,minute:0 };
  enterCasinoRoom(state,"leisure"); replaceState(state); uiState.modal = null;
  target = document.createElement("div"); document.body.append(target);
});
afterEach(async () => { if(component) await unmount(component); component=undefined; restoreRisk?.(); restoreRisk=undefined; target.remove(); uiState.modal=null; vi.useRealTimers(); vi.restoreAllMocks(); });
function present(kind: "slots" | "roulette_redblack" | "high_low") {
  startDistrictLeisure(gameState,kind,{currency:"chips",bet:50,choice:kind === "high_low" ? "high" : "red"});
  const session = gameState.districtLeisure!.active as CasinoSession;
  const input = vi.fn(() => session.phase="ready"), busy = vi.fn();
  component = mount(CasinoTableGame,{target,props:{session,oninput:input,onbusy:busy}}); flushSync();
  return {session,input,busy};
}
describe("赌场表现层与动画状态", () => {
  it("启用真实风控存储时可从场次进入游戏，界面计算不写状态或日志", () => {
    let journal: FinancialRiskJournal | null = null;
    const write = vi.fn((next: FinancialRiskJournal) => { journal=JSON.parse(JSON.stringify(next)); return true; });
    restoreRisk=configureFinancialRiskStorage({ accepts:s=>s===gameState, read:()=>journal, write });
    initializeFinancialRisk(gameState,"casino-ui-regression");
    component=mount(DistrictLeisurePanel,{target}); flushSync();
    Array.from(target.querySelectorAll("button")).find(b=>b.textContent?.includes("进入场次选择"))!.click(); flushSync();
    Array.from(document.querySelectorAll("button")).find(b=>b.textContent?.includes("进入新手场"))!.click(); flushSync();
    expect(document.querySelector('.casino-menu[aria-label="选择赌场游戏"]')).not.toBeNull();
    expect(document.querySelector(".casino-game-heading h3")?.textContent).toBe("21 点");
    expect(write).toHaveBeenCalledTimes(1);
    expect(gameState.financialRisk!.storageBlocked).toBe(false);
    Array.from(document.querySelectorAll("nav button")).find(b=>b.textContent==="老虎机")!.click(); flushSync();
    expect(document.querySelector(".casino-game-heading h3")?.textContent).toBe("幸运老虎机");
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("老虎机仅揭晓一次，转轴逐个停下，动画结束前不放开结算", () => {
    const {session,input,busy}=present("slots"); session.outcome=[0,4,5];
    const button=target.querySelector("button")!; button.click(); button.click(); flushSync();
    expect(input).toHaveBeenCalledTimes(1); expect(busy).toHaveBeenLastCalledWith(true);
    expect(target.querySelectorAll(".reel-strip")).toHaveLength(3);
    vi.advanceTimersByTime(1300); flushSync(); expect(target.querySelectorAll(".reel-strip")).toHaveLength(2);
    vi.advanceTimersByTime(900); flushSync(); expect(target.querySelectorAll(".reel-strip")).toHaveLength(0);
    expect(busy).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(400); flushSync(); expect(busy).toHaveBeenLastCalledWith(false);
    expect(target.textContent).toContain("转轴已停下"); expect(session.outcome).toEqual([0,4,5]);
  });
  it("轮盘落点采用已保存结果，动画期间不提前显示号码", () => {
    const {session,input,busy}=present("roulette_redblack"); session.outcome=[32];
    target.querySelector("button")!.click(); flushSync();
    expect(input).toHaveBeenCalledWith({type:"reveal"});
    expect(target.querySelector(".wheel-result")?.textContent).toBe("·");
    vi.advanceTimersByTime(3200); flushSync();
    expect(target.querySelector(".wheel-result")?.textContent).toBe("32");
    expect(busy).toHaveBeenLastCalledWith(false); expect(session.outcome).toEqual([32]);
  });
  it("关闭动画界面会清理计时器并解除按钮锁定", async () => {
    const {busy}=present("slots"); target.querySelector("button")!.click(); flushSync();
    await unmount(component!); component=undefined; expect(busy).toHaveBeenLastCalledWith(false);
    const count=busy.mock.calls.length; vi.advanceTimersByTime(5000); expect(busy).toHaveBeenCalledTimes(count);
  });
  it("比大小翻牌后保留动画时间，再解除结算锁定", () => {
    const {busy}=present("high_low"); target.querySelector("button")!.click(); flushSync();
    vi.advanceTimersByTime(700); flushSync();
    expect(target.querySelectorAll(".playing-card.hidden")).toHaveLength(0);
    expect(busy).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(800); flushSync(); expect(busy).toHaveBeenLastCalledWith(false);
  });
  it("减少动态效果模式缩短等待，不改变存档结果", () => {
    vi.spyOn(window,"matchMedia").mockReturnValue({matches:true} as MediaQueryList);
    const {session,busy}=present("slots"), result=[...session.outcome];
    target.querySelector("button")!.click(); flushSync(); vi.advanceTimersByTime(160); flushSync();
    expect(busy).toHaveBeenLastCalledWith(false); expect(session.outcome).toEqual(result);
  });
  it("全屏游戏菜单让位于结算弹窗，关闭弹窗后再显示菜单", () => {
    component=mount(DistrictLeisurePanel,{target}); flushSync();
    Array.from(target.querySelectorAll("button")).find(b=>b.textContent?.includes("进入场次选择"))!.click(); flushSync();
    Array.from(document.querySelectorAll("button")).find(b=>b.textContent?.includes("进入新手场"))!.click(); flushSync();
    expect(document.querySelector(".casino-menu")).not.toBeNull();
    uiState.modal="result"; flushSync(); expect(document.querySelector(".casino-menu")).toBeNull();
    uiState.modal=null; flushSync(); expect(document.querySelector(".casino-menu")).not.toBeNull();
  });
});
