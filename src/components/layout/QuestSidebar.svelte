<script lang="ts">
  import { gameState } from '../../stores/gameStore.svelte';
  import { uiState } from '../../stores/uiStore.svelte';
  import { formatTime } from '../../game/core/time';
  import { unreadSmsCount } from '../../game/core/phone';
  import HomePhonePocket from './HomePhonePocket.svelte';
</script>
<aside class="phone-edge hud-scope" aria-label="随身手机">
  <HomePhonePocket time={formatTime(gameState.time.hour,gameState.time.minute)} date={gameState.time.month+'月'+gameState.time.day+'日'} balance={gameState.player.money} skin={gameState.phoneSkin} unread={unreadSmsCount(gameState)} expanded={uiState.modal==='phone'} onOpen={()=>{uiState.phoneStartApp='home';uiState.modal='phone';}}/>
</aside>
<style>
  .phone-edge{position:absolute;right:0;top:60px;bottom:0;width:64px;overflow:hidden;pointer-events:none;z-index:12}
  .phone-edge :global(.phone-pocket){pointer-events:auto;top:62px}
  @media(max-height:520px){.phone-edge{top:45px}.phone-edge :global(.phone-pocket){top:38px}}
</style>
