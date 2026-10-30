import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/game/core/state";
import { canPerform, getAction } from "../src/game/core/actions";
import { borrowLibraryBook, borrowedLibraryBook, returnLibraryBook } from "../src/game/core/library";

describe("图书馆单本借阅", () => {
  it("同一时间只借出一本，归还后才能借下一本", () => {
    const state = createInitialState(11);
    const first = borrowLibraryBook(state, "book_sports");
    expect(first.ok).toBe(true);
    expect(borrowedLibraryBook(state)?.id).toBe("book_sports");

    const second = borrowLibraryBook(state, "book_health");
    expect(second.ok).toBe(false);
    expect(state.inventory.book_health ?? 0).toBe(0);

    expect(returnLibraryBook(state, "book_sports").ok).toBe(true);
    expect(borrowLibraryBook(state, "book_health").ok).toBe(true);
    expect(borrowedLibraryBook(state)?.id).toBe("book_health");
  });

  it("已借阅的书可在家阅读属性书，未借书或在其他地点不允许", () => {
    const state = createInitialState(12);
    const action = getAction("book_sports")!;
    state.locationId = "home";

    expect(canPerform(state, action).ok).toBe(false);
    expect(borrowLibraryBook(state, "book_sports").ok).toBe(true);
    expect(canPerform(state, action).ok).toBe(true);

    state.locationId = "park";
    expect(canPerform(state, action).ok).toBe(false);
  });
});
