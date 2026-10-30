import oldTestamentText from "./scripture/old-testament.txt?raw";
import newTestamentText from "./scripture/new-testament.txt?raw";

/** 阅读器每页的正文字符上限。章节会独立分页，长章从自然标点处分成续页。 */
export const SCRIPTURE_PAGE_CHAR_LIMIT = 260;

export const SCRIPTURE_VOLUME_IDS = [
  "bible_old_testament",
  "bible_new_testament",
] as const;

export type ScriptureVolumeId = (typeof SCRIPTURE_VOLUME_IDS)[number];

export interface ScripturePage {
  /** 页面所属书卷。 */
  bookName: string;
  /** 章节号；卷首材料没有章节号。 */
  chapterNumber: number | null;
  /** 同一章节内从 1 开始的页序号。 */
  part: number;
  /** 供游戏阅读器直接显示的章节标识与原文。 */
  text: string;
  /** 未添加页面标识的原文片段。 */
  content: string;
}

export interface ScriptureChapter {
  number: number;
  pages: ScripturePage[];
}

export interface ScriptureBook {
  name: string;
  chapters: ScriptureChapter[];
}

export interface ScriptureVolume {
  id: ScriptureVolumeId;
  title: string;
  /** 源文件首行标题，供检查源文件时使用。 */
  sourceTitle: string;
  books: ScriptureBook[];
  /** 按原书卷、章节顺序展平，可直接作为 ReadableDocument.pages。 */
  pages: ScripturePage[];
}

interface MutableChapter {
  number: number;
  lines: string[];
}

interface MutableBook {
  name: string;
  prefaceLines: string[];
  chapters: MutableChapter[];
}

const BOOK_HEADER = /^◎\s*(.+?)\s*$/;
const CHAPTER_HEADER = /^【第(\d+)章】$/;
const STRUCTURAL_RULE = /^(?:-{5,}|={5,})$/;
const PAGE_BREAK_PUNCTUATION = new Set(["\n", "。", "！", "？", "；"]);
const SECONDARY_BREAK_PUNCTUATION = new Set(["，", "、"]);

function trimOuterBlankLines(lines: string[]): string[] {
  let first = 0;
  let last = lines.length;
  while (first < last && lines[first].trim() === "") first += 1;
  while (last > first && lines[last - 1].trim() === "") last -= 1;
  return lines.slice(first, last);
}

/** 在标点或原有换行处分段；硬切仅作为没有合适标点时的兜底。 */
function paginateText(text: string, limit: number): string[] {
  const chars = Array.from(text);
  if (chars.length <= limit) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < chars.length) {
    const maxEnd = Math.min(start + limit, chars.length);
    if (maxEnd === chars.length) {
      chunks.push(chars.slice(start).join(""));
      break;
    }

    const preferredStart = start + Math.floor(limit * 0.55);
    let cut = -1;
    for (let i = maxEnd - 1; i >= preferredStart; i -= 1) {
      if (PAGE_BREAK_PUNCTUATION.has(chars[i])) {
        cut = i + 1;
        break;
      }
    }
    if (cut < 0) {
      for (let i = maxEnd - 1; i >= start; i -= 1) {
        if (PAGE_BREAK_PUNCTUATION.has(chars[i])) {
          cut = i + 1;
          break;
        }
      }
    }
    if (cut < 0) {
      for (let i = maxEnd - 1; i >= start; i -= 1) {
        if (SECONDARY_BREAK_PUNCTUATION.has(chars[i])) {
          cut = i + 1;
          break;
        }
      }
    }
    if (cut < 0) cut = maxEnd;

    chunks.push(chars.slice(start, cut).join(""));
    start = cut;
  }
  return chunks;
}

function makePage(
  bookName: string,
  chapterNumber: number | null,
  part: number,
  content: string,
): ScripturePage {
  const chapterLabel = chapterNumber === null ? "卷首" : `第${chapterNumber}章`;
  const continuation = part > 1 ? `（续页${part}）` : "";
  const reference = `【${bookName} ${chapterLabel}${continuation}】`;
  return {
    bookName,
    chapterNumber,
    part,
    text: content ? `${reference}\n${content}` : reference,
    content,
  };
}

