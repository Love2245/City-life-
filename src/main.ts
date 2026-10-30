import { mount } from "svelte";
import "./styles/app.css";
// v1.21-beta：皮肤覆盖必须晚于 app.css 载入，保证同特异度下后者生效
import "./styles/themes.css";
import "./styles/uiPolish.css";
// 手游 PE 横屏适配章节：必须最后载入——它以安全区/流体令牌整体重排三栏，
// 旧版散落在 app.css 中的 7 层手游补丁已移除，统一由本文件维护。
import "./styles/mobile.css";
import App from "./App.svelte";
import { initSkin, initZoom } from "./stores/uiStore.svelte";
import { requestPersistentStorage } from "./lib/save";
import {installFinancialRiskStorage} from './lib/financialRiskStorage';
import {gameState} from './stores/gameStore.svelte';
installFinancialRiskStorage(state=>state===gameState);

// 在挂载前落地皮肤与显示模式，避免主菜单先闪一帧默认配色 / 端游布局（FOUC）。
// v1.44：initZoom 原先只在 GameView.onMount 里调用，导致主菜单、设置、存档等
// 进入游戏前的页面拿不到 data-game-mode，手机上全部按端游布局渲染。
initSkin();
initZoom();
// v1.44.3：安卓 APK / 网页版没有 fs 存档镜像，唯一落点就是 localStorage。
// 尽早申请持久化豁免，降低「清数据 / 存储回收 = 进度全丢」的概率。
requestPersistentStorage();

const app = mount(App, {
  target: document.getElementById("app")!,
});

// The boot hint must go as soon as the real UI is mounted. A MutationObserver guess in
// index.html proved unreliable (the hint survived mount and shaded the whole page).
document.getElementById("boot-hint")?.remove();

export default app;
