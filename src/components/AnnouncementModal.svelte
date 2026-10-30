<script lang="ts">
  import { onMount } from "svelte";
  import { CHANGELOG, VERSION } from "../version";

  let { onClose }: { onClose: () => void } = $props();
  let dialog: HTMLDialogElement;
  const entry = CHANGELOG.find((item) => item.version === VERSION) ?? CHANGELOG[0];
  const updateTitle = (entry?.title ?? "城市生活更新").replace(/^[\d.]+[：:]\s*/, "");
  const discussionUrl = "https://www.taptap.cn/moment/851226362868927504?group_id=1346576";

  // Native dialogs use viewport pixels. Escape the app's zoom/transition wrapper
  // so older WebViews do not scale their fixed bounds a second time.
  function viewportDialog(node: HTMLDialogElement) {
    document.body.appendChild(node);
    return { destroy() {
      if (node.open && typeof node.close === "function") node.close();
      node.remove();
    } };
  }

  onMount(() => {
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  });

  function handleCancel(event: Event): void {
    event.preventDefault();
    onClose();
  }

</script>

<dialog id="version-announcement-dialog" class="announcement-dialog" bind:this={dialog} use:viewportDialog aria-labelledby="announcement-title" aria-describedby="announcement-intro" oncancel={handleCancel}>
  <div class="announcement-shell">
    <header class="announcement-head">
      <div>
        <p class="announcement-eyebrow">URBAN LIFE · 版本公告</p>
        <h2 id="announcement-title">v{entry?.version ?? VERSION} · {updateTitle}</h2>
      </div>
      <button class="announcement-close" type="button" aria-label="关闭公告" onclick={onClose}>×</button>
    </header>

    <!-- Keyboard focus enables native Arrow/PageUp/PageDown scrolling inside the dialog. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="announcement-scroll" role="region" aria-label="版本公告内容" tabindex="0">
      <p class="announcement-intro" id="announcement-intro">欢迎回来。这是当前版本的主要更新内容；遇到问题或想交流攻略，可以在公告底部前往讨论区留言。</p>
      <div class="announcement-release"><span>当前版本</span><strong>v{entry?.version ?? VERSION}</strong><span class="release-date">{entry?.date ?? ""}</span></div>
      <ul class="announcement-notes">
        {#each entry?.notes ?? [] as note, index (`${entry?.version ?? VERSION}-${index}`)}
          <li><span class="note-index">{String(index + 1).padStart(2, "0")}</span><span>{note}</span></li>
        {/each}
      </ul>
    </div>

    <footer class="announcement-foot">
      <div class="announcement-contact">
        <span class="contact-label">官方交流群</span>
        <strong>QQ群 1125965732</strong>
      </div>
      <a class="discussion-link" href={discussionUrl} target="_blank" rel="noopener noreferrer">
        <span><small>攻略与讨论</small><strong>遇到困难？来这里留言</strong></span>
        <span class="discussion-arrow" aria-hidden="true">↗</span>
      </a>
      <button class="announcement-confirm" type="button" onclick={onClose}>开始体验</button>
    </footer>
  </div>
</dialog>

<style>
  .announcement-dialog {
    position: fixed;
    inset: calc(var(--sai-top, 0px) + 12px) calc(var(--sai-right, 0px) + 12px) calc(var(--sai-bottom, 0px) + 12px) calc(var(--sai-left, 0px) + 12px);
    margin: auto;
    zoom: 1;
    width: min(820px, calc(100vw - var(--sai-left, 0px) - var(--sai-right, 0px) - 24px));
    max-width: calc(100vw - var(--sai-left, 0px) - var(--sai-right, 0px) - 24px);
    /* Keep vh first for WebViews that do not implement dynamic viewport units. */
    height: min(820px, calc(100vh - var(--sai-top, 0px) - var(--sai-bottom, 0px) - 24px));
    height: min(820px, calc(100dvh - var(--sai-top, 0px) - var(--sai-bottom, 0px) - 24px));
    max-height: calc(100vh - var(--sai-top, 0px) - var(--sai-bottom, 0px) - 24px);
    max-height: calc(100dvh - var(--sai-top, 0px) - var(--sai-bottom, 0px) - 24px);
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--accent) 44%, #ffffff26);
    border-radius: 22px;
    overflow: hidden;
    color: var(--text-main, #eef1ff);
    background: linear-gradient(145deg, color-mix(in srgb, var(--bg-card, #222842) 94%, var(--accent-2, #6cc6ff) 6%), var(--bg-deep, #10131f));
    box-shadow: 0 32px 90px #0009, inset 0 1px #ffffff0d;
  }
  .announcement-dialog::backdrop { background: #050914bd; backdrop-filter: blur(8px); }
  .announcement-shell { display:flex; flex-direction:column; height:100%; min-height:0; }
  .announcement-head { flex:0 0 auto; display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:22px 26px 18px; border-bottom:1px solid color-mix(in srgb,var(--border,#333b63) 72%,transparent); background:linear-gradient(100deg,color-mix(in srgb,var(--accent) 9%,transparent),transparent 78%); }
  .announcement-head > div { flex:1; min-width:0; }
  .announcement-eyebrow { margin:0 0 9px; color:var(--accent,#ffd166); font-size:12px; font-weight:750; letter-spacing:.14em; }
  .announcement-head h2 { margin:0; max-width:650px; font-size:clamp(21px,2.8vw,27px); line-height:1.35; font-weight:800; text-wrap:balance; overflow-wrap:anywhere; }
  .announcement-dialog .announcement-close { flex:none; width:44px; min-width:44px; height:44px; min-height:44px; padding:0; border:1px solid var(--border,#333b63); border-radius:12px; color:var(--text-dim,#a8b2d6); background:#ffffff08; font-size:24px; cursor:pointer; touch-action:manipulation; }
  .announcement-close:hover { color:var(--text-main,#eef1ff); background:#ffffff12; }
  .announcement-scroll { flex:1 1 0; min-height:0; overflow-x:hidden; overflow-y:auto; padding:20px 26px 14px; overscroll-behavior:contain; touch-action:pan-y; -webkit-overflow-scrolling:touch; }
  .announcement-intro { margin:0 0 16px; color:var(--text-dim,#a8b2d6); font-size:16px; line-height:1.7; }
  .announcement-release { display:flex; align-items:center; gap:10px; margin:0 0 12px; color:var(--text-dim,#a8b2d6); font-size:13px; }
  .announcement-release strong { color:var(--accent,#ffd166); font-size:15px; font-weight:800; }
  .release-date { margin-left:auto; font-variant-numeric:tabular-nums; }
  .announcement-notes { display:grid; gap:8px; list-style:none; margin:0; padding:0; }
  .announcement-notes li { display:grid; grid-template-columns:34px minmax(0,1fr); align-items:start; gap:10px; padding:11px 13px; border:1px solid color-mix(in srgb,var(--border,#333b63) 75%,transparent); border-radius:12px; background:linear-gradient(120deg,#ffffff07,#ffffff02); color:var(--text-main,#eef1ff); font-size:15px; line-height:1.65; }
  .note-index { padding-top:1px; color:var(--accent,#ffd166); font-size:12px; font-weight:800; font-variant-numeric:tabular-nums; }
  .announcement-foot { flex:0 0 auto; display:grid; grid-template-columns:minmax(150px,.72fr) minmax(210px,1.2fr) auto; align-items:center; gap:12px; padding:16px 26px 20px; border-top:1px solid color-mix(in srgb,var(--border,#333b63) 72%,transparent); background:#080d1a36; }
  .announcement-contact { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .contact-label,.discussion-link small { color:var(--text-dim,#a8b2d6); font-size:11px; letter-spacing:.05em; }
  .announcement-contact strong { color:var(--text-main,#eef1ff); font-size:14px; font-weight:800; white-space:nowrap; }
  .discussion-link { min-width:0; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border:1px solid color-mix(in srgb,var(--accent-2,#6cc6ff) 34%,var(--border,#333b63)); border-radius:12px; color:var(--text-main,#eef1ff); text-decoration:none; background:color-mix(in srgb,var(--accent-2,#6cc6ff) 8%,transparent); transition:background .16s ease,border-color .16s ease; }
  .discussion-link:hover { border-color:var(--accent-2,#6cc6ff); background:color-mix(in srgb,var(--accent-2,#6cc6ff) 16%,transparent); }
  .discussion-link > span:first-child { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .discussion-link strong { overflow:hidden; color:var(--text-main,#eef1ff); font-size:13px; font-weight:750; text-overflow:ellipsis; white-space:nowrap; }
  .discussion-arrow { color:var(--accent-2,#6cc6ff); font-size:18px; }
  .announcement-dialog .announcement-confirm { min-height:44px; padding:0 17px; border:0; border-radius:12px; color:var(--accent-ink,#1a1a2e); background:var(--accent,#ffd166); font-size:14px; font-weight:800; white-space:nowrap; cursor:pointer; touch-action:manipulation; }
  .announcement-confirm:hover { filter:brightness(1.06); }
  :is(.announcement-close,.announcement-confirm,.discussion-link):focus-visible { outline:2px solid var(--accent-2,#6cc6ff); outline-offset:3px; }
  @media (max-width:600px) {
    .announcement-dialog { border-radius:18px; }
    .announcement-head { padding:17px 17px 14px; gap:10px; }
    .announcement-eyebrow { font-size:11px; }
    .announcement-head h2 { font-size:19px; }
    .announcement-scroll { padding:15px 16px 12px; }
    .announcement-intro { font-size:14px; }
    .announcement-notes { gap:7px; }
    .announcement-notes li { grid-template-columns:29px minmax(0,1fr); gap:8px; padding:10px; font-size:13px; }
    .announcement-foot { grid-template-columns:minmax(0,1fr) auto; gap:9px; padding:12px 16px 16px; }
    .announcement-contact { grid-column:1 / -1; flex-direction:row; align-items:center; justify-content:space-between; }
    .announcement-contact strong { font-size:13px; }
    .discussion-link { min-height:44px; }
    .announcement-dialog .announcement-confirm { padding-inline:13px; }
  }
  @media (max-height:500px) and (min-width:601px) {
    .announcement-head { padding:10px 16px; gap:12px; }
    .announcement-eyebrow { margin-bottom:4px; font-size:10px; }
    .announcement-head h2 { font-size:18px; }
    .announcement-scroll { padding:12px 16px; }
    .announcement-intro { font-size:13px; margin-bottom:10px; }
    .announcement-notes li { font-size:13px; padding:9px 11px; }
    .announcement-foot { padding:10px 16px; gap:10px; }
    .discussion-link { padding:7px 10px; }
  }
  @media (prefers-reduced-motion: reduce) { .discussion-link { transition:none; } }
</style>