/** 将用户提供的思高圣经纯文本解析为卷、章和阅读器页面。 */
export function parseScriptureText(
  rawText: string,
  id: ScriptureVolumeId,
  title: string,
  pageCharLimit = SCRIPTURE_PAGE_CHAR_LIMIT,
): ScriptureVolume {
  if (!Number.isInteger(pageCharLimit) || pageCharLimit < 80) {
    throw new RangeError("pageCharLimit 必须是至少 80 的整数");
  }

  const normalizedText = rawText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalizedText.split("\n");
  const sourceTitle = lines.find((line) => line.trim() !== "")?.trim() ?? title;
  const parsedBooks: MutableBook[] = [];
  let currentBook: MutableBook | undefined;
  let currentChapter: MutableChapter | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    const bookMatch = BOOK_HEADER.exec(trimmed);
    if (bookMatch) {
      currentBook = { name: bookMatch[1], prefaceLines: [], chapters: [] };
      parsedBooks.push(currentBook);
      currentChapter = undefined;
      continue;
    }

    const chapterMatch = CHAPTER_HEADER.exec(trimmed);
    if (chapterMatch) {
      if (!currentBook) throw new Error(`卷章标记前未找到书卷标题：${trimmed}`);
      const number = Number(chapterMatch[1]);
      const expected = currentBook.chapters.length + 1;
      if (number !== expected) {
        throw new Error(`${currentBook.name} 章节编号异常：应为第${expected}章，实际为第${number}章`);
      }
      currentChapter = { number, lines: [] };
      currentBook.chapters.push(currentChapter);
      continue;
    }

    if (STRUCTURAL_RULE.test(trimmed)) continue;
    if (currentChapter) currentChapter.lines.push(line);
    else if (currentBook) currentBook.prefaceLines.push(line);
  }

  if (parsedBooks.length === 0) throw new Error("没有找到思高圣经书卷标题");

  const pages: ScripturePage[] = [];
  const books: ScriptureBook[] = parsedBooks.map((book) => {
    const chapters: ScriptureChapter[] = [];
    const preface = trimOuterBlankLines(book.prefaceLines).join("\n");
    if (preface) {
      const contentPages = paginateText(preface, pageCharLimit);
      contentPages.forEach((content, index) => {
        const page = makePage(book.name, null, index + 1, content);
        pages.push(page);
      });
    }

    for (const chapter of book.chapters) {
      const body = trimOuterBlankLines(chapter.lines).join("\n");
      const contentPages = paginateText(body, pageCharLimit);
      const chapterPages = contentPages.map((content, index) =>
        makePage(book.name, chapter.number, index + 1, content),
      );
      chapters.push({ number: chapter.number, pages: chapterPages });
      pages.push(...chapterPages);
    }
    return { name: book.name, chapters };
  });

  return { id, title, sourceTitle, books, pages };
}

export const OLD_TESTAMENT = parseScriptureText(
  oldTestamentText,
  "bible_old_testament",
  "思高圣经·旧约（上册）",
);

export const NEW_TESTAMENT = parseScriptureText(
  newTestamentText,
  "bible_new_testament",
  "思高圣经·新约（下册）",
);

export const SCRIPTURE_VOLUMES: Record<ScriptureVolumeId, ScriptureVolume> = {
  bible_old_testament: OLD_TESTAMENT,
  bible_new_testament: NEW_TESTAMENT,
};

/** 便于与 ReadableDocument 对接：返回可直接使用的 string[] 页面。 */
export function getScripturePages(id: ScriptureVolumeId): string[] {
  return SCRIPTURE_VOLUMES[id].pages.map((page) => page.text);
}

export function getScriptureVolume(id: ScriptureVolumeId): ScriptureVolume {
  return SCRIPTURE_VOLUMES[id];
}
