import type { GameState } from "../types";
import { BOOKS, type BookDef } from "../data/books";
import { addItem, itemCount, removeItem } from "./items";

export type LibraryLoanResult =
  | { ok: true; book: BookDef }
  | { ok: false; reason: string };

export function isLibraryLocation(id: string): boolean {
  return ['library','campus_teacher_library','campus_engineering_library'].includes(id);
}

/** 图书馆每位居民最多保留一本外借馆藏。 */
export function borrowedLibraryBook(state: GameState): BookDef | undefined {
  return BOOKS.find((book) => itemCount(state, book.id) > 0);
}

export function borrowLibraryBook(state: GameState, bookId: string): LibraryLoanResult {
  const book = BOOKS.find((entry) => entry.id === bookId);
  if (!book) return { ok: false, reason: "这不是可借阅的图书馆馆藏" };
  const current = borrowedLibraryBook(state);
  if (current) return { ok: false, reason: `请先归还《${current.name}》，再借其他书。` };
  addItem(state, book.id, 1);
  return { ok: true, book };
}

export function returnLibraryBook(state: GameState, bookId: string): LibraryLoanResult {
  const book = BOOKS.find((entry) => entry.id === bookId);
  if (!book) return { ok: false, reason: "这不是图书馆借阅书籍" };
  if (!removeItem(state, book.id, 1)) return { ok: false, reason: "这本书不在你的书架上" };
  state.flags["npc_remaster_librarian_returned_book"] = true;
  return { ok: true, book };
}
