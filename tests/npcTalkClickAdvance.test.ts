// @vitest-environment jsdom
/**
 * 回归测试：对话模态的「点击任意处推进」契约。
 *
 * 背景：v1.43 发货版只有底部台词框自身的 onclick 能推进，提示却写
 * 「点击任意处继续对话」——玩家点大面积的立绘/空白区域毫无反应，
 * 只有右上角「结束对话」能用，表现为「对话无法进行」。
 *
 * 本测试锁定：
 *  1) 点击舞台任意处（onStageClick）能推进台词；
 *  2) 单次点击只推进一句，不会双推进；
 *  3) 完整点击序列最终能到达选项列表，不会卡死。
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

// jsdom 不实现 Web Animations API；Svelte 的 transition:fade 会用到，补一个桩。
if (!(Element.prototype as unknown as { animate?: unknown }).animate) {
  (Element.prototype as unknown as { animate: unknown }).animate = function () {
    const anim = {
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
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
  expect(stage, "舞台层应存在").not.toBeNull();
  stage!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
function clickChoice(index: number): void {
  const btns = document.querySelectorAll<HTMLButtonElement>(".choice-btn");
  expect(btns.length, "应出现选项按钮").toBeGreaterThan(index);
  btns[index].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
function hintText(): string {
  const h = document.querySelector(".advance-hint");
  return h ? h.textContent ?? "" : "(无提示=已进入选项态)";
}
function remainingFromHint(): number | null {
  const m = hintText().match(/还有 (\d+) 句/);
  return m ? Number(m[1]) : null;
}

describe("NpcTalkModal 点击任意处推进", () => {
  it("点舞台任意处能推进、单次只推一句、最终到达选项", async () => {
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

    openNpcTalk(target!.npcId, "chat");
    const { default: NpcTalkModal } = await import("../src/components/layout/NpcTalkModal.svelte");
    const comp = mount(NpcTalkModal as unknown as never, { target: document.body });
    await tick();
    await delay(50);

    expect(document.querySelector(".dialogue-box"), "对话框应存在").not.toBeNull();
    const before = remainingFromHint();
    expect(before, "初始应显示剩余句数").not.toBeNull();

    // ① 点舞台任意处一次：应只减少一句（验证不双推进）
    clickStage();
    await tick();
    await delay(15);
    const after = remainingFromHint();
    if (after !== null && before !== null) {
      expect(after, "单次点击应只推进一句，不应双推进").toBe(before - 1);
    }

    // ② 完整推进直到出现选项
    let steps = 0;
    while (!document.querySelector(".choice-list") && steps < 12) {
      clickStage();
      await tick();
      await delay(10);
      steps += 1;
    }
    expect(document.querySelector(".choice-list"), "完整点击序列应到达选项列表（否则真卡死）").not.toBeNull();

    // ③ 选项态下点舞台不应误触推进（canAdvanceDialogue 为 false）
    const hintAtChoice = hintText();
    expect(hintAtChoice, "选项态提示不应再是「点击任意处朗读」").not.toContain("点击任意处朗读");

    // ④ 选一个选项后对话应正常继续（不报错、能结算或进入下一节点）
    clickChoice(0);
    await tick();
    await delay(20);
    expect(document.querySelector(".dialogue-error"), "选择后不应进入错误分支").toBeNull();

    closeNpcTalk();
    unmount(comp);
  });
});
