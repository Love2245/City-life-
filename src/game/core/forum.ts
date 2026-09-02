/**
 * v1.3 城市论坛（笔记本专属）
 * ------------------------------------------------------------------
 * 市民发帖分享日常、任务信息与城市资讯；主角也可发帖。
 * 复用 Moments 的 Post 模型，与朋友圈（Moments / momentsPostsOf）共享 social.posts 数组，
 * 但论坛帖统一以 hint === "forum" 标记，从不进入朋友圈视图。
 *
 * 贴吧（bar）归属：每条论坛帖在生成时即打上对应吧的 hint（suburb/cafe/religion/volunteer/rent），
 * 不带具体吧归属的城市资讯帖 hint 留 "forum"（归入"全部"）。
 * 切换具体吧时按 hint 过滤即可，保证每个吧都有内容。
 *
 * - tickForum: 跨天 tick（rollDay 调用）生成市民城市资讯帖 + 市民日常帖
 * - postToForum: 主角发帖（标记 hint=forum）
 * - forumPosts: 取论坛视图（hint=forum），不含任何联系人/自我动态
 */
import type { GameState, Post, CitizenAuthor, MomentCategory } from "../types";
import { gameDay } from "./calendar";
import { socialOf } from "./moments";

let forumSeq = 0;
function nextForumId(): string {
  forumSeq += 1;
  return `forum_${Date.now().toString(36)}_${forumSeq}`;
}

/**
 * 论坛「吧」定义：id 同时作为帖的 hint，保证分吧有内容。
 * 文本本身自然表达语境，不再附加「提示：xxx」标签。
 */
export interface ForumBarDef {
  id: string;
  name: string;
  icon: string;
}

/** 论坛吧目录（与 Laptop 端 FORUM_BARS 保持一致，hint 即 id） */
export const FORUM_BARS: ForumBarDef[] = [
  { id: "all", name: "全部", icon: "🌐" },
  { id: "suburb", name: "跳蚤市场", icon: "🛒" },
  { id: "cafe", name: "咖啡馆", icon: "☕" },
  { id: "religion", name: "教堂团契", icon: "⛪" },
  { id: "volunteer", name: "志愿服务", icon: "🤝" },
  { id: "rent", name: "同城租房", icon: "🏠" },
];

/** 市民城市资讯帖模板（按吧归属，文本自然表达语境，无显式提示） */
const FORUM_TEMPLATES: Array<{ text: string; category: MomentCategory; hint: string }> = [
  { text: "郊区跳蚤市场这周末开张，摆摊货车能淘到便宜家电，路过的可以去逛逛。", category: "daily", hint: "suburb" },
  { text: "市中心新开的那家咖啡馆环境挺安静，适合带电脑去办公，咖啡也不贵。", category: "daily", hint: "cafe" },
  { text: "教堂周日弥撒后有一次教友聚餐，氛围很好，欢迎新朋友一起来。", category: "fun", hint: "religion" },
  { text: "社区义工小队长期招人，周末两小时，帮忙搬搬东西陪陪老人，记录还能入档案。", category: "fun", hint: "volunteer" },
  { text: "最近物价有点涨，大家都是怎么省钱的？求分享点省钱小妙招。", category: "daily", hint: "forum" },
  { text: "downtown 新出一批合租房源，押金比上月低了些，想搬家的可以看看。", category: "daily", hint: "rent" },
  { text: "跳蚤市场那家二手书店老板人挺好，旧书论斤称，淘到不少绝版。", category: "daily", hint: "suburb" },
  { text: "咖啡馆周二会员日第二杯半价，约上同事拼一杯挺划算。", category: "daily", hint: "cafe" },
  { text: "教堂这周有义卖，义卖所得都捐给山区孩子，有时间去捧个场。", category: "fun", hint: "religion" },
  { text: "志愿服务队这周末去河边捡垃圾，顺便野餐，既环保又放松。", category: "fun", hint: "volunteer" },
  { text: "同城合租群里有人转租主卧，带独立卫浴，价格美丽，手慢无。", category: "daily", hint: "rent" },
  { text: "老城区那间咖啡馆要搬走了，去了最后一次，以后少个安静角落。", category: "daily", hint: "cafe" },
  // v1.3b9 文案扩池：贴吧体（求助/避雷/安利/标题党），增强论坛氛围
  { text: "避雷！市中心那家新开的麻辣烫，一碗三十八还没几片肉，汤底怀疑是料包冲的。", category: "fun", hint: "forum" },
  { text: "蹲一个靠谱的修手机师傅，屏幕摔裂了，官方售后报价肉疼，求老哥指路。", category: "daily", hint: "forum" },
  { text: "深夜emo：加班到十一点，末班公交上全是和我一样眼神空空的打工人。", category: "daily", hint: "forum" },
  { text: "今天在公园捡到一只受伤的鸽子，送去宠物医院花了小两百，值不值兄弟们说句公道话。", category: "fun", hint: "forum" },
  { text: "跳蚤市场避雷指南：喊价先对半砍，老板涨红脸说明砍对了，笑呵呵你就砍少了。", category: "fun", hint: "suburb" },
  { text: "安利郊区跳蚤市场一个修表大爷，二十年手艺，我的老表起死回生只要三十块。", category: "daily", hint: "suburb" },
  { text: "咖啡馆社恐自救指南：坐角落戴耳机，店员就懂了不会来搭话，亲测有效。", category: "fun", hint: "cafe" },
  { text: "谁把咖啡馆靠窗的位置占了三小时？就一杯美式，我等了四十分钟（微笑）。", category: "fun", hint: "cafe" },
  { text: "教堂唱诗班招人，不要求功底，只要你敢开口，周三晚上有试唱。", category: "fun", hint: "religion" },
  { text: "志愿服务时长能换社区体检券了，具体问居委会，做了好事还有实惠，双赢。", category: "daily", hint: "volunteer" },
  { text: "租房避雷：看房一定挑晚上去，白天看不出隔音，晚上隔壁打呼噜听得一清二楚。", category: "daily", hint: "rent" },
  { text: "房租又涨了两百，房东说是市场价，市场价是谁定的？在线等，挺急的。", category: "daily", hint: "rent" },
  { text: "早高峰地铁实测：晚出门十分钟，多挤两班车，赖床的代价是惨痛的。", category: "fun", hint: "forum" },
  { text: "楼下便利店的关东煮涨价一块钱，老板说是萝卜涨价了，萝卜做错了什么。", category: "fun", hint: "forum" },
];

