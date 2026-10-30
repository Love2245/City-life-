import type { NpcTalkNode } from "../core/npcs";

/** Alternate first encounters follow the NPC's actual weekly itinerary. */
const encounters: Record<string, Record<string, string>> = {
  npc_zhao_gang: {
    snack_street: "（他端着一碗热汤，往旁边挪了挪。）这儿还有个空位，坐吧。干完一天活，就盼着吃口热的。我姓赵，大家叫我刚哥。你也是来垫垫肚子的？",
  },
  npc_lin_xiaoyu: {
    commercial_office: '（她抱着文件夹从电梯里出来，往旁边让了让。）你好，是来办事的吗？这一层的接待在走廊那头。我叫小雨，在楼上工作，正好顺路可以给你指一下。',
    dev_art_gallery: "（她在画前退了半步，给你让出位置。）近处看笔触，远一点看颜色，感觉还真不一样。我叫小雨，今天带了速写本来找点灵感。你喜欢这幅吗？",
    dev_university: "（她收起长椅上的速写纸。）你坐吧，这边树荫凉快。我叫小雨，周末来画画校园。刚才那阵风，把纸吹得满地都是，多亏你帮忙按住。",
    library: "（她把摊开的速写本往自己这边收了收，压低声音。）不好意思，占了点位置。我叫小雨，来翻翻画册。你也是来找书的？",
  },
  npc_chen_jie: {
    market: "（她提着菜袋，在摊位前掂了掂番茄。）挑菜也得慢慢看，光瞧颜色不够。你也来买菜？我姓陈，在快餐厅做事，趁休息出来补点家用。",
  },
  npc_wang_lei: {
    hospital: "（他在候诊椅上给你留了个位子。）这边能坐，叫号屏在前面。我叫王磊，今天过来复查。医院里一等就容易心急，坐下来缓缓吧。",
  },
  npc_netbar_boss: {
    boyue_nightclub: "（他侧过身，避开舞池里的人流。）里面声音太大，站这儿说话还听得清。我平时看网吧，今晚出来换换心情。你也是头一回来？",
    electronics_store: "（他放下正在看的配件盒。）同样的接口也得看兼容型号，不然买回去白跑一趟。我是开网吧的，今天来补点配件。你准备装机，还是随便看看？",
  },
  npc_librarian: {
    lake_park: "（她合上膝头的书，望了望湖面。）在这儿看书，抬头就能歇歇眼睛。这半张长椅空着，坐吧。我平时在图书馆工作，休息日也爱带本书出来。",
  },
  npc_flower_market_owner: {
    amusement_park: "（她扶正手里的游园地图，笑了笑。）平时忙着照看花，今天给自己放个假。你知道旋转木马往哪边走吗？我叫苏荷，在花市开店，进来一转倒把方向转没了。",
  },
  npc_snack_street_vendor: {
    boyue_snack_street: "（摊主翻了翻铁板上的小串，把热气往外拨开。）先站远一点，别让油点溅着。叫我马师傅就行，今天把摊挪到泊月这边试试人气。想吃辣的还是清淡的？",
    dev_food_street: "（摊主把新写的菜单摆到桌边。）这边学生多，我也来试试新口味。我姓马，做小吃有些年头了。先看看，拿不准口味可以问我。",
  },
  npc_suburb_farmer: {
    pasture: "（他把装草料的筐靠在围栏边，拍了拍手。）别急着伸手，小牛认生，站旁边看看就好。我叫陈守田，今天过来帮着照料牲口。你来参观牧场？",
    camping_base: "（他拎着水壶，从露营地旁的小路走回来。）水在那边能接，沿路走两步就到了。我叫陈守田，今天出来透透气。搭帐篷避开那块低洼地，夜里露水重。",
  },
};

export function npcFirstEncounterNode(npcId: string, locationId: string): NpcTalkNode | undefined {
  const text = encounters[npcId]?.[locationId];
  if (!text) return undefined;
  return {
    id: `encounter_${npcId}_${locationId}`,
    text,
    options: [
      { label: "打个招呼，聊几句。", playerReply: "你好，刚来这边，还不太熟。认识一下吧。", affinity: 3 },
      { label: "我先逛逛，回头见。", leave: true },
    ],
  };
}
