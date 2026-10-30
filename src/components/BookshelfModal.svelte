<script lang="ts">
  import { fade } from "svelte/transition";
  import { gameState } from "../stores/gameStore.svelte";
  import { uiState, showToast, closeModal, pushModal } from "../stores/uiStore.svelte";
  import { getAction, performAction } from "../game/core/actions";
  import { returnLibraryBook } from "../game/core/library";
  import { BOOKS } from "../game/data/books";
  import { rollEvent } from "../game/core/events";
  import { READABLE_DOCUMENTS, type ReadableDocument } from "../game/data/readableDocuments";

  let { underlay = false }: { underlay?: boolean } = $props();

  const owned = $derived(
    READABLE_DOCUMENTS.filter((document) => (gameState.inventory[document.id] ?? 0) > 0),
  );

  function close(): void {
    closeModal();
  }

  function read(document: ReadableDocument): void {
    const libraryBook = BOOKS.find((book) => book.id === document.id);
    if (libraryBook) {
      const action = getAction(libraryBook.id);
      if (!action || action.handler !== "read_book") {
        showToast("这本馆藏暂时无法阅读，请稍后再试。");
        return;
      }
      const result = performAction(gameState, action.id);
      if (!result.ok) {
        showToast(`🚫 ${result.reason ?? "现在无法阅读这本书"}`);
        return;
      }
      const event = rollEvent(gameState, action.eventChance);
      if (event) uiState.pendingEvent = event;
      uiState.pendingBookResult = result.result
        ? { payload: result.result, action: { id: action.id, name: action.name, icon: action.icon } }
        : null;
    } else {
      uiState.pendingBookResult = null;
    }
    uiState.readerId = document.id;
    pushModal("reader");
  }

  function returnBook(document: ReadableDocument): void {
    const result = returnLibraryBook(gameState, document.id);
    if (!result.ok) {
      showToast(`🚫 ${result.reason}`);
      return;
    }
    showToast(`已归还《${result.book.name}》，现在可以借阅其他书籍。`);
  }

  function isLibraryBook(document: ReadableDocument): boolean {
    return BOOKS.some((book) => book.id === document.id);
  }

  function kindLabel(document: ReadableDocument): string {
    if (document.kind === "book") return "书籍";
    if (document.kind === "certificate") return "奖状";
    if (document.kind === "art") return "画像";
    return "单页文书";
  }
</script>

<div class="shelf-overlay hud-scope" class:underlay role="presentation" onclick={close} transition:fade={{ duration: 150 }}>
  <section class="shelf-modal" role="dialog" aria-modal="true" aria-label="我的书架" onclick={(event) => event.stopPropagation()}>
    <header class="shelf-header">
      <div>
        <h2>📚 我的书架</h2>
        <p>在这里阅读已经收集的书籍与纪念文书。</p>
      </div>
      <button class="close" aria-label="关闭书架" onclick={close}>✕</button>
    </header>

    {#if owned.length > 0}
      <div class="shelf-list">
        {#each owned as document (document.id)}
          <div class="shelf-item">
            <button class="shelf-read" onclick={() => read(document)}>
              <span class="book-mark" aria-hidden="true">{document.kind === "book" ? "📖" : document.kind === "certificate" ? "🏅" : "🖼️"}</span>
              <span class="item-copy">
                <strong>{document.title}</strong>
                <small>{document.subtitle ?? kindLabel(document)} · {isLibraryBook(document) ? "图书馆借阅" : kindLabel(document)} · {document.pages.length ? `${document.pages.length} 页` : "正文打开时载入"}</small>
              </span>
              <span class="item-open">阅读 →</span>
            </button>
            {#if isLibraryBook(document)}
              <button class="return-book" aria-label={`归还《${document.title}》`} onclick={() => returnBook(document)}>归还</button>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="shelf-empty">
        <span>📭</span>
        <strong>书架还是空的</strong>
        <p>收集到书籍、经文或纪念文书后，它们会显示在这里。</p>
      </div>
    {/if}

    <footer><span>共收藏 {owned.length} 件</span><button onclick={close}>返回</button></footer>
  </section>
</div>

<style>
  .shelf-overlay { position: fixed; inset: 0; z-index: 180; display: grid; place-items: center; padding: 18px; background: #080b15de; }
  .shelf-overlay.underlay { visibility: hidden; pointer-events: none; }
  .shelf-modal { width: min(760px, 96vw); max-height: min(86dvh, 820px); display: flex; flex-direction: column; gap: 16px; padding: 22px; color: var(--text, #eef1ff); background: var(--bg-card, #222842); border: 1px solid var(--border, #454d6d); border-radius: 18px; box-shadow: 0 22px 70px #0009; }
  .shelf-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  h2 { margin: 0; font-size: 22px; }
  .shelf-header p { margin: 6px 0 0; color: var(--text-dim, #aab1cf); font-size: 13px; }
  button { color: inherit; cursor: pointer; }
  .close { flex: none; width: 34px; height: 34px; border: 0; border-radius: 9px; background: #ffffff18; }
  .shelf-list { min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 10px; padding-right: 3px; }
  .shelf-item { min-width: 0; display: flex; align-items: center; gap: 8px; padding: 10px 12px; color: inherit; background: #ffffff0b; border: 1px solid #ffffff1c; border-radius: 12px; transition: background .16s, border-color .16s, transform .16s; }
  .shelf-item:hover { background: #ffffff14; border-color: var(--accent, #ffd166); transform: translateY(-1px); }
  .shelf-read { min-width: 0; flex: 1; display: flex; align-items: center; gap: 12px; padding: 3px 0; text-align: left; color: inherit; background: transparent; border: 0; }
  .book-mark { flex: none; display: grid; place-items: center; width: 42px; height: 50px; border-radius: 5px 9px 9px 5px; color: #342718; background: linear-gradient(140deg, #ebd4a1, #bd9d63); box-shadow: inset 4px 0 #735b37, 2px 3px 6px #0005; font-size: 21px; }
  .item-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 5px; }
  .item-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .item-copy small { overflow: hidden; color: var(--text-dim, #aab1cf); text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .item-open { flex: none; color: var(--accent, #ffd166); font-size: 12px; }
  .return-book { flex: none; padding: 7px 10px; border: 1px solid #ffffff28; border-radius: 8px; color: #e8d3a2; background: #ffffff0d; font-size: 12px; }
  .return-book:hover { color: #fff0c6; border-color: #d5bb7b; background: #d5bb7b18; }
  .shelf-empty { min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; }
  .shelf-empty span { font-size: 42px; }
  .shelf-empty p { max-width: 330px; margin: 0; color: var(--text-dim, #aab1cf); font-size: 13px; line-height: 1.6; }
  footer { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; color: var(--text-dim, #aab1cf); border-top: 1px solid #ffffff20; font-size: 12px; }
  footer button { padding: 8px 16px; border: 0; border-radius: 8px; color: #1b1c21; background: var(--accent, #ffd166); font-weight: 700; }
  @media (max-width: 520px) { .shelf-modal { padding: 16px; } .shelf-item { padding: 10px; } .item-open { display: none; } .return-book { padding: 7px 8px; } }
</style>