/**
 * 市民日常帖模板（仅出现在论坛）：大量无意义日常分享，显得生活化。
 * 含食谱、宠物、家人、旅行等，文本即语境，无提示标签。
 * hint 按内容归属到对应吧，纯生活流水账归 "forum"（全部）。
 */
const CITIZEN_DAILY_TEMPLATES: Array<{ text: string; category: MomentCategory; hint: string }> = [
  { text: "{name}：今天试着做了番茄牛腩，炖了两个小时，隔壁都闻着香味了。", category: "daily", hint: "forum" },
  { text: "{name}：我家猫主子今天又把我的袜子叼到沙发底下了，拿它没办法。", category: "fun", hint: "forum" },
  { text: "{name}：周末带娃去了趟郊区公园，放风筝跑了满头汗，孩子笑得开心。", category: "daily", hint: "forum" },
  { text: "{name}：傍晚溜达去教堂后头的小广场，大爷大妈跳广场舞，挺热闹。", category: "daily", hint: "religion" },
  { text: "{name}：周末去做了回义工，帮独居老人换了灯泡，临走还塞给我俩橘子。", category: "fun", hint: "volunteer" },
  { text: "{name}：听说郊区跳蚤市场有辆九成新的二手自行车，准备明天去瞧瞧。", category: "fun", hint: "suburb" },
  { text: "{name}：常去的那家咖啡馆今日特调是海盐焦糖，甜得刚好，强烈安利。", category: "daily", hint: "cafe" },
  { text: "{name}：今晚炖了排骨汤，香味飘满屋，一个人喝完一整锅，满足。", category: "daily", hint: "forum" },
  { text: "{name}：狗子今天学会握手了，奖励了根肉干，摇尾巴摇到起飞。", category: "fun", hint: "forum" },
  { text: "{name}：和爸妈视频了半小时，妈又念叨让我加衣服，听着心里暖暖的。", category: "daily", hint: "forum" },
  { text: "{name}：去年全家去海边玩的照片翻出来看了，那会儿天蓝水清，真想再去。", category: "daily", hint: "forum" },
  { text: "{name}：教堂团契今天读了一段经文，主讲说慢下来也是一种努力，记下了。", category: "daily", hint: "religion" },
  { text: "{name}：志愿服务群里在组织旧衣捐赠，翻出几件大衣洗好送过去了。", category: "fun", hint: "volunteer" },
  { text: "{name}：跳蚤市场淘到一台老式收音机，居然还能响，放床头当摆件。", category: "fun", hint: "suburb" },
  { text: "{name}：楼下咖啡馆新来的拉花小哥手法绝了，一杯拿铁拉出个小爱心。", category: "daily", hint: "cafe" },
  { text: "{name}：今天烤了盘曲奇，配方是网上学的，第一次没翻车，开心。", category: "daily", hint: "forum" },
  { text: "{name}：养的多肉又胖了一圈，浇水太勤容易烂根，总算摸到门道了。", category: "daily", hint: "forum" },
  { text: "{name}：带孩子去了趟动物园，熊猫耍宝把全家人逗乐了，值回票价。", category: "fun", hint: "forum" },
  { text: "{name}：租的房子合同快到了，群里看了几套转租，地段好点的都抢手。", category: "daily", hint: "rent" },
  { text: "{name}：中介又推了套合租，主卧带飘窗，价格能谈，心动但还在犹豫。", category: "daily", hint: "rent" },
  { text: "{name}：周末和老同学聚餐，聊起从前熬夜赶作业，一晃都工作好几年了。", category: "fun", hint: "forum" },
  { text: "{name}：今早去买菜顺便遛了狗，菜场阿姨送了把小葱，市井气最抚人心。", category: "daily", hint: "forum" },
  // v1.3b9 文案扩池：更多生活切片（通勤/加班/独居/健身/追剧）
  { text: "{name}：第一次一个人去医院挂号，全程手机导航，原来是长大的必修课。", category: "daily", hint: "forum" },
  { text: "{name}：办了张健身年卡，去过两次，希望这次不是给健身房做慈善。", category: "fun", hint: "forum" },
  { text: "{name}：加班到楼下便利店买关东煮，店员多给了我一勺汤，瞬间破防。", category: "daily", hint: "forum" },
  { text: "{name}：阳台上种的辣椒结果了，就三个，每个都舍不得吃。", category: "fun", hint: "forum" },
  { text: "{name}：连续加班一周，今天准点下班，走出办公楼居然还有太阳，有点恍惚。", category: "daily", hint: "forum" },
  { text: "{name}：租房五年搬了三次家，行李越搬越少，回忆越攒越多。", category: "daily", hint: "rent" },
  { text: "{name}：合租室友半夜煮泡面，香得我睡不着，最后蹭了半碗，问心有愧。", category: "fun", hint: "rent" },
  { text: "{name}：跳蚤市场砍价失败实录：想砍到五十，老板一口价四十八，我赚了两块的快乐。", category: "fun", hint: "suburb" },
  { text: "{name}：咖啡馆窗边写了一下午辞职信，写完删了，删完点了块蛋糕安慰自己。", category: "daily", hint: "cafe" },
  { text: "{name}：志愿者队里七十岁的张大爷比我还能干，被老人教育了什么叫热爱生活。", category: "fun", hint: "volunteer" },
  { text: "{name}：周末大扫除翻出三年前的日记，当时的烦恼现在看根本不算事儿。", category: "daily", hint: "forum" },
];

