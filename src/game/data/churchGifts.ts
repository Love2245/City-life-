import portrait_mary from "../../assets/documents/church-portraits/mary.png";
import portrait_peter from "../../assets/documents/church-portraits/peter.png";
import portrait_andrew from "../../assets/documents/church-portraits/andrew.png";
import portrait_james_zebedee from "../../assets/documents/church-portraits/james_zebedee.png";
import portrait_john from "../../assets/documents/church-portraits/john.png";
import portrait_philip from "../../assets/documents/church-portraits/philip.png";
import portrait_bartholomew from "../../assets/documents/church-portraits/bartholomew.png";
import portrait_thomas from "../../assets/documents/church-portraits/thomas.png";
import portrait_matthew from "../../assets/documents/church-portraits/matthew.png";
import portrait_james_alphaeus from "../../assets/documents/church-portraits/james_alphaeus.png";
import portrait_jude_thaddeus from "../../assets/documents/church-portraits/jude_thaddeus.png";
import portrait_simon_zealot from "../../assets/documents/church-portraits/simon_zealot.png";
import type { GameState } from "../types";
import { gameDay } from "../core/calendar";

/** Church catechumen cards and daily Gospel excerpts sourced from the bundled Síkǎo New Testament. */
export interface ChurchGiftCardDef {
  itemId: string;
  name: string;
  subject: "圣母卡" | "门徒卡";
  icon: string;
  accent: string;
  description: string;
}

/** Mary and the eleven apostles named in the catechumen gift collection (Judas Iscariot is excluded). */
export const CHURCH_GIFT_CARDS: readonly ChurchGiftCardDef[] = [
  { itemId: "church_card_mary", name: "圣母玛利亚", subject: "圣母卡", icon: "🌹", accent: "#a64d62", description: "蓝色披风与象牙白衣袍中的圣母玛利亚，双手合拢。" },
  { itemId: "church_card_peter", name: "圣伯多禄", subject: "门徒卡", icon: "🗝️", accent: "#a77a37", description: "金色披风中的圣伯多禄，手持两把钥匙。" },
  { itemId: "church_card_andrew", name: "圣安德肋", subject: "门徒卡", icon: "✝️", accent: "#4f8290", description: "青色衣袍中的圣安德肋，身旁有斜十字架。" },
  { itemId: "church_card_james_zebedee", name: "圣雅各伯（载伯德之子）", subject: "门徒卡", icon: "🐚", accent: "#8b6847", description: "朝圣装束中的圣雅各伯，佩戴贝壳并持手杖。" },
  { itemId: "church_card_john", name: "圣若望", subject: "门徒卡", icon: "🕊️", accent: "#6d78a4", description: "红色衣袍中的年轻圣若望，手持福音书。" },
  { itemId: "church_card_philip", name: "圣斐理伯", subject: "门徒卡", icon: "📜", accent: "#777044", description: "橄榄色衣袍中的圣斐理伯，手持木十字架。" },
  { itemId: "church_card_bartholomew", name: "圣巴尔多禄茂", subject: "门徒卡", icon: "🌿", accent: "#65815b", description: "绿色衣袍中的圣巴尔多禄茂，手持经卷。" },
  { itemId: "church_card_thomas", name: "圣多默", subject: "门徒卡", icon: "🕯️", accent: "#9a654d", description: "棕红色衣袍中的圣多默，手持木工角尺。" },
  { itemId: "church_card_matthew", name: "圣玛窦", subject: "门徒卡", icon: "📖", accent: "#926e8b", description: "紫色衣袍中的圣玛窦，手持书卷与羽毛笔。" },
  { itemId: "church_card_james_alphaeus", name: "圣雅各伯（阿尔斐之子）", subject: "门徒卡", icon: "🌾", accent: "#9a7544", description: "浅金色衣袍中的圣雅各伯，手持小经卷。" },
  { itemId: "church_card_jude_thaddeus", name: "圣犹达（达陡）", subject: "门徒卡", icon: "🤍", accent: "#5e829c", description: "蓝绿色衣袍中的圣犹达（达陡），胸前佩戴纪念章；并非依斯加略犹达。" },
  { itemId: "church_card_simon_zealot", name: "圣西满（热忱者）", subject: "门徒卡", icon: "🪔", accent: "#85644c", description: "暗红衣袍中的圣西满，手持经书。" },
];

