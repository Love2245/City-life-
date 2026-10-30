import { describe, expect, it } from "vitest";
import {
  NPC_DIALOGUE_REMASTER,
  NPC_SPECIAL_EVENT_CHANCE,
  remasterConversationStart,
} from "../src/game/data/npcDialogueRemaster";
import {
  advanceNpcConversation,
  beginNpcFormalConversation,
  beginNpcConversation,
  capNpcConversationAffinity,
  commitNpcConversation,
  npcConversationView,
  npcChatCountToday,
  npcFormalTopics,
  presentNpcs,
  type NpcConversationSession,
} from "../src/game/core/npcTalk";
import {
  allNpcs,
  getNpcDef,
  npcPresenceAt,
  npcDescriptor,
  npcFamiliarName,
  npcKnownName,
} from "../src/game/core/npcs";
import { ensureRelationship, findRelationship } from "../src/game/core/relationships";
import { createInitialState } from "../src/game/core/state";
import { gameDay, weekdayOf } from "../src/game/core/calendar";
import { dialogueLines } from "../src/game/core/npcPortraits";
import { npcChatBoundaryLine } from "../src/game/data/npcChatBoundaries";
import type { GameState } from "../src/game/types";

const STAGES = ["meet", "acquaintance", "friend", "close_friend"] as const;

function fresh(): GameState {
  const state = createInitialState(43);
  // 2026-08-03 为周一；07:00 是林小雨工作日咖啡厅时段。
  state.time.day = 3;
  state.time.hour = 7;
  state.locationId = "cafe";
  state.region = "downtown_residential";
  return state;
}

function disableEvents(state: GameState, npcId: string): void {
  for (const scene of Object.values(NPC_DIALOGUE_REMASTER[npcId]?.scenes ?? {})) {
    if (scene.kind === "event") state.flags[`npc_remaster_event_seen_${npcId}_${scene.id}`] = true;
  }
}

/**
 * v1.43：每天第一次搭话会先播放「地点问候」。这些用例聚焦日常池与结算逻辑本身，
 * 因此显式标记「今天已问候」，让 beginNpcConversation 直接走正常日常池。
 */
function skipDailyGreeting(state: GameState, npcId: string): void {
  state.flags[`npc_greet_day_${npcId}`] = gameDay(state.time);
}

function walkWithFirstNormal(state: GameState, initial: NpcConversationSession): NpcConversationSession {
  let session = initial;
  for (let step = 0; step < 12 && session.status === "active"; step += 1) {
    const view = npcConversationView(state, session);
    expect(view, "当前节点应该能正常渲染").not.toBeNull();
    const optionIndex = view!.options.findIndex((option) => !option.leave);
    const fallbackIndex = view!.options.findIndex((option) => option.leave);
    const selectedIndex = optionIndex >= 0 ? optionIndex : fallbackIndex;
    expect(selectedIndex, "当前节点缺少可继续的回答").toBeGreaterThanOrEqual(0);
    const advanced = advanceNpcConversation(state, session, selectedIndex);
    expect(advanced.ok, advanced.reason).toBe(true);
    session = advanced.session!;
  }
  expect(session.status, "对话节点不应形成循环").toBe("ended");
  return session;
}

function startAtOption(
  state: GameState,
  npcId: string,
  predicate: (option: NonNullable<ReturnType<typeof npcConversationView>>["options"][number]) => boolean,
): { session: NpcConversationSession; optionIndex: number } {
  for (let day = 1; day <= 31; day += 1) {
    for (let hour = 7; hour <= 20; hour += 1) {
      state.time.day = day;
      state.time.hour = hour;
      state.time.minute = 0;
      const presence = npcPresenceAt(npcId, { ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time), hour, minute: 0 });
      if (!presence) continue;
      state.locationId = presence.locationId;
      if (presence.regionId) state.region = presence.regionId;
      skipDailyGreeting(state, npcId);
      const started = beginNpcConversation(state, npcId, "chat");
      if (!started.ok && started.reason === "现在不在这里") continue;
      expect(started.ok, started.reason).toBe(true);
      const view = npcConversationView(state, started.session!);
      const optionIndex = view?.options.findIndex(predicate) ?? -1;
      if (optionIndex >= 0) return { session: started.session!, optionIndex };
    }
  }
  throw new Error(`没有找到 ${npcId} 所需的日常对话选项`);
}

