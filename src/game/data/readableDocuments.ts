import { BOOKS, BOOK_READING_CLOSINGS } from "./books";
import guanyin from "../../assets/documents/guanyin.png";
import catAward from "../../assets/documents/cat-award.png";
import employeeAward from "../../assets/documents/employee-award.png";
import cityGuideCover from "../../assets/documents/book-covers/city-guide.webp";
import sportsCover from "../../assets/documents/book-covers/book-sports.webp";
import healthCover from "../../assets/documents/book-covers/book-health.webp";
import cookingCover from "../../assets/documents/book-covers/book-cooking.webp";
import philosophyCover from "../../assets/documents/book-covers/book-philosophy.webp";
import charmCover from "../../assets/documents/book-covers/book-charm.webp";
import programmingCover from "../../assets/documents/book-covers/book-programming.webp";
import designCover from "../../assets/documents/book-covers/book-design.webp";
import operationCover from "../../assets/documents/book-covers/book-operation.webp";
import stallTipsCover from "../../assets/documents/book-covers/book-stall-tips.webp";
import bibleOldCover from "../../assets/documents/book-covers/bible-old-testament.webp";
import bibleNewCover from "../../assets/documents/book-covers/bible-new-testament.webp";
import templeDeerKing from "../../assets/documents/temple-gift/deer-king-jataka.png";
import templeGuideBodhisattva from "../../assets/documents/temple-gift/guide-bodhisattva.png";
import templeMahaVairocana from "../../assets/documents/temple-gift/maha-vairocana.png";
import templeCourtyard from "../../assets/documents/temple-gift/temple-courtyard.png";
import { RECIPES } from "../core/cooking";
import { LIBRARY_BOOK_PAGES } from "./libraryBookPages";
import templeSutras from "./templeSutras.json";
import type { GameState } from "../types";
import {
  CHURCH_GIFT_CARDS,
  churchCrucifixImage,
  churchGiftCardImage,
  
} from "./churchGifts";

export interface ReadableDocument {
  id: string;
  title: string;
  kind: "book" | "sheet" | "art" | "certificate";
  subtitle?: string;
  pages: string[];
  image?: string;
  cover?: string;
  /** 正文起始页（1-based）；前言和目录前置后用于迁移旧阅读进度。 */
  bodyStartPage?: number;
}

const INTROS: Record<string, string> = {
  doc_temple_sutra_booklet: "旧版结缘院晨读选页仅为旧存档保留，新领取的经书已改为有明确底本与译者信息的完整读本。",
  book_sports: "运动不是一次性挑战，而是可以融入生活的习惯。本书从热身、呼吸、训练和恢复四个环节入手。读完后挑一件今天能做的小事，比制订庞大的计划更有用。",
  book_health: "照顾身体要从每天的作息、饮食和观察开始。这本小册子谈常见的生活习惯，也提醒你：持续或严重的不适需要交给医生判断。",
  book_cooking: "从安排一顿饭开始，学习备料、火候、调味、食品安全与复盘。菜谱是结合器具和食材调整的起点，不是适用于所有厨房的固定保证。",
  book_philosophy: "哲学从日常疑问开始。本书以概念辨析、理由检查和观点比较为主，章节是编者撰写的思考练习，并非古典哲学家的原文或学说摘录。",
  book_charm: "仪表、交谈和待人的分寸都能练习。精致并不取决于花多少钱，而是愿不愿意照顾自己，也给别人留出舒适的空间。",
  book_programming: "写程序就是把问题拆成明确的步骤，让电脑依序执行。先学会输入、变量、条件和循环，再试着做一个能运行的小作品。",
  book_design: "设计让信息更容易被看见、理解和记住。配色、对齐、留白与字体都是工具；先想清楚内容的主次，再选择形式。",
  book_operation: "经营从了解顾客开始。本书用拉新、留存、转化与复购串起一个小生意的日常，也提醒读者把数字放回真实情境。",
  book_stall_tips: "摆摊需要观察人流、准备货品和耐心招呼顾客。这里记录摊主常用的小办法；好位置和稳定的口碑都要靠时间积累。",
};

