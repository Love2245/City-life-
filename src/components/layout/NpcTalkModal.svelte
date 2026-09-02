<script lang="ts">
  import { fade } from "svelte/transition";
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, closeNpcTalk, showToast } from "../../stores/uiStore.svelte";
  import { npcTalkTier, chooseNpcTalkOption } from "../../game/core/npcTalk";
  import { getNpcDef } from "../../game/core/npcs";
  const npcId = $derived(uiState.npcTalk?.npcId ?? "");
  const def = $derived(npcId ? getNpcDef(npcId) : undefined);
  const view = $derived(npcId ? npcTalkTier(gameState, npcId) : null);

  let phase = $state<"talk" | "result">("talk");
  let resultText = $state("");

  function pick(i: number): void {
    const r = chooseNpcTalkOption(gameState, npcId, i);
    if (!r.ok) {
      showToast(`🚫 ${r.reason ?? "没法继续聊"}`);
      return;
    }
    resultText = r.text;
    phase = "result";
  }

  function close(): void {
    closeNpcTalk();
    phase = "talk";
    resultText = "";
  }
</script>

{#if uiState.npcTalk}
  <div class="npc-overlay" onclick={close} role="presentation" transition:fade={{ duration: 200 }}>
    <div
      class="npc-card"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="与 NPC 对话"
    >
      {#if def && view}
        <div class="npc-head">
          <span class="gi-emoji" style="font-size:44px;line-height:1">{view.icon}</span>
          <div class="npc-meta">
            <div class="npc-name">{view.name}<span class="npc-nick">（{view.nick}）</span></div>
            <div class="npc-badge">{view.stateLabel} · 好感 {view.affinity}</div>
          </div>
        </div>

        {#if phase === "talk"}
          <div class="npc-bubble">{view.text}</div>
          <div class="npc-opts">
            {#each view.options as opt, i (i)}
              <button class="npc-opt" onclick={() => pick(i)}>{opt.label}</button>
            {/each}
          </div>
        {:else}
          <div class="npc-bubble result">{resultText}</div>
          <div class="npc-opts">
            <button class="npc-opt primary" onclick={close}>继续</button>
          </div>
        {/if}
      {:else}
        <div class="npc-bubble">你们还不认识，先去搭个话吧。</div>
        <div class="npc-opts">
          <button class="npc-opt primary" onclick={close}>好的</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .npc-overlay {
    position: fixed;
    inset: 0;
    background: rgba(6, 9, 20, 0.62);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    padding: 18px;
  }
  .npc-card {
    width: min(440px, 94vw);
    max-height: 86vh;
    overflow-y: auto;
    background: linear-gradient(160deg, #1b2138, #141828);
    border: 1px solid rgba(255, 209, 102, 0.3);
    border-radius: 18px;
    padding: 18px 18px 20px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
    color: #eef1ff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
  .npc-head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .npc-icon {
    font-size: 40px;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
  }
  .npc-name {
    font-size: 17px;
    font-weight: 800;
  }
  .npc-nick {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.6);
  }
  .npc-badge {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 700;
    color: #ffd166;
  }
  .npc-bubble {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 13.5px;
    line-height: 1.6;
    margin-bottom: 14px;
    white-space: pre-wrap;
  }
  .npc-bubble.result {
    color: #a8e6b0;
    border-color: rgba(123, 216, 143, 0.35);
  }
  .npc-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .npc-opt {
    font: inherit;
    font-size: 14px;
    text-align: left;
    padding: 11px 14px;
    border-radius: 12px;
    background: rgba(255, 209, 102, 0.1);
    border: 1px solid rgba(255, 209, 102, 0.3);
    color: #ffe6a8;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.12s ease;
  }
  .npc-opt:hover {
    background: rgba(255, 209, 102, 0.2);
    transform: translateY(-1px);
  }
  .npc-opt.primary {
    background: rgba(108, 198, 255, 0.18);
    border-color: rgba(108, 198, 255, 0.45);
    color: #cfeaff;
    text-align: center;
    font-weight: 700;
  }
</style>
