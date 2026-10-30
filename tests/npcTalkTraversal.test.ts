// @vitest-environment node
/**
 * NPC 对话全图遍历审计（v1.43.1）
 * 把每位 NPC 的会话图走一遍，断言：
 *  1. 不存在「既没有选项、也没有结束」的死路节点（玩家会卡住）
 *  2. 不存在空台词节点（进去只有空框）
 *  3. 每个选项都能推进；且主角回应的**清洗后结果**要么为空（界面会跳过播放），
 *     要么至少能产出一行 —— 否则会进入「玩家阶段」却没有任何可显示/可点击内容（真卡死）
 */
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import {
  advanceNpcConversation,
  beginNpcConversation,
  npcConversationView,
  type NpcConversationSession,
} from "../src/game/core/npcTalk";
import { allNpcs, npcPresenceAt } from "../src/game/core/npcs";
import { dialogueLines, playerReplyText } from "../src/game/core/npcPortraits";
import { addAffinity, ensureRelationship } from "../src/game/core/relationships";
import { gameDay, weekdayOf } from "../src/game/core/calendar";
import { markGreeted } from "../src/game/data/npcGreetings";
import { NPC_DIALOGUE_REMASTER } from "../src/game/data/npcDialogueRemaster";

const NPC_IDS = allNpcs().map(n=>n.id);
const MAX_STEPS = 600;

function walk(npcId: string, seed: number, affinity: number): { problems: string[]; visited: number } {
  const problems: string[] = [];
  let visited = 0;
  const state = createInitialState(seed);
  let foundPresence = false;
  for (let day = 1; day <= 31 && !foundPresence; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const presence = npcPresenceAt(npcId, { weekday: weekdayOf({ ...state.time, day }), hour, minute: 0 });
      if (!presence) continue;
      state.time.day = day;
      state.time.hour = hour;
      state.locationId = presence.locationId;
      if (presence.regionId) state.region = presence.regionId;
      foundPresence = true;
      break;
    }
  }
  if (!foundPresence) return { problems: [`${npcId} 没有可用排班时刻`], visited };
  if (affinity > 0) {
    state.flags.npc_introduction_m02_complete = true;
    ensureRelationship(state, npcId);
    addAffinity(state, npcId, affinity, "talk");
  }

  for (const entry of ["meet", "chat"] as const) {
    // 当天首次搭话会命中「每日问候」（只有一轮、两个结束型选项），
    // 会把遍历卡在问候里 —— 先标记今天已打过招呼，才能走进日常池。
    markGreeted(state, npcId, gameDay(state.time));
    const begin = beginNpcConversation(state, npcId, entry);
    if (!begin.ok || !begin.session) continue;
    const queue: NpcConversationSession[] = [begin.session];
    const seen = new Set<string>();
    let steps = 0;

    while (queue.length > 0) {
      const session = queue.shift() as NpcConversationSession;
      steps += 1;
      if (steps > MAX_STEPS) {
        problems.push(`${npcId}/${entry} 遍历步数超过 ${MAX_STEPS}（疑似循环）`);
        break;
      }
      if (session.status === "ended") continue;

      const view = npcConversationView(state, session);
      if (!view) {
        problems.push(`${npcId}/${entry} 节点 ${session.nodeId} 无法生成视图`);
        continue;
      }
      const key = `${session.sceneId ?? "-"}|${session.stageKey}|${session.nodeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      visited += 1;

      if (view.options.length === 0) {
        problems.push(`${npcId}/${entry} 死路节点（无选项且未结束）：${key}`);
        continue;
      }
      if (dialogueLines(view.text).length === 0) {
        problems.push(`${npcId}/${entry} 空台词节点：${key}`);
      }

      for (let i = 0; i < view.options.length; i += 1) {
        const option = view.options[i];
        const reply = playerReplyText(option, state.player.name);
        if (reply && dialogueLines(reply).length === 0) {
          problems.push(
            `${npcId}/${entry} 选项回应清洗后为空（会卡在玩家阶段）：${key} #${i}「${option.label}」`,
          );
        }
        const advanced = advanceNpcConversation(state, session, i);
        if (advanced.ok && advanced.session) {
          queue.push(advanced.session);
        } else {
          problems.push(`${npcId}/${entry} 选项无法推进：${key} #${i}「${option.label}」`);
        }
      }
    }
  }
  return { problems, visited };
}