const ADDITIONAL_PAGES: Record<string, string[]> = {
  book_sports: [
    "第一章　找到合适的起点\n\n刚开始训练时，先估计自己能稳定完成的运动量。快走、慢跑和徒手动作都可以作为起点。每周增加一点时间，给肌肉和关节留出适应的机会；如果动作让你疼痛，就停下来检查姿势。",
    "第二章　安排一周\n\n有氧、力量和休息交替安排，比每天重复同一组动作更容易坚持。忙碌时可以把训练拆成几段短活动。记下运动后的体力与心情，过几周再调整计划。",
  ],
  book_health: [
    "第一章　记录身体的信号\n\n睡眠、食欲和精神状态每天都在变化。偶尔的一天不好不必惊慌；如果问题持续、加重，或者妨碍正常生活，就应寻求医护人员帮助。简单的日常记录能让描述症状更清楚。",
    "第二章　建立可执行的习惯\n\n规律进食、喝水、活动和睡眠往往比昂贵的用品更有效。先改变一个最容易做到的环节，例如固定起床时间。稳定一周后，再加入下一件事。",
  ],
  book_cooking: [
    "第一章　开火以前\n\n先洗手、清理台面，再把食材分开放好。生肉与即食食物使用不同的刀板；切好的材料按下锅顺序排列。这样做菜时不必一边找东西一边看火。",
    "第二章　火候和收尾\n\n大火适合快炒，小火适合慢炖。调料宁可少量多次地放；装盘前尝味道，确认食物已经熟透。最后把锅具洗净，也算一道菜完成的一部分。",
  ],
  book_philosophy: [
    "第一章　把问题说清楚\n\n“我过得不好”包含许多不同的问题：缺钱、疲倦、孤独，或者不知道下一步往哪走。试着写下具体的一件事，再问自己能改变其中哪一部分。好问题往往比急着找答案更重要。",
    "第二章　与不同观点相处\n\n读到与自己相反的想法时，先试着准确复述它，再决定是否同意。哲学不是把名言当作命令，而是练习辨认理由。今天的答案也可以随着经验改变。",
  ],
  book_charm: [
    "第一章　照顾自己\n\n干净合身的衣服、整洁的头发和稳定的作息，会让人更自在地走进不同场合。准备一套适合工作的穿搭，再留一套舒服的日常衣服，不必每次出门都重新烦恼。",
    "第二章　认真听人说话\n\n先听完整，再回应对方真正关心的事。记住名字与约定的时间，做不到时提前告知。守时和可靠常常比漂亮话更能留下好印象。",
  ],
  book_programming: [
    "第一章　变量与输入\n\n变量保存一段数据。例如输入今天的收入和支出，分别存入 income 与 expense；计算 income - expense 就得到余额。名字应说明用途，避免过几天连自己也看不懂。",
    "第二章　判断与循环\n\n条件判断让程序根据不同情况选择路径：如果余额小于零，就提示超支。循环则把同样的步骤用于一周的每一天。写完后试试零、负数和空输入，看看程序会怎样。",
    "第三章　完成一个小工具\n\n做一份简单记账程序：输入一笔花费、加入列表、求出总额。遇到错误时先缩小范围，打印中间结果，再检查变量类型。能运行的小程序比停在笔记里的宏大计划更有用。",
  ],
  book_design: [
    "第一章　先定主次\n\n看一张海报时，读者应该先看见什么？把那一句话写在纸中央，其余信息按重要程度缩小。若每件事都被放大，最后反而没有重点。",
    "第二章　用间距建立秩序\n\n同类内容放近，不同内容拉开。让图片边缘、标题与正文沿一条看不见的线对齐。调整完后站远一点看，检查整体是否仍能辨认。",
  ],
  book_operation: [
    "第一章　认识顾客\n\n先观察顾客为什么来到这里：是急需一件东西，还是想慢慢挑选？记录他们问得最多的问题。比起猜测市场喜好，真实的对话更容易指出需要改进的地方。",
    "第二章　把数字接回行动\n\n成交量低时，可能是进店的人少，也可能是价格、陈列或介绍方式出了问题。一次只改一个因素，记下改动前后的结果，才知道究竟是哪一步起了作用。",
  ],
  book_stall_tips: [
    "第一章　出摊准备\n\n提前数好零钱，检查照明和装货方式，把价格写得清楚。食物要注意储存与卫生；遇到天气变化，能迅速收摊也是本事。",
    "第二章　复盘一晚\n\n收摊后记下剩余货品、最忙的时段和顾客常问的话。下一次调整备货量和摆放位置。摆摊的经验来自许多个普通夜晚的细小改进。",
  ],
};