function startAtFormalOption(
  state: GameState,
  npcId: string,
  predicate: (option: NonNullable<ReturnType<typeof npcConversationView>>["options"][number]) => boolean,
): { session: NpcConversationSession; optionIndex: number } {
  for (let day = 1; day <= 31; day += 1) {
    for (let hour = 0; hour <= 23; hour += 1) {
      state.time.day = day;
      state.time.hour = hour;
      state.time.minute = 0;
      const presence = npcPresenceAt(npcId, { ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time), hour, minute: 0 });
      if (!presence) continue;
      state.locationId = presence.locationId;
      if (presence.regionId) state.region = presence.regionId;
      const topic = npcFormalTopics(state, npcId).find((candidate) => candidate.options?.some(predicate));
      if (!topic) continue;
      const started = beginNpcFormalConversation(state, npcId, topic.id);
      expect(started.ok, started.reason).toBe(true);
      const view = npcConversationView(state, started.session!);
      const optionIndex = view?.options.findIndex(predicate) ?? -1;
      if (optionIndex >= 0) return { session: started.session!, optionIndex };
    }
  }
  throw new Error(`没有找到 ${npcId} 所需的正式对话选项`);
}

function startAtScene(
  state: GameState,
  npcId: string,
  stage: "acquaintance" | "friend" | "close_friend",
  predicate: (start: NonNullable<ReturnType<typeof remasterConversationStart>>) => boolean,
): NonNullable<ReturnType<typeof remasterConversationStart>> {
  for (let day = 1; day <= 31; day += 1) {
    for (let hour = 0; hour <= 23; hour += 1) {
      state.time.day = day;
      state.time.hour = hour;
      state.time.minute = 0;
      const def = getNpcDef(npcId);
      const presence = def && npcPresenceAt(def, { ...state.time, seed: state.rng.seed, weekday: weekdayOf(state.time), hour, minute: 0 });
      if (!presence) continue;
      state.locationId = presence.locationId;
      if (presence.regionId) state.region = presence.regionId;
      const start = remasterConversationStart(state, npcId, stage);
      if (start && predicate(start)) return start;
    }
  }
  throw new Error(`没有找到 ${npcId} 所需的对话场景`);
}