/**
 * v1.3b9 论坛市民评论池：跟帖灌水（盖楼感），随机 0~3 条挂在生成的帖子下。
 * 泛用回复，不依赖帖子内容语义，保证任意模板都接得住。
 */
const FORUM_COMMENTS: string[] = [
  "同感，我也是这么过来的。",
  "前排围观，说得在理。",
  "哈哈哈哈笑死，太真实了。",
  "蹲一个后续，别让我白点进来。",
  "帮顶，好人一生平安。",
  "这波我站楼主。",
  "家里人也这样，看完泪目了。",
  "省流：就是不容易。",
  "已收藏，明天就去试试。",
  "楼主人真好，谢谢分享。",
  "不敢苟同，但尊重你的想法。",
  "地铁老人看手机.jpg",
  "真实性存疑，但我选择相信。",
  "路过留个爪，回头再看。",
];

/** v1.3b9 给论坛帖随机挂点赞 + 0~3 条市民跟帖（盖楼感） */
function attachForumBuzz(post: Post, citizens: CitizenAuthor[], today: number): void {
  const likes = Math.floor(Math.random() * 8);
  for (let i = 0; i < likes; i++) {
    post.reactions.push({ reactor: `seed_${post.id}_${i}`, icon: "👍", kind: "like" });
  }
  const commentCount = Math.floor(Math.random() * 4); // 0~3
  const used = new Set<number>();
  for (let i = 0; i < commentCount; i++) {
    let idx = Math.floor(Math.random() * FORUM_COMMENTS.length);
    while (used.has(idx)) idx = (idx + 1) % FORUM_COMMENTS.length;
    used.add(idx);
    const c = citizens.length
      ? citizens[Math.floor(Math.random() * citizens.length)]
      : { id: "city", name: "热心市民", avatar: "🙂" };
    post.comments.push({
      id: `${post.id}_c${i}`,
      authorId: c.id,
      authorName: c.netName ?? c.name,
      authorIcon: c.netAvatar ?? c.avatar,
      text: FORUM_COMMENTS[idx],
      day: today,
    });
  }
}