const RECIPE_METHODS: Record<string, string> = {
  dish_veg: "洗净并沥干蔬菜，按粗细和耐煮程度安排下锅顺序。锅里留出翻动空间，炒至达到自己喜欢的熟度；火力弱时分批处理。",
  dish_salad: "使用安全饮水清洗蔬菜并沥干，切配工具保持洁净。沙拉酱临吃前加入，若加入易腐材料应及时冷藏并遵循当地保存建议。",
  dish_meat: "肉块切成相近大小后先按合适方式加热，再加入调味液保持稳定炖煮。软烂程度受肉块和锅具影响；不要只靠颜色判断中心是否熟透。",
  dish_full_meal: "先安排较耗时的主食，再准备两道配菜和汤。处理生肉后洗手并清洁工具；肉、蛋等食材依适用食品安全指南充分加热。",
  dish_steak: "按厚度和偏好控制煎制过程。锅具不必烧到冒烟；熟度不能仅凭每面几分钟推定，可用食品温度计测中心并遵循当地安全指引。",
  pudding: "搅匀奶液与蛋液，过滤后分装，用温和而稳定的热源加热到凝固。蛋奶甜品需充分加热并及时冷藏，具体保存时间参照当地指南。",
  egg_tart: "先准备挞皮，再将奶、蛋和糖混匀，按烤箱说明预热与烘烤。不同烤箱温差明显，应观察内部凝固情况并确保蛋奶馅充分加热。",
  stir_fried_vegetables: "把蔬菜切成相近大小并充分沥水，锅中避免一次装得过满。按需分批翻炒，尝试后调整调味；材料多时要确认内部都已热透。",
  salt_vegetables: "蔬菜洗净沥干后再烹调，盐少量分次加入。先尝基础味，再决定是否需要补调；注意盐、酱料和预制食材可能同时带来钠。",
  salad: "蔬菜清洗后用洁净器具切配，拌入适量沙拉酱。避免把盛放过生肉的器皿直接用于成品；做好后尽快食用或按指南冷藏。",
  small_stir_fry: "蔬菜和肉片分别准备，处理生肉后清洁双手与刀板。先确保肉片充分熟透，再加入蔬菜调整口感；锅中拥挤时分批更容易受热均匀。",
  tomato_egg: "鸡蛋打匀后先炒到凝固并盛出，再把番茄加热至软化出汁，最后合锅调味。使用洁净器具，鸡蛋应充分加热，软嫩程度按个人需要调整。",
  egg_fried_rice: "使用妥善冷藏的熟米饭，先打散结块，再按顺序加入鸡蛋与配料并充分翻热。不要使用在室温放置过久的米饭；剩余成品及时冷藏。",
  potato_beef: "牛肉与土豆切成相近大小，先处理牛肉，再加入液体和更易熟的材料。维持稳定炖煮并检查中心熟度，时间随份量、切块和炉具而变。",
  spicy_chicken: "鸡肉处理后及时清洗刀板和双手，切块大小尽量一致。先充分加热鸡肉，再依耐辣程度分次加入辣椒粉；使用温度计比观察表面颜色可靠。",
  onion_beef: "洋葱与牛肉分别切配，生熟工具分开。牛肉先加热至适合的熟度，再加入洋葱调整软硬；若肉片厚薄不同，要留意较厚部分的中心受热。",
  mushroom_egg: "蘑菇清洁处理并切成相近大小，先炒至水分减少，再加入蛋液。鸡蛋要充分加热，调味少量多次；避免把生蛋液接触过的器具用于成品。",
  cabbage_pork: "卷心菜和猪肉分别备料，处理生肉后清洁台面。猪肉应按当地食品安全建议充分加热，再加入卷心菜翻炒；切片厚度和锅具会影响用时。",
  chicken_rice: "先确认鸡肉已妥善解冻，再与大米按器具建议安排烹煮。鸡肉应达到适用指南的安全中心温度；若饭熟而肉未熟，应继续加热并再次检查。",
  pork_rice: "猪肉切块后按安全指南充分加热，与清洁的米饭和调味料组合。盖锅焖煮时检查水量与火力；肉类熟度需结合中心温度，不靠外表颜色判断。",
  sweet_milk_rice_porridge: "米粒煮软后再加入牛奶和糖，降低火力并持续留意锅底，避免黏底溢锅。使用新鲜且正确冷藏的奶类，剩余粥及时分装冷藏。",
  carrot_mushroom: "胡萝卜和蘑菇洗净、切成相近大小。先加热较硬的胡萝卜，再加入蘑菇并调整火候；一次放料太多时可分批烹调，避免积水久煮。",
  spicy_pork: "猪肉切薄片便于均匀受热，先充分加热后再按口味加入酱油和辣椒粉。调味品含盐量有差异，应少量加入；肉类中心熟度按适用指南确认。",
  vegetable_rice: "把蔬菜切成相近大小，按米饭所需液量和器具说明安排下锅顺序。易出水的材料会改变成品软硬，可先少量试做；熟食剩余需及时冷藏。",
};

const RECIPE_PAGES = RECIPES.map((recipe, index) =>
  `家常食谱 ${index + 1}：${recipe.name}\n\n配方线索：${recipe.clue ?? "按游戏内配方所列材料准备"}\n\n操作建议：${RECIPE_METHODS[recipe.id] ?? "先备齐材料并清洁工具，按顺序烹调，分次调味，并依据食材与器具调整火候。"}\n\n预计耗时 ${recipe.duration} 小时仅供游戏内安排参考；现实烹饪应按食材安全要求判断熟度与储存。`,
);

const LIBRARY_COVERS: Record<string, string> = {
  book_sports: sportsCover,
  book_health: healthCover,
  book_cooking: cookingCover,
  book_philosophy: philosophyCover,
  book_charm: charmCover,
  book_programming: programmingCover,
  book_design: designCover,
  book_operation: operationCover,
  book_stall_tips: stallTipsCover,
};

