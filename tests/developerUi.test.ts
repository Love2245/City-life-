// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import MainMenuView from "../src/views/MainMenuView.svelte";
import SettingsView from "../src/views/SettingsView.svelte";
import DeveloperPanel from "../src/components/DeveloperPanel.svelte";
import Topbar from "../src/components/layout/Topbar.svelte";
import { createInitialState } from "../src/game/core/state";
import { currentView, gameState, navigation, replaceState } from "../src/stores/gameStore.svelte";
import { developerState, setDeveloperEnabled, resetDeveloperTitleTaps, runDeveloperAction, restoreDeveloperSnapshot, canRestoreDeveloperSnapshot, openDeveloperPanel } from "../src/stores/developerStore.svelte";
import { uiState, dismissToast } from "../src/stores/uiStore.svelte";
import { DEVELOPER_STORAGE_KEY, readDeveloperAccess } from "../src/lib/developerAccess";

let component: ReturnType<typeof mount> | undefined, target: HTMLDivElement;
beforeEach(() => {
  localStorage.clear(); developerState.unlocked = false; setDeveloperEnabled(false); resetDeveloperTitleTaps();
  developerState.message = ""; developerState.history = [];
  replaceState(createInitialState(149210)); currentView.name = "menu"; navigation.returnView = "menu";
  uiState.deviceSetupOpen = true; uiState.modal = null; uiState.npcTalk = null; uiState.npcTaskPanel = null;
  target = document.createElement("div"); document.body.append(target);
});
afterEach(async () => { if (component) await unmount(component); component = undefined; target.remove(); dismissToast(); uiState.deviceSetupOpen = false; setDeveloperEnabled(false); currentView.name = "menu"; });
async function render(view: any): Promise<void> { if (component) await unmount(component); target.innerHTML = ""; component = mount(view, { target }); flushSync(); }
function click(text: string): void {
  const button = [...target.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text); expect(button, text).toBeTruthy(); button!.click(); flushSync();
}
function enter(): void { developerState.unlocked = true; setDeveloperEnabled(true); currentView.name = "game"; }

