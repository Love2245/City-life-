<script lang="ts">
  import { checkpointFingerprint, gameState } from "../../src/stores/gameStore.svelte";

  let fingerprint = $state("");

  $effect(() => {
    fingerprint = checkpointFingerprint(gameState);
  });

  export function readFingerprint(): string {
    return fingerprint;
  }
</script>

<span hidden>{fingerprint}</span>
