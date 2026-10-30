// @vitest-environment jsdom
/**
 * 回归测试：NPC 对话「选完回答后能继续 / 正常结算」。
 *
 * 背景 bug：NPC 对话结算时 `commitNpcConversation` 调用 `cloneState(state)`，
 * 而传入的 `state` 是 Svelte 5 `$state` 响应式代理——`structuredClone` 克隆代理会抛
 * `DataCloneError`，异常中断结算、状态不更新 → 对话冻在玩家回应句上（"点完回答之后就不能继续了"）。
 * 仅当对话 progressed（真实交流后结束）才走到该克隆分支，故终结型选项不触发、续接后结束必触发。
 *
 * 本测试用真实 store 的 `gameState`（即 $state 代理）复现，并断言：
 *  1) 选选项 → 玩家回应 → 继续推进，对话能到达结算（summary 出现），不卡死、不抛异常；
 *  2) 结算确实提交到游戏状态（socialized_once 标记被置位）；
 *  3) 贪婪走续接分支也能在正常步数内结束（无死循环/无停滞）。
 */
import { describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { gameState } from "../src/stores/gameStore.svelte";
import { openNpcTalk, closeNpcTalk } from "../src/stores/uiStore.svelte";
import { createInitialState } from "../src/game/core/state";
import { ensureRelationship, addAffinity } from "../src/game/core/relationships";
import { markGreeted } from "../src/game/data/npcGreetings";
import { gameDay } from "../src/game/core/calendar";
import { presentNpcs } from "../src/game/core/npcTalk";
import { LOCATIONS } from "../src/game/core/actions";

vi.spyOn(console, "error").mockImplementation(() => {});
if (!(Element.prototype as unknown as { animate?: unknown }).animate) {
  (Element.prototype as unknown as { animate: unknown }).animate = function () {
    const anim = {
      onfinish: null as (() => void) | null, oncancel: null as (() => void) | null,
      currentTime: 0, startTime: 0, playState: "finished",
      cancel() {}, finish() {}, play() {}, pause() {}, finished: Promise.resolve(),
    };
    queueMicrotask(() => { if (anim.onfinish) anim.onfinish(); });
    return anim;
  };
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clickStage(): void {
  const stage = document.querySelector(".npc-stage") as HTMLElement | null;
  if (stage) stage.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
function clickLastChoice(): void {
  const btns = document.querySelectorAll<HTMLButtonElement>(".choice-btn");
  const continuations = document.querySelectorAll<HTMLButtonElement>(".choice-btn:not(.leave-choice)");
  const last = continuations[continuations.length - 1] ?? btns[btns.length - 1];
  if (last) last.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("NpcTalkModal 选选项后正常结算", () => {
  it("选续接选项 → 玩家回应 → 继续 → 到达结算，且不抛 DataCloneError", async () => {
    const s = createInitialState(11);
    s.time.day = 12; s.time.hour = 10; s.time.minute = 0;
    const ids = [
      "npc_lin_xiaoyu", "npc_zhao_gang", "npc_chen_jie", "npc_wang_lei",
      "npc_netbar_boss", "npc_librarian", 
      "npc_flower_market_owner", "npc_snack_street_vendor",
       "npc_suburb_farmer",
    ];
    let target: { npcId: string; loc: string } | null = null;
    outer: for (const loc of LOCATIONS.map((l) => l.id)) {
      s.locationId = loc;
      for (const id of ids) {
        if (presentNpcs(s).some((n) => n.id === id)) { target = { npcId: id, loc }; break outer; }
      }
    }
    expect(target, "应找到在场的 NPC").not.toBeNull();
    Object.assign(gameState, s);
    ensureRelationship(gameState, target!.npcId);
    addAffinity(gameState, target!.npcId, 50, "talk");
    markGreeted(gameState, target!.npcId, gameDay(s.time));
    gameState.flags["socialized_once"] = false;

    openNpcTalk(target!.npcId, "chat");
    const { default: NpcTalkModal } = await import("../src/components/layout/NpcTalkModal.svelte");
    const comp = mount(NpcTalkModal as unknown as never, { target: document.body });
    await tick(); await delay(50);

    let reachedSummary = false;
    for (let i = 0; i < 60; i++) {
      if (document.querySelector(".result-panel")) { reachedSummary = true; break; }
      if (document.querySelector(".dialogue-error")) break;
      const choices = document.querySelectorAll(".choice-btn").length;
      if (choices > 0) { clickLastChoice(); }
      else { clickStage(); }
      await tick(); await delay(12);
    }

    expect(reachedSummary, "选选项后对话应正常走到结算（而非冻在玩家回应句）").toBe(true);
    expect(gameState.flags["socialized_once"], "结算应已提交到游戏状态").toBe(true);

    closeNpcTalk();
    unmount(comp);
  });
});
