/**
 * v1.3 Moments 社交系统（类朋友圈）
 * ------------------------------------------------------------------
 * 核心数据结构：Post（动态）、PostComment（评论）、PostReaction（点赞）。
 * 作者来源：联系人（contactId）、主角自己（author === "self"）。
 * 城市/论坛帖由 forum.ts 独占，详见 forumPosts。
 * 评分机制：ratePost 根据内容标签（日常/趣事/任务完成）决定点赞与评论数量及评价语气。
 */

import type { GameState } from "../types";
import type { SocialState, Post, PostComment, PostReaction, MomentCategory, CitizenAuthor } from "../types";
import { gameDay } from "./calendar";
import { chance, randomInt } from "../rng";
import { findRelationship } from "./relationships";
import { contactNpcId, npcOnlineName } from './npcOnlineNames';
import { COMMON_MOMENTS, LEGACY_MOMENT_IMAGE_PLACEHOLDER, npcMomentTemplates, type MomentTemplate } from "../data/npcMoments";

/**
 * v1.3b4 朋友圈视图：仅显示自己与联系人的日常动态。
 * 严格不包含 hint === "forum" 的城市帖（即便 author === "self"，主角在论坛发的帖也不回流到这里，避免二视图混淆）。
 * 论坛帖由 forum.ts 独占、标记 hint === "forum"，由 forumPosts 单独取。
 */
export function momentsPostsOf(state: GameState): Post[] {
  const contacts=new Map(state.contacts.map(c=>[c.id,c]));
  const displayName=(id:string,name:string)=>{const contact=contacts.get(id);return contact?npcOnlineName(contactNpcId(contact.id,contact.npcId),contact.name):name;};
  return socialOf(state).posts
    .filter((p) => p.hint !== "forum" && (p.author === "self" || p.author === "contact"))
    .map(post=>({...post,
      authorName:post.contactId?displayName(post.contactId,post.authorName??'联系人'):npcOnlineName(post.npcId,post.authorName??(post.author==='self'?'我':'联系人')),
      image:post.image===LEGACY_MOMENT_IMAGE_PLACEHOLDER?undefined:post.image,
      comments:post.comments.map(comment=>({...comment,authorName:displayName(comment.authorId,comment.authorName)})),
    }));
}

export type MomentScore = "plain" | "interesting" | "milestone";

/** 根据内容分类返回评分档位 */
export function scoreCategory(cat: MomentCategory): MomentScore {
  switch (cat) {
    case "task":
      return "milestone";
    case "fun":
      return "interesting";
    case "daily":
    default:
      return "plain";
  }
}

/** 评分档位对应的点赞/评论基准数 */
const SCORE_PROFILE: Record<MomentScore, { likes: [number, number]; comments: [number, number] }> = {
  plain: { likes: [1, 2], comments: [0, 0] },
  interesting: { likes: [3, 8], comments: [1, 3] },
  milestone: { likes: [6, 14], comments: [2, 5] },
};

let postSeq = 0;
export const MAX_SOCIAL_POSTS = 120;
export const MAX_POST_COMMENTS = 20;
export const MAX_POST_REACTIONS = 80;
function nextPostId(): string {
  postSeq += 1;
  return `post_${Date.now().toString(36)}_${postSeq}`;
}

/** 安全取得 social 状态（旧档可能未初始化，自动补全默认值） */
export function socialOf(state: GameState): SocialState {
  if (!state.social) state.social = createSocialState();
  state.social.posts ??= [];
  if (state.social.posts.length > MAX_SOCIAL_POSTS) state.social.posts.length = MAX_SOCIAL_POSTS;
  return state.social;
}

/** Add a newest-first social post and keep both UI work and save size bounded. */
export function prependSocialPost(state: GameState, post: Post): void {
  const posts = socialOf(state).posts;
  posts.unshift(post);
  if (posts.length > MAX_SOCIAL_POSTS) posts.length = MAX_SOCIAL_POSTS;
}

/** 主角发帖：创建一条 author === "self" 的动态，不立即获得互动（跨天 tick 时模拟） */
export function createPost(state: GameState, input: { text: string; category: MomentCategory; image?: string }): Post {
  const post: Post = {
    id: nextPostId(),
    author: "self",
    text: input.text,
    category: input.category,
    image: input.image,
    day: gameDay(state.time),
    reactions: [],
    comments: [],
    selfLiked: false,
  };
  prependSocialPost(state, post);
  return post;
}

/** 对动态点赞（主角或模拟联系人） */
export function reactToPost(state: GameState, postId: string, reactor: string, icon: string): void {
  const post = socialOf(state).posts.find((p) => p.id === postId);
  if (!post) return;
  if (post.reactions.some((r) => r.reactor === reactor)) return;
  const reaction: PostReaction = { reactor, icon, kind: "like" };
  if (post.reactions.length >= MAX_POST_REACTIONS) post.reactions.shift();
  post.reactions.push(reaction);
}

