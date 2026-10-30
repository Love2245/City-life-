<script lang="ts">
  import {overlayPortal} from '../lib/overlayPortal';
  import { onMount, tick } from "svelte";
  import { beginMinigameMusic } from "../lib/audio";
  import { uiState } from "../stores/uiStore.svelte";
  import PhoneMinesweeper from "./layout/minigames/PhoneMinesweeper.svelte";
  import PhoneSokoban from "./layout/minigames/PhoneSokoban.svelte";
  import PhoneSnake from "./layout/minigames/PhoneSnake.svelte";
  import Phone2048 from "./layout/minigames/Phone2048.svelte";

  type GameOption = { id: string; name: string; icon: string; desc: string };

  let {
    installedGames = [],
    phonePerfectUnlocked = [],
    resetSignal = 0,
    visible = true,
    onBack = () => {},
    onGoMarket = () => {},
    onPlay = () => {},
    onPerfect = () => {},
  }: {
    installedGames?: readonly GameOption[];
    phonePerfectUnlocked?: readonly GameOption[];
    resetSignal?: number;
    visible?: boolean;
    onBack?: () => void;
    onGoMarket?: () => void;
    onPlay?: () => void;
    onPerfect?: (gameId: string) => void;
  } = $props();

  let phoneGame = $state<string | null>(null);
  let backgroundPaused = $state(false);
  let userPaused = $state(false);
  let gamePage: HTMLDivElement;
  const currentGame = $derived(installedGames.find((game) => game.id === phoneGame));
  const surfaceVisible = $derived(visible && (uiState.modal === null || uiState.modal === "phone"));
  const gamePaused = $derived(userPaused || backgroundPaused || !surfaceVisible || !!uiState.confirmRequest);
  const playingMusic = $derived(surfaceVisible && phoneGame !== null && ["minesweeper", "sokoban", "snake", "2048"].includes(phoneGame)
);
  $effect(() => {
    if (playingMusic) return beginMinigameMusic();
  });

  onMount(() => {
    const syncVisibility = () => { backgroundPaused = document.hidden; };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  });

  $effect(() => {
    void resetSignal;
    phoneGame = null;userPaused=false;
  });

  async function closeGame():Promise<void>{phoneGame=null;userPaused=false;await tick();gamePage?.querySelector('button')?.focus();}
  function portal(node:HTMLElement){
    const handle=overlayPortal(node);node.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();void closeGame();}
      if(event.key==='Tab'){
        const buttons=[...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===node)){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',key,true);
    return{destroy(){window.removeEventListener('keydown',key,true);handle.destroy();}};
  }
  function chooseRandomGame(): void {
    const game = installedGames[Math.floor(Math.random() * installedGames.length)];
    if (game){userPaused=false;phoneGame = game.id;}
  }
</script>

