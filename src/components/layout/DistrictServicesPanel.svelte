<script lang="ts">
  import {overlayPortal} from '../../lib/overlayPortal';
  import { gameState, markSessionDirty } from "../../stores/gameStore.svelte";
  import { todayDistrictFortune, clinicWeekOf } from "../../game/core/districtServices";
  import { getDistrictExhibition } from "../../game/data/districtExhibitions";
  import { gameDay } from "../../game/core/calendar";
  import "../../styles/districtUi.css";
  let exhibitIndex = $state(0);
  const exhibition = $derived(getDistrictExhibition(gameState.locationId, gameState.time.month, gameDay(gameState.time)));
  const fortune = $derived(todayDistrictFortune(gameState));
  const cups = $derived(gameState.districtServices?.alcoholCups ?? 0);
  const warning = $derived(gameState.districtServices?.alcoholWarning);
  let previousExhibitionKey = "";
  $effect(() => {
    const key = `${gameState.locationId}:${exhibition?.id ?? ""}`;
    if (key !== previousExhibitionKey) { previousExhibitionKey = key; exhibitIndex = 0; }
  });
  function dismissWarning() { if (gameState.districtServices) { delete gameState.districtServices.alcoholWarning; markSessionDirty(); } }
  function portal(node: HTMLElement) { const handle=overlayPortal(node); queueMicrotask(() => node.querySelector("button")?.focus()); return handle; }
</script>

