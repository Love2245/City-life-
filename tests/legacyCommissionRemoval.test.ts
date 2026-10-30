import { describe, expect, it } from 'vitest';
import type { GameState, Quest } from '../src/game/types';
import type { NpcTalkOption } from '../src/game/core/npcs';
import { allNpcs } from '../src/game/core/npcs';
import { createInitialState } from '../src/game/core/state';
import { ensureRelationship } from '../src/game/core/relationships';
import { gameDay } from '../src/game/core/calendar';
import { migrateSave, SAVE_VERSION } from '../src/game/core/migrate';
import { activeQuests, refreshDailyQuests } from '../src/game/core/quests';
import { advanceHours, tickNpcCommissions } from '../src/game/core/time';
import { executeNpcTaskAction, getNpcTaskQuest, getNpcTaskTopics } from '../src/game/core/npcTasks';
import { CURRENT_NPC_TASK_IDS, removeRetiredNpcTasks } from '../src/game/core/npcTaskAvailability';
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE } from '../src/game/data/npcIntroductionProgress';
import { NPC_DIALOGUE_SEEDS } from '../src/game/data/npcDialogueData';
import npcData from '../src/game/data/npcs.json';
import {
  advanceNpcConversation, beginNpcConversation, beginNpcFormalConversation, commitNpcConversation,
  npcConversationView, npcFormalTopics, npcTalkOptionAvailable,
} from '../src/game/core/npcTalk';
import {
  acceptCityCommission, deliverCityCommissionStep, markCityCommissionAction, markCityCommissionLocation,
  progressCityCommission, refreshCityCommissionOffers, tickCityCommissions,
} from '../src/game/core/cityCommissions';

function fresh(): GameState {
  const s = createInitialState(149218);
  Object.assign(s.time, { year: 2026, month: 8, day: 3, hour: 9, minute: 0 });
  s.locationId = 'labor_market'; s.region = 'downtown_industrial'; s.player.money = 1000;
  s.flags[INTRO_FIRST_COMPLETE] = true; s.flags[INTRO_SECOND_COMPLETE] = true;
  for (const npc of allNpcs()) ensureRelationship(s, npc.id).affinity = 75;
  return s;
}

function legacy(id = 'old_contract', status: Quest['status'] = 'active', city = false): Quest {
  return { id, type: 'story', title: '旧占位委托', icon: '📋', desc: '无需过程的旧奖励', day: 0, status,
    commission: { npcId: 'npc_chen_jie', days: 1, startDay: 0, rewardEffects: { money: 9999, mood: 10 }, rewardText: '9999元',
      ...(city ? { commissionId: 'city_market_weekend_stock', stepIndex: 2, deadlineDay: 0 } : {}) } };
}

function realTasks(): GameState {
  let s = fresh();
  for (const taskId of CURRENT_NPC_TASK_IDS) {
    const accepted = executeNpcTaskAction(s, 'npc_zhao_gang', { taskId, action: 'accept' });
    expect(accepted.ok, accepted.reason).toBe(true); s = accepted.state!;
  }
  s.locationId = 'boyue_fast_food'; s.region = 'boyue_mall';
  const bought = executeNpcTaskAction(s, null, { taskId: 'zhao_toy', action: 'buy_toy' });
  expect(bought.ok, bought.reason).toBe(true);
  return bought.state!;
}