describe("v1.43 NPC 修订稿数据", () => {
  it("全部有正式对白的 NPC 均有固定初见、三档日常池和有效节点引用", () => {
    const dialogueNpcs = allNpcs().filter((npc) => NPC_DIALOGUE_REMASTER[npc.id]);
    expect(allNpcs()).toHaveLength(12);
    // 新增三位 NPC（范柯杰 / 杰克范马 / 范珂汐）已接入正式稿，与 allNpcs 同步为 12。
    expect(dialogueNpcs).toHaveLength(allNpcs().length);
    expect(Object.keys(NPC_DIALOGUE_REMASTER)).toHaveLength(allNpcs().length);

    for (const npc of dialogueNpcs) {
      const data = NPC_DIALOGUE_REMASTER[npc.id];
      expect(data, `${npc.id} 未载入修订稿`).toBeDefined();
      expect(data.dailySceneIds.acquaintance, `${npc.id} 相识日常`).toHaveLength(12);
      expect(data.dailySceneIds.friend, `${npc.id} 朋友日常`).toHaveLength(7);
      // 修订稿中部分人物在挚友档保留 D20～D24，至少五条才能形成稳定轮换。
      expect(data.dailySceneIds.close_friend?.length, `${npc.id} 挚友日常`).toBeGreaterThanOrEqual(5);

      for (const stageKey of STAGES) {
        const stage = npc.talk?.[stageKey];
        expect(stage, `${npc.id}.${stageKey} 缺少阶段`).toBeDefined();
        expect(stage!.nodes[stage!.start], `${npc.id}.${stageKey} 缺少起始节点`).toBeDefined();

        for (const node of Object.values(stage!.nodes)) {
          expect(node.text, `${npc.id}.${node.id} 缺少台词`).toBeTruthy();
          expect(node.text, `${npc.id}.${node.id} 仍含停顿号占位符`).not.toMatch(/(?:…+|\.{2,}|。{2,})/);
          expect(dialogueLines(node.text), `${npc.id}.${node.id} 清理后没有可显示台词：${node.text}`).not.toHaveLength(0);
          expect(node.text).not.toContain("NPC台词：");
          expect(node.options.length, `${npc.id}.${node.id} 缺少回答`).toBeGreaterThan(0);
          for (const option of node.options) {
            expect(option.label).not.toContain("好感");
            expect(option.label).not.toContain("【离开");
            if (option.next) expect(stage!.nodes[option.next], `${npc.id}.${option.next} 不存在`).toBeDefined();
            if (option.nextStage) expect(stageKey).toBe("meet");
          }
        }
      }

      for (const scene of Object.values(data.scenes)) {
        expect(npc.talk?.[scene.stageKey]?.nodes[scene.startNodeId], `${npc.id}.${scene.id} 起点失效`).toBeDefined();
      }
    }
  });

  it("保留修订稿的身份称呼，不再把旧备注生成占位奖励", () => {
    expect(npcDescriptor("npc_wang_lei")).toBe("公园晨练的退休干部");
    expect(npcFamiliarName("npc_wang_lei")).toBe("王叔");
    expect(npcKnownName("npc_wang_lei")).toBe("王爷爷");
    const lin=getNpcDef("npc_lin_xiaoyu")!;
    expect(Object.values(lin.talk!.friend!.nodes).flatMap(n=>n.options).some(o=>o.help||o.commission||o.cityCommissionId)).toBe(false);
  });
});

