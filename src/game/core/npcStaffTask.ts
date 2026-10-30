import type { GameState, Quest } from '../types';
import type { NpcStaffData, NpcTaskAction, NpcTaskActionResult, NpcTaskChoice, NpcTaskProgress, NpcTaskSummary, NpcTaskTopic } from '../npcTaskTypes';
import { NPC_TASK_DEFINITIONS } from '../data/npcTaskData';
import { NPC_STAFF_OFFER_SPEECHES, NPC_STAFF_RULES as RULES, NPC_STAFF_TEXT as TEXT } from '../data/npcStaffTaskData';
import { START_EPOCH, WEEKDAY_LABEL, fromLinearDay, gameDay, weekdayOf } from './calendar';
import { getNpcDef, npcAtLocation } from './npcs';
import { addAffinity, findRelationship } from './relationships';
import { advanceHours } from './time';
import { recordMoney } from './weekly';
import { nextLogSequence } from './logSequence';

const TASK = 'zhao_staff' as const;
const OWNER = 'npc_zhao_gang';
const KEJIE = 'npc_fan_kejie';
const JACK = 'npc_jack_fanma';
const BOSS = 'npc_netbar_boss';
const WEEK = 7 * 1440;
const DEF = NPC_TASK_DEFINITIONS[TASK];
const nowOf = (state: GameState): number => gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
const questOf = (state: GameState): Quest | undefined => state.quests.find(q => q.npcTask?.taskId === TASK);
const affinityOf = (state: GameState, npcId: string): number => findRelationship(state, npcId)?.affinity ?? 0;
const staffOf = (p: NpcTaskProgress): NpcStaffData => p.data.staff ?? { askedNpcIds: [] };

/** 已按时报人后，等待表现反馈和领款不再占用一周的找人期限。 */
export function npcStaffReported(p: NpcTaskProgress): boolean {
  return p.taskId === TASK && (p.stage === 'await_staff_result' || p.stage === 'await_netbar_bonus');
}
export function npcStaffResultReadyAt(p: NpcTaskProgress): number {
  const staff = staffOf(p);
  // 兼容此前只保存 submittedAt 的网咖中间档，不在读取话题时改写存档。
  return staff.settlementReadyAt ?? (Math.floor((staff.submittedAt ?? p.acceptedAt) / 1440) + 1) * 1440;
}
function awaitingResult(p: NpcTaskProgress): boolean {
  return p.stage === 'await_staff_result' || (p.stage === 'await_netbar_bonus' && staffOf(p).resultReviewedAt === undefined);
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  return value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)])) as T : value;
}
function isHere(state: GameState, npcId: string): boolean {
  return !!getNpcDef(npcId) && findRelationship(state, npcId)?.state !== 'blocked'
    && npcAtLocation(npcId, state.locationId, { ...state.time, weekday: weekdayOf(state.time), seed: state.rng.seed, regionId: state.region });
}
function cannotFinish(state: GameState, p: NpcTaskProgress, minutes: number): string | undefined {
  return !npcStaffReported(p) && nowOf(state) + minutes > p.deadlineAt ? '已来不及在一周内办完这次协商，请查看待办期限。' : undefined;
}
function choice(action: string, label: string, p?: NpcTaskProgress, disabledReason?: string, nextTopic?: string): NpcTaskChoice {
  return { id: `${TASK}:${action}`, label, action: { taskId: TASK, action, ...(p ? { expectedRevision: p.revision } : {}) },
    ...(disabledReason ? { disabledReason } : {}), ...(nextTopic ? { nextTopic } : {}) };
}
function topic(npcId: string, channel: 'formal' | 'chat', category: NpcTaskTopic['category'], text: string, choices: NpcTaskChoice[]): NpcTaskTopic {
  return { id: `npc_task:${TASK}:${npcId}:${category}`, taskId: TASK, npcId, channel, category, title: DEF.title,
    description: category === 'offer' ? '听赵刚说说商场展会的活 · 接受约30分钟' : category === 'history' ? '这次找人的结果' : '询问或办理展会看场的人手', text, choices };
}
function acknowledgment(p: NpcTaskProgress): NpcTaskChoice[] { return [choice('acknowledge', '我知道了。', p)]; }