/** 操作型新居民指南。章节中的按钮名、条件与数值都对应当前游戏入口。 */
const CITY_GUIDE_CHAPTERS = [
  "第一章　开局先做这三步\n\n一、看屏幕顶部的日期、时间和现金，再看左侧的饱腹、体力、健康、心情与压力。二、在手机里打开“目标”查看当前主线提示；不确定下一步时，先完成一项明确目标。三、要换地点，点击场景顶部的“出门”回地图，选区域和地点，再点地图标牌或“地点列表”。到达后，在场景行动卡里点击要办的事。灰色行动点不开时，先读卡片上的条件提示。",
  "第二章　安排时间、体力和背包\n\n出行、吃饭、工作、上课和照料都会推进游戏时间；行动卡会显示本次需要多久、花多少钱或扣多少体力。安排工作班次时，把通勤时间也算进去，并留意目的地营业时间。体力低或健康不佳时，部分工作和活动会被拦下；先吃东西、休息或看病，再试一次。打开手机“背包”，点选消耗品后按“使用”；买到的普通饮料也先进入背包，不会在购买时自动喝下。工具、食材和证照也可在背包中查看。",
  "第三章　地图、车站与工业通行证\n\n地图上先点区域，再选可前往的地点；“地点列表”可按名字找设施。跨区出行时，前往地图标出的巴士站或火车站，在“城际交通”面板选目的地，核对候车时间、车程与票价后点“确认购票并出发”。系统会直接扣款、推进候车和车程，并在预计时刻送达，不需要再点一次上车。旧档若带有待乘车票，按车站面板提示在发车时回站“检票上车”。\n\n去重工业区：先完成任意两份工作，再到市中心核心商业区的“市政大厅”（9:00—18:00），打开“办理工业通行证”。准备 80 元，办理耗时 1 小时；办好后会解锁“重工业区”路线。若行动卡说工作次数不足，确认已结算两份工作，单纯申请或开始工作不算完成。原劳务公司仍可代办工业证。市政大厅也能免费办理学生通行证，登记后即可进入两处大学城校园。",
  "第四章　找日结工作\n\n打开地图，进入树堰区工业园的“劳务市场”（5:00—18:00 营业）。这里每天会刷新 3—6 个日结岗位，岗位卡会写工作时长、预计报酬、体力消耗和剩余名额。挑一个符合当前体力与健康条件的岗位，点“开始工作”，完成对应工作流程后当班结算工资。名额用完或当天没有合适岗位时，第二天再来查看。卡片提示条件不足，就按提示恢复状态或选择轻一些的岗位。",
  "第五章　找正式工作与按班上班\n\n打开手机主屏的“招聘”应用，查看各岗位的工作地点、班次时间、时长和预计工资。正式岗位应聘后立即入职，无需先备技能证书或自带工具；按排班前往单位并开始工作，每七天发薪。手机“待办”会显示近期安排。连续三个应出勤班次未上班会解除合同；换岗前先确认原岗位待发工资会立即结清。想做当天短工，去劳务市场；想要固定班次，使用手机招聘。",
  "第六章　培训课与结业证书\n\n到树堰区市中心的“培训学校”（8:00—20:00 营业），点“上培训课”。课程免费，每堂 2 小时，每个游戏日最多一堂。每一级证书分别累计进度：连续三个游戏日每天上 1 堂可结业；中断后也可继续，累计上满 5 堂同样结业。结业才会取得对应等级证书，单上几天但没有满足整项条件时不会提前发证。\n\n证书共三级，普通工作工资加成依次为 5%、10%、20%；满级后再完成一轮结业可领 200 元。打开证照夹或背包查看已经取得的凭证；培训学校界面也会显示当前级别和离结业还差多少堂。旧存档的已有等级会从下一等级继续。",
  "第七章　签月租房\n\n需要长期住处时，前往树堰区市中心的核心商业区“房屋租赁所”（9:00—18:00 营业）。逐项查看地点、设施和首期租金，再按“签约”。签约时一次预付首个 30 游戏日的租金；以后每 30 天续缴，租金可能随续租次数上涨。只有签约成功后，地图和住处详情才会显示该月租房源。续租前检查手机待办里的缴租日期和金额，避免余额不足。想做饭，还要确认住处设施有厨房，并备好厨具和食材。",
  "第八章　临时住宿\n\n只需过夜时，可在地点的住宿行动中选择按晚房间。政府免费床位最多 7 晚，青年旅舍、民宿和酒店的价格与设施各有不同，现场卡片会显示当下费用。入住登记不会立刻扣房费；登记后可继续活动，睡觉结算时按当前选中的住宿收取当晚房费，也可以随时换住或退房。临时住宿适合短住，不会替代月租合同。\n\n登记后，酒店就是本次临时住处。可在酒店场景点“睡觉”，选择时长并确认；登记时不扣钱，每次睡眠按当前房价结算一晚。醒后仍可留在酒店继续住，直到手动退房或切换住宿。回自己的长住处并在那里睡觉，会结束这次酒店借宿。\n",
  "第九章　购买饮料并在背包使用\n\n餐饮地点的“用餐”行动是当场吃；“买饮料”或其他带走商品则会先装进背包。买后打开手机“背包”，选物品并按“使用”，再查看饱腹、体力和心情等状态变化。商品的价格与实际效果以物品卡为准；体力已满时恢复量可能受上限影响。余额不足时，可改看其他商品的现场费用或去市场采购。\n",
  "第十章　给猫咪买猫粮并喂食\n\n领养猫咪前，需要已经签月租或拥有产权房；临时床位不满足新领养条件。打开地图前往紫羊区的“花鸟市场”，在场景里点“宠物用品店”设施卡，再切到“食品”分类。查看商品卡并购买合适的猫粮；购买后猫粮进入猫咪用品背包，不会自动喂食。\n\n回到自己的住处，打开“猫咪”面板，选择猫咪并点“喂食”。系统会按可用猫粮完成喂食；购买前先看背包数量，猫粮售罄时回宠物用品店补货。饱食、心情、清洁和健康都会影响猫咪状态；受伤时请去宠物医院，猫粮不能替代治疗。\n",
  "第十一章　在珍宝湖或环湖公园钓鱼\n\n可在伯月新区自然保护区的“珍宝湖”或紫羊区城市边缘的“环湖公园”钓鱼。打开地图进入对应地点，在水边点“湖边垂钓”。开钓前需带鱼竿、鱼饵和鱼桶；没有装备时，到伯月新区自然保护区的“野营基地”购买。鱼竿与鱼桶可重复使用，鱼饵和体力会随垂钓消耗；具体物资与本次行动要求以现场卡片为准。\n\n按提示等浮标、在咬钩时提竿，再依小游戏控制鱼线把鱼收上来。收获先放进鱼桶；结束垂钓后可整理、出售或留存标本。地点更换不需要再买一套装备，历史最佳和标本会沿用同一份钓鱼记录。若按钮提示缺装备、鱼饵或体力不足，按提示补齐后再开竿。\n",
  "第十二章　用手机和笔记本找对聊天对象\n\n手机打开“消息与通话”，先在“会话”列表选人，再看双方按时间排列的消息；要发起新对话，切到“通讯录”，按姓名、身份或介绍搜索，点对应联系人的消息按钮。通讯录按家人、工作、前辈、朋友等身份分类，最近有消息的人排在前面；这里只列已认识、已解锁或办理服务后加入的联系人。打开会话即可读完未读消息，收到带选项的短信就在原消息下选回复。\n\n奶奶的短信固定在“奶奶”会话里，你的回复和奶奶回信会接在同一个聊天流。笔记本微信与手机共用同一收件箱和联系人身份，换设备查看不会另开一个“我”的会话。需要处理关系短信时，点消息自身的回复选项，确保回应发给原发送人。",
  "第十三章　学习、读书和查看证照\n\n职业培训在培训学校办理；技能练习、网络课程和普通书籍是不同系统，不能替代培训课的结业条件。要读书，打开“背包”，点书籍或文书的“阅读”入口；封面后可翻页，也可直接输入页码跳转。本指南目录列出章节的实际页码，底部“选择章节”可直接跳到操作主题。阅读进度会记录在当前存档中。\n\n办理驾照、培训结业或其他资格后，打开手机背包的“证照夹”确认凭证；证书等级与技能等级分别显示。找不到凭证时，先检查资格条件是否完整结业，再查看证照夹，不要只按上过几天课来判断。",
  "第十四章　回住处、烹饪与基础服务\n\n从任何场景点“出门”回地图，再点地图中的当前住处标牌回家；“定位住处”会带你前往登记的实际住处。要开火，需有可烹饪的住处、厨具和食材；政府临时床位与没有厨房的房间不能做饭。进屋后打开烹饪工作台，从背包或冰箱选料，配好后按“开火”。看病去医院或诊所；洗澡、休息与收纳则按住处设施使用。行动卡上的缺项就是当前操作的阻塞原因。",
  "第十五章　手动存档与读档\n\n要保留当前进度，点主菜单“存档 / 读档”，选一个手动槽位，点“保存”；继续游戏时回到同一界面，选记录并“读取”。再次保存到同一槽位会覆盖旧记录，确认槽位名称和日期再点。自动保存与手动槽位分开，换设备或浏览器不会自动带来本地记录。可以在长途旅行、签约或重要决定前先保存一份手动记录。",
  "第十六章　常见问题速查\n\n行动按钮灰色：读卡片上的缺少条件，检查余额、时间、地点、装备和体力。地点找不到：先确认当前区域，打开“地点列表”搜索名称；未解锁路线要先完成地图或卡片提示的条件。工作没发工资：检查是否完成当班流程；正式工要等七天结算，日结工则在该班结束后结算。培训没有证书：检查当前等级的三堂连续课或五堂累计课是否完成，并在证照夹查看。猫咪没吃到粮：确认买的是猫咪用品背包中的猫粮，再回住处从猫咪面板喂食。饮料没有即时恢复：购买只入包，需在背包点“使用”。短信回错人：回到会话列表确认姓名后，再点那条未回复消息的选项。",
];

