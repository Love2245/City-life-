import type { ItemDef } from "../types";
import type { NpcTaskId } from "../npcTaskTypes";

export const NPC_TASK_DEFINITIONS: Record<NpcTaskId, {
  id: NpcTaskId; title: string; npcId: string; icon: string; desc: string;
}> = {
  zhao_toy: { id: "zhao_toy", title: "给孩子留一份", npcId: "npc_zhao_gang", icon: "🧸", desc: "替赵刚找一份快餐店联名小熊，带回来后当面商量价格。" },
  xiaoyu_print: { id: "xiaoyu_print", title: "先印一张看看", npcId: "npc_lin_xiaoyu", icon: "🖨️", desc: "拿着林小雨的原稿到网咖打印：A3、哑光、完整画面不裁边。" },
  farmer_delivery: { id: "farmer_delivery", title: "赶上晚市的两筐菜", npcId: "npc_suburb_farmer", icon: "🥬", desc: "按约定从农场装两筐菜，送到老城区小吃街，再带回马师傅的签收回执。" },
  zhao_staff: { id: "zhao_staff", title: "展会看场的人手", npcId: "npc_zhao_gang", icon: "👥", desc: "赵刚接了商场展会的活，托你在一周内找两个年轻、身高体壮的看场人手。" },
};

/** 旧任务标识保留供存档清理使用；正式游戏只登记赵刚两条。 */
export const CURRENT_NPC_TASK_DEFINITIONS = [NPC_TASK_DEFINITIONS.zhao_toy, NPC_TASK_DEFINITIONS.zhao_staff];

export const NPC_TASK_ITEMS: ItemDef[] = [
  { id: "task_toy_bear", name: "快餐联名小熊摆件", icon: "🧸", desc: "暖棕色、奶油色肚皮与爪印的原创快餐联名小熊，装在橙黄配色的独立透明展示盒中。赵刚想带给孩子的就是它。", artId: "zhao-toy-item" },
  { id: "task_toy_ticket", name: "小熊预约取货单", icon: "🎫", desc: "陈姐给你留的一份预约。次日起可在老城快餐厅柜台支付约定成本领取。", artId: "zhao-toy-ticket" },
  { id: "task_print_original", name: "林小雨的招牌设计原稿", icon: "📐", desc: "街角招牌的完整设计。交付要求：A3、哑光、整图不裁边；办完要还原稿。", artId: "xiaoyu-original" },
  { id: "task_print_good", name: "A3哑光整图样张", icon: "🖼️", desc: "画面完整，留白和四周定位标记齐全的A3哑光样张。", artId: "xiaoyu-proof-icon" },
  { id: "task_print_wrong", name: "A4亮面错印样张", icon: "📄", desc: "尺寸缩小，亮膜反光，边缘被裁掉了。它是实物，但不符合这次委托。", artId: "xiaoyu-proof-wrong" },
  { id: "task_print_receipt", name: "A3样张打印凭据", icon: "🧾", desc: "一份合格A3哑光整图样张的12元打印凭据，交付时据此报销。", artId: "xiaoyu-print-receipt" },
  { id: "task_vegetable_crate", name: "受托鲜蔬筐", icon: "🥬", desc: "陈叔托你送到老城区小吃街的新鲜蔬菜，每件是一筐。这次要交两筐，不可食用或另送他人。", artId: "farmer-crate-item" },
  { id: "task_delivery_appointment", name: "两筐菜送货约定单", icon: "📋", desc: "记着装货日期、农场装货和老城签收时段的约定单。", artId: "farmer-appointment" },
  { id: "task_delivery_receipt", name: "马师傅的收货回执", icon: "📝", desc: "马师傅验过两筐菜后写下的回执。带回陈叔手里才能结清这次劳务。", artId: "farmer-receipt" },
].filter(item => item.id === "task_toy_bear" || item.id === "task_toy_ticket")
  .map((item) => ({ ...item, consumable: false, startOffer: false, tags: ["任务物品"] }));

export const RETIRED_NPC_CITY_COMMISSION_IDS = ["city_fresh_goods_into_town"] as const;

/** 台词与数值分开；任务推进只认结构化动作。 */
export const NPC_TASK_OFFER_TEXT: Record<NpcTaskId, string> = {
  // 此任务的完整正文在 npcStaffTaskData.ts，保留本表的统一定义入口。
  zhao_staff: "赵刚接了商场展会的看场活，想请你帮忙找两个年轻、身高体壮的人。",
  zhao_toy: "赵刚把一张揉过的宣传单摊平，拇指压在那只小熊上。\n\n『家里那个小的，前几天发了三回图，让我回来给带一个。我今早真去了，现金都数好了。柜台让我扫这扫那，说得先在手机里报名。我寻思买个东西怎么还得装个软件？一着急，话就冲了。』\n\n他停下来，把纸角又捋了一遍。\n\n『人家说的我也没全听明白，就记着不收我这钱。我说别是哄人下软件骗钱的，她也急了。谁也不认识谁，闹得怪没意思。最后东西没拿着。』\n\n『单子写一百一份，限量的。你要是方便，帮我看看还有没有？一周里给我个准信就行。别替我吵架，我不占这个理；实在没有也别往嘴上答应。』",
  xiaoyu_print: "林小雨把卷起的稿纸压在杯垫下面，先指了指四角的小标记。\n\n『这张街角招牌，我在屏幕上看得快没感觉了。想印一张，隔几步看一看字能不能认清。附近网咖柜台能印，你经过的时候，能帮我带一份吗？』\n\n『要A3，哑光，完整画面，不裁边。这三条我也写在原稿袋上了。A4亮面那种便宜，但缩了尺寸，又反光，看不出我要检查的东西。』\n\n她把稿袋推过来，又用笔圈住十二这个数。\n\n『正确那份十二块，我报销，另外二十块是你的辛苦钱。原稿和打印小票一起带回来。要是拿到不对的，先留着，回来给我看，别为了省一句话自己硬扛。七天内办好就行。』",
  farmer_delivery: "陈守田把两只空菜筐挪到阴影里，拿铅笔在纸上记了个数。\n\n『老城小吃街的马师傅，要两筐菜。他下午备晚市，我这边得上午装完。你要接，就把日子先定死，别到时候咱俩都等。』\n\n『定下那天，早上八点到十一点，在这儿装好，得留半个钟头；下午一点到四点，交给老城区小吃街的马师傅，拿他签的回执。两筐，别少一筐，也别拿市场上别的菜凑。』\n\n他把铅笔递给你。\n\n『这是八十块的活儿。回执拿回来再结，不用你垫菜钱。赶不上就别勉强答应，菜晒坏了，人家的晚市也耽误。挑个你真有空的日子。』",
};
