/**
 * v1.43 · NPC 每日首次问候（地点 / 时段感知）
 *
 * 设计意图
 * ─────────
 * NPC 会按 `npcs.json` 的 `weeklySchedule` 在不同时段出现在不同地点，但对话内容此前
 * 与地点无关：在图书馆碰到「图书馆大姐」和在花市碰到她说的是同一套台词。
 *
 * 这里为**每天第一次**和某位 NPC 搭话时提供一段**短问候**：台词按「NPC × 当前地点」
 * 取，并区分「自己的常驻地点」（语气自然）与「行程中的临时地点」（会说明自己为什么在这儿，
 * 例如图书馆大姐周末在环湖公园晒太阳看书、陈守田周日去果园摘果）。
 * 深夜（23:00–05:00）与清晨（05:00–08:00）各有覆盖台词。
 *
 * 规则
 * ────
 * - 问候只有**一轮**：一个 NPC 节点 + 两个结束型选项（回应 / 点头走开），随后对话结束。
 * - 工作、运动等活动先走 `npcContextDialogues`；场景短稿用完后走正常日常池。
 * - 玩家主动选择的话题直达正文，不被问候或场景短稿替换。
 * - 台词不允许出现省略号（`……`），与全项目「对话文本不留停顿号」的规范一致。
 */
import type { NpcTalkNode } from "../core/npcs";

/** 问候时段分档：清晨 / 常规 / 深夜。 */
export type GreetingPeriod = "early" | "normal" | "late";

export function greetingPeriodOfHour(hour: number): GreetingPeriod {
  if (hour >= 23 || hour < 5) return "late";
  if (hour >= 5 && hour < 8) return "early";
  return "normal";
}

interface GreetingScript {
  /** 该地点的问候台词（含括号动作），按 gameDay 稳定性抽签。 */
  lines: string[];
  /** 玩家「顺口接一句」的选项文案（好感 +1）。 */
  reply: string;
  replyByLine?: Record<number,string>;
  benefitByLine?: Record<number,string>;
}

interface NpcGreetingSet {
  /** 常驻地点：语气更自然，不解释"为什么在这儿"。 */
  home: string;
  /** 各地点问候脚本（键为 locationId）。 */
  scripts: Record<string, GreetingScript>;
  /** 清晨（05:00–08:00）覆盖；缺省用地点脚本。 */
  early?: GreetingScript;
  /** 深夜（23:00–05:00）覆盖；缺省用地点脚本。 */
  late?: GreetingScript;
}