export function npcStaffMarginShare(staff: NpcStaffData): number {
  if (!staff.kejieAgreed || staff.kejieDailyWage === undefined) return 0;
  return Math.max(0, RULES.kejieBudget - staff.kejieDailyWage - (staff.kejieTravelCost ?? 0)) / 2;
}
function marginText(staff: NpcStaffData): string {
  const share = staff.marginShare ?? 0;
  return share > 0 ? `\n\n赵刚数着钱，又主动加上${share}元：『给范柯杰留的预算是三百，最后谈成${staff.kejieDailyWage! + (staff.kejieTravelCost ?? 0)}。剩下${share * 2}，咱俩一人一半。这个也给你。』` : '';
}
function history(p: NpcTaskProgress): string {
  const staff = staffOf(p);
  if (p.outcome === 'pair') return TEXT.pairEnding + marginText(staff);
  if (p.outcome === 'kejie') return TEXT.singleEnding + marginText(staff);
  if (p.outcome === 'netbar') return TEXT.netbarEnding;
  return `${TEXT.expired}\n\n失败原因：${p.failureReason ?? '未在一周内落实人手'}。`;
}

/** 人物自己的反应只在对应人物话题中出现，待办不提前列出解法。 */
export function getNpcStaffTopics(state: GameState, npcId: string, channel: 'formal' | 'chat'): NpcTaskTopic[] {
  if (!isHere(state, npcId)) return [];
  const q = questOf(state), p = q?.npcTask;
  if (npcId === OWNER && channel === 'formal') {
    if (!q) return affinityOf(state, OWNER) < RULES.zhaoMinAffinity ? [] : [{ ...topic(OWNER, channel, 'offer', TEXT.offer, [
      choice('accept', '交给我吧，我帮你找找。'), choice('decline', '这回我腾不出空，你再问问别人吧。'),
    ]), speeches: NPC_STAFF_OFFER_SPEECHES }];
    if (!p) return [];
    if (q.status !== 'active') return [topic(OWNER, channel, 'history', history(p), acknowledgment(p))];
    const staff = staffOf(p);
    if (awaitingResult(p)) {
      if (nowOf(state) < npcStaffResultReadyAt(p)) return [topic(OWNER, channel, 'active', TEXT.awaitResult, acknowledgment(p))];
      return staff.submittedRoute === 'netbar'
        ? [topic(OWNER, channel, 'delivery', TEXT.netbarApproved, [choice('staff_review_netbar_result', '好，我去找老板说一声。', p)])]
        : [topic(OWNER, channel, 'delivery', staff.submittedRoute === 'pair' ? TEXT.pairEnding : TEXT.singleEnding,
          [choice('staff_claim_commission', '收下这次的辛苦费。', p)])];
    }
    if (p.stage === 'await_netbar_bonus') return [topic(OWNER, channel, 'active', '赵刚说：『那两个人已经定好了，工钱照约定结给网咖老板。你回店里跟他说一声就行。』', acknowledgment(p))];
    const disabled = cannotFinish(state, p, 5);
    const submissions: NpcTaskChoice[] = [];
    if (staff.netbarStaffAgreed) submissions.push(choice('staff_submit_netbar', '我认识的网咖老板安排了两个店员。', p, disabled));
    if (staff.kejieAgreed && staff.jackAgreed) submissions.push(choice('staff_submit_pair', TEXT.reportPairPlayer, p, disabled));
    else if (staff.kejieAgreed) submissions.push(choice('staff_submit_kejie', '我认识的一个朋友答应了，先把他报给你。', p, disabled));
    const root = topic(OWNER, channel, 'active', TEXT.ownerFollowup, [
      choice('staff_review', '交付已知的人手。', p, submissions.length ? disabled : staff.jackAgreed ? '目前只有杰克答应，先再落实一位年轻人。' : '还没有人答应，先去问问。', 'roster'),
      choice('staff_self', '你看我行不行？', p, cannotFinish(state, p, 30)),
      choice('staff_wait', '还没找到，稍等一下。', p, cannotFinish(state, p, 30)),
    ]);
    root.branches = { roster: topic(OWNER, channel, 'delivery', '赵刚拿起笔：『行，你说说，找的是谁？』', [
      ...submissions, choice('staff_back', '我再想想，先不交人。', p, undefined, 'root'),
    ]) };
    return [root];
  }
  if (channel !== 'chat' || !p || q?.status !== 'active' || npcId === OWNER) return [];
  const staff = staffOf(p);
  if (awaitingResult(p)) return [];
  if (p.stage === 'await_netbar_bonus') return npcId === BOSS
    ? [topic(npcId, channel, 'delivery', TEXT.netbarEnding, [choice('staff_claim_netbar_bonus', '收下老板给的一百元。', p)])] : [];
  if (getNpcDef(npcId)?.gender === 'female') {
    return [{ ...topic(npcId, channel, 'active', '', []), playerThought: TEXT.playerThought }];
  }
  const disabled = cannotFinish(state, p, 30);
  const ask = (text: string): NpcTaskTopic[] => [topic(npcId, channel, 'active', text, [choice('staff_ask', '知道了，我再去问问。', p, disabled)])];
  if (npcId === 'npc_suburb_farmer') return ask(TEXT.farmer);
  if (npcId === 'npc_wang_lei') return ask(TEXT.farmer.replace(/^陈守田/, '王磊'));
  if (npcId === 'npc_snack_street_vendor') return ask(TEXT.vendor);
  if (npcId === BOSS) {
    if (staff.netbarStaffAgreed) return [topic(npcId, channel, 'active', '网咖老板说：『那两个店员我已经说好了，你回去把人报给赵刚就行。』', acknowledgment(p))];
    return [topic(npcId, channel, 'active', TEXT.netbar + (affinityOf(state, BOSS) >= RULES.netbarMinAffinity ? `\n\n${TEXT.netbarOffer}` : ''), [
      ...(affinityOf(state, BOSS) >= RULES.netbarMinAffinity ? [choice('staff_hire_netbar', '那就请你安排两个店员，工资直接结给你。', p, disabled)] : []),
      choice('staff_ask', '那我再去问问。', p, disabled),
    ])];
  }
  if (npcId === JACK) {
    if (staff.jackAgreed) return [topic(npcId, channel, 'active', staff.jackInvitedByKejie ? '杰克说：『柯杰已经跟我说过了，我会和他一起去。』' : '杰克点头：『答应你的事我记着，我会去。』', acknowledgment(p))];
    return affinityOf(state, JACK) < RULES.jackMinAffinity ? ask(TEXT.jackRefuses)
      : [topic(npcId, channel, 'active', TEXT.jackAccepts, [choice('staff_hire_jack', '那就拜托你了，我回去告诉赵刚。', p, disabled)])];
  }
  if (npcId === KEJIE) {
    if (staff.kejieAgreed) return [topic(npcId, channel, 'active', `范柯杰说：『说好了，一天${staff.kejieDailyWage}。${staff.kejieTravelCost ? '再加二十来回路费，别忘了。' : '我会过去的。'}${staff.jackInvitedByKejie ? '杰克我也叫好了，你放心。' : ''}』`, acknowledgment(p))];
    const root = topic(npcId, channel, 'active', TEXT.kejieQuestion, [
      choice('staff_offer_100', '100元一天。', p, disabled, 'kejie_100'), choice('staff_offer_150', '150元一天。', p, disabled, 'kejie_150'),
      choice('staff_offer_200', '200元一天。', p, disabled), choice('staff_offer_300', '300元一天。', p, disabled),
    ]);
    const higherOffers = (): NpcTaskChoice[] => [choice('staff_offer_200', '那就200元一天。', p, disabled), choice('staff_offer_300', '300元一天，怎么样？', p, disabled)];
    root.branches = {
      kejie_100: topic(npcId, channel, 'active', TEXT.kejie100, [
        choice('staff_offer_150', '再加点，150元一天。', p, disabled, 'kejie_150'),
        ...higherOffers(), choice('staff_offer_100', '那你休息吧，我再问问别人。', p, disabled),
      ]),
      kejie_150: topic(npcId, channel, 'active', TEXT.kejie150, [
        choice('staff_persist_150', '再帮我这一次吧，这边还缺个人。', p, disabled, 'kejie_150_travel'),
        ...higherOffers(), choice('staff_end_negotiation', '那你去陪妹妹吃饭，我再找找。', p, disabled),
      ]),
      kejie_150_travel: topic(npcId, channel, 'active', TEXT.kejie150Travel, [
        choice('staff_offer_150', '150元工钱，再报销20元车费，就这么定。', p, disabled),
        ...higherOffers(), choice('staff_end_negotiation', '那先算了，你去陪妹妹吧。', p, disabled),
      ]),
    };
    return [root];
  }
  return ask(TEXT.genericRefusal);
}