{#if gameState.locationId === "moon_mountain"}
  <section class="district-services" aria-label="东月道观服务">
    <div class="notice-heading"><strong>📜 道观告示</strong><small>善堂 6:00—18:00</small></div>
    <p>山道全天开放，请量力而行。善堂提供热粥与义诊。</p>
    <div class="quotas"><span>{gameState.districtServices?.clinicWeek === clinicWeekOf(gameState) ? "本周已参加义诊" : "本周义诊可预约"}</span><span>{gameState.flags.moon_porridge_day === gameDay(gameState.time) ? "今天已经领过粥" : "今日有粥"}</span></div>
    {#if fortune}
      <details class="fortune"><summary>今日签 · {fortune.name}<span>查看签文</span></summary><h4>{fortune.name}</h4><p class="verse">{fortune.text}</p><div class="interpretation"><strong>解读</strong><p>{fortune.interpretation}</p></div></details>
    {/if}
  </section>
{/if}

{#if exhibition}
  {@const item = exhibition.exhibits[exhibitIndex % exhibition.exhibits.length]}
  <section class="district-services exhibition" class:art-gallery={gameState.locationId === "dev_art_gallery"} aria-label="展览阅读">
    <small>免费展览 · 8:00—18:00</small><h3>{exhibition.currentTheme?.name ?? exhibition.title}</h3>
    {#if exhibition.rotation}<p class="rotation">本周 {exhibition.rotation.label} 展 · 每 7 个游戏日轮换 · {exhibition.rotation.daysUntilChange} 天后换展</p>{/if}
    <p>{exhibition.currentTheme?.desc ?? exhibition.intro}</p>
    <article class="exhibit-card"><div class="exhibit-image">{#if item.image}<img src={item.image} alt={item.title} loading="lazy" decoding="async" />{:else if item.svg}{@html item.svg}{/if}</div><div><small>展品 {exhibitIndex + 1}/{exhibition.exhibits.length}</small><h4>{#if item.rank}<span class="exhibit-rank">{String(item.rank).padStart(2, "0")}</span>{/if}{item.title}</h4><p>{item.caption}</p></div></article>
    <nav aria-label="展品翻页"><button onclick={() => exhibitIndex = (exhibitIndex - 1 + exhibition.exhibits.length) % exhibition.exhibits.length}>← 上一件</button><button onclick={() => exhibitIndex = (exhibitIndex + 1) % exhibition.exhibits.length}>下一件 →</button></nav>
    <p>可自由浏览馆内导览，或跟随讲解员参观。</p>
  </section>
{/if}

{#if cups > 0 && ["boyue_nightclub", "boyue_lounge_bar"].includes(gameState.locationId)}
  <section class="district-services drink-status" aria-label="饮酒状态"><strong>🍸 已喝 {cups} 杯</strong><span class:danger={cups >= 5}>{cups >= 5 ? "已经快站不稳了，别再喝了。" : "慢慢喝，记得休息。"}</span></section>
{/if}

{#if warning}
  <div class="warning-overlay hud-scope" use:portal><div role="alertdialog" aria-modal="true" aria-label="饮酒提醒" tabindex="-1" class="warning-card"><h3>{warning === 6 ? "在住处醒来" : "饮酒提醒"}</h3><p>{warning === 3 ? "脸上有些发热，酒意渐渐上来了。先喝点水，歇一会儿吧。" : warning === 5 ? "眼前有些晃，连站稳都费劲。酒保劝你别再喝了。" : "醒来时已经躺在住处。酒保安排人送你回来，床头还放着一杯水。"}</p><button onclick={dismissWarning}>知道了</button></div></div>
{/if}

<style>
  .district-services{padding:20px;border:1px solid #c8b78055;border-radius:12px;margin:14px 0;max-width:100%;box-sizing:border-box}h3,h4{margin:0 0 8px}p{line-height:1.75;font-size:14px;margin:8px 0}.quotas{display:flex;flex-wrap:wrap;gap:12px;font-size:13px}.fortune{max-width:600px;border-radius:10px;padding:20px;margin-top:16px}.fortune h4{font-size:26px;text-align:center}.verse{white-space:pre-line;text-align:center;font-size:19px;line-height:2}.interpretation{border-top:1px solid #a08b6655;padding-top:12px}small{color:#99b6ad}.exhibit-card{display:grid;grid-template-columns:minmax(180px,40%) 1fr;gap:18px;align-items:center;margin:16px 0}.exhibit-image :global(svg),.exhibit-image :global(img){width:100%;height:auto;display:block;border-radius:10px}.exhibit-image :global(img){aspect-ratio:760 / 504;object-fit:contain;background:#e7e2d8}.exhibit-rank{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:24px;margin-right:8px;border:1px solid #d7b87999;border-radius:6px;color:#f1ce82;font-size:12px;vertical-align:middle}.exhibition nav{display:flex;gap:12px;justify-content:center}button{min-height:44px;border:1px solid #c8b78077;padding:10px 20px;border-radius:7px;cursor:pointer;font:inherit}.danger{font-weight:700}.warning-overlay{position:fixed;inset:0;z-index:1400;display:grid;place-items:center;padding:16px;background:#071014c9}.warning-card{width:min(420px,100%);box-sizing:border-box;border:1px solid #d3b073;border-radius:16px;padding:24px;box-shadow:0 24px 70px #0008}.warning-card button{width:100%;font-weight:bold}@media(max-width:560px){.district-services{padding:16px}.exhibit-card{grid-template-columns:1fr}.exhibit-image{max-width:320px;margin:auto;width:100%}}@media(max-height:480px){.warning-card{padding:16px;max-height:90vh;overflow:auto}}
  .exhibition.art-gallery .exhibit-card{grid-template-columns:minmax(300px,54%) 1fr;align-items:start;gap:22px;margin:20px 0}
  .exhibition.art-gallery .exhibit-image{padding:10px;border:1px solid #d2b87977;border-radius:14px;background:linear-gradient(145deg,#f3e8d055,#13202a);box-shadow:0 16px 38px #0004}
  .exhibition.art-gallery .exhibit-image :global(img){aspect-ratio:4 / 3;object-fit:contain;border:1px solid #fff5;border-radius:8px;background:#18222a}
  .rotation{color:#e4c47a;font-size:13px}
  .exhibition.art-gallery .exhibit-card h4{font-size:22px;line-height:1.45}
  .exhibition.art-gallery .exhibit-card p{font-size:15px;line-height:1.85}
  .exhibition.art-gallery .exhibit-rank{min-width:34px;height:27px;font-size:13px}
  .exhibition.art-gallery nav button{border-color:#d2b87999;background:linear-gradient(120deg,#e4c47a1c,#fff1);color:inherit;font-weight:700}
  .exhibition.art-gallery nav button:hover{background:#d2b8792e;border-color:#e8cd8a}
  @media(max-width:700px){.exhibition.art-gallery .exhibit-card{grid-template-columns:1fr}.exhibition.art-gallery .exhibit-image{width:min(100%,620px);margin-inline:auto}.exhibition.art-gallery .exhibit-card h4{font-size:20px}}
</style>