const NPC_GREETINGS: Record<string, NpcGreetingSet> = {
  npc_lin_xiaoyu: {
    home: "cafe",
    scripts: {
      commercial_office: {lines:['（她在电梯口收好文件，朝你笑了笑。）来啦？我先回工位，等下班再慢慢聊。'],reply:'“好，你先忙，回头见。”'},
      dev_art_gallery: { lines: ["（她停在一幅画前，手里夹着速写本。）周六来看看画，换换思路。"], reply: "（陪她看看这幅画。）" },
      dev_university: { lines: ["（她在校园长椅上合起速写本。）今天来这边写生，你也来逛校园？"], reply: "（坐下来看看她的速写。）" },
      library: { lines: ["（她把借来的画册往旁边挪了挪。）周日这里安静，正好看点东西。"], reply: "（放轻声音，问问她在看哪一本。）" },
      cafe: {
        lines: [
          "（她把速写本合上，往旁边让了让。）坐吧，今天不赶时间。",
          "（铅笔停在纸边。）你来啦，窗边那个位子刚空出来。",
          "（抬头看了你一眼。）正好，帮我看看这张图别扭在哪。",
        ],
        reply: "（坐下，先看看她画的东西。）",
      },
    },
    late: {
      lines: ["（她把台灯调暗了一格。）这么晚还出来喝咖啡？"],
      reply: "（说是路过，顺便进来坐会儿。）",
    },
  },

  npc_zhao_gang: {
    home: "labor_market",
    scripts: {
      labor_market: {
        lines: [
          "（他从招工牌前转过身。）哟，又来了。今天想找什么活？",
          "（他把几张招工单摊在膝盖上。）这几份我也在看，先把工时和钱问清楚。",
          "（他靠在柱子边看着人群。）今天人多，咱们都先等消息，别急着乱接。",
        ],
        reply: "（站着跟他一起看招工牌。）",
      },
      snack_street: {
        lines: [
          "（他把没动过的热面分到干净的小碟里。）你也来了？分你一点，先垫垫肚子。",
          "（他挪开旁边的凳子，把一小碟面推到桌边。）今天下了工，不聊招工。想尝就拿这份，还是热的。",
        ],
        reply: "（接过那碟热面，吃两口再聊。）",
        benefitByLine: {0:'zhao_noodles',1:'zhao_noodles'},
      },
    },
    early: {
      lines: ["（他已经在公告板前站了一会儿。）今天来得早，活儿也挑得早。"],
      reply: "（跟着他一起看公告板。）",
    },
    late: {
      lines: ["（他把外套往身上一裹。）这么晚了，你还出来晃？"],
      reply: "（说是随便走走。）",
    },
  },

  npc_chen_jie: {
    home: "fast_food",
    scripts: {
      fast_food: {
        lines: [
          "（她一边翻勺一边朝里喊。）来了？先找个位子坐。",
          "（把一碗汤放到台面上。）今天有你爱吃的那道。",
          "（擦着手出来。）忙完这阵我陪你坐会儿。",
        ],
        reply: "（在台边找了个位子。）",
      },
      market: {
        lines: [
          "（她拎着菜篮，手上还挂着零钱。）今天店里休息，我来买菜。",
          "（挑着青菜回头看你。）你也来逛市场？这几家我熟。",
        ],
        reply: "（帮她拎起一边的袋子。）",
      },
    },
    early: {
      lines: ["（她刚把卷帘门拉开一半。）来得巧，头一锅刚出锅。"],
      reply: "（先帮她把门拉上去。）",
    },
    late: {
      lines: ["（她从后厨探出头。）这么晚还没吃？我给你留了饭。"],
      reply: "（说不用麻烦，坐一会儿就走。）",
    },
  },

  npc_wang_lei: {
    home: "park",
    scripts: {
      park: {
        lines: [
          "（他把报纸叠起来。）来得早啊，一起走走？",
          "（手里转着核桃。）今天天气不错，适合活动活动。",
          "（坐在长椅上招手。）过来坐，这位置晒得着太阳。",
        ],
        reply: "（在旁边坐下，听他说几句。）",
      },
      hospital: {
        lines: [
          "（他从取药窗口回来，手里捏着药袋。）今天来把药取了，顺路走走。",
          "（他把药袋往身边收了收。）不是来看病号，自己的老毛病按时拿药就行。你怎么也来医院？",
        ],
        reply: "（问他取的是什么药，顺便陪他走一段。）",
      },
    },
    early: {
      lines: ["（他正压着腿。）这个点公园最清静，来活动活动筋骨。"],
      reply: "（跟着他压了压腿。）",
      benefitByLine:{0:'wang_stretch'},
    },
    late: {
      lines: ["（他把外套领子立起来。）夜里凉，早点回去。"],
      reply: "（说这就回。）",
    },
  },

  npc_netbar_boss: {
    home: "internet_cafe",
    scripts: {
      boyue_nightclub: { lines: ["（他端着杯子，朝你招了招手。）忙了一周，出来听会儿音乐。"], reply: "（在旁边坐下，聊聊这周的事。）" },
      internet_cafe: {
        lines: [
          "（他从柜台后面抬眼。）来了？靠里那排机器空着。",
          "（把耳机递过来一副。）今天人少，随你挑。",
          "（敲了敲显示器。）机子刚维护过，比前两天顺。",
        ],
        reply: "（接过耳机，先去挑台机器。）",
      },
      electronics_store: {
        lines: [
          "（他蹲在一排笔记本前比价。）网吧有台机器要换配件，我顺便看看自己用的。",
          "（回头看你。）正好，帮我看看这几台哪个更适合日常用。",
        ],
        reply: "（蹲下来一起看参数。）",
      },
    },
    late: {
      lines: ["（他正拉下卷帘门。）今天到点了，明天再来。"],
      reply: "（说好，明天来。）",
    },
  },

  npc_librarian: {
    home: "library",
    scripts: {
      library: {
        lines: [
          "（她把一摞书往架子上推。）来了？新到了一批，在最里面那排。",
          "（压低了嗓子。）小声点，这边刚安静下来。",
          "（把登记本推过来。）你要的那类我给你留着呢。",
        ],
        reply: "（放轻脚步，去最里面那排看看。）",
      },
      lake_park: {
        lines: [
          "（她坐在湖边石凳上，手里捧着本书。）周末出来晒晒太阳。",
          "（把书合上。）在家待不住，在这儿反而看得进去。",
        ],
        reply: "（在旁边的石凳坐下。）",
      },
    },
    late: {
      lines: ["（她正在关灯。）这么晚了，明天再来吧。"],
      reply: "（说明天再来。）",
    },
  },

  npc_flower_market_owner: {
    home: "flower_market",
    scripts: {
      flower_market: {
        lines: [
          "（她正给一盆花浇水。）来了。这盆刚开，你看看。",
          "（把水管放下，擦了擦手。）今天的花比上周精神。",
          "（从架子最上面拿下一盆。）这盆一直给你留着。",
        ],
        reply: "（凑近看了看那盆花。）",
      },
      amusement_park: {
        lines: [
          "（她坐在长椅上，手里捏着张票。）难得一天不摆摊。",
          "（她朝过山车那边抬了抬下巴。）今天不聊花，我来玩。",
        ],
        reply: "（在她旁边坐下。）",
      },
    },
    late: {
      lines: ["（她正在收摊。）今天晚了，明天早点儿来。"],
      reply: "（说明天早点来。）",
    },
  },

  npc_snack_street_vendor: {
    home: "snack_street",
    scripts: {
      boyue_snack_street: { lines: ["（他翻了翻烤架上的串。）周五来泊月这边摆摊，要不要尝一份？"], reply: "（看看今天有什么小吃。）" },
      dev_food_street: { lines: ["（他把刚出锅的小吃摆上台面。）周末在学院这边出摊，学生们挺爱吃。"], reply: "（看看今天的小吃，和他聊几句。）" },
      snack_street: {
        lines: [
          "（他把一小碗试味的热汤放到桌边。）来了？这点我请你，先尝口汤。",
          "（手上的铲子没停。）今天人多，你先坐着等会儿。",
          "（他用干净小碟分出一份试吃。）刚出锅的，请你尝两口，趁热。",
        ],
        reply: "（接过来先尝一口。）",
        replyByLine:{1:'（找个位子，先看看菜单。）'},
        benefitByLine:{0:'ma_soup',2:'ma_tasting'},
      },
    },
    early: {
      lines: ["（他刚把炉子点着。）来得巧，第一批刚下锅。"],
      reply: "（站在旁边看火。）",
    },
    late: {
      lines: ["（他正收拾摊子。）收摊了，明天再来。"],
      reply: "（说明天来。）",
    },
  },

  npc_suburb_farmer: {
    home: "farm",
    scripts: {
      camping_base: { lines: ["（他在帐篷旁摆好折叠椅。）周日歇一天，来湖边坐坐。"], reply: "（在旁边坐下，看看湖景。）" },
      farm: {
        lines: [
          "（他直起腰，拍了拍手上的土。）来了？地里正忙。",
          "（把锄头往地上一插。）今天日头好，活儿好干。",
        ],
        reply: "（跟着他往田里走了几步。）",
      },
      pasture: {
        lines: [
          "（他拎着奶桶从牛棚出来。）今天轮到我挤奶。",
          "（把桶放下，抹了把汗。）这儿味儿大，你不嫌就站会儿。",
        ],
        reply: "（站在栏边看他干活。）",
      },
      orchard: {
        lines: [
          "（他站在树下，把刚洗好的果子放到你手边。）这枚洗过了，想尝就拿，脆得很。",
          "（他递来一个洗好的果子。）请你尝尝，今天摘的甜。",
        ],
        reply: "（接过来咬了一口。）",
        benefitByLine:{0:'farmer_fruit',1:'farmer_fruit'},
      },
    },
    early: {
      lines: ["（他已经在田埂上了。）趁凉快把这段干完，中午就歇了。"],
      reply: "（跟着他往田里走。）",
    },
    late: {
      lines: ["（他打着灯往回走。）天黑了，地里的活儿明天再说。"],
      reply: "（说一起走一段。）",
    },
  },
};