<div class="game-app-page" bind:this={gamePage}>
  <button class="back" onclick={onBack}>← 返回</button>
  {#if phoneGame}
    <div class="phone-game-full hud-scope" role="dialog" aria-modal="true" aria-label={`手机游戏 · ${currentGame?.name??'小游戏'}`} tabindex="-1" use:portal>
      <header class="pg-topbar"><button onclick={closeGame} aria-label="返回手机游戏列表">← 游戏列表</button><div><span>口袋游乐室</span><h1>{currentGame?.icon} {currentGame?.name}</h1></div><button class:active={userPaused} onclick={()=>userPaused=!userPaused} aria-label={userPaused?'继续手机游戏':'暂停手机游戏'}>{userPaused?'继续游戏':'暂停'}</button></header>
      <div class="pg-content">
    {#if phoneGame === "minesweeper"}
      <PhoneMinesweeper paused={gamePaused} onPerfect={onPerfect} />
    {:else if phoneGame === "sokoban"}
      <PhoneSokoban paused={gamePaused} onPerfect={onPerfect} />
    {:else if phoneGame === "snake"}
      <PhoneSnake paused={gamePaused} onPerfect={onPerfect} />
    {:else if phoneGame === "2048"}
      <Phone2048 paused={gamePaused} onPerfect={onPerfect} />
    {:else}
      <p class="jobs-hint dim">这个游戏版本暂不可用，请返回应用市场重新安装。</p>
    {/if}

        {#if gamePaused}<div class="pg-paused" role="status"><strong>稍作休息</strong><p>游戏已暂停，当前进度保留。</p>{#if userPaused}<button onclick={()=>userPaused=false}>继续游戏</button>{/if}</div>{/if}
      </div>
    </div>
  {:else}
    <div class="page-title">🎮 手机游戏</div>
    {#if installedGames.length === 0}
      <p class="jobs-hint dim">还没有游戏，先去「应用市场」下载一个吧。</p>
      <button class="big-action" onclick={onGoMarket}>🛍️ 前往应用市场</button>
    {:else}
      <button class="big-action" onclick={chooseRandomGame}>
        🎲 随便玩一个（随机小游戏）
      </button>
      <div class="g-head">🎲 已安装游戏</div>
      <div class="job-list">
        {#each installedGames as game}
          <button class="job-item" onclick={() => {userPaused=false;phoneGame = game.id;}}>
            <span class="gi-emoji" style="font-size:34px;line-height:1">{game.icon}</span>
            <div class="j-info">
              <div class="j-name">{game.name}</div>
              <div class="j-desc dim">{game.desc}</div>
              {#if phonePerfectUnlocked.some((item) => item.id === game.id)}
                <div class="referral-badge">🏆 已满分</div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
      <button class="big-action ghost" onclick={onPlay}>
        💤 摸鱼一小时（放松：+心情，-1 小时）
      </button>
      <div class="jobs-group">
        <div class="g-head">🏆 隐藏成就</div>
        {#if phonePerfectUnlocked.length > 0}
          {#each phonePerfectUnlocked as game}
            <div class="hired-banner">🏆 隐藏成就「{game.name}满分」已解锁（+30 元奖金）</div>
          {/each}
        {:else}
          <p class="jobs-hint dim">任意一个游戏拿到满分即可解锁隐藏成就（仅一次奖励）。</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .game-app-page {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--text-main);
  }
  .back {
    align-self: flex-start;
    font-size: 13px;
    color: var(--text-dim);
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
  }
  .back:active { transform: scale(0.95); }

  .page-title { font-size: 16px; font-weight: 700; color: var(--text-main); }
  .big-action {
    padding: 13px 14px;
    border: 0;
    border-radius: 14px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text-main);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent);
    font-size: 12px;
    text-align: left;
    line-height: 1.5;
    cursor: pointer;
    transition: transform 0.14s ease, background 0.16s ease;
  }
  .big-action:active { transform: scale(0.99); background: color-mix(in srgb, var(--accent) 20%, transparent); }
  .big-action.ghost { background: var(--tint); box-shadow: inset 0 0 0 1px var(--stroke); color: var(--text-dim); font-weight: 600; }
  .job-list { display: flex; flex-direction: column; gap: 10px; }
  .jobs-hint { font-size: 11.5px; line-height: 1.6; }
  .job-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    border: 0;
    text-align: left;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--glass);
    color: var(--text-main);
    box-shadow: var(--lift), inset 0 0 0 1px var(--stroke);
    cursor: pointer;
    transition: transform 0.14s ease;
  }
  .job-item:active { transform: scale(0.99); }
  .j-info { flex: 1; min-width: 0; }
  .j-name { font-size: 13px; font-weight: 600; }
  .j-desc { font-size: 11px; margin-top: 2px; }
  .referral-badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 10px;
    color: var(--ok, #7bd88f);
    background: color-mix(in srgb, var(--ok, #7bd88f) 12%, transparent);
  }
  .jobs-group { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
  .g-head { font-size: 11.5px; font-weight: 700; color: var(--accent); letter-spacing: 0.4px; padding-left: 4px; }
  .hired-banner {
    background: color-mix(in srgb, var(--ok, #7bd88f) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ok, #7bd88f) 34%, transparent);
    color: color-mix(in srgb, var(--ok, #7bd88f) 72%, var(--text-main));
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 11.5px;
    line-height: 1.5;
  }
  .phone-game-full{position:fixed;inset:0;z-index:1300;display:flex;flex-direction:column;box-sizing:border-box;min-width:0;min-height:0;overflow:hidden;background:radial-gradient(ellipse at top,#24494e,#0c1e29 70%);color:#eaf1ed;--text-main:#eaf1ed;--text-dim:#bacdc6;--accent:#efd297;--ok:#8ce2ae;--danger:#ffad9c;padding:max(10px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));font-family:system-ui,'Microsoft YaHei',sans-serif}
  .phone-game-full:focus{outline:none}.pg-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex:none;min-height:62px;padding:0 4px 10px;border-bottom:1px solid #a3c8bf33}.pg-topbar>div{flex:1;text-align:center}.pg-topbar span{font-size:10px;color:#b7c6b6;letter-spacing:3px}.pg-topbar h1{margin:0;font-size:clamp(18px,2.4vw,26px);line-height:1.4}.phone-game-full button{font:inherit;cursor:pointer;color:inherit}.pg-topbar>button,.pg-paused button{min-height:44px;padding:8px 15px;border:1px solid #aac6b955;border-radius:10px;background:#ffffff0c;font-size:13px}.pg-topbar>button.active,.pg-paused button{background:#ebd19b;color:#1c343a}.pg-content{position:relative;display:flex;flex:1;min-height:0;padding-top:12px}.pg-content>:global(.g2),.pg-content>:global(.sn),.pg-content>:global(.ms),.pg-content>:global(.sk){width:100%;height:100%;min-height:0;min-width:0}.pg-paused{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border-radius:16px;background:#102631f5;text-align:center}.pg-paused strong{font-size:26px}.pg-paused p{color:#bed0c6;margin:0}.phone-game-full button:focus-visible{outline:3px solid #f1ce80;outline-offset:2px}
  @media(max-height:520px) and (orientation:landscape){.phone-game-full{padding-top:max(5px,env(safe-area-inset-top));padding-bottom:max(5px,env(safe-area-inset-bottom))}.pg-topbar{min-height:46px;padding-bottom:5px}.pg-topbar span{display:none}.pg-topbar h1{font-size:18px}.pg-content{padding-top:6px}}
</style>

