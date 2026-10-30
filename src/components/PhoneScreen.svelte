<script lang="ts">
  import PhoneScreenWorkspace from "./PhoneScreenWorkspace.svelte";

  /**
   * 手机入口壳。
   *
   * PhoneView 与 QuestSidebar 只依赖这个稳定入口；具体 App 工作区已经移到
   * PhoneScreenWorkspace，后续可以继续按 App 拆分而不再扩大调用方耦合面。
   */
  let { onClose = () => {}, variant = "full", initialApp = "home" }: { onClose?: () => void; initialApp?: "home" | "todo" | "jobs"; variant?: "full" | "panel" } = $props();
</script>

<PhoneScreenWorkspace {onClose} {variant} {initialApp} />