/** 兜底：未收录的 NPC / 地点组合，给一句通用问候，保证「每天第一次」永远有回应。 */
const GENERIC_NORMAL: GreetingScript = {
  lines: ["（停下手上的事。）今天也出来了？", "（抬头看了你一眼。）嗯，你来了。"],
  reply: "（顺口聊两句。）",
};
const GENERIC_LATE: GreetingScript = {
  lines: ["（看了看时间。）这么晚了，还没回去？"],
  reply: "（说这就回。）",
};

/**
 * 生成某位 NPC 当天首次搭话的短问候节点。
 *
 * @param npcId       NPC id
 * @param locationId  玩家当前所在地点（也是该 NPC 此刻所在的地点）
 * @param hour        当前小时（0–23）
 * @param seed        稳定性抽签种子（建议传 gameDay，保证同一天重开对话结果一致）
 */
export function npcGreetingNode(
  npcId: string,
  locationId: string,
  hour: number,
  seed: number,
): NpcTalkNode | undefined {
  const set = NPC_GREETINGS[npcId];
  const period = greetingPeriodOfHour(hour);
  let script: GreetingScript | undefined;
  let variant = "generic";

  if (period === "late" && (!set?.scripts[locationId] || locationId === set.home)) {
    script = set?.late ?? GENERIC_LATE;
    variant = "late";
  } else if (period === "early" && set?.early) {
    script = set.early;
    variant = "early";
  } else {
    const byLocation = set?.scripts[locationId];
    if (byLocation) {
      script = byLocation;
      variant = locationId;
    } else {
      script = GENERIC_NORMAL;
    }
  }
  if (!script || script.lines.length === 0) return undefined;

  const pick = hashSeed(`${npcId}:${locationId}:${period}:${seed}`) % script.lines.length;
  return {
    id: `greet_${npcId}_${variant}_${pick}`,
    text: script.lines[pick],
    options: [
      { label: script.replyByLine?.[pick]??script.reply, affinity: 1, ...(script.benefitByLine?.[pick]?{dialogueBenefitId:script.benefitByLine[pick]}:{}) },
      { label: "（点头走开。）", affinity: 0, leave: true },
    ],
  };
}

