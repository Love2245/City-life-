<script lang="ts">
  import { uiState } from "../../stores/uiStore.svelte";
  import { transitionThemeImages } from "../../game/data/transitionThemes";
  import { fade } from "svelte/transition";
  // v1.3b3-fix6：把 base64 图片转成 url() 一次性解析（每张图只解析一次）
  const BG_URL: Record<"city" | "industry" | "rural" | "suburb", string> = {
    city: `url("${transitionThemeImages.city}")`,
    industry: `url("${transitionThemeImages.industry}")`,
    rural: `url("${transitionThemeImages.rural}")`,
    suburb: `url("${transitionThemeImages.suburb}")`,
  };

  const ICONS: Record<string, string> = {
    walk: "🚶",
    bike: "🚲",
    ebike: "🛵",
    car: "🚗",
    metro: "🚇",
    bus: "🚌",
  };
  const LABELS: Record<string, string> = {
    walk: "步行前往",
    bike: "骑车前往",
    ebike: "电动车前往",
    car: "开车前往",
    metro: "地铁前往",
    bus: "乘巴士前往",
  };
  const t = $derived(uiState.transition);
  const kind = $derived(t?.kind ?? "bus");
  const icon = $derived(ICONS[kind] ?? "🚌");
  const verb = $derived(LABELS[kind] ?? "前往");
  /**
   * v1.3b3-fix3：动画时长直接内联到车辆元素 animation-duration，
   * 不再依赖 CSS 变量（--tr-dur 经 Svelte 作用域/单文件打包后失效，
   * 车辆 1.15s 冲出屏幕后画面静止 → 表现为「卡死不动」）。
   * 完整过场（跨一级地图）3s，简短过场（跨二级区域）1.2s。
   */
  const dur = $derived(`${Math.max(900, t?.durationMs ?? 1150) / 1000}s`);

  /**
   * v1.3b3-fix5：按目标区域 id 推导背景主题。
   * 二级地图过场带区域特色：工业区=工厂烟囱、市中心=高楼、
   * 农村=山野农田、郊区=树林田野；一级区域（市区/郊区）取默认对应主题。
   */
  function themeOf(regionId?: string): "city" | "industry" | "rural" | "suburb" {
    switch (regionId) {
      case "downtown_industrial":
      case "heavy_industry":
        return "industry";
      case "rural":
        return "rural";
      case "suburb":
      case "suburban_edge":
        return "suburb";
      case "downtown":
      case "downtown_center":
      case "downtown_mall":
      case "downtown_residential":
      case "downtown_station":
      default:
        return "city";
    }
  }
  const theme = $derived(themeOf(t?.regionId));
</script>