describe("正常游戏中的超级开发者入口", () => {
  it("真实主菜单标题10连点只解锁，随后真实设置页手动开关才启用", async () => {
    const before = JSON.stringify(gameState); await render(SettingsView); expect(target.querySelector('[aria-label="启用超级开发者模式"]')).toBeNull();
    await render(MainMenuView); const title = target.querySelector<HTMLButtonElement>('[aria-label="都市生活游戏标题"]')!;
    for (let i = 0; i < 9; i++) title.click(); flushSync(); expect(developerState.unlocked).toBe(false);
    title.click(); flushSync(); expect(developerState.unlocked).toBe(true); expect(developerState.enabled).toBe(false); expect(developerState.open).toBe(false);
    expect(readDeveloperAccess(localStorage)).toEqual({ unlocked: true, enabled: false }); expect(uiState.toast).toContain("手动开启");
    await render(SettingsView); const toggle = target.querySelector<HTMLButtonElement>('[aria-label="启用超级开发者模式"]')!;
    expect(toggle.getAttribute("aria-checked")).toBe("false"); toggle.click(); flushSync(); expect(developerState.enabled).toBe(true); expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(JSON.parse(localStorage.getItem(DEVELOPER_STORAGE_KEY)!)).toEqual({ unlocked: true, enabled: true });
    expect(target.querySelector<HTMLButtonElement>("button:disabled")?.textContent).toContain("打开超级开发者面板");
    expect(JSON.stringify(gameState)).toBe(before);
    toggle.click(); flushSync(); expect(developerState.enabled).toBe(false);
  });
  it("标题连点中途点到其他地方必须重新计数", async () => {
    await render(MainMenuView); const title = target.querySelector<HTMLButtonElement>('[aria-label="都市生活游戏标题"]')!;
    for (let i = 0; i < 6; i++) title.click(); target.querySelector<HTMLElement>(".title-subtitle")!.click();
    for (let i = 0; i < 9; i++) title.click(); expect(developerState.unlocked).toBe(false); title.click(); expect(developerState.unlocked).toBe(true);
  });
  it("顶栏入口只在启用后出现，并能打开面板", async () => {
    currentView.name = "game"; await render(Topbar); expect(target.querySelector('[aria-label="超级开发者模式"]')).toBeNull();
    developerState.unlocked = true; flushSync(); expect(target.querySelector('[aria-label="超级开发者模式"]')).toBeNull();
    setDeveloperEnabled(true); flushSync(); const entry = target.querySelector<HTMLButtonElement>('[aria-label="超级开发者模式"]')!; expect(entry).toBeTruthy(); entry.click(); expect(developerState.open).toBe(true);
    setDeveloperEnabled(false); flushSync(); expect(developerState.open).toBe(false); expect(target.querySelector('[aria-label="超级开发者模式"]')).toBeNull();
  });
});
describe("开发者面板实际组件操作", () => {
  it("修改金钱、道具与关系，并可恢复最近操作前的完整状态", async () => {
    enter(); await render(DeveloperPanel); const original = gameState.player.money;
    click("＋1,000"); expect(gameState.player.money).toBe(original + 1000); expect(canRestoreDeveloperSnapshot()).toBe(true);
    click("撤回最近调试"); expect(gameState.player.money).toBe(original);
    const tab = (name: string) => { target.querySelector<HTMLButtonElement>(`nav button:nth-child(${name === "items" ? 2 : 3})`)!.click(); flushSync(); };
    tab("items"); const search = target.querySelector<HTMLInputElement>('[aria-label="搜索物品"]')!; search.value = "task_toy_bear"; search.dispatchEvent(new Event("input", { bubbles: true })); flushSync(); click("增加"); expect(gameState.inventory.task_toy_bear).toBe(1);
    tab("npcs"); click("应用人物关系"); expect(gameState.relationships.find((r) => r.npcId === "npc_zhao_gang")?.affinity).toBe(40);
    click("撤回最近调试"); expect(gameState.relationships.some((r) => r.npcId === "npc_zhao_gang")).toBe(false); expect(gameState.inventory.task_toy_bear).toBe(1);
  });
  it("任务准备不发钱，真实数据和完整JSON均可在面板读取", async () => {
    enter(); await render(DeveloperPanel); target.querySelector<HTMLButtonElement>("nav button:nth-child(5)")!.click(); flushSync();
    const money = gameState.player.money; click("准备任务场景"); expect(gameState.quests.find((q) => q.npcTask?.taskId === "zhao_staff")?.npcTask?.stage).toBe("seeking_staff"); expect(gameState.player.money).toBe(money);
    target.querySelector<HTMLButtonElement>("nav button:nth-child(7)")!.click(); flushSync(); click("读取当前状态");
    const json = target.querySelector<HTMLTextAreaElement>('[aria-label="完整游戏状态JSON"]')!; const value = JSON.parse(json.value); value.player.money = 6789; json.value = JSON.stringify(value); json.dispatchEvent(new Event("input", { bubbles: true })); flushSync(); click("应用编辑后的完整状态"); expect(gameState.player.money).toBe(6789);
  });
  it("关闭权限后旧按钮与状态恢复也无法执行，换档后不误恢复上一局", async () => {
    enter(); await render(DeveloperPanel); click("＋1,000"); const before = gameState.player.money;
    setDeveloperEnabled(false); click("＋1,000"); expect(gameState.player.money).toBe(before); expect(restoreDeveloperSnapshot()).toBe(false);
    setDeveloperEnabled(true); replaceState(createInitialState(149211)); expect(canRestoreDeveloperSnapshot()).toBe(false); expect(restoreDeveloperSnapshot()).toBe(false);
  });
  it("调试成功时关闭旧NPC副本；失败时保持原状态和会话", () => {
    enter(); uiState.npcTalk = { npcId: "npc_zhao_gang", entry: "chat" }; uiState.modal = "inventory";
    expect(runDeveloperAction({ type: "money", mode: "set", value: NaN })).toBe(false); expect(uiState.npcTalk).not.toBeNull();
    expect(runDeveloperAction({ type: "money", mode: "add", value: 1 })).toBe(true); expect(uiState.npcTalk).toBeNull(); expect(uiState.modal).toBeNull();
  });
  it("Escape只关闭开发者工具，不继续触发下层窗口按键", async () => {
    enter(); openDeveloperPanel(); await render(DeveloperPanel); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); flushSync(); expect(developerState.open).toBe(false);
  });
});
