// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import NpcTalkModal from "../src/components/layout/NpcTalkModal.svelte";
import { gameDay, weekdayOf } from "../src/game/core/calendar";
import {
  advanceNpcConversation,
  beginNpcConversation,
  beginNpcFormalConversation,
  cancelNpcConversation,
  commitNpcConversation,
  npcConversationView,
  npcFormalTopics,
  type NpcConversationSession,
} from "../src/game/core/npcTalk";
import { npcPresenceAt } from "../src/game/core/npcs";
import { ensureRelationship } from "../src/game/core/relationships";
import { createInitialState } from "../src/game/core/state";
import { NPC_DIALOGUE_REMASTER } from "../src/game/data/npcDialogueRemaster";
import { gameState, replaceState } from "../src/stores/gameStore.svelte";
import { closeNpcTalk, uiState } from "../src/stores/uiStore.svelte";
import type { GameState, Quest } from "../src/game/types";

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];

function fresh(): GameState {
  const state = createInitialState(731);
  state.time.year = 2026;
  state.time.month = 8;
  state.time.day = 3;
  state.time.hour = 7;
  state.time.minute = 0;
  state.region = "downtown_residential";
  state.locationId = "cafe";
  return state;
}

function placeNpc(state: GameState, npcId: string): void {
  for (let day = 1; day <= 31; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      state.time.day = day;
      state.time.hour = hour;
      state.time.minute = 0;
      const presence = npcPresenceAt(npcId, {
        ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time),
        hour,
        minute: 0,
      });
      if (!presence) continue;
      state.locationId = presence.locationId;
      if (presence.regionId) state.region = presence.regionId;
      return;
    }
  }
  throw new Error(`找不到 ${npcId} 的可用排班`);
}

function disableNpcEvents(state: GameState, npcId: string): void {
  for (const scene of Object.values(NPC_DIALOGUE_REMASTER[npcId]?.scenes ?? {})) {
    if (scene.kind === "event") state.flags[`npc_remaster_event_seen_${npcId}_${scene.id}`] = true;
  }
}

function finishWithFirstAvailableOption(state: GameState, initial: NpcConversationSession): NpcConversationSession {
  let session = initial;
  for (let step = 0; step < 16 && session.status === "active"; step += 1) {
    const view = npcConversationView(state, session);
    expect(view, "对话节点应有可显示内容").not.toBeNull();
    const index = view!.options.findIndex((option) => !option.leave);
    const fallback = view!.options.findIndex((option) => option.leave);
    const advanced = advanceNpcConversation(state, session, index >= 0 ? index : fallback);
    expect(advanced.ok, advanced.reason).toBe(true);
    session = advanced.session!;
  }
  expect(session.status).toBe("ended");
  return session;
}

function activeQuestFor(npcId: string, title = "临时委托"): Quest {
  return {
    id: `test_active_${npcId}_${title}`,
    type: "story",
    title,
    icon: "📋",
    desc: "正在进行中的委托",
    day: 1,
    status: "active",
    commission: {
      npcId,
      days: 3,
      startDay: 1,
      rewardEffects: {},
      rewardText: "测试奖励",
    },
  };
}

function mountModal(): HTMLElement {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const component = mount(NpcTalkModal, { target });
  mounted.push({ component, target });
  flushSync();
  return target;
}

function unmountModal(target: HTMLElement): void {
  const index = mounted.findIndex((item) => item.target === target);
  if (index < 0) return;
  const [item] = mounted.splice(index, 1);
  unmount(item.component);
  target.remove();
}

beforeAll(() => {
  if (!Element.prototype.animate) {
    Element.prototype.animate = (() => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })) as any;
  }
});

afterEach(() => {
  for (const item of mounted.splice(0)) {
    unmount(item.component);
    item.target.remove();
  }
  closeNpcTalk();
  replaceState(createInitialState(999));
});

