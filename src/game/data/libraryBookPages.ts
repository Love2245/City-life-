import { LIFESTYLE_BOOK_PAGES } from "./libraryBookPagesLifestyle";
import { PRACTICAL_BOOK_PAGES } from "./libraryBookPagesPractical";

/**
 * 把相邻的短章整合成较完整的主题。每个主题保留两张阅读器页面，
 * 因而原有八本书的物理页序不变，同时目录从零散小节变成清楚的七个主题。
 */
const TOPIC_TITLES: Record<string, string[]> = {
  book_cooking: [
    "规划用餐并建立卫生流程", "控制火候并按步骤调味", "掌握快炒蔬菜与炖煮方法",
    "关注食品安全并安排备餐", "把菜谱转化为适合自己的做法", "安排采购、份量与厨房安全", "安全处理剩菜并形成稳定流程",
  ],
  book_sports: [
    "建立适合自己的活动习惯", "做好准备并开展有氧活动", "安全步行并开始力量练习",
    "发展上下肢力量", "兼顾柔韧与平衡", "安排周计划并逐步进阶", "恢复身体并长期坚持",
  ],
  book_health: [
    "理解健康并照顾睡眠", "安排多样饮食与饮水", "把活动和卫生融入日常",
    "照顾情绪与屏幕使用", "观察身体并准备就诊", "有依据地安排预防与用药", "借助环境支持稳定习惯",
  ],
  book_philosophy: [
    "提出问题并澄清概念", "区分事实与判断并检查论证", "用反例检验观点并讨论自由",
    "讨论责任并尊重他人", "说明公平标准并处理两难", "理解幸福与生活价值", "在分歧中把思考带回生活",
  ],
  book_charm: [
    "建立整洁而合宜的仪表", "选衣、护理与卫生", "整理环境并为交谈留出空间",
    "倾听并理解对方", "具体表达意见与需求", "遵守公共礼仪与线上分寸", "尊重边界并形成个人风格",
  ],
  book_programming: [
    "拆解问题并呈现结果", "理解数据并验证输入", "用条件组织不同路径",
    "用循环处理重复任务", "以函数组织可复用逻辑", "用数据结构完成小项目", "依据证据调试并迭代",
  ],
  book_design: [
    "从沟通目标建立层级", "用结构、对齐和分组组织内容", "安排留白与阅读节奏",
    "让字体与段落易于阅读", "用色彩与图像传达信息", "统一视觉元素并组织版面", "在真实场景检查并交付",
  ],
  book_operation: [
    "识别经营问题与顾客需求", "确定服务对象与目标", "说明商品价值并选择渠道",
    "连接购买路径与价格判断", "让购买和问题处理更可靠", "用记录选择经营指标", "用指标、小试验与复盘改进",
  ],
  book_stall_tips: [
    "先确认场地条件再选点", "选品并按实际需求备货", "兼顾天气、运输与卫生要求",
    "规划摊位动线并安排陈列", "定价清楚并礼貌介绍商品", "规范交易并处理突发状况", "妥善收摊并复盘调整",
  ],
};

function firstLine(text: string): { heading: string; body: string } {
  const newline = text.indexOf("\n");
  if (newline < 0) return { heading: text, body: "" };
  const heading = text.slice(0, newline).trim();
  return { heading, body: text.slice(newline).replace(/^\n+/, "").trim() };
}

function consolidateTopics(bookId: string, pages: string[]): string[] {
  const titles = TOPIC_TITLES[bookId];
  if (!titles) return pages;
  if (pages.length !== titles.length * 2) {
    throw new Error(`${bookId} 正文页数应为 ${titles.length * 2}，实际为 ${pages.length}`);
  }
  return titles.flatMap((title, index) => {
    const chapter = `第${index + 1}章｜${title}`;
    const first = firstLine(pages[index * 2]);
    const second = firstLine(pages[index * 2 + 1]);
    return [
      `${chapter}\n\n${first.body}`,
      `${chapter}（续）\n\n${second.body}`,
    ];
  });
}

const ORIGINAL_BOOK_PAGES: Record<string, string[]> = {
  ...LIFESTYLE_BOOK_PAGES,
  ...PRACTICAL_BOOK_PAGES,
};

/** 图书馆九本原创馆藏正文；烹饪书的菜谱附录在 readableDocuments 中单独组装。 */
export const LIBRARY_BOOK_PAGES: Record<string, string[]> = Object.fromEntries(
  Object.entries(ORIGINAL_BOOK_PAGES).map(([id, pages]) => [id, consolidateTopics(id, pages)]),
);