/** 该 NPC 当天是否已经打过招呼（问候只在每天首次搭话时出现）。 */
export function greetedToday(state: { flags: Record<string, boolean | number> }, npcId: string, today: number): boolean {
  return state.flags[`npc_greet_day_${npcId}`] === today;
}

/** 记录「今天已问候」，供 commit 时写入正式状态。 */
export function markGreeted(state: { flags: Record<string, boolean | number> }, npcId: string, today: number): void {
  state.flags[`npc_greet_day_${npcId}`] = today;
}

/** 问候只占用很短的时间（6 分钟），与正式对话的 0.5 小时区分开。 */
export const GREETING_TIME_COST = 0.1;

/** 导出供构建期审计使用：全部问候脚本的文本。 */
export function greetingScriptTexts(): Array<{ key: string; text: string; reply: string; benefitId?:string }> {
  const out: Array<{ key: string; text: string; reply: string; benefitId?:string }> = [];
  for (const [npcId, set] of Object.entries(NPC_GREETINGS)) {
    for (const [loc, script] of Object.entries(set.scripts)) {
      for (const [index,text] of script.lines.entries()) out.push({ key: `${npcId}/${loc}`, text, reply: script.replyByLine?.[index]??script.reply,benefitId:script.benefitByLine?.[index] });
    }
    if (set.early) for (const [index,text] of set.early.lines.entries()) out.push({ key: `${npcId}/early`, text, reply: set.early.reply,benefitId:set.early.benefitByLine?.[index] });
    if (set.late) for (const [index,text] of set.late.lines.entries()) out.push({ key: `${npcId}/late`, text, reply: set.late.reply,benefitId:set.late.benefitByLine?.[index] });
  }
  for (const text of GENERIC_NORMAL.lines) out.push({ key: "generic/normal", text, reply: GENERIC_NORMAL.reply });
  for (const text of GENERIC_LATE.lines) out.push({ key: "generic/late", text, reply: GENERIC_LATE.reply });
  return out;
}

/** 小巧的稳定哈希（不引入 rng，避免扰动全局随机序列与读档回放）。 */
function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}