describe("v1.43 NPC 会话流程", () => {
  it("NPC 按星期、时段和地点出现，其他时间或地点不可搭话", () => {
    const state = fresh();
    state.locationId = "fast_food";
    state.region = "downtown_mall";
    state.time.day = 2; // 周日：陈姐在菜市场
    state.time.hour = 10;
    const chen = getNpcDef("npc_chen_jie")!;

    expect(npcPresenceAt(chen, { weekday: 6, hour: 10, minute: 0 })?.locationId).toBe("market");
    expect(presentNpcs(state).some((npc) => npc.id === "npc_chen_jie")).toBe(false);
    expect(beginNpcConversation(state, "npc_chen_jie", "meet")).toEqual({ ok: false, reason: "这里没有这个人" });

    state.locationId = "market";
    state.region = "downtown_residential";
    expect(presentNpcs(state).some((npc) => npc.id === "npc_chen_jie")).toBe(true);
    expect(beginNpcConversation(state, "npc_chen_jie", "meet").ok).toBe(true);
  });

  it("网吧老板只在住宅区的网吧实例出现与搭话，市中心同 ID 网吧不可见", () => {
    const state = fresh();
    state.locationId = "internet_cafe";
    state.time.hour = 14;
    ensureRelationship(state, "npc_netbar_boss");

    state.region = "downtown_center";
    expect(presentNpcs(state).some((npc) => npc.id === "npc_netbar_boss")).toBe(false);
    expect(beginNpcConversation(state, "npc_netbar_boss", "chat")).toEqual({ ok: false, reason: "现在不在这里" });

    state.region = "downtown_residential";
    expect(presentNpcs(state).some((npc) => npc.id === "npc_netbar_boss")).toBe(true);
    expect(beginNpcConversation(state, "npc_netbar_boss", "chat").ok).toBe(true);
  });

  it("初见开场直接离开不建关系、不耗时间；正常完成后下次才进入日常池", () => {
    const state = fresh();
    state.locationId = "cafe";
    const before = JSON.stringify(state);
    const started = beginNpcConversation(state, "npc_lin_xiaoyu", "meet");
    expect(started.ok).toBe(true);
    const opening = npcConversationView(state, started.session!)!;
    const greeted = advanceNpcConversation(state, started.session!, 0);
    expect(npcConversationView(state, greeted.session!)?.text).toContain("我叫林小雨");
    const greetingView = npcConversationView(state, greeted.session!)!;
    const nameIndex = greetingView.options.findIndex((option) => option.label.includes("告诉她名字"));
    const remembered = advanceNpcConversation(state, greeted.session!, nameIndex);
    expect(npcConversationView(state, remembered.session!)?.text).toContain("记住了");
    const guessIndex = greetingView.options.findIndex((option) => option.label.includes("你猜"));
    const guessed = advanceNpcConversation(state, greeted.session!, guessIndex);
    expect(npcConversationView(state, guessed.session!)?.text).toContain("无聊");
    expect(walkWithFirstNormal(state, guessed.session!).status).toBe("ended");

    const leaveIndex = opening.options.findIndex((option) => option.leave);
    expect(leaveIndex).toBeGreaterThanOrEqual(0);
    const left = advanceNpcConversation(state, started.session!, leaveIndex);
    const leftCommit = commitNpcConversation(state, left.session!);
    expect(leftCommit.ok).toBe(true);
    expect(leftCommit.state).toBeUndefined();
    expect(leftCommit.summary?.timeCost).toBe(0);
    expect(JSON.stringify(state)).toBe(before);

    const normal = walkWithFirstNormal(state, started.session!);
    expect(normal.pending.some((selection) => selection.stageKey === "acquaintance")).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    const committed = commitNpcConversation(state, normal);
    expect(committed.ok).toBe(true);
    expect(committed.summary?.timeCost).toBe(0.5);
    expect(findRelationship(committed.state!, "npc_lin_xiaoyu")).toBeDefined();
    expect(commitNpcConversation(committed.state!, normal).ok).toBe(false);

    const next = beginNpcConversation(committed.state!, "npc_lin_xiaoyu", "chat");
    const nextView = npcConversationView(committed.state!, next.session!)!;
    expect(next.session?.lockedStage).toBe("acquaintance");
    expect(nextView.conversationKind).toBe("daily");
  });

  it("林小雨闲聊保持可用，不再生成旧正式帮助话题", () => {
    const state=fresh(),npcId="npc_lin_xiaoyu";
    ensureRelationship(state,npcId).affinity=40;disableEvents(state,npcId);skipDailyGreeting(state,npcId);
    const chat=beginNpcConversation(state,npcId,"chat");expect(chat.ok,chat.reason).toBe(true);
    expect(npcConversationView(state,chat.session!)!.options.some(o=>o.help||o.commission||o.cityCommissionId)).toBe(false);
    expect(npcFormalTopics(state,npcId)).toEqual([]);
    expect(npcChatCountToday(state,npcId)).toBe(0);
  });

  it("没有正式事项时，话题列表为空且检查不修改存档", () => {
    const state = fresh();
    const npcId = "npc_lin_xiaoyu";
    ensureRelationship(state, npcId).affinity = 10;
    disableEvents(state, npcId);
    const before = JSON.stringify(state);
    expect(npcFormalTopics(state, npcId)).toEqual([]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("同一 NPC 每日聊天第 4、5 次婉拒，第 6 次拒绝，跨天恢复", () => {
    const npcId = "npc_lin_xiaoyu";
    let state = fresh();
    state.locationId = "cafe";
    ensureRelationship(state, npcId);
    disableEvents(state, npcId);
    skipDailyGreeting(state, npcId);

    const first = beginNpcConversation(state, npcId, "chat");
    expect(first.ok, first.reason).toBe(true);
    const firstCommitted = commitNpcConversation(state, walkWithFirstNormal(state, first.session!));
    expect(firstCommitted.ok).toBe(true);
    state = firstCommitted.state!;
    expect(npcChatCountToday(state, npcId)).toBe(1);

    // 其余次数直接把已完成的聊天次数推进到提醒后，专门验证边界分支和结算。
    state.flags[`npc_chat_day_${npcId}`] = gameDay(state.time);
    state.flags[`npc_chat_count_${npcId}`] = 3;
    const softFourth = beginNpcConversation(state, npcId, "chat");
    expect(softFourth.ok).toBe(true);
    expect(softFourth.session?.chatLimitNotice).toBe("polite");
    expect(npcConversationView(state, softFourth.session!)?.text).toBe(
      npcChatBoundaryLine(npcId, "polite", findRelationship(state, npcId)?.affinity ?? 0),
    );
    const softFourthAdvanced = advanceNpcConversation(state, softFourth.session!, 0);
    expect(softFourthAdvanced.ok).toBe(true);
    const fourthCommitted = commitNpcConversation(state, softFourthAdvanced.session!);
    expect(fourthCommitted.ok).toBe(true);
    expect(fourthCommitted.summary?.timeCost).toBe(0);
    state = fourthCommitted.state!;
    expect(npcChatCountToday(state, npcId)).toBe(4);

    const fifthAffinityBefore = findRelationship(state, npcId)!.affinity;
    const upsetFifth = beginNpcConversation(state, npcId, "chat");
    expect(upsetFifth.ok).toBe(true);
    expect(upsetFifth.session?.chatLimitNotice).toBe("upset");
    const upsetFifthAdvanced = advanceNpcConversation(state, upsetFifth.session!, 0);
    expect(upsetFifthAdvanced.ok).toBe(true);
    const fifthCommitted = commitNpcConversation(state, upsetFifthAdvanced.session!);
    expect(fifthCommitted.ok).toBe(true);
    expect(fifthCommitted.summary?.affinityDelta).toBe(-2);
    state = fifthCommitted.state!;
    expect(findRelationship(state, npcId)!.affinity).toBe(fifthAffinityBefore - 2);
    expect(npcChatCountToday(state, npcId)).toBe(5);

    const hardSixth = beginNpcConversation(state, npcId, "chat");
    expect(hardSixth).toEqual({
      ok: false,
      reason: npcChatBoundaryLine(npcId, "refusal", findRelationship(state, npcId)!.affinity),
    });

    state.time.day += 1;
    state.time.hour = 7;
    state.time.minute = 0;
    const nextDay = beginNpcConversation(state, npcId, "chat");
    expect(nextDay.ok, nextDay.reason).toBe(true);
    expect(npcChatCountToday(state, npcId)).toBe(0);
  });

  it("第三次完成的闲聊附加个性化提醒；取消不计次，重复提交不重复计次", () => {
    const npcId = "npc_lin_xiaoyu";
    const state = fresh();
    state.locationId = "cafe";
    ensureRelationship(state, npcId);
    disableEvents(state, npcId);
    skipDailyGreeting(state, npcId);

    const cancelled = beginNpcConversation(state, npcId, "chat");
    expect(cancelled.ok).toBe(true);
    // Closing the modal discards its uncommitted session; only an explicit end
    // action reaches commitNpcConversation and increments the daily counter.
    expect(npcChatCountToday(state, npcId)).toBe(0);

    state.flags[`npc_chat_day_${npcId}`] = gameDay(state.time);
    state.flags[`npc_chat_count_${npcId}`] = 2;
    const third = beginNpcConversation(state, npcId, "chat");
    expect(third.ok).toBe(true);
    const completedSession = walkWithFirstNormal(state, third.session!);
    const result = commitNpcConversation(state, completedSession);
    expect(result.ok).toBe(true);
    const afterAffinity = findRelationship(result.state!, npcId)?.affinity ?? 0;
    expect(result.text).toContain(npcChatBoundaryLine(npcId, "reminder", afterAffinity));
    expect(npcChatCountToday(result.state!, npcId)).toBe(3);

    const duplicate = commitNpcConversation(result.state!, completedSession);
    expect(duplicate.ok).toBe(false);
    expect(npcChatCountToday(result.state!, npcId)).toBe(3);
  });

  it("会话好感变化被限制在 -5 到 +5，且关系档位在会话中锁定", () => {
    expect(capNpcConversationAffinity(4, 3)).toEqual({ applied: 1, next: 5 });
    expect(capNpcConversationAffinity(-4, -3)).toEqual({ applied: -1, next: -5 });

    const state = fresh();
    const relation = ensureRelationship(state, "npc_lin_xiaoyu");
    relation.affinity = 69;
    disableEvents(state, "npc_lin_xiaoyu");
    const started = beginNpcConversation(state, "npc_lin_xiaoyu", "chat");
    expect(started.session?.lockedStage).toBe("friend");
    const view = npcConversationView(state, started.session!)!;
    const positive = view.options.findIndex((option) => !option.leave && (option.affinity ?? 0) > 0);
    expect(positive).toBeGreaterThanOrEqual(0);
    const advanced = advanceNpcConversation(state, started.session!, positive);
    expect(advanced.session?.lockedStage).toBe("friend");
    const committed = commitNpcConversation(state, walkWithFirstNormal(state, advanced.session!));
    expect(committed.ok).toBe(true);
    expect(findRelationship(committed.state!, "npc_lin_xiaoyu")?.state).toBe("close_friend");
  });

  it("日常池会轮换；当下雨天事件满足后出现，并在结算后永久排除", () => {
    let state = fresh();
    const relation = ensureRelationship(state, "npc_lin_xiaoyu");
    relation.affinity = 10;
    disableEvents(state, "npc_lin_xiaoyu");
    skipDailyGreeting(state, "npc_lin_xiaoyu");
    const nodes = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const started = beginNpcConversation(state, "npc_lin_xiaoyu", "chat");
      const view = npcConversationView(state, started.session!)!;
      expect(view.conversationKind).toBe("daily");
      nodes.add(view.nodeId);
      const committed = commitNpcConversation(state, walkWithFirstNormal(state, started.session!));
      expect(committed.ok).toBe(true);
      state = committed.state!;
    }
    expect(nodes.size).toBeGreaterThan(1);

    const eventState = fresh();
    ensureRelationship(eventState, "npc_lin_xiaoyu").affinity = 70;
    eventState.weather.id = "sunny";
    const data = NPC_DIALOGUE_REMASTER.npc_lin_xiaoyu;
    const rainy = Object.values(data.scenes).find((scene) => scene.kind === "event" && scene.conditions.some((condition) => condition.type === "rainNow"))!;
    for (const scene of Object.values(data.scenes)) {
      if (scene.kind === "event" && scene.id !== rainy.id) {
        eventState.flags[`npc_remaster_event_seen_npc_lin_xiaoyu_${scene.id}`] = true;
      }
    }
    expect(NPC_SPECIAL_EVENT_CHANCE).toBe(1);
    const dailyFallback = startAtScene(eventState, "npc_lin_xiaoyu", "close_friend", (start) => start.kind === "daily");
    expect(dailyFallback.kind).toBe("daily");

    eventState.weather.id = "rain";
    const event = startAtScene(eventState, "npc_lin_xiaoyu", "close_friend", (start) => start.kind === "event");
    expect(event.kind).toBe("event");
    expect(event.sceneId).toBe(rainy.id);

    // 特殊剧情只从正式入口出现；闲聊达到上限时仍按原规则拒聊。
    eventState.flags[`npc_chat_day_npc_lin_xiaoyu`] = gameDay(eventState.time);
    eventState.flags[`npc_chat_count_npc_lin_xiaoyu`] = 5;
    const blockedChat = beginNpcConversation(eventState, "npc_lin_xiaoyu", "chat");
    expect(blockedChat.ok).toBe(false);
    const eventTopic = npcFormalTopics(eventState, "npc_lin_xiaoyu").find((topic) => topic.id === `event:${rainy.id}`)!;
    const eventSession = beginNpcFormalConversation(eventState, "npc_lin_xiaoyu", eventTopic.id);
    expect(eventSession.ok).toBe(true);
    const eventCommit = commitNpcConversation(eventState, walkWithFirstNormal(eventState, eventSession.session!));
    expect(eventCommit.ok).toBe(true);
    expect(npcChatCountToday(eventCommit.state!, "npc_lin_xiaoyu")).toBe(5);
    const affinityAfterEvent = findRelationship(eventCommit.state!, "npc_lin_xiaoyu")?.affinity;
    const duplicateEvent = commitNpcConversation(eventCommit.state!, walkWithFirstNormal(eventState, eventSession.session!));
    expect(duplicateEvent.ok).toBe(false);
    expect(findRelationship(eventCommit.state!, "npc_lin_xiaoyu")?.affinity).toBe(affinityAfterEvent);

    eventState.flags[`npc_remaster_event_seen_npc_lin_xiaoyu_${rainy.id}`] = true;
    const afterSeen = remasterConversationStart(eventState, "npc_lin_xiaoyu", "close_friend");
    expect(afterSeen?.kind).toBe("daily");

    const directLeaveState = fresh();
    ensureRelationship(directLeaveState, "npc_lin_xiaoyu").affinity = 70;
    directLeaveState.weather.id = "rain";
    for (const scene of Object.values(data.scenes)) {
      if (scene.kind === "event" && scene.id !== rainy.id) {
        directLeaveState.flags[`npc_remaster_event_seen_npc_lin_xiaoyu_${scene.id}`] = true;
      }
    }
    startAtScene(directLeaveState, "npc_lin_xiaoyu", "close_friend", (start) => start.sceneId === rainy.id);
    const directStarted = beginNpcFormalConversation(directLeaveState, "npc_lin_xiaoyu", `event:${rainy.id}`);
    expect(directStarted.ok).toBe(true);
    const directLeave = commitNpcConversation(directLeaveState, {
      ...directStarted.session!,
      status: "ended",
      endReason: "leave",
    });
    expect(directLeave.ok).toBe(true);
    expect(directLeave.summary?.timeCost).toBe(0);
    expect(directLeave.state?.flags[`npc_remaster_event_seen_npc_lin_xiaoyu_${rainy.id}`]).toBe(true);
  });

  it("旧帮助和占位委托不再挂载到正式菜单", () => {
    for(const npcId of ["npc_lin_xiaoyu","npc_chen_jie","npc_zhao_gang"]){
      const state=fresh();ensureRelationship(state,npcId).affinity=75;
      for(const topic of npcFormalTopics(state,npcId)){
        expect(topic.npcTaskTopicId).toBeTruthy();
        expect(topic.options?.some(o=>o.help||o.commission||o.cityCommissionId||o.cityCommissionDeliver)).toBe(false);
      }
    }
  });

  it("林小雨的速写本特殊事件奖励会入背包", () => {
    const state = fresh();
    ensureRelationship(state, "npc_lin_xiaoyu").affinity = 40;
    const data = NPC_DIALOGUE_REMASTER.npc_lin_xiaoyu;
    const sketchbook = Object.values(data.scenes).find((scene) => scene.reward?.itemId === "lin_xiaoyu_sketchbook")!;
    state.flags.npc_remaster_visit_streak_npc_lin_xiaoyu = 3;
    for (const scene of Object.values(data.scenes)) {
      if (scene.kind === "event" && scene.id !== sketchbook.id) {
        state.flags[`npc_remaster_event_seen_npc_lin_xiaoyu_${scene.id}`] = true;
      }
    }
    const start = startAtScene(state, "npc_lin_xiaoyu", "friend", (candidate) => candidate.sceneId === sketchbook.id);
    expect(start.kind).toBe("event");
    const topic = npcFormalTopics(state, "npc_lin_xiaoyu").find((candidate) => candidate.id === `event:${sketchbook.id}`)!;
    const started = beginNpcFormalConversation(state, "npc_lin_xiaoyu", topic.id);
    expect(started.session?.sceneId).toBe(sketchbook.id);
    const committed = commitNpcConversation(state, walkWithFirstNormal(state, started.session!));
    expect(committed.ok).toBe(true);
    expect(committed.state?.inventory.lin_xiaoyu_sketchbook).toBe(1);
    expect(committed.state?.flags[`npc_remaster_event_seen_npc_lin_xiaoyu_${sketchbook.id}`]).toBe(true);
    const afterSeen = remasterConversationStart(committed.state!, "npc_lin_xiaoyu", "friend");
    expect(afterSeen?.kind).toBe("daily");
  });
});