describe('1.492 仅保留已经确定的实体任务', () => {
  it('所有人物各关系阶段的正式菜单只会来自两条批准任务，查询不改变存档', () => {
    const s = fresh();
    for (const affinity of [0, 19, 20, 39, 40, 69, 70, 100]) for (const npc of allNpcs()) {
      ensureRelationship(s, npc.id).affinity = affinity;
      const before = JSON.stringify(s);
      const allowed = new Set(getNpcTaskTopics(s, npc.id, 'formal').map(t => t.id));
      for (const topic of npcFormalTopics(s, npc.id)) {
        expect(allowed.has(topic.npcTaskTopicId!)).toBe(true);
        expect(topic.options?.some(o => o.help || o.commission || o.cityCommissionId || o.cityCommissionDeliver)).toBe(false);
      }
      expect(JSON.stringify(s)).toBe(before);
    }
    ensureRelationship(s, 'npc_zhao_gang').affinity = 75;
    expect(npcFormalTopics(s, 'npc_zhao_gang').map(t => t.label)).toEqual(['给孩子留一份', '展会看场的人手']);
  });

  it('兼容人物种子和旧JSON均不再包含占位奖励配置', () => {
    const oldAction = /"(?:help|commission|cityCommissionId|cityCommissionDeliver)"\s*:/;
    expect(JSON.stringify(NPC_DIALOGUE_SEEDS)).not.toMatch(oldAction);
    expect(JSON.stringify(npcData)).not.toMatch(oldAction);
  });

  it.each([33, 34])('v%s读档清理各状态旧委托，同时保留实体任务进度、普通工作、资产与剧情', version => {
    const s = realTasks(); s.version = version;
    const day = gameDay(s.time);
    const ordinary: Quest[] = [
      { id: 'ordinary_job', type: 'job', title: '已做的工作', icon: '', desc: '', day, status: 'done' },
      { id: 'ordinary_story', type: 'story', title: '普通剧情提示', icon: '', desc: '', day: day + 2, status: 'pending' },
      { id: 'ordinary_main', type: 'main', title: '普通目标', icon: '', desc: '', day: day + 2, status: 'pending' },
    ];
    s.quests.push(...ordinary);
    const approved = structuredClone(s.quests);
    for (const status of ['active', 'done', 'failed', 'missed', 'pending'] as const) s.quests.push(legacy('old_' + status, status));
    s.quests.push(legacy('city_old', 'active', true));
    s.cityCommissions = { weekIndex: 10, offeredIds: ['city_snack_signature'], activeId: 'city_market_weekend_stock', cooldownUntilDay: { city_snack_signature: 999 } };
    s.flags.npc_story_progress_kejie = 3;
    s.dailyGoals = [{ id: 'eat_hot', text: '吃一顿热的', done: false, reward: { mood: 2 } }];
    const original = JSON.stringify(s);
    const loaded = migrateSave(s);
    expect(JSON.stringify(s)).toBe(original);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.quests).toEqual(approved);
    expect(loaded.inventory).toEqual(s.inventory);
    // 既有读档规范会补上缺省 debt=0；所有已经保存的人物数值保持一致。
    expect(loaded.player).toMatchObject(s.player);
    expect(loaded.player.debt).toBe(s.player.debt ?? 0);
    expect(loaded.relationships).toEqual(s.relationships);
    expect(loaded.dailyGoals).toBeUndefined();
    expect(loaded.flags.npc_story_progress_kejie).toBe(3);
    expect(loaded.cityCommissions).toEqual({ weekIndex: 0, offeredIds: [], activeId: null, cooldownUntilDay: {} });
    refreshDailyQuests(loaded);
    expect(loaded.quests).toHaveLength(approved.length);
    expect(loaded.quests).toEqual(expect.arrayContaining(approved));
    expect(getNpcTaskQuest(loaded, 'zhao_toy')!.npcTask).toEqual(getNpcTaskQuest(s, 'zhao_toy')!.npcTask);
  });

  it('跨年与跨日推进相对干净存档没有额外领奖、扣款或关系变化', () => {
    const clean = fresh(); Object.assign(clean.time, { year: 2026, month: 12, day: 31, hour: 22 });
    const dirty = structuredClone(clean);
    dirty.quests.push(legacy(), legacy('old_city', 'active', true));
    dirty.cityCommissions = { weekIndex: 5, offeredIds: ['city_market_weekend_stock'], activeId: 'city_market_weekend_stock', cooldownUntilDay: {} };
    advanceHours(clean, 28); advanceHours(dirty, 28);
    expect(dirty.player.money).toBe(clean.player.money);
    expect(dirty.inventory).toEqual(clean.inventory);
    expect(dirty.relationships).toEqual(clean.relationships);
    expect(dirty.quests).toEqual(clean.quests);
    expect(dirty.cityCommissions).toEqual(clean.cityCommissions);
    expect(dirty.log.some(l => /旧占位委托.*完成|没完成.*旧占位/.test(l.text))).toBe(false);
  });

  it('旧API不再扣物或发奖；即使残留合同和周候选也不能交付', () => {
    const s = fresh(); s.quests.push(legacy('old_city', 'active', true)); s.inventory.rice = 5;
    s.cityCommissions.activeId = 'city_market_weekend_stock';
    const before = JSON.stringify(s);
    for (const result of [acceptCityCommission(s, 'city_market_weekend_stock'), progressCityCommission(s, { deliver: true }),
      deliverCityCommissionStep(s), markCityCommissionAction(s, 'farm', 'anything'), markCityCommissionLocation(s, 'flower_market')]) {
      expect(result.ok).toBe(false);
    }
    expect(JSON.stringify(s)).toBe(before);
    tickNpcCommissions(s); tickCityCommissions(s); refreshCityCommissionOffers(s);
    expect(s.quests).toEqual([]); expect(s.player.money).toBe(1000); expect(s.inventory.rice).toBe(5);
  });

  it('待办纯读取先隐藏残留记录；反复清理不重建干净数组，也不制造日志', () => {
    const s = realTasks(), approved = structuredClone(s.quests);
    s.quests.push(legacy(), { ...legacy('comm_orphan'), commission: undefined });
    const dirty = JSON.stringify(s);
    expect(activeQuests(s).map(q => q.id).sort()).toEqual(approved.map(q => q.id).sort());
    expect(JSON.stringify(s)).toBe(dirty);
    removeRetiredNpcTasks(s);
    const quests = s.quests, city = s.cityCommissions, before = JSON.stringify(s);
    for (let i = 0; i < 100; i++) removeRetiredNpcTasks(s);
    expect(s.quests).toBe(quests); expect(s.cityCommissions).toBe(city); expect(JSON.stringify(s)).toBe(before);
  });

  it.each([
    { help: { log: '旧即时帮助', reward: { money: 999 } } },
    { commission: { title: '旧占位', desc: '', days: 1, reward: { money: 999 }, rewardText: '999元' } },
    { cityCommissionId: 'city_market_weekend_stock' },
    { cityCommissionDeliver: true, cityCommissionStepIndex: 2 },
  ])('旧会话待提交动作失效，不经普通对话效果变相领奖：%j', old => {
    const s = fresh(); s.locationId = 'fast_food'; s.region = 'downtown_mall'; s.time.hour = 10;
    const started = beginNpcConversation(s, 'npc_chen_jie', 'chat'); expect(started.ok, started.reason).toBe(true);
    let session = started.session!;
    for (let i = 0; i < 100 && session.status === 'active'; i++) {
      const next = advanceNpcConversation(s, session, 0); expect(next.ok, next.reason).toBe(true); session = next.session!;
    }
    expect(session.pending.length).toBeGreaterThan(0);
    const option: NpcTalkOption = { label: '旧提交', effects: { money: 999 }, ...old };
    expect(npcTalkOptionAvailable(s, option)).toBe(false);
    const stale = structuredClone(session); stale.pending[0].option = option;
    const before = JSON.stringify(s), result = commitNpcConversation(s, stale);
    expect(result.ok).toBe(false); expect(result.reason).toContain('已移除'); expect(JSON.stringify(s)).toBe(before);
    expect(beginNpcFormalConversation(s, 'npc_chen_jie', 'request:old').ok).toBe(false);
    expect(npcConversationView(s, started.session!)).toBeDefined();
  });
});
