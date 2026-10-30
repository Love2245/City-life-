<script lang="ts">
  import { tick } from 'svelte';
  import { gameState } from '../stores/gameStore.svelte';
  import { characterAbilities, abilityNumber } from '../lib/characterAbilities';
  import { overlayPortal } from '../lib/overlayPortal';

  let { compact = false }: { compact?: boolean } = $props();
  const id = $props.id();
  const abilities = $derived(characterAbilities(gameState));
  const learned = $derived(abilities.filter(a => a.kind === 'skill' && a.value > 0).length);
  let open = $state(false);
  let dialog = $state<HTMLElement>();
  let returnFocus: HTMLElement | null = null;
  function show(event: MouseEvent): void { returnFocus = event.currentTarget as HTMLElement; open = true; }
  $effect(() => {
    if (!open) return;
    let alive = true;
    void tick().then(() => { if (alive) dialog?.querySelector<HTMLButtonElement>('.ability-close')?.focus(); });
    const keyboard = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); open = false; }
      if (event.key === 'Tab') { event.preventDefault(); dialog?.querySelector<HTMLButtonElement>('.ability-close')?.focus(); }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => { alive = false; window.removeEventListener('keydown', keyboard, true); if (returnFocus?.isConnected) returnFocus.focus(); };
  });
</script>

