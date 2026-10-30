import manuscript from '../../../npc对话修正.txt?raw';
import type { GameState } from '../types';
import type { NpcTalkOption } from '../core/npcs';
import type { NpcSpeech } from '../core/npcDialoguePlayback';
import { INTRO_FIRST_COMPLETE, INTRO_SECOND_COMPLETE } from './npcIntroductionProgress';

export interface NpcIntroductionNode {
  id: string;
  speeches: NpcSpeech[];
  options: NpcTalkOption[];
  presentParticipants?: readonly string[];
}
export interface NpcIntroduction {
  id: 'M01' | 'M02'; title: string; participants: readonly string[];
  locationId: string; regionId: string; start: string; description: string;
  nodes: Record<string, NpcIntroductionNode>;
}
const brother = 'npc_fan_kejie', sister = 'npc_fan_kexi', jack = 'npc_jack_fanma';
const definitions = [
  { id: 'M01', title: '五块钱的旧笔', participants: [brother, sister], locationId: 'boyue_snack_street', regionId: 'boyue_night_market', start: 'm1_start', description: '一名青年朝你扬了扬手，身旁的女孩正把一支旧笔拿出来。' },
  { id: 'M02', title: '你来晚了', participants: [brother, jack], locationId: 'boyue_lounge_bar', regionId: 'boyue_night_market', start: 'm2_start', description: '柯杰带着一袋小吃走到桌旁，朝你招了招手。' },
] as const;

function speeches(lines: string[], sceneId: string): NpcSpeech[] {
  const aliases: Record<string, string> = { 青年: sceneId === 'M01' ? brother : jack, 女孩: sister, 范柯杰: brother, 范珂汐: sister, 杰克: jack, 玩家: 'player' };
  return lines.flatMap<NpcSpeech>(raw => {
    const line = raw.trim();
    if (!line || line.startsWith('**') || line.startsWith('#') || line === '---') return [];
    const match = line.match(/^([^：:]+)[：:]\s*(.*)$/);
    if (match && aliases[match[1]]) {
      const text = match[2];
      return [{ speakerId: aliases[match[1]], text: text.replace(/^（[^）]*）\s*/, '') || text, portraitText: text }];
    }
    return [{ speakerId: null, text: line }];
  });
}

function parseIntroduction(def: typeof definitions[number]): NpcIntroduction {
  const start = manuscript.indexOf(`## ${def.id}｜`);
  const remaining = manuscript.slice(manuscript.indexOf('\n', start) + 1);
  const end = remaining.search(/^#{1,2} /m);
  const content = end < 0 ? remaining : remaining.slice(0, end);
  const marks = [...content.matchAll(/^### 节点 ([a-z0-9_／]+)｜[^\n]+/gm)];
  const nodes: Record<string, NpcIntroductionNode> = {};
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i], ids = mark[1].split('／');
    const body = content.slice(mark.index! + mark[0].length, marks[i + 1]?.index ?? content.length);
    const lines = body.split(/\r?\n/);
    const choiceIndexes = lines.flatMap((line, index) => /^\d+\. \*\*/.test(line) ? [index] : []);
    const node: NpcIntroductionNode = { id: ids[0], speeches: speeches(lines.slice(0, choiceIndexes[0] ?? lines.length), def.id), options: [] };
    for (let index = 0; index < choiceIndexes.length; index++) {
      const line = lines[choiceIndexes[index]].replace(/^\d+\. \*\*/, '').replace(/\*\*\s*$/, '');
      const [rawLabel, destination] = line.split('→');
      const label = rawLabel.replace(/【[^】]*】/g, '').trim();
      const next = destination?.match(/m[12]_[a-z_]+/)?.[0];
      const cash = rawLabel.match(/可用现金([≥＜])(?:(\d+)元|(当前报价))/);
      const option: NpcTalkOption = { label, next };
      if (cash) {
        if (cash[3]) option.cashQuoteCondition = { amount: '100000', affordable: cash[1] === '≥' };
        else option.cashCondition = cash[1] === '≥' ? { minimum: Number(cash[2]) } : { below: Number(cash[2]) };
      }
      const branchSpeeches = speeches(lines.slice(choiceIndexes[index] + 1, choiceIndexes[index + 1] ?? lines.length), def.id);
      if (branchSpeeches.length) {
        const branchId = `${node.id}_reply_${index + 1}`;
        nodes[branchId] = { id: branchId, speeches: branchSpeeches, options: [{ label: '继续', next }] };
        option.next = branchId;
      }
      node.options.push(option);
    }
    if (!node.options.length) {
      const next = body.match(/→ (m[12]_[a-z_]+)/)?.[1];
      node.options = [{ label: next ? '继续' : '结束交流', ...(next ? { next } : {}), ...(ids[0].endsWith('_leave') ? { leave: true } : {}) }];
    }
    // The narrator may still describe the farewell, but her actor has left.
    if (def.id === 'M01' && ['m1_invite', 'm1_done', 'm1_done_no_coupon', 'm1_invite_reply_1', 'm1_invite_reply_2', 'm1_invite_reply_3'].includes(node.id)) node.presentParticipants = [brother];
    for (const id of ids) nodes[id] = { ...node, id };
  }
  for (const node of Object.values(nodes)) {
    if (def.id === 'M01' && node.id.startsWith('m1_invite_reply_')) node.presentParticipants = [brother];
    if (!node.speeches.length) node.speeches = [{ speakerId: null, text: node.id === 'm1_done_no_coupon' ? '你记下了邀请，向柯杰道别。' : '你们记下彼此的名字，约好以后碰见再打招呼。' }];
  }
  return { ...def, nodes };
}

let cache: NpcIntroduction[] | undefined;
export function npcIntroduction(id: string | undefined): NpcIntroduction | undefined {
  return (cache ??= definitions.map(parseIntroduction)).find(scene => scene.id === id);
}
export function npcIntroductionAvailable(state: GameState, scene: NpcIntroduction): boolean {
  if (state.locationId !== scene.locationId || state.region !== scene.regionId) return false;
  const hour = state.time.hour + state.time.minute / 60;
  return scene.id === 'M01'
    ? state.flags[INTRO_FIRST_COMPLETE] !== true && state.flags[INTRO_SECOND_COMPLETE] !== true && hour >= 17 + 10 / 60 && hour < 20 + 10 / 60
    : state.flags[INTRO_FIRST_COMPLETE] === true && state.flags[INTRO_SECOND_COMPLETE] !== true && (hour >= 18 || hour < 6);
}
export function availableNpcIntroduction(state: GameState): NpcIntroduction | undefined {
  return (cache ??= definitions.map(parseIntroduction)).find(scene => npcIntroductionAvailable(state, scene));
}
export function npcIntroductionNode(scene: NpcIntroduction, nodeId: string, quote = '100000'): NpcIntroductionNode | undefined {
  const node = scene.nodes[nodeId];
  if (!node || nodeId !== 'm1_more') return node;
  return { ...node, speeches: node.speeches.map(s => ({ ...s, text: s.text.replace('【当前报价】', BigInt(quote).toLocaleString('zh-CN')), portraitText: s.portraitText?.replace('【当前报价】', quote) })),
    options: node.options.map(o => o.cashQuoteCondition ? { ...o, cashQuoteCondition: { ...o.cashQuoteCondition, amount: quote } } : o) };
}
