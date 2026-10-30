import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import type { GameState } from '../src/game/types';
import { ensureRelationship, findRelationship } from '../src/game/core/relationships';
import { gameDay } from '../src/game/core/calendar';
import { getNpcDef } from '../src/game/core/npcs';
import { NPC_DIALOGUE_REMASTER, remasterDailyConversationStart, remasterEligibleEvents } from '../src/game/data/npcDialogueRemaster';
import { availableNpcIntroduction, npcIntroduction } from '../src/game/data/npcSharedIntroductions';
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE, LOUNGE_BEER_COUPON } from '../src/game/data/npcIntroductionProgress';
import { advanceNpcConversation, beginNpcConversation, beginNpcFormalConversation, beginNpcIntroduction, commitNpcConversation, npcCasualTopics, npcConversationView, npcFormalTopics, presentNpcs, type NpcConversationSession } from '../src/game/core/npcTalk';
import { getAction, performAction } from '../src/game/core/actions';
import { maybeMeetNpc } from '../src/game/core/romance';
import { npcDialogueBeats } from '../src/game/core/npcDialoguePlayback';
import {NPC_CONTEXT_DIALOGUES,contextDialogueDayFlag} from '../src/game/data/npcContextDialogues';

const brother = 'npc_fan_kejie', sister = 'npc_fan_kexi', jack = 'npc_jack_fanma';
function at(locationId = 'boyue_snack_street', hour = 18): GameState {
  const state = createInitialState(77);
  Object.assign(state.time, { year: 2026, month: 8, day: 3, hour, minute: 0 });
  state.locationId = locationId; state.region = 'boyue_night_market'; state.player.money = 1000000;
  return state;
}
function advance(state: GameState, session: NpcConversationSession, index = 0): NpcConversationSession {
  const result = advanceNpcConversation(state, session, index);
  expect(result.ok, result.reason).toBe(true); return result.session!;
}
function finish(state: GameState, session: NpcConversationSession, choose?: (s: NpcConversationSession) => number): NpcConversationSession {
  let count = 0;
  while (session.status === 'active' && count++ < 45) session = advance(state, session, choose?.(session) ?? 0);
  expect(session.status).toBe('ended'); return session;
}
function intro(state: GameState, id: string, decline = false): GameState {
  const started = beginNpcIntroduction(state, id); expect(started.ok, started.reason).toBe(true);
  const ended = finish(state, started.session!, session => decline && session.nodeId === 'm1_invite' ? 2 : 0);
  const committed = commitNpcConversation(state, ended); expect(committed.ok, committed.reason).toBe(true);
  expect(committed.summary?.timeCost).toBe(.5); return committed.state!;
}
function known(npcId: string, affinity: number, locationId: string, region: string, hour: number): GameState {
  const state = at(locationId, hour); state.region = region; state.flags[INTRO_SECOND_COMPLETE] = true;
  const r = ensureRelationship(state, npcId); r.affinity = affinity; r.state = affinity >= 70 ? 'close_friend' : affinity >= 40 ? 'friend' : 'acquaintance';
  return state;
}