/** 对动态评论 */
export function commentOnPost(state: GameState, postId: string, comment: PostComment): void {
  const post = socialOf(state).posts.find((p) => p.id === postId);
  if (!post) return;
  if (post.comments.length >= MAX_POST_COMMENTS) post.comments.shift();
  post.comments.push(comment);
}

/** 主角自己点赞自己的动态（toggle） */
export function toggleSelfLike(state: GameState, postId: string): void {
  const post = socialOf(state).posts.find((p) => p.id === postId);
  if (!post) return;
  post.selfLiked = !post.selfLiked;
}

/**
 * 评分模拟：对一条指定作者的动态生成互动（点赞 + 评论）。
 * 用于跨天 tick 时让联系人/市民对主角的帖子和彼此的帖子产生互动。
 * 返回值：生成的互动摘要（供 toast / 日志）。
 */
export function simulateReactionsFor(
  state: GameState,
  postId: string,
  reactors: Array<{ id: string; name: string; icon: string }>,
): { likes: number; comments: number } {
  const post = socialOf(state).posts.find((p) => p.id === postId);
  if (!post) return { likes: 0, comments: 0 };

  const score = scoreCategory(post.category);
  const profile = SCORE_PROFILE[score];
  const likeCount = randomInt(state.rng, profile.likes[0], profile.likes[1]);
  const commentCount = randomInt(state.rng, profile.comments[0], profile.comments[1]);

  // 点赞：从 reactors 随机取 likeCount 个
  const shuffled = [...reactors];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(state.rng, 0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < Math.min(likeCount, shuffled.length); i++) {
    reactToPost(state, postId, shuffled[i].id, shuffled[i].icon);
  }
  // 评论：取前 commentCount 个，语气随评分档位
  const tonePool = score === "plain"
    ? ["👍", "加油", "嗯嗯", "好的"]
    : score === "interesting"
      ? ["太有趣了吧！", "羡慕了", "哈哈哈", "求细节", "厉害啊"]
      : ["太棒了！", "为你骄傲", "恭喜恭喜", "这波可以", "666"];
  for (let i = 0; i < Math.min(commentCount, shuffled.length); i++) {
    const r = shuffled[i];
    commentOnPost(state, postId, {
      id: `c_${postId}_${i}`,
      authorId: r.id,
      authorName: r.name,
      authorIcon: r.icon,
      text: tonePool[i % tonePool.length],
      day: gameDay(state.time),
    });
  }
  return { likes: likeCount, comments: commentCount };
}

/**
 * 跨天 tick：让联系人自动发布生活动态。市民的城市资讯帖由 tickForum 独占，避免与本视图混淆。
 *
 * v1.45：
 * - NPC 使用自己的 10 条专属动态，按关系等级逐步解锁，同一条不重复发布；
 * - 专属动态全部解锁后，再从 20 条通用动态中抽取；通用池用完前不重复；
 * - 每人至少间隔5天，每日仅抽一次；全体每天最多2条，跳日不补刷历史。
 */
export const NPC_MOMENT_COOLDOWN_DAYS=5;
export const NPC_MOMENT_DAILY_CAP=2;
export function tickMoments(state: GameState, _citizens: CitizenAuthor[]): void {
  const today = gameDay(state.time);
  const posts=socialOf(state).posts;
  const contacts = getActiveContacts(state).sort((a,b)=>Number(state.flags[`moments_last_${a.id}`]??-9999)-Number(state.flags[`moments_last_${b.id}`]??-9999)||a.id.localeCompare(b.id));
  const persisted=state.flags.moments_npc_post_day===today?Number(state.flags.moments_npc_post_count??0):0;
  let published=Math.max(Number.isFinite(persisted)?persisted:0,posts.filter(p=>p.author==='contact'&&p.hint!=='forum'&&p.day===today).length);

  for (const c of contacts) {
    if(published>=NPC_MOMENT_DAILY_CAP)break;
    const flagKey = `moments_last_${c.id}`;
    const lastFlag=Number(state.flags[flagKey]??-9999);
    const lastPost=posts.find(p=>p.author==='contact'&&p.hint!=='forum'&&p.contactId===c.id)?.day??-9999;
    const lastDay=Math.max(Number.isFinite(lastFlag)?lastFlag:-9999,lastPost);
    if (today-lastDay<NPC_MOMENT_COOLDOWN_DAYS)continue;
    // 同一天只抽一次，重复刷新、读档和多次 tick 不会提高发帖概率。
    const checkedKey=`moments_checked_${c.id}`;
    if(state.flags[checkedKey]===today)continue;
    state.flags[checkedKey]=today;
    if (!chance(state.rng, 0.18)) continue;
    const post = makeContactPost(state, c, today);
    if (!post) continue;
    prependSocialPost(state, post);
    state.flags[flagKey] = today;
    published++;
    state.flags.moments_npc_post_day=today;state.flags.moments_npc_post_count=published;
    state.social!.unreadMoments=Math.min(MAX_SOCIAL_POSTS,Math.max(0,state.social!.unreadMoments??0)+1);
  }
}