export interface GospelBoxQuote {
  bookName: string;
  chapter: number;
  /** Exact contiguous words from the bundled `new-testament.txt`; no wording is authored here. */
  text: string;
}

export interface ChurchGospelExcerptDocument {
  id: "doc_church_gospel_box";
  title: string;
  kind: "sheet";
  subtitle: string;
  pages: string[];
  cover: string;
}

/** Returns only the saved excerpt for today; the draw pool is never turned into public document pages. */
export function getChurchGospelExcerptDocument(state: GameState): ChurchGospelExcerptDocument | undefined {
  const today = gameDay(state.time);
  const index = state.flags.church_gospel_box_quote_index;
  if (state.flags.church_gospel_box_day !== today || typeof index !== "number") return undefined;
  const quote = GOSPEL_BOX_QUOTES[index];
  if (!quote) return undefined;
  return {
    id: "doc_church_gospel_box",
    title: "福音小盒·今日摘录",
    kind: "sheet",
    subtitle: "思高圣经·新约 · 当日已抽取",
    pages: [`【${quote.bookName} 第${quote.chapter}章】\n\n${quote.text}`],
    cover: gospelBoxCoverImage(),
  };
}

/**
 * Daily draw pool. Each excerpt is copied verbatim from the named chapter in
 * data/scripture/new-testament.txt; tests check every quote against that source.
 */
export const GOSPEL_BOX_QUOTES: readonly GospelBoxQuote[] = [
  { bookName: "玛窦福音", chapter: 5, text: "怜悯人的人是有福的，因为他们要受怜悯。" },
  { bookName: "玛窦福音", chapter: 5, text: "缔造和平的人是有福的，因为他们要称为天主的子女。" },
  { bookName: "玛窦福音", chapter: 5, text: "你们的光也当在人前照耀，好使他们看见你们的善行，光荣你们在天之父。" },
  { bookName: "玛窦福音", chapter: 6, text: "所以你们不要为明天忧虑，因为明天有明天的忧虑！一天的苦足够一天受的了。" },
  { bookName: "玛窦福音", chapter: 7, text: "所以，凡你们愿意人给你们做的，你们也要照样给人做：法律和先知即在于此。" },
  { bookName: "玛窦福音", chapter: 11, text: "凡劳苦和负重担的，你们都到我跟前来，我要使你们安息。" },
  { bookName: "玛窦福音", chapter: 18, text: "因为那里有两个或三个人，因我的名字聚在一起，我就在他们中间。" },
  { bookName: "玛窦福音", chapter: 25, text: "凡你们对我这些最小兄弟中的一个所做的，就是对我做的。" },
  { bookName: "马尔谷福音", chapter: 10, text: "让小孩子到我跟前来，不要阻止他们！因为天主的国正属于这样的人。" },
  { bookName: "路加福音", chapter: 6, text: "你们愿意人怎样待你们，也要怎样待人。" },
  { bookName: "路加福音", chapter: 6, text: "你们应当慈悲，就像你们的父那样慈悲。" },
  { bookName: "若望福音", chapter: 8, text: "真理必会使你们获得自由。" },
  { bookName: "若望福音", chapter: 13, text: "我给你们一条新命令：你们该彼此相爱；如同我爱了你们，你们也该照样彼此相爱。" },
  { bookName: "若望福音", chapter: 14, text: "我把平安留给你们，我将我的平安赐给你们；我所赐给你们的，不像世界所赐的一样。你们心里不要烦乱，也不要胆怯。" },
  { bookName: "罗马书", chapter: 12, text: "论望德，要喜乐；在困苦中，要忍耐；在祈祷上，要恒心；" },
  { bookName: "罗马书", chapter: 12, text: "你不可为恶所胜，反应以善胜恶。" },
  { bookName: "格林多前书", chapter: 13, text: "爱是含忍的，爱是慈祥的，爱不嫉妒，不夸张，不自大" },
  { bookName: "迦拉达书", chapter: 6, text: "为此，我们行善不要厌倦；如果不松懈，到了适当的时节，必可收获。" },
  { bookName: "厄弗所书", chapter: 4, text: "彼此相待，要良善，要仁慈，互相宽恕，如同天主在基督内宽恕了你们一样。" },
  { bookName: "斐理伯书", chapter: 4, text: "你们在主内应当常常喜乐，我再说：你们应当喜乐！" },
  { bookName: "斐理伯书", chapter: 4, text: "你们什么也不要挂虑，只在一切事上，以恳求和祈祷，怀着感谢之心，向天主呈上你们的请求" },
  { bookName: "斐理伯书", chapter: 4, text: "凡是真实的，凡是高尚的，凡是正义的，凡是纯洁的，凡是可爱的，凡是荣誉的，不管是美德，不管是称誉：这一切你们都该思念" },
  { bookName: "伯多禄前书", chapter: 5, text: "将你们的一切挂虑都托给他，因为他必关照你们。" },
  { bookName: "若望一书", chapter: 4, text: "可爱的诸位，既然天主这样爱了我们，我们也应该彼此相爱。" },
  { bookName: "默示录", chapter: 21, text: "他要拭去他们眼上的一切泪痕；以后再也没有死亡，再也没有悲伤，没有哀号，没有苦楚，因为先前的都已过去了。" },
];

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const CARD_PORTRAITS: Record<string, string> = {
  church_card_mary: portrait_mary,
  church_card_peter: portrait_peter,
  church_card_andrew: portrait_andrew,
  church_card_james_zebedee: portrait_james_zebedee,
  church_card_john: portrait_john,
  church_card_philip: portrait_philip,
  church_card_bartholomew: portrait_bartholomew,
  church_card_thomas: portrait_thomas,
  church_card_matthew: portrait_matthew,
  church_card_james_alphaeus: portrait_james_alphaeus,
  church_card_jude_thaddeus: portrait_jude_thaddeus,
  church_card_simon_zealot: portrait_simon_zealot,
};