describe('twelve-person manuscript integration', () => {
  it('keeps all 298 scene units, including 45 original stories, with explicit routing', () => {
    const all = Object.values(NPC_DIALOGUE_REMASTER).flatMap(data => Object.values(data.scenes));
    expect(Object.keys(NPC_DIALOGUE_REMASTER)).toHaveLength(12);
    expect(all).toHaveLength(296); // M01/M02 have separate temporary casts.
    expect(all.filter(s => s.kind === 'daily')).toHaveLength(178);
    expect(all.filter(s => s.kind === 'topic' && s.channel === 'chat')).toHaveLength(52);
    expect(all.filter(s => s.kind === 'topic' && s.channel === 'formal')).toHaveLength(12);
    expect(all.filter(s => s.kind === 'event')).toHaveLength(45);
    expect(all.filter(s => s.kind === 'event').every(s => s.channel === 'formal' && !s.casualChat)).toBe(true);
  });
  it('bounds every scene correctly and does not expose author notes, headings or unknown actors', () => {
    for (const [id, data] of Object.entries(NPC_DIALOGUE_REMASTER)) for (const [key, stage] of Object.entries(data.talk)) {
      for (const node of Object.values(stage.nodes)) {
        expect(node.text.trim(), node.id).not.toBe('');
        expect(node.text, `${id}/${key}/${node.id}`).not.toMatch(/作者说明|本场入场窗口|^##|关系：|后续变化|\*\*/m);
        expect(node.speeches?.every(s => s.speakerId === null || s.speakerId === 'player' || s.speakerId === id)).toBe(true);
        for (const option of node.options) if (option.next) expect(stage.nodes[option.next], option.next).toBeDefined();
      }
    }
    for (const id of ['M01', 'M02']) {
      const scene = npcIntroduction(id)!; expect(scene.nodes[scene.start]).toBeDefined();
      for (const node of Object.values(scene.nodes)) {
        expect(node.speeches.every(s => s.speakerId === null || scene.participants.includes(s.speakerId))).toBe(true);
        for (const o of node.options) if (o.next) expect(scene.nodes[o.next], o.next).toBeDefined();
      }
    }
    const jackText = Object.values(NPC_DIALOGUE_REMASTER[jack].talk.friend!.nodes).filter(n => n.id.includes('_d14_')).map(n => n.text).join('\n');
    expect(jackText).toContain('柯杰来晚了'); expect(jackText).not.toMatch(/珂汐|她/);
  });
  it.each([0, 19, 20, 39, 40, 69, 70, 100])('selects daily scenes from the authored affection band at %i', affinity => {
    for (const npcId of [brother, sister, jack, 'npc_lin_xiaoyu']) {
      const data = NPC_DIALOGUE_REMASTER[npcId];
      const stage = affinity >= 70 ? 'close_friend' : affinity >= 40 ? 'friend' : 'acquaintance';
      const location = npcId === sister ? 'dev_university' : npcId === jack ? 'boyue_engineering_college' : npcId === brother ? 'boyue_lounge_bar' : 'cafe';
      const s = at(location); const start = remasterDailyConversationStart(s, npcId, stage, affinity);
      if (start) {
        const scene = data.scenes[start.sceneId]; expect(['daily','topic','event']).toContain(scene.kind);
        expect(affinity).toBeGreaterThanOrEqual(scene.minAffinity??0); if(scene.kind==='daily')expect(affinity).toBeLessThanOrEqual(scene.maxAffinity ?? 100);
      }
      expect(Object.values(data.scenes).filter(s => s.kind === 'daily' && affinity >= s.minAffinity! && affinity <= (s.maxAffinity ?? 100)).length).toBeGreaterThan(0);
    }
  });
  it('keeps life fragments in casual chat, preserves old growth conditions, and treats quotations as explicit speakers', () => {
    const s = known('npc_lin_xiaoyu', 45, 'cafe', 'downtown_residential', 8);
    const topics = npcCasualTopics(s, 'npc_lin_xiaoyu'); expect(topics.some(t => t.id === 'reset_topic_t01')).toBe(false);
    const result = beginNpcConversation(s, 'npc_lin_xiaoyu', 'chat', 'reset_topic_t01'); expect(result.ok, result.reason).toBe(true);
    expect(result.session!.greetingNode).toBeUndefined(); expect(result.session!.sceneId).toBe('reset_topic_t01');
    const completed = commitNpcConversation(s, finish(s, result.session!)); expect(completed.ok, completed.reason).toBe(true);
    expect(completed.state!.flags.npc_chat_count_npc_lin_xiaoyu).toBe(1);
    expect(completed.state!.flags.npc_remaster_event_seen_npc_lin_xiaoyu_reset_story_e01).toBeUndefined();
    s.flags.npc_remaster_daily_seen_npc_lin_xiaoyu_reset_daily_friend_d07 = true;
    expect(npcFormalTopics(s, 'npc_lin_xiaoyu').some(t => t.sceneId === 'reset_story_e01')).toBe(false);
    expect(remasterEligibleEvents(s,'npc_lin_xiaoyu','friend',45).some(event=>event.sceneId==='reset_story_e01')).toBe(true);
    const xState = known('npc_chen_jie', 25, 'fast_food', 'downtown_mall', 13);
    const x = beginNpcConversation(xState, 'npc_chen_jie', 'chat', 'reset_group_x01'); expect(x.ok, x.reason).toBe(true);
    const view = npcConversationView(xState, x.session!)!;
    expect(view.participants).toBeUndefined();
    expect(npcDialogueBeats(view.text, view.npcId, view.speeches).some(b => b.speakerId === 'player')).toBe(true);
    expect(view.speeches?.some(b => b.speakerId === 'npc_zhao_gang' || b.speakerId === 'npc_wang_lei')).toBe(false);
  });
  it('preserves a daily narrative even when the same root can offer a formal commission', () => {
    const s = known('npc_lin_xiaoyu', 45, 'cafe', 'downtown_residential', 8);
    s.flags.npc_greet_day_npc_lin_xiaoyu = gameDay(s.time);
    for(const scene of Object.values(NPC_CONTEXT_DIALOGUES))s.flags[contextDialogueDayFlag(scene.id)]=gameDay(s.time);
    const begin = beginNpcConversation(s, 'npc_lin_xiaoyu', 'chat'); expect(begin.ok, begin.reason).toBe(true);
    const view = npcConversationView(s, begin.session!)!;
    const node = getNpcDef(view.npcId)!.talk![view.stageKey]!.nodes[view.nodeId];
    expect(view.text).toBe(node.text); expect(view.speeches).toEqual(node.speeches);
  });
  it('unlocks the quoted parents question only after the brother’s actual D24 is committed', () => {
    const s = known(sister, 80, 'dev_university', 'development_university', 10);
    const topicId = 'topic:reset_daily_close_friend_d24';
    const begin = () => beginNpcConversation(s, sister, 'chat', topicId.replace(/^topic:/,''));
    expect(begin().ok).toBe(true);
    expect(npcConversationView(s, begin().session!)!.options.some(o => o.label.includes('都死了'))).toBe(false);
    let b = known(brother, 80, 'boyue_lounge_bar', 'boyue_night_market', 19);
    const started = beginNpcConversation(b, brother, 'chat', topicId.replace(/^topic:/,'')); expect(started.ok, started.reason).toBe(true);
    expect(b.flags.npc_heard_kejie_parents_dead).toBeUndefined();
    const committed = commitNpcConversation(b, finish(b, started.session!)); expect(committed.ok, committed.reason).toBe(true);
    b = committed.state!; s.flags.npc_heard_kejie_parents_dead = b.flags.npc_heard_kejie_parents_dead;
    expect(npcConversationView(s, begin().session!)!.options.some(o => o.label.includes('都死了'))).toBe(true);
    expect(npcFormalTopics(b, brother).some(t => t.id === topicId)).toBe(false);
    expect(beginNpcConversation(b,brother,'chat',topicId.replace(/^topic:/,'')).ok).toBe(false);
    expect(b.flags[`npc_chat_count_${brother}`]).toBe(1);
  });
});

describe('shared introductions and restoration of original schedules', () => {
  it('hides ordinary appearances and blocks automatic introductions until M02, including old known relationships', () => {
    const s = at('boyue_lounge_bar', 20); ensureRelationship(s, brother);
    expect(presentNpcs(s).some(n => n.id === brother)).toBe(false);
    expect(beginNpcConversation(s, brother, 'chat').ok).toBe(false);
    expect(npcFormalTopics(s, brother)).toEqual([]);
    const k = at('dev_university', 10); k.region = 'development_university';
    k.flags[`meet_visits_${sister}`] = 100;
    maybeMeetNpc(k, k.locationId); expect(findRelationship(k, sister)).toBeUndefined();
  });
  it.each([true, false])('completes both openings on one day and grants the coupon only when accepted=%s', accept => {
    const s = at(); const before = JSON.stringify(s);
    const first = intro(s, 'M01', !accept); expect(JSON.stringify(s)).toBe(before);
    expect(first.flags[INTRO_FIRST_COMPLETE]).toBe(true); expect(first.flags[INTRO_SECOND_COMPLETE]).toBeUndefined();
    expect(first.inventory[LOUNGE_BEER_COUPON] ?? 0).toBe(accept ? 1 : 0); expect(first.player.money).toBe(s.player.money);
    expect(findRelationship(first, sister)).toBeDefined(); expect(findRelationship(first, jack)).toBeUndefined();
    first.locationId = 'boyue_lounge_bar'; expect(availableNpcIntroduction(first)?.id).toBe('M02');
    const second = intro(first, 'M02'); expect(gameDay(second.time)).toBe(gameDay(s.time));
    expect(second.flags[INTRO_SECOND_COMPLETE]).toBe(true); expect(findRelationship(second, jack)).toBeDefined();
    expect(presentNpcs(second).map(n => n.id)).toContain(brother); expect(presentNpcs(second).map(n => n.id)).not.toContain(sister);
    expect(beginNpcIntroduction(second, 'M01').ok).toBe(false); expect(beginNpcIntroduction(second, 'M02').ok).toBe(false);
  });
  it('keeps Jack and Kejie as the entire M02 cast and removes Kexi before the M01 invitation without changing the height reference', () => {
    expect(npcIntroduction('M02')!.participants).toEqual([brother, jack]);
    for (const node of Object.values(npcIntroduction('M02')!.nodes)) {
      expect(node.speeches.some(s => s.speakerId === sister)).toBe(false);
      expect(node.speeches.map(s => s.text).join('\n')).not.toMatch(/珂汐/);
    }
    const s = at(); let session = beginNpcIntroduction(s, 'M01').session!;
    while (session.nodeId !== 'm1_invite') session = advance(s, session);
    const view = npcConversationView(s, session)!; expect(view.participants).toEqual([brother, sister]); expect(view.presentParticipants).toEqual([brother]);
  });
  it('allows leave and retry without settling partial progress or reissuing a coupon', () => {
    const s = at(); let session = beginNpcIntroduction(s, 'M01').session!;
    const leaveIndex = npcConversationView(s, session)!.options.findIndex(o => o.next === 'm1_leave');
    session = finish(s, advance(s, session, leaveIndex)); const cancelled = commitNpcConversation(s, session);
    expect(cancelled.ok).toBe(true); expect(cancelled.summary!.timeCost).toBe(0);
    expect(cancelled.state!.flags[INTRO_FIRST_COMPLETE]).toBeUndefined(); expect(cancelled.state!.relationships).toEqual(s.relationships);
    const first = intro(cancelled.state!, 'M01'); first.locationId = 'boyue_lounge_bar';
    let second = beginNpcIntroduction(first, 'M02').session!;
    second = finish(first, advance(first, second, 2)); const left = commitNpcConversation(first, second);
    expect(left.ok, left.reason).toBe(true); expect(left.state!.flags[INTRO_FIRST_COMPLETE]).toBe(true);
    expect(left.state!.flags[INTRO_SECOND_COMPLETE]).toBeUndefined(); expect(left.state!.inventory[LOUNGE_BEER_COUPON]).toBe(1);
    const retried = intro(left.state!, 'M02'); expect(retried.inventory[LOUNGE_BEER_COUPON]).toBe(1);
  });
  it.each([0, 4, 5, 19, 20, 99, 100, 9999, 10000, 100000, 1000000, Number.MAX_VALUE])('checks each escalating price against cash %s, without deducting it', cash => {
    const s = at(); s.player.money = cash; let session = beginNpcIntroduction(s, 'M01').session!;
    let quoteRounds = 0;
    while (session.status === 'active') {
      const view = npcConversationView(s, session)!;
      if (session.nodeId === 'm1_more') { quoteRounds++; expect(view.text).not.toContain('【当前报价】'); }
      const willing = view.options.findIndex(o => o.cashCondition?.minimum != null || o.cashQuoteCondition?.affordable === true);
      session = advance(s, session, willing >= 0 ? willing : 0);
      expect(s.player.money).toBe(cash); if (quoteRounds > 310) throw Error('Quote loop did not terminate');
    }
    const committed = commitNpcConversation(s, session); expect(committed.ok, committed.reason).toBe(true); expect(committed.state!.player.money).toBe(cash);
    if (cash >= 100000) expect(quoteRounds).toBeGreaterThan(1);
  });
  it('preserves old relationships and story flags, rejects duplicate/stale/forged commits, and restores schedules at the settled clock', () => {
    const old = at(); for (const [id, state, affinity] of [[brother, 'blocked', 75], [sister, 'lover', 91], [jack, 'friend', 55]] as const) Object.assign(ensureRelationship(old, id), { state, affinity });
    old.flags.npc_remaster_event_seen_npc_lin_xiaoyu_reset_story_e03 = true; old.flags[`npc_contact_${sister}`] = true;
    const relations = structuredClone(old.relationships); const first = intro(old, 'M01'); expect(first.relationships).toEqual(relations);
    first.locationId = 'boyue_lounge_bar'; first.time.day = 7; first.time.hour = 22; first.time.minute = 45; // Friday.
    const start = beginNpcIntroduction(first, 'M02').session!; const ended = finish(first, start);
    const forged = { ...ended, pending: ended.pending.slice(1) }; expect(commitNpcConversation(first, forged).ok).toBe(false);
    const moved = structuredClone(first); moved.time.minute++; expect(commitNpcConversation(moved, ended).ok).toBe(false);
    const done = commitNpcConversation(first, ended); expect(done.ok, done.reason).toBe(true);
    expect(done.state!.time.hour).toBe(23); expect(done.state!.time.minute).toBe(15);
    expect(done.state!.relationships).toEqual(relations); expect(done.state!.flags.npc_remaster_event_seen_npc_lin_xiaoyu_reset_story_e03).toBe(true);
    expect(presentNpcs(done.state!).map(n => n.id)).not.toContain(jack);
    expect(presentNpcs(done.state!).map(n => n.id)).not.toContain(brother);
    expect(commitNpcConversation(done.state!, ended).ok).toBe(false);
    const schedules = [brother, sister, jack].map(id => JSON.stringify(getNpcDef(id)!.weeklySchedule));
    expect(schedules.every(s => !s.includes('introduction'))).toBe(true);
  });
  it('redeems a real lounge coupon once with the usual alcohol/time effects, and never uses nightclub dance credit', () => {
    const s = at('boyue_lounge_bar', 20); s.inventory[LOUNGE_BEER_COUPON] = 1;
    const action = getAction('boyue_lounge_coupon_drink')!; expect(action).toBeDefined();
    const money = s.player.money; const result = performAction(s, action.id); expect(result.ok, result.reason).toBe(true);
    expect(s.inventory[LOUNGE_BEER_COUPON] ?? 0).toBe(0); expect(s.player.money).toBe(money); expect(s.districtServices?.alcoholCups).toBe(1); expect(s.time.minute).toBe(15);
    expect(performAction(s, action.id).ok).toBe(false);
    s.inventory[LOUNGE_BEER_COUPON] = 1; s.locationId = 'boyue_nightclub'; expect(performAction(s, action.id).ok).toBe(false);
  });
});