type ActiveContact = { id: string; name: string; avatar: string; npcId?: string };

const DEDICATED_INDEX_PREFIX = "moments_dedicated_index_";
const DEDICATED_LIMITS = [
  { minAffinity: 70, count: 10 },
  { minAffinity: 40, count: 6 },
  { minAffinity: 20, count: 3 },
  { minAffinity: 0, count: 1 },
];

function dedicatedLimitOf(state: GameState, npcId: string, total: number): number {
  const rel = findRelationship(state, npcId);
  // 旧存档可能只有联系人快照，没有关系记录；此时不阻塞已有联系人看到专属动态。
  if (!rel) return total;
  if (rel.state === "blocked") return 0;
  const tier = DEDICATED_LIMITS.find((entry) => rel.affinity >= entry.minAffinity);
  return Math.min(total, tier?.count ?? 1);
}

function nextDedicatedMoment(state: GameState, npcId: string): MomentTemplate | undefined {
  const templates = npcMomentTemplates(npcId);
  if (templates.length === 0) return undefined;
  const limit = dedicatedLimitOf(state, npcId, templates.length);
  if (limit <= 0) return undefined;

  const social = socialOf(state);
  const posted = new Set(
    social.posts
      .filter((p) => p.momentSource === "dedicated" && p.npcId === npcId)
      .map((p) => p.momentTemplateId)
      .filter((id): id is string => Boolean(id)),
  );
  const storedIndex = Number(state.flags[`${DEDICATED_INDEX_PREFIX}${npcId}`] ?? 0);
  const start = Number.isFinite(storedIndex) ? Math.max(0, Math.floor(storedIndex)) : 0;
  const template = templates
    .slice(0, limit)
    .find((candidate, index) => index >= start && !posted.has(candidate.id));
  // index 是永久进度；旧动态被120条上限清出后也不重发人物的专属生活记录。
  return template;
}

function nextCommonMoment(state: GameState, contactId: string): MomentTemplate | undefined {
  const social = socialOf(state);
  const used = new Set(
    social.posts
      .filter((p) => p.momentSource === "common")
      .map((p) => p.momentTemplateId)
      .filter((id): id is string => Boolean(id)),
  );
  let candidates = COMMON_MOMENTS.filter((candidate) => !used.has(candidate.id));
  if (candidates.length === 0) {
    // 20 条都发过后允许循环，但避免同一联系人连续看到同一条。
    const last = social.posts.find((p) => p.contactId === contactId && p.momentSource === "common");
    candidates = COMMON_MOMENTS.filter((candidate) => candidate.id !== last?.momentTemplateId);
  }
  if (candidates.length === 0) return undefined;
  return candidates[randomInt(state.rng, 0, candidates.length - 1)];
}

/** 内部：构造联系人动态；NPC 优先使用当前关系阶段可见的专属文案。 */
function makeContactPost(state: GameState, contact: ActiveContact, day: number): Post | undefined {
  const npcId = contact.npcId ?? (contact.id.startsWith("npc_") ? contact.id.slice("npc_".length) : undefined);
  const rel = npcId ? findRelationship(state, npcId) : undefined;
  if (rel?.state === "blocked") return undefined;

  const dedicated = npcId ? nextDedicatedMoment(state, npcId) : undefined;
  const template = dedicated ?? nextCommonMoment(state, contact.id);
  if (!template) return undefined;

  if (dedicated && npcId) {
    const templates = npcMomentTemplates(npcId);
    const index = templates.findIndex((candidate) => candidate.id === dedicated.id);
    if (index >= 0) state.flags[`${DEDICATED_INDEX_PREFIX}${npcId}`] = index + 1;
  }
  return {
    id: nextPostId(),
    author: "contact",
    contactId: contact.id,
    npcId,
    authorName: contact.name,
    authorIcon: contact.avatar,
    text: template.text,
    image: template.image,
    category: template.category,
    day,
    reactions: [],
    comments: [],
    selfLiked: false,
    momentSource: dedicated ? "dedicated" : "common",
    momentTemplateId: template.id,
  };
}

/** 从 GameState 取当前已启用的联系人（用于互动模拟） */
function getActiveContacts(state: GameState): ActiveContact[] {
  return state.contacts
    .map((c) => ({ id: c.id, name: npcOnlineName(contactNpcId(c.id,c.npcId),c.name), avatar: c.avatar, npcId: c.npcId }));
}

/** 初始化 social 状态默认值（供 state.ts 调用） */
export function createSocialState(): SocialState {
  return { posts: [], unreadMoments: 0 };
}