describe("NPC 对话 runtime 回归", () => {
  it("Escape 与结束按钮都只结算一次第五次婉拒并扣 2 点好感", () => {
    for (const exitBy of ["escape", "button"] as const) {
      const state = fresh();
      const npcId = "npc_lin_xiaoyu";
      placeNpc(state, npcId);
      const relationship = ensureRelationship(state, npcId);
      relationship.affinity = 60;
      state.flags[`npc_chat_day_${npcId}`] = gameDay(state.time);
      state.flags[`npc_chat_count_${npcId}`] = 4;
      replaceState(state);
      uiState.npcTalk = { npcId, entry: "chat" };

      const target = mountModal();
      expect(target.textContent).toContain("今天先聊到这里");
      const beforeAffinity = gameState.relationships.find((rel) => rel.npcId === npcId)!.affinity;
      expect(gameState.flags[`npc_chat_count_${npcId}`]).toBe(4);

      if (exitBy === "escape") {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else {
        target.querySelector<HTMLButtonElement>(".end-dialogue-btn")!.click();
      }
      flushSync();

      expect(target.querySelector(".result-panel")).not.toBeNull();
      expect(gameState.flags[`npc_chat_count_${npcId}`]).toBe(5);
      expect(gameState.relationships.find((rel) => rel.npcId === npcId)!.affinity).toBe(beforeAffinity - 2);

      // 结算后再走另一种出口只关闭结果页，不能再次计次或扣好感。
      if (exitBy === "escape") target.querySelector<HTMLButtonElement>(".continue-btn")!.click();
      else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      flushSync();
      expect(uiState.npcTalk).toBeNull();
      expect(gameState.flags[`npc_chat_count_${npcId}`]).toBe(5);
      expect(gameState.relationships.find((rel) => rel.npcId === npcId)!.affinity).toBe(beforeAffinity - 2);
      unmountModal(target);
    }
  });

  it("问候不显示日常线索，取消不消耗线索；日常线索只在完成交流时标记", () => {
    const state = fresh();
    const npcId = "npc_lin_xiaoyu";
    placeNpc(state, npcId);
    ensureRelationship(state, npcId).affinity = 10;
    disableNpcEvents(state, npcId);
    const hintKey = `npc_remaster_hint_day_${npcId}`;
    const greetingBefore = JSON.stringify(state);

    const greeting = beginNpcConversation(state, npcId, "chat");
    expect(greeting.ok, greeting.reason).toBe(true);
    expect(greeting.session?.greetingNode).toBeDefined();
    expect(npcConversationView(state, greeting.session!)?.text).not.toContain("我每隔几天会在咖啡馆坐一会儿");
    expect(state.flags[hintKey]).toBeUndefined();
    expect(JSON.stringify(state)).toBe(greetingBefore);
    cancelNpcConversation(greeting.session!);
    expect(JSON.stringify(state)).toBe(greetingBefore);

    // 真正完成问候后，问候标记可提交，但它不会读取或占用日常线索。
    const greeted = advanceNpcConversation(state, greeting.session!, 0);
    expect(greeted.ok).toBe(true);
    const greetingCommit = commitNpcConversation(state, greeted.session!);
    expect(greetingCommit.ok).toBe(true);
    expect(greetingCommit.state?.flags[`npc_greet_day_${npcId}`]).toBe(gameDay(state.time));
    expect(greetingCommit.state?.flags[hintKey]).toBeUndefined();

    const dailyState = greetingCommit.state!;
    const day = gameDay(dailyState.time);
    const beforeBegin = JSON.stringify(dailyState);
    const daily = beginNpcConversation(dailyState, npcId, "chat");
    expect(daily.ok, daily.reason).toBe(true);
    expect(daily.session?.hintText).toContain("我每隔几天会在咖啡馆坐一会儿");
    expect(npcConversationView(dailyState, daily.session!)?.text).toContain(daily.session!.hintText!);
    expect(dailyState.flags[hintKey]).toBeUndefined();
    expect(JSON.stringify(dailyState)).toBe(beforeBegin);

    cancelNpcConversation(daily.session!);
    expect(dailyState.flags[hintKey]).toBeUndefined();
    const reopened = beginNpcConversation(dailyState, npcId, "chat");
    expect(reopened.session?.hintText).toBe(daily.session?.hintText);

    const completed = finishWithFirstAvailableOption(dailyState, reopened.session!);
    const dailyCommit = commitNpcConversation(dailyState, completed);
    expect(dailyCommit.ok, dailyCommit.reason).toBe(true);
    expect(dailyCommit.state?.flags[hintKey]).toBe(day);
  });

  it("提交会复核 NPC 在场与关系快照，过时会话不应用效果", () => {
    const state = fresh();
    const npcId = "npc_lin_xiaoyu";
    placeNpc(state, npcId);
    ensureRelationship(state, npcId).affinity = 30;
    disableNpcEvents(state, npcId);
    state.flags[`npc_greet_day_${npcId}`] = gameDay(state.time);
    const started = beginNpcConversation(state, npcId, "chat");
    expect(started.ok, started.reason).toBe(true);
    const ended = finishWithFirstAvailableOption(state, started.session!);

    state.locationId = "apartment";
    const stateAtWrongLocation = JSON.stringify(state);
    const absent = commitNpcConversation(state, ended);
    expect(absent.ok).toBe(false);
    expect(absent.reason).toContain("不在当前地点");
    expect(JSON.stringify(state)).toBe(stateAtWrongLocation);

    placeNpc(state, npcId);
    const relationshipChanged = beginNpcConversation(state, npcId, "chat");
    expect(relationshipChanged.ok, relationshipChanged.reason).toBe(true);
    const relationshipEnded = finishWithFirstAvailableOption(state, relationshipChanged.session!);
    ensureRelationship(state, npcId).affinity += 1;
    const changed = commitNpcConversation(state, relationshipEnded);
    expect(changed.ok).toBe(false);
    expect(changed.reason).toContain("关系已经发生变化");
  });

  it("赵刚实体委托通过 JSON 存档往返后仍拒绝重复提交", () => {
    const state=fresh(),npcId="npc_zhao_gang";placeNpc(state,npcId);
    ensureRelationship(state,npcId).affinity=20;
    const topic=npcFormalTopics(state,npcId).find(t=>t.category==='commission'&&t.label==='给孩子留一份')!;
    expect(topic).toBeDefined();
    const started=beginNpcFormalConversation(state,npcId,topic.id);expect(started.ok,started.reason).toBe(true);
    const ended=advanceNpcConversation(state,started.session!,0);expect(ended.ok,ended.reason).toBe(true);
    const first=commitNpcConversation(state,ended.session!);expect(first.ok,first.reason).toBe(true);
    const savedState=JSON.parse(JSON.stringify(first.state)) as GameState;
    const savedSession=JSON.parse(JSON.stringify(ended.session)) as NpcConversationSession;
    const before=JSON.stringify(savedState);
    expect(commitNpcConversation(savedState,savedSession).ok).toBe(false);
    expect(commitNpcConversation(savedState,{...savedSession,commitSequence:Number.NaN}).ok).toBe(false);
    expect(JSON.stringify(savedState)).toBe(before);
  });

  it("注入旧合同也不会显示跟进或重新发放占位委托", () => {
    const state=fresh(),npcId="npc_chen_jie";placeNpc(state,npcId);
    ensureRelationship(state,npcId).affinity=75;
    state.quests.push(activeQuestFor(npcId,"快餐店旧占位"));
    const before=JSON.stringify(state);
    expect(npcFormalTopics(state,npcId)).toEqual([]);
    expect(beginNpcFormalConversation(state,npcId,'active:'+state.quests[0].id).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});
