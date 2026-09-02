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

/**
 * v1.3b4 朋友圈视图：仅显示自己与联系人的日常动态。
 * 严格不包含 hint === "forum" 的城市帖（即便 author === "self"，主角在论坛发的帖也不回流到这里，避免二视图混淆）。
 * 论坛帖由 forum.ts 独占、标记 hint === "forum"，由 forumPosts 单独取。
 */
export function momentsPostsOf(state: GameState): Post[] {
  return socialOf(state).posts.filter(
    (p) => p.hint !== "forum" && (p.author === "self" || p.author === "contact"),
  );
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
function nextPostId(): string {
  postSeq += 1;
  return `post_${Date.now().toString(36)}_${postSeq}`;
}

/** 安全取得 social 状态（旧档可能未初始化，自动补全默认值） */
export function socialOf(state: GameState): SocialState {
  if (!state.social) state.social = createSocialState();
  return state.social;
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
  socialOf(state).posts.unshift(post);
  return post;
}

/** 对动态点赞（主角或模拟联系人） */
export function reactToPost(state: GameState, postId: string, reactor: string, icon: string): void {
  const post = socialOf(state).posts.find((p) => p.id === postId);
  if (!post) return;
  if (post.reactions.some((r) => r.reactor === reactor)) return;
  const reaction: PostReaction = { reactor, icon, kind: "like" };
  post.reactions.push(reaction);
}

/** 对动态评论 */
export function commentOnPost(state: GameState, postId: string, comment: PostComment): void {
  const post = socialOf(state).posts.find((p) => p.id === postId);
  if (!post) return;
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
  const likeCount = randInt(profile.likes[0], profile.likes[1]);
  const commentCount = randInt(profile.comments[0], profile.comments[1]);

  // 点赞：从 reactors 随机取 likeCount 个
  const shuffled = [...reactors].sort(() => Math.random() - 0.5);
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

/** 跨天 tick：让联系人自动发布生活动态。市民的城市资讯帖由 tickForum 独占，避免与本视图混淆。
 *  v1.3b6 调整：单联系人概率 0.5 → 0.3；新增 2 天间隔 cooldown（写回 state.flags[moments_last_<id>]）。 */
export function tickMoments(state: GameState, _citizens: CitizenAuthor[]): void {
  const today = gameDay(state.time);
  const contacts = getActiveContacts(state);

  for (const c of contacts) {
    // 2 天 cooldown（首次为 -9999 视为通过）
    const flagKey = `moments_last_${c.id}`;
    const lastDay = Number(state.flags[flagKey] ?? -9999);
    if (today - lastDay < 2) continue;
    // 概率：~30%（从 50% 下调，避免联系人群刷屏）
    if (Math.random() >= 0.3) continue;
    const post = makeContactPost(c.id, c.name, c.avatar, today);
    socialOf(state).posts.unshift(post);
    state.flags[flagKey] = today;
  }
}

/** 内部：构造联系人动态（大量无意义日常分享，显得生活化，降低重复感） */
function makeContactPost(contactId: string, name: string, icon: string, day: number): Post {
  const templates = [
    { text: "今天天气不错，出门溜了溜弯，顺手买了根糖葫芦。", category: "daily" as MomentCategory },
    { text: "做了顿拿手菜，番茄炒蛋配米饭，看着就香。", category: "daily" as MomentCategory },
    { text: "周末和朋友小聚，聊得挺开心，还约了下次火锅。", category: "fun" as MomentCategory },
    { text: "最近在学点新东西，感觉挺充实，日子总有奔头。", category: "fun" as MomentCategory },
    { text: "我家那只猫今天又拆家了，沙发抓得一道一道的。", category: "fun" as MomentCategory },
    { text: "傍晚去公园跑了三公里，出一身汗，舒服。", category: "daily" as MomentCategory },
    { text: "今晚炖了排骨汤，香得不行，一个人喝完一整锅。", category: "daily" as MomentCategory },
    { text: "和爸妈视频了半小时，妈又念叨让我多穿点，暖暖的。", category: "daily" as MomentCategory },
    { text: "昨天烤了盘曲奇，第一次没翻车，办公室分了一圈。", category: "fun" as MomentCategory },
    { text: "养的多肉又胖了一圈，浇水太勤容易烂根，总算摸到门道。", category: "daily" as MomentCategory },
    { text: "带娃去了趟动物园，熊猫耍宝把全家人逗乐了。", category: "fun" as MomentCategory },
    { text: "今早买菜顺便遛了狗，菜场阿姨送了把小葱，市井气最抚人心。", category: "daily" as MomentCategory },
    { text: "翻出去年全家去海边的照片，那天蓝水清，真想再去一次。", category: "daily" as MomentCategory },
    { text: "试着复刻了网上的红烧肉，收汁收得漂亮，室友直夸。", category: "fun" as MomentCategory },
    { text: "狗子今天学会握手了，奖励了根肉干，尾巴摇到起飞。", category: "fun" as MomentCategory },
    { text: "周末和老同学聚餐，聊起从前熬夜赶作业，一晃好几年了。", category: "fun" as MomentCategory },
    { text: "楼下新开的包子铺，一两块钱一个，皮薄馅大，早餐有着落了。", category: "daily" as MomentCategory },
    { text: "今天加班到挺晚，路上买了杯热奶茶，瞬间回血。", category: "daily" as MomentCategory },
    { text: "朋友送了我一盆绿萝，说好养，希望我别又养死。", category: "daily" as MomentCategory },
    { text: "晚上追了集剧，结局神反转，愣是半夜没睡着。", category: "fun" as MomentCategory },
    // v1.3b9 扩池：更多都市生活切片，降低重复感
    { text: "通勤地铁上给人让了个座，小朋友说了声谢谢叔叔/阿姨，一天都亮了。", category: "daily" as MomentCategory },
    { text: "阳台上种的辣椒结果了，就三个，舍不得吃，先拍张照。", category: "fun" as MomentCategory },
    { text: "公司楼下便利店阿姨记住了我的口味，主动帮我留了最后一个饭团。", category: "daily" as MomentCategory },
    { text: "办了健身年卡，去过两次，希望这次不是给健身房做慈善。", category: "fun" as MomentCategory },
    { text: "周末大扫除，翻出三年前的日记，当时的烦恼现在看根本不算事儿。", category: "daily" as MomentCategory },
    { text: "第一次一个人去医院挂号，全程手机导航，原来是长大的必修课。", category: "daily" as MomentCategory },
    { text: "加班到楼下便利店买关东煮，店员多给了我一勺汤，瞬间破防。", category: "daily" as MomentCategory },
    { text: "连续加班一周，今天准点下班，走出办公楼居然还有太阳，有点恍惚。", category: "daily" as MomentCategory },
    { text: "抢到演唱会门票的那一刻，手都在抖，穷开心也是开心。", category: "fun" as MomentCategory },
    { text: "楼下广场舞大妈换新歌了，节奏一响，我家狗子跟着点头。", category: "fun" as MomentCategory },
  ];
  const t = templates[randInt(0, templates.length - 1)];
  return {
    id: nextPostId(),
    author: "contact",
    contactId,
    authorName: name,
    authorIcon: icon,
    text: t.text,
    category: t.category,
    day,
    reactions: [],
    comments: [],
    selfLiked: false,
  };
}

/** 从 GameState 取当前已启用的联系人（用于互动模拟） */
function getActiveContacts(state: GameState): Array<{ id: string; name: string; avatar: string }> {
  // contacts 在 gameState 中可能以 flags 或 contacts 数组存在；此处做兼容读取
  const list = (state as unknown as { contacts?: Array<{ id: string; name: string; avatar: string; enabled?: boolean }> }).contacts;
  if (!list) return [];
  return list.filter((c) => c.enabled !== false).map((c) => ({ id: c.id, name: c.name, avatar: c.avatar }));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 初始化 social 状态默认值（供 state.ts 调用） */
export function createSocialState(): SocialState {
  return { posts: [], unreadMoments: 0 };
}