describe("NPC 对话全图遍历审计", () => {
  it("覆盖 9 位 NPC：无死路节点、无空台词、选项均可推进", () => {
    expect(NPC_IDS.length).toBeGreaterThanOrEqual(9);
    const problems: string[] = [];
    let visited = 0;
    // 日常池条目按 rng 随机抽取，单个种子只能覆盖少量节点；
    // 用多组种子 × 三档关系，才能把整张会话图铺开。
    const seeds = Array.from({ length: 40 }, (_, index) => 7 + index * 11);
    for (const npcId of NPC_IDS) {
      for (const seed of seeds) {
        for (const affinity of [0, 40, 95]) {
          const result = walk(npcId, seed, affinity);
          problems.push(...result.problems);
          visited += result.visited;
        }
      }
    }
    // 防“空转”：遍历必须真的走进大量节点，否则测试没有意义
    expect(visited, `实际遍历节点数仅 ${visited}`).toBeGreaterThan(600);
    expect([...new Set(problems)].slice(0, 12).join("\n")).toEqual("");
  });

  it("覆盖每位 NPC 的实际排班地点：初见、相识、朋友和挚友入口都能显示台词", () => {
    const problems: string[] = [];
    let checkedLocations = 0;
    const stageAffinities = [0, 40, 70];

    function placementFor(npcId: string, locationId: string): {
      seed: number;
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      regionId?: string;
    } | null {
      const probe = createInitialState(700 + checkedLocations);
      for (let day = 1; day <= 30; day += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
          for (const minute of [0, 30]) {
            probe.time.day = day;
            probe.time.hour = hour;
            probe.time.minute = minute;
            const presence = npcPresenceAt(npcId, {
              ...probe.time, seed: probe.rng.seed, weekday: weekdayOf(probe.time),
              hour,
              minute,
            });
            if (presence?.locationId === locationId) {
              return {
                seed: probe.rng.seed,
                year: probe.time.year,
                month: probe.time.month,
                day,
                hour,
                minute,
                regionId: presence.regionId,
              };
            }
          }
        }
      }
      return null;
    }

    for (const npc of allNpcs()) {
      const locations = [...new Set((npc.weeklySchedule ?? []).map((entry) => entry.locationId))];
      for (const locationId of locations) {
        const placement = placementFor(npc.id, locationId);
        if (!placement) {
          problems.push(`${npc.id}/${locationId} 没有可用排班时刻`);
          continue;
        }
        checkedLocations += 1;

        const stateAtPlacement = (seed: number) => {
          const state = createInitialState(seed);
          state.rng.seed = placement.seed;
          state.locationId = locationId;
          state.time.year = placement.year;
          state.time.month = placement.month;
          state.time.day = placement.day;
          state.time.hour = placement.hour;
          state.time.minute = placement.minute;
          if (placement.regionId) state.region = placement.regionId;
          return state;
        };

        const meetState = stateAtPlacement(800 + checkedLocations);
        const meet = beginNpcConversation(meetState, npc.id, "meet");
        const meetView = meet.session ? npcConversationView(meetState, meet.session) : null;
        if (!NPC_DIALOGUE_REMASTER[npc.id]?.meetSceneId) {
          expect(meet.ok, `${npc.id} 应使用共同初见`).toBe(false);
        } else if (!meet.ok || !meet.session || !meetView || dialogueLines(meetView.text).length === 0 || meetView.options.length === 0) {
          problems.push(`${npc.id}/${locationId}/meet 初见入口没有完整台词或选项`);
        }

        for (const affinity of stageAffinities) {
          const chatState = stateAtPlacement(900 + checkedLocations + affinity);
          chatState.flags.npc_introduction_m02_complete = true;
          const relation = ensureRelationship(chatState, npc.id);
          relation.affinity = affinity;
          // 跳过当天一次性问候，直接检查正式的阶段/场景对话池。
          markGreeted(chatState, npc.id, gameDay(chatState.time));
          const chat = beginNpcConversation(chatState, npc.id, "chat");
          const chatView = chat.session ? npcConversationView(chatState, chat.session) : null;
          if (!chat.ok || !chat.session || !chatView || dialogueLines(chatView.text).length === 0 || chatView.options.length === 0) {
            problems.push(`${npc.id}/${locationId}/chat affinity=${affinity} 没有完整台词或选项`);
          }
        }
      }
    }

    expect(checkedLocations).toBeGreaterThanOrEqual(9);
    expect(problems.join("\n")).toBe("");
  });
});