/** 跨天 tick：生成 1~2 条论坛帖（混合【论坛模板】与【市民日常】两池，市民日常占比更高） */
export function tickForum(state: GameState, citizens: CitizenAuthor[]): void {
  const today = gameDay(state.time);
  const social = socialOf(state);
  const postedToday = social.posts.some((p) => p.hint === "forum" && p.day === today && p.author === "citizen");
  if (postedToday) return;

  const count = 1 + Math.floor(Math.random() * 2); // 1~2
  for (let i = 0; i < count; i++) {
    const useCitizenDaily = Math.random() < 0.6;
    const t = useCitizenDaily
      ? CITIZEN_DAILY_TEMPLATES[Math.floor(Math.random() * CITIZEN_DAILY_TEMPLATES.length)]
      : FORUM_TEMPLATES[Math.floor(Math.random() * FORUM_TEMPLATES.length)];
    const author = citizens.length
      ? citizens[Math.floor(Math.random() * citizens.length)]
      : { id: "city", name: "市民", avatar: "🏙️" };
    // v1.3b7 论坛显示网名 + 网络头像（若市民配置了 netName/netAvatar）
    const authorName = (author as { netName?: string }).netName ?? author.name;
    const authorIcon = (author as { netAvatar?: string }).netAvatar ?? author.avatar;
    const text = t.text.includes("{name}") ? t.text.replace("{name}", authorName) : t.text;
    const post: Post = {
      id: nextForumId(),
      author: "citizen",
      citizenId: author.id,
      authorName,
      authorIcon,
      text,
      category: t.category,
      hint: "forum",
      forumBar: t.hint,
      day: today,
      reactions: [],
      comments: [],
      selfLiked: false,
    };
    attachForumBuzz(post, citizens, today); // v1.3b9 点赞 + 跟帖盖楼
    social.posts.unshift(post);
  }
}

/**
 * v1.3b8 开局种子帖：新档首次打开论坛时补种（幂等）。
 * 用户反馈"第一天打开论坛一个消息都没有"——rollDay 才 tick 生成，
 * 开局第 1 天论坛为空。此函数在首次打开论坛时补 6 条帖子
 * （模板池洗牌抽取，覆盖各吧），并附带随机点赞，保证热议榜也有内容。
 */
export function seedForum(state: GameState, citizens: CitizenAuthor[]): void {
  const social = socialOf(state);
  // 已有任何论坛帖（含旧种子 / 主角发帖）则跳过，保证幂等
  if (social.posts.some((p) => p.hint === "forum")) return;
  const today = gameDay(state.time);
  const pool = [...FORUM_TEMPLATES, ...CITIZEN_DAILY_TEMPLATES];
  const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, 6);
  for (const t of picked) {
    const author = citizens.length
      ? citizens[Math.floor(Math.random() * citizens.length)]
      : { id: "city", name: "市民", avatar: "🏙️" };
    const authorName = author.netName ?? author.name;
    const authorIcon = author.netAvatar ?? author.avatar;
    const text = t.text.includes("{name}") ? t.text.replace("{name}", authorName) : t.text;
    const post: Post = {
      id: nextForumId(),
      author: "citizen",
      citizenId: author.id,
      authorName,
      authorIcon,
      text,
      category: t.category,
      hint: "forum",
      forumBar: t.hint,
      day: today,
      reactions: [],
      comments: [],
      selfLiked: false,
    };
    // v1.3b9 随机点赞 + 跟帖（热议榜开局即有排序内容）
    attachForumBuzz(post, citizens, today);
    social.posts.unshift(post);
  }
}

/** 主角发帖到论坛（可指定归属吧，默认全部） */
export function postToForum(state: GameState, text: string, category: MomentCategory = "daily", bar: string = "forum"): Post | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;
  const post: Post = {
    id: nextForumId(),
    author: "self",
    authorName: "我",
    authorIcon: "🧑",
    text: trimmed,
    category,
    hint: "forum",
    forumBar: bar,
    day: gameDay(state.time),
    reactions: [],
    comments: [],
    selfLiked: false,
  };
  socialOf(state).posts.unshift(post);
  return post;
}

/**
 * 论坛视图：仅取 hint === "forum" 的帖（含 forumBar 归属）。
 * 朋友圈（author=self|contact）由 momentsPostsOf 单独取——绝不混用。
 */
export function forumPosts(state: GameState): Post[] {
  return socialOf(state).posts.filter((p) => p.hint === "forum");
}