<div class="character-abilities" class:compact>
  <button class="ability-entry" aria-haspopup="dialog" aria-expanded={open} onclick={show}>
    <span>能力与技能</span><span class="entry-arrow" aria-hidden="true">›</span>
  </button>
  {#if !compact}
    <div class="ability-summary">
      {#each abilities.filter(a => a.kind === 'stat') as ability (ability.key)}
        <div title={ability.breakdown}><span>{ability.name}</span><strong>{abilityNumber(ability.value)}</strong></div>
      {/each}
    </div>
    <small class="ability-count">{learned ? `已学习 ${learned} 项技能` : '查看全部成长项目'}</small>
  {/if}
</div>

{#if open}
  <div class="ability-overlay" use:overlayPortal>
    <button class="ability-backdrop" tabindex="-1" aria-label="关闭能力与技能详情" onclick={() => open = false}></button>
    <div class="ability-dialog hud-scope" bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabindex="-1">
      <header><div><h2 id={`${id}-title`}>能力与技能</h2><p>学习、工作与生活中的积累</p></div><button class="ability-close" aria-label="关闭能力与技能" onclick={() => open = false}>×</button></header>
      <div class="ability-grid">
        {#each abilities as ability (ability.key)}
          <article class="ability-card" class:trained={ability.kind === 'skill'} data-ability={ability.key} title={ability.breakdown}>
            <div class="ability-caption"><h3>{ability.name}</h3><strong>{ability.kind === 'skill' ? 'Lv.' : ''}{abilityNumber(ability.value)}<small>/{ability.max}</small></strong></div>
            <div class="ability-meter" role="meter" aria-label={ability.name} aria-valuemin="0" aria-valuemax={ability.max} aria-valuenow={ability.value} aria-valuetext={ability.kind === 'skill' ? `等级 ${abilityNumber(ability.value)}，上限 ${ability.max}` : `${ability.value}，上限 ${ability.max}`}><i style:width={`${Math.max(0, Math.min(100, ability.value / ability.max * 100))}%`}></i></div>
            <p>{ability.detail}</p>
            {#if ability.breakdown}<small class="ability-breakdown">{ability.breakdown}</small>{/if}
          </article>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  /* 3D status sheets pass gestures to the room; this entry remains interactive. */
  .character-abilities{display:grid;gap:8px;pointer-events:auto;color:var(--hud-text,var(--text-main));font-size:var(--m-fs-xs,12px)}
  .ability-entry{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;min-height:var(--m-tap,34px);border:0;padding:0;background:transparent;color:inherit;text-align:left;font:inherit;font-weight:650;cursor:pointer}
  .entry-arrow{font-size:1.4em;color:var(--accent)}.ability-entry:hover{color:var(--accent)}
  .ability-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  .ability-summary>div{display:grid;gap:2px;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--hud-text) 5%,transparent)}
  .ability-summary span{font-size:var(--m-fs-xs,11px);color:var(--text-dim);white-space:nowrap}.ability-summary strong{font-size:var(--m-fs-sm,15px);font-variant-numeric:tabular-nums}
  .ability-count{font-size:var(--m-fs-xs,11px);color:var(--text-dim);line-height:1.5}.compact{gap:0;border-top:1px solid var(--hud-border,var(--border));margin-top:7px}
  .ability-overlay{position:fixed;inset:0;z-index:1250;display:flex;align-items:center;justify-content:center;padding:20px;isolation:isolate}
  .ability-backdrop{position:absolute;inset:0;border:0;border-radius:0;background:rgba(4,8,17,.78);backdrop-filter:blur(6px)}
  .ability-dialog{position:relative;display:flex;flex-direction:column;width:min(1080px,100%);max-height:100%;min-height:0;border:1px solid var(--hud-border,var(--border));border-radius:14px;background:var(--hud-surface-solid,var(--bg-card));color:var(--hud-text,var(--text-main));overflow:hidden;box-shadow:0 16px 60px #0005}
  header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:0 0 auto;padding:18px 20px;border-bottom:1px solid var(--hud-border,var(--border))}h2{font-size:var(--m-fs-lg,21px);margin:0}header p{font-size:var(--m-fs-xs,12px);margin:5px 0 0;color:var(--text-dim)}
  .ability-close{display:grid;place-items:center;flex:0 0 auto;width:var(--m-tap,44px);height:var(--m-tap,44px);border:1px solid var(--hud-border,var(--border));border-radius:8px;background:transparent;color:inherit;font-size:var(--m-fs-lg,24px);cursor:pointer}
  .ability-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:18px 20px;overflow:auto;min-height:0;overscroll-behavior:contain}
  .ability-card{min-width:0;padding:15px 13px;border:1px solid var(--hud-border,var(--border));border-radius:9px;background:color-mix(in srgb,var(--hud-text) 3%,transparent)}
  .ability-caption{display:flex;align-items:center;justify-content:space-between;gap:8px}.ability-caption h3{font-size:var(--m-fs-sm,14px);margin:0}.ability-caption strong{font-size:var(--m-fs-md,19px);font-variant-numeric:tabular-nums;white-space:nowrap}.ability-caption small{font-size:var(--m-fs-xs,11px);color:var(--text-dim);font-weight:400}
  .ability-meter{height:4px;margin:12px 0;border-radius:4px;background:color-mix(in srgb,var(--hud-text) 9%,transparent);overflow:hidden}.ability-meter i{display:block;height:100%;background:var(--accent-2)}.trained .ability-meter i{background:var(--accent)}
  .ability-card p,.ability-breakdown{font-size:var(--m-fs-xs,12px);line-height:1.55;margin:0;color:var(--text-dim)}.ability-breakdown{display:block;font-size:var(--m-fs-xs,10px);margin-top:6px}
  button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  :global(:root[data-game-mode="mobile"]) .ability-overlay{padding:var(--sai-t) var(--sai-r) var(--sai-b) var(--sai-l)}
  :global(:root[data-game-mode="mobile"]) .ability-dialog{width:100%;max-width:none}
  :global(:root[data-game-mode="mobile"]) .ability-summary>div{padding:5px}
  @media(max-width:600px){.ability-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-height:500px){header{padding:8px 14px}header p{display:none}.ability-grid{gap:8px;padding:10px 14px}.ability-card{padding:10px}.ability-breakdown{margin-top:3px}}
  @media(orientation:portrait){:global(:root[data-game-mode="mobile"]) .ability-overlay{display:none}}
</style>
