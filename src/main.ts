import { mount } from "svelte";
import "./styles/app.css";
// v1.21-beta：皮肤覆盖必须晚于 app.css 载入，保证同特异度下后者生效
import "./styles/themes.css";
import App from "./App.svelte";
import { initSkin } from "./stores/uiStore.svelte";

// 在挂载前落地皮肤，避免主菜单先闪一帧默认配色（FOUC）
initSkin();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