/** Individual artistic devotional portraits. */
export function churchGiftCardImage(card: ChurchGiftCardDef): string {
  return CARD_PORTRAITS[card.itemId];
}

/** Vector rendering for the one-time baptismal crucifix keepsake. */
export function churchCrucifixImage(): string {
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960">
    <defs><linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8edda"/><stop offset="1" stop-color="#d9c39c"/></linearGradient></defs>
    <rect width="720" height="960" fill="#4c443a"/><rect x="24" y="24" width="672" height="912" rx="18" fill="url(#wood)"/>
    <rect x="45" y="45" width="630" height="870" rx="12" fill="none" stroke="#8a6946" stroke-width="4"/>
    <text x="360" y="132" text-anchor="middle" fill="#6f5133" font-family="serif" font-size="34" letter-spacing="8">洗礼纪念</text>
    <path d="M360 250v430M245 365h230" fill="none" stroke="#765335" stroke-width="46" stroke-linecap="round"/>
    <circle cx="360" cy="302" r="42" fill="#d2ae7b" stroke="#765335" stroke-width="8"/>
    <path d="M360 348l-62 132 62 54 62-54z" fill="#9b7953" stroke="#765335" stroke-width="8" stroke-linejoin="round"/>
    <path d="M305 415l-93 70M415 415l93 70M322 521l-33 120M398 521l33 120" fill="none" stroke="#765335" stroke-width="20" stroke-linecap="round"/>
    <text x="360" y="790" text-anchor="middle" fill="#493c2e" font-family="serif" font-size="54">苦像</text>
    <text x="360" y="858" text-anchor="middle" fill="#765335" font-family="serif" font-size="25">教会洗礼纪念品</text>
  </svg>`);
}

/** Original vector cover for the bookshelf entry containing the daily saved quote pages. */
export function gospelBoxCoverImage(): string {
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960">
    <defs><linearGradient id="cover" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#53677e"/><stop offset="1" stop-color="#24364b"/></linearGradient></defs>
    <rect width="720" height="960" fill="url(#cover)"/><rect x="30" y="30" width="660" height="900" rx="16" fill="none" stroke="#ddc78f" stroke-width="5"/>
    <circle cx="360" cy="350" r="174" fill="none" stroke="#ddc78f" stroke-width="6"/><circle cx="360" cy="350" r="142" fill="none" stroke="#ddc78f" stroke-width="2"/>
    <path d="M360 228v244M298 290h124" stroke="#f3e6c5" stroke-width="20" stroke-linecap="round"/>
    <text x="360" y="635" text-anchor="middle" fill="#f4e9cf" font-family="serif" font-size="64">福音小盒</text>
    <text x="360" y="720" text-anchor="middle" fill="#ddc78f" font-family="serif" font-size="30" letter-spacing="8">每日摘录</text>
    <text x="360" y="855" text-anchor="middle" fill="#ddc78f" font-family="serif" font-size="24">思高圣经 · 新约</text>
  </svg>`);
}