export function npcStaffSummary(state: GameState, q: Quest): NpcTaskSummary {
  const p = q.npcTask!, staff = staffOf(p), lines: string[] = ['请求：两个年轻、身高体壮、靠得住的看场人手。', '工钱由赵刚或主办方支付，玩家不垫付工资。'];
  const date = fromLinearDay(START_EPOCH + Math.floor(p.deadlineAt / 1440));
  const minute = p.deadlineAt % 1440;
  const deadline = `${date.year}年${date.month}月${date.day}日 ${WEEKDAY_LABEL[weekdayOf(date)]} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  if (staff.clueBoyue) lines.push('马师傅的线索：泊月的夜市和大学年轻人多，可以去看看。');
  if (staff.kejieAgreed) lines.push(`范柯杰已答应：${staff.kejieDailyWage}元/天${staff.kejieTravelCost ? `，另有${staff.kejieTravelCost}元来回路费，共${staff.kejieDailyWage! + staff.kejieTravelCost}元` : ''}。`);
  if (staff.jackAgreed) lines.push(staff.jackInvitedByKejie ? '杰克·范马：范柯杰已帮忙说服，同意一起来。' : '杰克·范马：已直接答应。');
  if (staff.netbarStaffAgreed) lines.push('网咖老板已答应安排两个店员；工资直接结给老板。');
  if (npcStaffReported(p)) {
    const ready = fromLinearDay(START_EPOCH + Math.floor(npcStaffResultReadyAt(p) / 1440));
    lines.push(`已向赵刚报好人手。${ready.year}年${ready.month}月${ready.day}日起，在他在场时正式对话，询问表现和结算。`);
  }
  if (staff.commission !== undefined) lines.push(`本次辛苦费：${staff.commission}元`, `本次差价分成：${staff.marginShare ?? 0}元`, `合计收到：${staff.commission + (staff.marginShare ?? 0)}元`);
  return { title: DEF.title, stageLabel: q.status === 'done' ? '已完成' : q.status === 'failed' ? '未完成' : awaitingResult(p) ? nowOf(state) < npcStaffResultReadyAt(p) ? '等待次日结果' : '找赵刚询问结果' : p.stage === 'await_netbar_bonus' ? '回网咖找老板' : '寻找并确认人手',
    detail: q.status === 'failed' ? `失败原因：${p.failureReason}` : q.status === 'done' ? '赵刚已审核人手，这次的辛苦费已经结清。'
      : awaitingResult(p) ? nowOf(state) < npcStaffResultReadyAt(p)
        ? '赵刚已记下你介绍的人手，准备联系他们。次日起再来询问表现，此时尚未领取辛苦费。'
        : '已经到了可以询问结果的日期。找赵刚正式对话，听他说说表现，再结算这次的辛苦费。'
      : p.stage === 'await_netbar_bonus' ? '赵刚已确认两位店员的表现。去网咖找老板，完成最后的交谈。' : '在一周内找到愿意接活的人，再回赵刚身边正式对话报人。',
    deadlineText: npcStaffReported(p) ? awaitingResult(p) ? nowOf(state) < npcStaffResultReadyAt(p) ? '一周内报人的约定已完成 · 等待次日起确认结果' : '一周内报人的约定已完成 · 待向赵刚确认结果' : '一周内报人的约定已完成 · 待找老板结清' : `截止：${deadline}`,
    urgent: q.status === 'active' && !npcStaffReported(p) && p.deadlineAt - nowOf(state) <= 1440,
    lines, attachments: [], ...(q.status !== 'active' ? { outcome: history(p) } : {}) };
}

/** 工资是人物之间的约定。玩家现金只增加辛苦费和明确的差价分成。 */
export function executeNpcStaffAction(state: GameState, npcId: string | null, action: NpcTaskAction): NpcTaskActionResult {
  const reject = (reason: string): NpcTaskActionResult => ({ ok: false, taskId: TASK, text: '', reason, timeCost: 0 });
  if (!npcId || !isHere(state, npcId)) return reject('请找到实际在场的对方再办理。');
  const q = questOf(state), p = q?.npcTask;
  if (action.expectedRevision !== undefined && action.expectedRevision !== p?.revision) return reject('人手情况已经改变，请重新打开话题。');
  const topics = getNpcStaffTopics(state, npcId, npcId === OWNER ? 'formal' : 'chat');
  const available = topics.flatMap(t => [...t.choices, ...Object.values(t.branches ?? {}).flatMap(branch => branch.choices)]);
  const option = available.find(c => !c.nextTopic && c.action.action === action.action);
  if (!option || option.disabledReason) return reject(option?.disabledReason ?? '当前没有这项办理，已经答应的人不能重复登记或改价。');
  const draft = clone(state);
  let text = '', minutes = 30;
  if (action.action === 'decline') { text = TEXT.decline; minutes = 0; }
  else if (action.action === 'accept') {
    const start = nowOf(state);
    draft.quests.push({ id: 'q_npc_task_zhao_staff', type: 'story', title: DEF.title, desc: DEF.desc, icon: DEF.icon, day: gameDay(state.time), status: 'active', reward: '报人次日起找赵刚确认表现后结算辛苦费',
      npcTask: { taskId: TASK, stage: 'seeking_staff', revision: 1, acceptedAt: start, deadlineAt: start + WEEK, data: { staff: { askedNpcIds: [] } } } });
    text = `${TEXT.accept}\n\n委托已加入待办，限时一周。`;
  } else {
    if (!q || !p) return reject('还没有接取这件事。');
    const dq = questOf(draft)!, dp = dq.npcTask!, staff = dp.data.staff!;
    if (action.action === 'acknowledge') return { ok: true, taskId: TASK, state: draft, text: '你记下了这件事。', timeCost: 0 };
    if (q.status !== 'active') return reject('这次找人的故事已经结束。');
    const remember = (): void => { if (!staff.askedNpcIds.includes(npcId)) staff.askedNpcIds.push(npcId); };
    if (action.action === 'staff_self') text = TEXT.self;
    else if (action.action === 'staff_wait') text = TEXT.wait;
    else if (action.action === 'staff_end_negotiation') { remember(); text = TEXT.genericClosing; }
    else if (action.action === 'staff_ask') {
      remember();
      if (npcId === 'npc_snack_street_vendor') { staff.clueBoyue = true; text = TEXT.vendorClosing; }
      else text = npcId === 'npc_suburb_farmer' ? TEXT.farmerClosing : npcId === 'npc_wang_lei' ? TEXT.farmerClosing.replace(/^陈守田/, '王磊') : npcId === BOSS ? TEXT.netbarClosing : npcId === JACK ? TEXT.jackRefusalClosing : TEXT.genericClosing;
    } else if (action.action === 'staff_hire_netbar') { remember(); staff.netbarStaffAgreed = true; text = TEXT.netbarHired; }
    else if (action.action === 'staff_hire_jack') { remember(); staff.jackAgreed = true; text = TEXT.jackConfirmed; }
    else if (/^staff_offer_(100|150|200|300)$/.test(action.action)) {
      remember();
      const wage = Number(action.action.slice('staff_offer_'.length));
      if (wage === 100) text = TEXT.genericClosing;
      else if (wage === 150 && affinityOf(state, KEJIE) < RULES.kejie150MinAffinity) text = TEXT.kejie150Refuses;
      else {
        staff.kejieAgreed = true; staff.kejieDailyWage = wage; staff.kejieTravelCost = wage === 150 ? RULES.kejieTravelCost : 0;
        text = wage === 150 ? TEXT.kejie150Agreed : wage === 200 ? TEXT.kejie200 : TEXT.kejie300;
        if (wage === 300) { staff.jackAgreed = true; staff.jackInvitedByKejie = true; }
        if (wage >= 200) addAffinity(draft, KEJIE, wage === 200 ? RULES.kejie200Affinity : RULES.kejie300Affinity, DEF.title);
      }
    } else if (['staff_submit_netbar', 'staff_submit_kejie', 'staff_submit_pair'].includes(action.action)) {
      minutes = 5;
      staff.submittedRoute = action.action === 'staff_submit_netbar' ? 'netbar' : action.action === 'staff_submit_pair' ? 'pair' : 'kejie';
      staff.submittedAt = nowOf(state) + minutes;
      staff.settlementReadyAt = (Math.floor(staff.submittedAt / 1440) + 1) * 1440;
      dp.stage = 'await_staff_result';
      text = staff.submittedRoute === 'pair' ? TEXT.reportPair : staff.submittedRoute === 'netbar' ? TEXT.reportNetbar : TEXT.reportSingle;
      dq.reward = '已报好人手，次日起询问结果后结算辛苦费';
    } else if (action.action === 'staff_review_netbar_result') {
      if (nowOf(state) < npcStaffResultReadyAt(p)) return reject('赵刚还在安排联系，次日起再来询问结果。');
      minutes = 5; staff.resultReviewedAt = nowOf(state) + minutes; dp.stage = 'await_netbar_bonus'; text = TEXT.netbarApproved;
    } else if (action.action === 'staff_claim_commission' || action.action === 'staff_claim_netbar_bonus') {
      if (nowOf(state) < npcStaffResultReadyAt(p)) return reject('辛苦费要等次日起确认表现后再结算。');
      minutes = 5;
      const route = staff.submittedRoute!;
      if (!route || (action.action === 'staff_claim_netbar_bonus' ? route !== 'netbar' : route === 'netbar')) return reject('本次报人的路线信息不完整，请重新查看任务。');
      staff.resultReviewedAt ??= nowOf(state) + minutes;
      staff.commission = route === 'pair' ? RULES.pairCommission : route === 'kejie' ? RULES.singleCommission : RULES.netbarBonus;
      staff.marginShare = route === 'netbar' ? 0 : npcStaffMarginShare(staff);
      const total = staff.commission + staff.marginShare;
      dq.status = 'done'; dp.stage = 'done'; dp.outcome = route; dp.resolvedAt = nowOf(state) + minutes;
      draft.player.money += total; recordMoney(draft, total);
      if (route === 'pair') for (const id of [OWNER, KEJIE, JACK]) addAffinity(draft, id, RULES.pairEndingAffinity, DEF.title);
      dq.reward = `${staff.commission}元辛苦费${staff.marginShare ? `＋${staff.marginShare}元差价分成` : ''}`;
      text = history(dp) + `\n\n收到${total}元${staff.marginShare ? `（辛苦费${staff.commission}元，差价分成${staff.marginShare}元）` : ''}。`;
    } else return reject('当前没有这个人手动作。');
    const reason = cannotFinish(state, p, minutes);
    if (reason) return reject(reason);
    dp.revision += 1;
  }
  if (minutes) advanceHours(draft, minutes / 60);
  if (minutes) {
    const hour = draft.time.hour;
    draft.log.push({ sequence: nextLogSequence(draft), day: draft.time.day, hour,
      period: hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 23 ? 'evening' : 'night', icon: DEF.icon, text });
    if (draft.log.length > 200) draft.log.splice(0, draft.log.length - 200);
  }
  return { ok: true, taskId: TASK, state: draft, text, timeCost: minutes / 60 };
}