const CITY_GUIDE_PROMOTIONAL_PAGE = "末页　喵喵对决宣传页\n\n喵喵对决，等你与伙伴一起登场！\n\n从日常照料到默契训练，每一位参赛者都能与自己的猫咪伙伴留下独特回忆。想了解赛事？先照顾好伙伴，再按自己的节奏尝试挑战。\n\n——本页为城市活动宣传信息";

export const READABLE_DOCUMENTS: ReadableDocument[] = [
  ...BOOKS.map((book): ReadableDocument => ({
    id: book.id,
    title: book.name,
    kind: "book",
    subtitle: "都市图书馆馆藏",
    cover: LIBRARY_COVERS[book.id],
    pages: LIBRARY_BOOK_PAGES[book.id] ? [
      ...LIBRARY_BOOK_PAGES[book.id],
      ...(book.id === "book_cooking" ? RECIPE_PAGES : []),
    ] : [
      INTROS[book.id] ?? book.desc,
      ...(ADDITIONAL_PAGES[book.id] ?? []),
      ...book.snippets,
      ...(book.id === "book_cooking" ? RECIPE_PAGES : []),
      BOOK_READING_CLOSINGS[book.id] ?? "读到这里，可以把有用的一页记下来。",
    ],
  })),
  {
    id: "doc_city_guide",
    title: "都市便民指南",
    kind: "book",
    subtitle: "市政府新居民服务手册",
    cover: cityGuideCover,
    pages: [...CITY_GUIDE_CHAPTERS, CITY_GUIDE_PROMOTIONAL_PAGE],
  },
  {
    id: "bible_old_testament",
    title: "思高圣经·旧约（上册）",
    kind: "book",
    subtitle: "教堂慕道会赠阅",
    cover: bibleOldCover,
    pages: [],
  },
  {
    id: "bible_new_testament",
    title: "思高圣经·新约（下册）",
    kind: "book",
    subtitle: "教堂慕道会赠阅",
    cover: bibleNewCover,
    pages: [],
  },
  ...CHURCH_GIFT_CARDS.map((card): ReadableDocument => ({
    id: card.itemId,
    title: card.name,
    kind: "art",
    subtitle: `${card.subject} · 慕道班纪念卡`,
    pages: [card.description],
    image: churchGiftCardImage(card),
  })),
  {
    id: "church_crucifix",
    title: "苦像纪念品",
    kind: "art",
    subtitle: "教会洗礼纪念",
    pages: ["洗礼时收到的苦像纪念品。卡面以原创矢量图呈现，可在背包中展开欣赏。"],
    image: churchCrucifixImage(),
  },
  {
    id: "doc_guanyin",
    title: "水月观音菩萨画像",
    kind: "art",
    subtitle: "寺庙义工纪念",
    pages: ["第一次在寺庙做义工后，师父赠予你的水月观音菩萨画像。"],
    image: guanyin,
  },
  {
    id: "doc_sutra_amita",
    title: "《佛说阿弥陀经》",
    kind: "book",
    subtitle: "姚秦鸠摩罗什译 · 结缘院赠阅",
    cover: templeGuideBodhisattva,
    pages: templeSutras.doc_sutra_amita,
  },
  {
    id: "doc_sutra_diamond",
    title: "《金刚般若波罗蜜经》",
    kind: "book",
    subtitle: "姚秦鸠摩罗什译 · 结缘院赠阅",
    cover: templeMahaVairocana,
    pages: templeSutras.doc_sutra_diamond,
  },
  {
    id: "doc_sutra_heart",
    title: "《般若波罗蜜多心经》",
    kind: "book",
    subtitle: "唐玄奘译；随卷序文单独编排 · 结缘院赠阅",
    cover: guanyin,
    pages: templeSutras.doc_sutra_heart,
  },
  {
    id: "doc_temple_sutra_booklet",
    title: "晨读经文抄本",
    kind: "book",
    subtitle: "旧版结缘院选页 · 仅为旧存档保留",
    cover: templeGuideBodhisattva,
    pages: [
      "晨读经文抄本\n\n这册旧版小本为晨读与抄写留出安静的一刻。该选页不再由结缘院发放；新领取的经书已改为完整、注明版本来源的独立读本。",
      "抄写时不必赶进度。准备好纸笔，先坐稳、放松肩膀，再从手边的经本选一段抄录。写完后读一遍，看看自己此刻记住了什么。",
      "愿每一次停步，都让心绪多一分安定。",
    ],
  },
  {
    id: "doc_temple_prayer_leaflet",
    title: "结缘院静心手册",
    kind: "sheet",
    subtitle: "结缘院生活与静心练习",
    pages: [
      "结缘院静心手册\n\n入院后请放轻脚步，尊重正在礼佛、诵读或休息的人。若不清楚礼仪，可以先向值守的师父或义工询问。",
      "静心练习：找一个安静的位置坐好，留意自然的呼吸。走神时不必责备自己，温和地把注意力带回当下。",
      "结缘重在一份善意。量力参与日常服务，保持环境整洁，也给他人留下安静的空间。",
    ],
  },
  {
    id: "doc_temple_art_print",
    title: "山门水墨画印",
    kind: "art",
    subtitle: "结缘院山水纪念画印",
    pages: ["一幅以远山、山门、松影与莲池为题的原创画印。仿古绢本与矿物色表现清晨寺院的静谧氛围；并非历史文物或既存寺院壁画的复制品。"],
    image: templeCourtyard,
  },
  {
    id: "doc_temple_deer_king_art",
    title: "鹿王本生图",
    kind: "art",
    subtitle: "鹿王本生故事主题创作",
    pages: ["以鹿王本生故事为题材的原创画作。画面将鹿王、旅人与远处的山寺置于同一段叙事中；这是当代创作的主题画印，并非古代壁画或文物复刻。"],
    image: templeDeerKing,
  },
  {
    id: "doc_temple_guide_bodhisattva_art",
    title: "引路菩萨图",
    kind: "art",
    subtitle: "云路引行主题创作",
    pages: ["以引路菩萨与云中净土为主题的原创画作。画面采用仿古矿物颜料与绢本肌理表现礼敬氛围，并非历史文物或既存壁画的复制品。"],
    image: templeGuideBodhisattva,
  },
  {
    id: "doc_temple_maha_vairocana_art",
    title: "大日如来图",
    kind: "art",
    subtitle: "莲台说法主题创作",
    pages: ["以大日如来结印说法为主题的原创画作。画面参考古典佛教壁画的矿物色层次与构图，不指代特定寺院、造像或历史原作。"],
    image: templeMahaVairocana,
  },
  {
    id: "doc_cat_award",
    title: "喵喵对决初级赛冠军奖状",
    kind: "certificate",
    subtitle: "喵喵对决赛事纪念",
    pages: ["喵喵对决初级赛冠军\n授予：{name}\n你和猫咪伙伴完成了初级赛的全部挑战。"],
    image: catAward,
  },
  {
    id: "doc_employee_award",
    title: "优秀员工奖状",
    kind: "certificate",
    subtitle: "连续四周全勤纪念",
    pages: ["优秀员工奖状\n授予：{name}\n连续四周按时出勤，完成全部排班。\n谨此表彰你的认真与可靠。"],
    image: employeeAward,
  },
];

