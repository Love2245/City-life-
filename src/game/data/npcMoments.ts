import type { MomentCategory } from "../types";

/** Legacy value hidden from feeds for posts already stored in old saves. */
export const LEGACY_MOMENT_IMAGE_PLACEHOLDER = "【该图片暂时无法查看】";
export interface MomentTemplate {
  id: string;
  text: string;
  category: MomentCategory;
  image?: string;
}

function moment(
  id: string,
  text: string,
  category: MomentCategory = "daily",
): MomentTemplate {
  return { id, text, category };
}

/** NPC 专属动态：每位 NPC 10 条，按关系进度依次解锁，单条不会重复发布。 */
export const NPC_MOMENTS: Record<string, readonly MomentTemplate[]> = {
  npc_lin_xiaoyu: [
    moment("npc_lin_xiaoyu_01", "改到第五版，客户说还是第一版好。我请问呢？", "fun"),
    moment("npc_lin_xiaoyu_02", "窗边的光今天特别好，画了一下午，脖子酸。", "daily"),
    moment("npc_lin_xiaoyu_03", "咖啡凉了。懒得热。就这样喝吧。"),
    moment("npc_lin_xiaoyu_04", "街角那家馄饨店还是关了。招牌被拆下来那天，我站对面看了很久。"),
    moment("npc_lin_xiaoyu_05", "新买的笔不好用。还是旧的好。但旧的那支不知道丢哪了。"),
    moment("npc_lin_xiaoyu_06", "有时候觉得，设计就是不停地跟自己吵架。"),
    moment("npc_lin_xiaoyu_07", "今天没画画。就坐着。看窗外的人走来走去。"),
    moment("npc_lin_xiaoyu_08", "有人问我为什么总坐窗边。因为可以一边画一边看外面。不然呢。", "fun"),
    moment("npc_lin_xiaoyu_09", "客户说“要大气”。我改了五版。他选了最土的那版。行吧。", "fun"),
    moment("npc_lin_xiaoyu_10", "下雨了。雨把玻璃弄花了。挺好。不用画了。", "daily"),
  ],
  npc_zhao_gang: [
    moment("npc_zhao_gang_01", "今天又帮三个小年轻找到了活。累是累，心里踏实。"),
    moment("npc_zhao_gang_02", "早上跑了三公里。腿还行。就是喘，不服来战。", "fun"),
    moment("npc_zhao_gang_03", "闺女打电话来了。没说几句。但高兴。"),
    moment("npc_zhao_gang_04", "现在的年轻人，开口就要日结。日结日结，我上哪给你日结。", "fun"),
    moment("npc_zhao_gang_05", "中午吃了碗面。多要了一碗。吃不完。浪费了。"),
    moment("npc_zhao_gang_06", "那个老伙计出院了。腿没保住。但人还在。就行了。"),
    moment("npc_zhao_gang_07", "天冷了。劳务市场人少。都在等活。不容易。"),
    moment("npc_zhao_gang_08", "有人给我递了根烟。我说戒了。其实没戒。就是不想抽。", "fun"),
    moment("npc_zhao_gang_09", "黄金右脚。当年的事。不提了。", "fun"),
    moment("npc_zhao_gang_10", "明天早上六点要早起锻炼，开始自律了。", "fun"),
  ],
  npc_chen_jie: [
    moment("npc_chen_jie_01", "今天总部来人检查。说我薯条炸得不够标准。干了十年。行吧。", "fun"),
    moment("npc_chen_jie_02", "闺女给我画了张奖状。“最佳薯条炸制奖”。放钱包里了。", "daily"),
    moment("npc_chen_jie_03", "新来的小孩又点错单了。说了多少遍。哎。"),
    moment("npc_chen_jie_04", "后厨空调坏了。报了三天。没人管。这帮坐办公室的。"),
    moment("npc_chen_jie_05", "今天有个客人说“还是你们家吃着舒服”。就这一句。值了。"),
    moment("npc_chen_jie_06", "下班了。换完衣服。突然不想做饭。买了杯奶茶。就坐着。"),
    moment("npc_chen_jie_07", "员工餐多了一份。给了一个常来的小伙子。他吃得挺香。"),
    moment("npc_chen_jie_08", "下雨天。店里没人。清净。挺好。"),
    moment("npc_chen_jie_09", "我想辞职。但不知道辞了干嘛。再想想吧。"),
    moment("npc_chen_jie_10", "今天薯条多炸了半分钟。脆的。给了那个老坐角落的姑娘。没跟她说。"),
  ],
  npc_wang_lei: [
    moment("npc_wang_lei_01", "早上打太极。碰到老李。他说我动作不到位。我笑他不懂。", "fun"),
    moment("npc_wang_lei_02", "报纸上又说年轻人就业难。我看着心里不是滋味。"),
    moment("npc_wang_lei_03", "孙子今天来了。教他下棋。他坐不住。玩手机。哎。"),
    moment("npc_wang_lei_04", "社区让我去教书法。第一次教。不知道怎么写。写了个“老有所乐”。", "fun"),
    moment("npc_wang_lei_05", "老伴儿走了三年了。今天翻到她的照片。没哭。就坐了一会儿。"),
    moment("npc_wang_lei_06", "儿子打电话让我去他那儿住。我不去。人生地不熟。"),
    moment("npc_wang_lei_07", "公园长椅上坐了一下午。看人来人往。挺好。"),
    moment("npc_wang_lei_08", "有个年轻人问我路。我给他指了。他说谢谢。挺有礼貌。"),
    moment("npc_wang_lei_09", "退休了。但我觉得自己还没老。还能干点事。"),
    moment("npc_wang_lei_10", "今天没带报纸。就跟旁边的小伙子聊了会儿。他说他刚辞职。我让他别急。"),
  ],
  npc_netbar_boss: [
    moment("npc_netbar_boss_01", "又修了一下午机器。比跟人说话轻松。"),
    moment("npc_netbar_boss_02", "泡面。晚饭。习惯了。"),
    moment("npc_netbar_boss_03", "老客人来了。没带钱。让他上了。下次给。"),
    moment("npc_netbar_boss_04", "今天写了个小程序。一个像素小人走来走去。没什么用。但挺好玩。", "fun"),
    moment("npc_netbar_boss_05", "凌晨三点。还有个客人在。放了杯热水。没说话。"),
    moment("npc_netbar_boss_06", "停电了。点蜡烛。想起小时候我妈讲故事。"),
    moment("npc_netbar_boss_07", "机器全黑。客人站起来。我修好了。重启就行。"),
    moment("npc_netbar_boss_08", "有个客人掉了一百块。我收着了。他回来找。买了瓶水给我。"),
    moment("npc_netbar_boss_09", "不卖烟。不赊账。未成年不让进。谁来都一样。"),
    moment("npc_netbar_boss_10", "今天休息。不想开店。就坐在门口。有人陪我坐了会儿。"),
  ],
  npc_librarian: [
    moment("npc_librarian_01", "新到的书。盖了章。上架。挺好。"),
    moment("npc_librarian_02", "有人还书。书里夹了张手绘书签。没扔。夹回去了。"),
    moment("npc_librarian_03", "下雨天。图书馆没人。清净。书也安静。"),
    moment("npc_librarian_04", "一个小孩留言说谢谢图书馆。放学有地方去。看了一会儿。没哭。"),
    moment("npc_librarian_05", "借书超期了。我跟他说下次注意。他说我较真。规矩就是规矩。"),
    moment("npc_librarian_06", "今天有个年轻人找编程书。站了十分钟。我给他推荐了一本入门的。"),
    moment("npc_librarian_07", "修补了一本旧书。三十年了。扉页上写着“赠给图书馆”。不知道谁赠的。", "daily"),
    moment("npc_librarian_08", "快关门了。月亮挺好。站了一会儿。走了。"),
    moment("npc_librarian_09", "我在这干了十五年。没换过。书不会跑。", "fun"),
    moment("npc_librarian_10", "有人问我为什么不去出版社。我说在哪看书都是看。"),
  ],
  npc_flower_market_owner: [
    moment("npc_flower_market_owner_01", "新到的花。换盆。浇水。一周一次。不用管。"),
    moment("npc_flower_market_owner_02", "一个客人买花。我问他家里光线怎么样。他说不知道。哎。"),
    moment("npc_flower_market_owner_03", "花死了。养了一个月。还是死了。不是所有花都能养活。"),
    moment("npc_flower_market_owner_04", "今天没几个人。清净。跟花说了会儿话。"),
    moment("npc_flower_market_owner_05", "我妈来了。没说话。就看着花。站了一会儿。走了。"),
    moment("npc_flower_market_owner_06", "有个老客人回来跟我说。上次那盆开花了。高兴。"),
    moment("npc_flower_market_owner_07", "下雨天。花市没人。坐在棚子下面喝茶。挺好。", "daily"),
    moment("npc_flower_market_owner_08", "我想开个花店。但租金太贵。再想想。"),
    moment("npc_flower_market_owner_09", "给一个客人挑了盆耐阴的。他家里光不好。希望能养活。"),
    moment("npc_flower_market_owner_10", "花比人简单。你给它光。给它水。它就长。不骗人。"),
  ],
  npc_snack_street_vendor: [
    moment("npc_snack_street_vendor_01", "今天进了点新鲜青菜。叶子挺的。一看就知道。"),
    moment("npc_snack_street_vendor_02", "炒菜。火候。差一秒都不行。"),
    moment("npc_snack_street_vendor_03", "闺女打电话说想吃我炒的菜。我说你回来。我炒给你吃。她说忙。"),
    moment("npc_snack_street_vendor_04", "晚上收摊。擦灶台。擦得干净。明天好干活。"),
    moment("npc_snack_street_vendor_05", "有个老客人。吃了二十年。每天来。就吃那个。不说话。但来。"),
    moment("npc_snack_street_vendor_06", "教了个新帮工。炒糊了一锅。没事。刚开始都这样。"),
    moment("npc_snack_street_vendor_07", "下雨天。没人。炒了个菜。自己吃。火安静。", "daily"),
    moment("npc_snack_street_vendor_08", "给一个小孩多放了个蛋。没多收钱。他爸妈加班。一个人来吃。"),
    moment("npc_snack_street_vendor_09", "想开个大饭店。没开成。现在在这炒菜。有人吃。有人说好。就行了。"),
    moment("npc_snack_street_vendor_10", "火候。说不准。得练。我练了二十年。"),
  ],
  npc_suburb_farmer: [
    moment("npc_suburb_farmer_01", "今天摘了点黄瓜。弯的。城里人不要。但甜。"),
    moment("npc_suburb_farmer_02", "鸡下了蛋。双黄的。少见。给了个常来的小伙子。", "daily"),
    moment("npc_suburb_farmer_03", "菜地淹了。雨下了好几天。今年白种了。地还在。"),
    moment("npc_suburb_farmer_04", "修篱笆。鸡老往外跑。修了好几次了。不长记性。", "fun"),
    moment("npc_suburb_farmer_05", "给菜地除草。草和菜。看根。草根浅。菜根深。"),
    moment("npc_suburb_farmer_06", "下雨天。不用干活。坐着。挺好。"),
    moment("npc_suburb_farmer_07", "我种了三十年地。最开始不会种。种什么死什么。后来我爹说。地不骗人。"),
    moment("npc_suburb_farmer_08", "分拣蔬菜。弯的留着自己吃。直的卖给城里人。"),
    moment("npc_suburb_farmer_09", "一个年轻人来帮忙。摘了一篮子。没收钱。让他拿点菜回去。"),
    moment("npc_suburb_farmer_10", "晚上。田边。坐着。看菜地。想一直种下去。但不知道还能种几年。"),
  ],
};

