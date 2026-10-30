<script lang="ts">
  import { desktopWindowState, setDesktopWindowMode, type DesktopWindowMode } from '../lib/desktopWindow.svelte';
  import { showToast } from '../stores/uiStore.svelte';
  async function change(mode: DesktopWindowMode) { try { await setDesktopWindowMode(mode); } catch { showToast('窗口切换失败，请重试'); } }
</script>
{#if desktopWindowState.available}
  <label class="window-setting"><span>显示模式</span><select aria-label="显示模式" value={desktopWindowState.mode} disabled={desktopWindowState.busy} onchange={event => change(event.currentTarget.value as DesktopWindowMode)}><option value="windowed">窗口化</option><option value="borderless">全屏（无边框）</option></select></label>
  <p>F11 / Alt+Enter 切换全屏</p>
{/if}
<style>
  .window-setting{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;font:inherit}
  select{font:inherit;color:inherit;border:1px solid var(--hud-border,#6668);background:var(--hud-surface-solid,#20283a);border-radius:8px;min-height:36px;padding:6px 12px;cursor:pointer}
  p{font-size:12px;opacity:.74;margin:0}
</style>