const TEMPLE_SUTRA_SOURCES: Record<string, { canon: string; translator: string; url: string }> = {
  doc_sutra_amita: {
    canon: "《大正新脩大藏经》T12n0366",
    translator: "姚秦三藏法师鸠摩罗什",
    url: "https://github.com/cbeta-org/xml-p5/blob/master/T/T12/T12n0366.xml",
  },
  doc_sutra_diamond: {
    canon: "《大正新脩大藏经》T08n0235",
    translator: "姚秦三藏法师鸠摩罗什",
    url: "https://github.com/cbeta-org/xml-p5/blob/master/T/T08/T08n0235.xml",
  },
  doc_sutra_heart: {
    canon: "《大正新脩大藏经》T08n0251",
    translator: "唐三藏法师玄奘",
    url: "https://github.com/cbeta-org/xml-p5/blob/master/T/T08/T08n0251.xml",
  },
};

/** 长章节在固定纸张内自然续页；每个章节标题仍从新页开始。 */
function splitLongText(text: string, maxChars: number): string[] {
  const pages: string[] = [];
  let rest = text.trim();
  while (rest.length > maxChars) {
    let cut = -1;
    for (const marker of ["\n\n", "。", "！", "？", "；", "，", "、"]) {
      const index = rest.lastIndexOf(marker, maxChars - 1);
      if (index >= 0) cut = Math.max(cut, index + marker.length);
    }
    if (cut < Math.floor(maxChars * 0.58)) cut = maxChars;
    pages.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pages.push(rest);
  return pages;
}

for (const doc of READABLE_DOCUMENTS) {
  if (doc.id !== "doc_city_guide") continue;
  doc.pages = doc.pages.flatMap((chapter) => {
    if (chapter.length <= 250) return [chapter];
    const titleEnd = chapter.indexOf("\n");
    if (titleEnd < 0) return splitLongText(chapter, 235);
    const title = chapter.slice(0, titleEnd).trim();
    const body = chapter.slice(titleEnd).trim();
    return splitLongText(body, 220).map((part, index) => `${title}${index ? "（续）" : ""}\n\n${part}`);
  });
}

/** 书籍统一加入独立前言、目录和后记页；原文正文仍按原顺序保留。 */
function editorialPagesFor(doc: ReadableDocument, scripture?: import("./scripture").ScriptureVolume): string[] {
  const sutraSource = TEMPLE_SUTRA_SOURCES[doc.id];
  const sutraSections = sutraSource
    ? [...new Set(doc.pages.map((text) => (text.split("\n", 1)[0]?.trim() ?? "").replace(/（续）$/, "")))]
    : undefined;
  const guideEntries = doc.id === "doc_city_guide"
    ? doc.pages.flatMap((text, pageIndex) => {
        const heading = text.split("\n", 1)[0]?.trim() ?? "";
        if (!/^(?:第[一二三四五六七八九十百\d]+章|末页)/.test(heading)) return [];
        const title = heading.replace(/（续）$/, "");
        return doc.pages.slice(0, pageIndex).some((prior) => prior.split("\n", 1)[0]?.trim().replace(/（续）$/, "") === title)
          ? []
          : [{ title, pageIndex }];
      })
    : undefined;
  const contents = scripture
    ? scripture.books.map((book) => `${book.name}（${book.chapters.length}章）`)
    : sutraSections
      ? sutraSections
      : guideEntries
        ? guideEntries.map((entry) => entry.title)
    : [...new Set(doc.pages.flatMap((text) => {
        const heading = text.split("\n", 1)[0]?.trim() ?? "";
        return /^(?:第[一二三四五六七八九十百\d]+章|末页|家常食谱\s*\d+)/.test(heading)
          ? [heading.replace(/（续）$/, "")]
          : [];
      }))];
  const tocPages: string[] = [];
  const pageSize = 18;
  const toc = contents.length ? contents : ["正文从下一页开始，可按页码继续阅读。"];
  const tocPageCount = Math.max(1, Math.ceil(toc.length / pageSize));
  const firstBodyPage = 2 + tocPageCount;
  for (let i = 0; i < toc.length; i += pageSize) {
    const chunk = toc.slice(i, i + pageSize);
    tocPages.push(`${i === 0 ? "目录" : "目录（续）"}\n\n${chunk.map((item, index) => {
      const entry = guideEntries?.find((candidate) => candidate.title === item);
      const pageNumber = entry ? firstBodyPage + entry.pageIndex : i + index + 1;
      return `${pageNumber}　${item}`;
    }).join("\n")}`);
  }

  let preface: string;
  let afterword: string;
  if (scripture) {
    const volumeLabel = doc.id === "bible_old_testament" ? "旧约上册" : "新约下册";
    const sourceTitle = scripture?.sourceTitle ?? `思高圣经·${volumeLabel}`;
    preface = `编者说明\n\n本册随附电子文本首行标为“${sourceTitle}”。阅读器按原文件所载书卷、章节顺序编排，经文和原有注释均保持文件中的次序与文字。随附文本没有提供具体印次与出版信息；如需正式引用，请核对所用纸本版本及出版资料。\n\n本导读、目录、页眉和页码由阅读器添加，仅供查阅，不属于经文。阅读时请区分正文与原注；经文中的宗教诠释属于其文本传统，不应直接当作现代自然科学结论。`;
    afterword = `编者后记\n\n本册经文及随附注释至此结束。阅读器只按原文件顺序分页，没有改写经文；页面标题和本后记仅用于辨识书卷、章节及阅读结构，不属于经文。引用具体段落时，请回看原书卷和章节，并核对所用版本。`;
  } else if (sutraSource) {
    const sutraNotes: Record<string, string> = {
      doc_sutra_amita: "原件中两处缺字占位已依 CBETA 对应经号校订为“阿㝹楼驮”和“车磲”。原件接在经文结束后的往生净土咒及说明不属于 T12n0366 正文，仍保留在书后并明确标注为附录。",
      doc_sutra_diamond: "原件在经文结束后另接“金刚般若波罗蜜经真言”，CBETA T08n0235 正文未收录该段；本书仍按原件保留，但与经文正文分开标注。",
      doc_sutra_heart: "卷首的明太祖御制序与唐释慧忠序按原卷保留并分章。原件将序题目录与正文题头重复展开，本书合并重复题头；咒文后的卷末经题仍按原件保留。",
    };
    preface = `版本与整理说明\n\n底本：${sutraSource.canon}，电子版整理者为 CBETA；译者：${sutraSource.translator}。原典条目：${sutraSource.url}\n\n本书根据玩家提供的文本转为简体并按自然段分页，保留经文次序和原有序文；繁简转换中无法可靠转换的异体字予以保留。校订与编排：${sutraNotes[doc.id] ?? "仅作文字编码与版面整理。"}\n\n来源文件所标 CBETA 电子版使用说明：\nAvailable for non-commercial use when distributed with this header intact.\n\n本书中的目录、分段标题、附录标签和页码为阅读整理所加；宗教文本的义理说明应以相应传统及正式版本为准。`;
    afterword = `整理后记\n\n正文、原卷序文与原件附录已分栏题头，便于辨认其来源与位置。引用经句时请以经号和原典版本为准。附录内容按用户提供的文本保留，不视为对应经号的经文正文。`;
  } else if (doc.id === "doc_city_guide") {
    preface = `前言\n\n欢迎来到本市。《都市便民指南》由市政府市民服务处编印，供新居民了解树堰区、公共设施、工作、交通、居家生活与宠物照料等常用信息。各项服务的具体开放时间、价格和办理条件，请以游戏内地点说明为准。`;
    afterword = `后记\n\n城市生活没有唯一的路线。希望这本指南能帮助你认识常用服务、安排每天的时间，并按自己的兴趣逐步探索。祝你在本市生活顺利，也欢迎把最后一页的活动信息留意起来。\n\n——市政府市民服务处`;
  } else {
    const intro = INTROS[doc.id] ?? `${doc.title}整理了相关主题的基础知识与实用经验。`;
    preface = `前言\n\n${intro}\n\n本书按主题分章编排，可从头阅读，也可通过目录挑选感兴趣的部分。书中的方法供日常学习与游戏体验参考。`;
    afterword = `后记\n\n读完正文后，可以挑出一两条适合自己的内容，在生活里慢慢尝试。知识不必一次记全；遇到新问题时，回到相关章节查阅，也是一种有效的阅读方式。`;
  }

  doc.bodyStartPage = 2 + tocPages.length;
  if (doc.id === "doc_city_guide" && doc.pages.length > 0) {
    // 保留喵喵对决宣传页为全书末页，编者后记放在宣传页之前。
    return [preface, ...tocPages, ...doc.pages.slice(0, -1), afterword, doc.pages[doc.pages.length - 1]];
  }
  return [preface, ...tocPages, ...doc.pages, afterword];
}

export interface ReadableDocumentChapterLink {
  title: string;
  page: number;
}

/** Chapters exposed by the city guide reader, with physical 1-based page numbers. */
export function readableDocumentChapterLinks(document: ReadableDocument): ReadableDocumentChapterLink[] {
  if (document.id !== "doc_city_guide") return [];
  const seen = new Set<string>();
  return document.pages.flatMap((text, index) => {
    const heading = text.split("\n", 1)[0]?.trim() ?? "";
    if (!/^(?:第[一二三四五六七八九十百\d]+章|末页)/.test(heading)) return [];
    const title = heading.replace(/（续）$/, "");
    if (seen.has(title)) return [];
    seen.add(title);
    return [{ title, page: index + 1 }];
  });
}

for (const doc of READABLE_DOCUMENTS) {
  if (doc.kind === "book" && doc.id !== "bible_old_testament" && doc.id !== "bible_new_testament") {
    doc.pages = editorialPagesFor(doc);
  }
}

const documentMap = new Map(READABLE_DOCUMENTS.map((document) => [document.id, document]));
export function getReadableDocument(id: string, _state?: GameState): ReadableDocument | undefined {
  const document = documentMap.get(id);
  return document;
}

const loadedScripture = new Set<string>();
/** Load the large Bible source only after the reader is opened on a Bible volume. */
export async function loadReadableDocument(id: string): Promise<ReadableDocument | undefined> {
  const document = documentMap.get(id);
  if (!document || (id !== "bible_old_testament" && id !== "bible_new_testament")) return document;
  if (!loadedScripture.has(id)) {
    const scripture = await import("./scripture");
    document.pages = scripture.getScripturePages(id);
    document.pages = editorialPagesFor(document, scripture.getScriptureVolume(id));
    loadedScripture.add(id);
  }
  return document;
}

/**
 * 书籍编排调整时将旧阅读位置尽量映射到对应内容。此前烹饪书的菜谱附录
 * 紧接在 8 张导读/短章页后，新版将其扩为 14 张主题页，所以旧菜谱页需前移 6 页。
 * 桌面旧版按双页保存奇数起始页，页 11 已包含第一个菜谱（右页）。
 */
export function migrateReadableDocumentPage(id: string, savedPage: number): number {
  if (!Number.isFinite(savedPage)) return 0;
  const page = Math.max(0, Math.floor(savedPage));
  if (id === "book_cooking" && page >= 11) return page + 6;
  return page;
}

/** 一次性应用当前馆藏页面布局迁移，并将完成标记写入玩家 flags。 */
export function migrateReadableDocumentProgress(
  flags: Record<string, boolean | number>,
  id: string,
  savedPage: number | undefined,
): number | undefined {
  const marker = `reader_${id}_topics_v2`;
  if (flags[marker] === true) return savedPage;
  const page = typeof savedPage === "number" ? migrateReadableDocumentPage(id, savedPage) : undefined;
  if (typeof page === "number") flags[`reader_${id}_page`] = page;
  flags[marker] = true;
  return page;
}