/** 通用动态：任何联系人都可以发布，20 条用完前不重复，之后才循环。 */
export const COMMON_MOMENTS: readonly MomentTemplate[] = [
  moment("common_01", "今天天气真好。适合发呆。"),
  moment("common_02", "累了一天。终于可以歇了。"),
  moment("common_03", "突然想吃火锅。有人一起吗。", "fun"),
  moment("common_04", "有时候觉得，日子过得真快。"),
  moment("common_05", "今天心情不错。没什么理由。"),
  moment("common_06", "下雨了。听着雨声，挺舒服的。"),
  moment("common_07", "又到周末了。但好像也没什么区别。"),
  moment("common_08", "看到一句话，挺有道理的。但忘了是什么了。", "fun"),
  moment("common_09", "今天走了很多路。脚疼。"),
  moment("common_10", "晚上失眠。刷手机。越刷越精神。"),
  moment("common_11", "想吃妈妈做的菜了。"),
  moment("common_12", "今天遇到一件小事，但挺暖的。"),
  moment("common_13", "有时候觉得，一个人也挺好的。"),
  moment("common_14", "明天要早起。但现在还不想睡。"),
  moment("common_15", "今天什么都没干。但也不觉得浪费。"),
  moment("common_16", "突然很想出去走走。但不知道去哪。"),
  moment("common_17", "听到一首老歌。想起以前的事。"),
  moment("common_18", "生活嘛，就是这样。一天又一天。"),
  moment("common_19", "今天笑了好几次。挺好的。"),
  moment("common_20", "晚安。明天见。"),
];

export function npcMomentTemplates(npcId: string): readonly MomentTemplate[] {
  return NPC_MOMENTS[npcId] ?? [];
}