{#if t}
  <div class="tr-overlay" data-theme-bg={theme} in:fade={{ duration: 180 }} out:fade={{ duration: 260 }}>
    <!-- v1.3b3-fix6：AI 生成的主题背景图（每张 ~60-80KB JPEG，base64 内联）
         style 上直接绑定 background-image（避开 Svelte <style> 不能用 JS 变量） -->
    <div class="bg bg-city"    style={`background-image: ${BG_URL.city}`}    aria-hidden="true"></div>
    <div class="bg bg-industry" style={`background-image: ${BG_URL.industry}`} aria-hidden="true"></div>
    <div class="bg bg-rural"   style={`background-image: ${BG_URL.rural}`}   aria-hidden="true"></div>
    <div class="bg bg-suburb"  style={`background-image: ${BG_URL.suburb}`}  aria-hidden="true"></div>

    <!-- 天空光晕 / 云朵叠加在图片之上作气氛层（淡而不夺） -->
    <div class="tr-glow"></div>
    <div class="tr-clouds" aria-hidden="true">
      <i></i><i></i><i></i>
    </div>

    <!-- 地面层：马路 + 车道线 -->
    <div class="tr-road"></div>
    <div class="tr-lines" aria-hidden="true">
      <span></span><span></span><span></span><span></span>
    </div>
    <!-- 载具：时长内联，随 durationMs 放慢/加快 -->
    <div
      class="tr-veh"
      class:car={kind === "car"}
      class:metro={kind === "metro"}
      class:bus={kind === "bus"}
      style={`animation-duration: ${dur}`}
    >
      <span class="tr-veh-ic">{icon}</span>
    </div>
    <div class="tr-label">{verb} {t.label}…</div>
  </div>
{/if}

<style>
  .tr-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    pointer-events: none;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    /* v1.38 P1：隔离合成层 + 提示浏览器优化透明度合成，降低过场期间底层重绘拖累 */
    will-change: opacity;
    contain: layout paint;
  }

  /* v1.3b3-fix6：主题背景图（AI 生成，base64 内联）
     占满 overlay 顶部到马路（bottom: 24.5%）之间 */
  .bg {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 24.5%;
    top: 0;
    background-size: cover;
    background-position: center bottom;
    background-repeat: no-repeat;
    opacity: 0.95;
  }
  .bg { display: none; }
  .tr-overlay[data-theme-bg="city"] .bg-city { display: block; }
  .tr-overlay[data-theme-bg="industry"] .bg-industry { display: block; }
  .tr-overlay[data-theme-bg="rural"] .bg-rural { display: block; }
  .tr-overlay[data-theme-bg="suburb"] .bg-suburb { display: block; }

  /* 天空光晕（夕阳氛围，叠加在图片之上） */
  .tr-glow {
    position: absolute;
    top: 4%;
    right: 8%;
    width: 32vw;
    height: 32vw;
    max-width: 360px;
    max-height: 360px;
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--accent, #ffd166) 30%, transparent) 0%,
      color-mix(in srgb, var(--accent, #ffd166) 8%, transparent) 50%,
      transparent 75%
    );
    opacity: 0.75;
    pointer-events: none;
  }

  /* 飘云（叠加在图片之上作气氛） */
  .tr-clouds i {
    position: absolute;
    top: 18%;
    width: 180px;
    height: 26px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    filter: blur(8px);
    animation: tr-cloud 16s linear infinite;
    pointer-events: none;
  }
  .tr-clouds i:nth-child(2) { top: 30%; width: 240px; animation-duration: 22s; animation-delay: -6s; opacity: 0.6; }
  .tr-clouds i:nth-child(3) { top: 12%; width: 140px; animation-duration: 13s; animation-delay: -3s; opacity: 0.5; }
  @keyframes tr-cloud {
    from { left: -20%; }
    to { left: 110%; }
  }

  /* ---- 地面层（AI 图片底部已含马路效果，但保留独立的黑色马路强化前景） ---- */
  .tr-road {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 24%;
    background:
      repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.14) 0 22px, transparent 22px 56px),
      linear-gradient(180deg, #1c1f2e, #0a0c14);
    border-top: 3px solid rgba(255, 255, 255, 0.18);
  }
  .tr-lines span {
    position: absolute;
    bottom: 13%;
    width: 60px;
    height: 3px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.28);
    animation: tr-streak 0.7s linear infinite;
  }
  .tr-lines span:nth-child(1) { animation-delay: 0s; }
  .tr-lines span:nth-child(2) { animation-delay: 0.18s; bottom: 19%; }
  .tr-lines span:nth-child(3) { animation-delay: 0.36s; bottom: 8%; }
  .tr-lines span:nth-child(4) { animation-delay: 0.52s; bottom: 16%; }
  @keyframes tr-streak {
    from { left: 100%; opacity: 0; }
    20% { opacity: 1; }
    to { left: -80px; opacity: 0; }
  }

  /* ---- 载具 ---- */
  .tr-veh {
    position: absolute;
    bottom: 15%;
    left: -14%;
    font-size: 3.4rem;
    filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.55));
    animation-name: tr-drive;
    animation-duration: 1.15s;
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
    animation-iteration-count: 1;
    animation-fill-mode: forwards;
  }
  .tr-veh.car { font-size: 4rem; }
  .tr-veh.metro { font-size: 3.6rem; }
  .tr-veh.bus { font-size: 4.2rem; }
  @keyframes tr-drive {
    0% { left: -16%; transform: translateY(0) rotate(-1deg); }
    50% { transform: translateY(-8px) rotate(1deg); }
    100% { left: 112%; transform: translateY(0) rotate(-1deg); }
  }

  .tr-label {
    position: absolute;
    top: 14%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--text-main, #fff);
    background: rgba(0, 0, 0, 0.45);
    padding: 7px 18px;
    border-radius: 999px;
    white-space: nowrap;
    backdrop-filter: blur(5px);
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
  }
</style>