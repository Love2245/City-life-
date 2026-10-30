<script lang="ts">
  import { tick } from 'svelte';
  import { sceneLoading, markLoadingCovered } from '../../stores/sceneLoading.svelte';
  import { LOADING_DISTRICTS, loadingArtStyle } from '../../lib/loadingArt';
  import LoadingLandmark from './LoadingLandmark.svelte';
  import { LOADING_FEEDBACK_GROUP, LOADING_TIP_INTERVAL_MS, LOADING_TIP_COUNT } from '../../game/data/loadingTips';
  import {drawContextualLoadingTips} from '../../lib/loadingTips';
  import {financialAlertActive} from '../../game/core/financialRisk';
  import {gameState} from '../../stores/gameStore.svelte';
  const current = $derived(sceneLoading.current);
  const loadId = $derived(current?.id);
  const alert=$derived(financialAlertActive(gameState));
  const tips=$derived.by(()=>{alert;return loadId===undefined?[]:drawContextualLoadingTips(gameState);});
  const artKey=$derived(current?[current.regionId,current.time,current.weather].join(':'):'');
  const district = $derived(LOADING_DISTRICTS[current?.regionId ?? 'downtown'] ?? { name: '都市生活', number: '—', detail: '生活，在下一处继续' });
  let panel = $state<HTMLDivElement>();
  let artReadyKey=$state(''),tipStep=$state(0),tipOwner=$state<number>();
  const tipIndex=$derived(tipOwner===loadId?tipStep:0);
  const feedback=$derived(tipIndex>=LOADING_TIP_COUNT+1);
  function overlayKeydown(event:KeyboardEvent){
    event.stopPropagation();
    if(event.key!=='Tab'||!panel)return;
    const buttons=[...panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if(!buttons.length){event.preventDefault();panel.focus();return;}
    const first=buttons[0],last=buttons[buttons.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel)){event.preventDefault();first.focus();}
  }
  $effect(() => {
    const id = loadId;
    const key=artKey;
    if (id === undefined || artReadyKey!==key) return;
    let cancelled = false, frame = 0, nextFrame = 0;
    let tipsTimer:ReturnType<typeof setInterval>|undefined;
    tipOwner=id;tipStep=0;
    void tick().then(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        nextFrame = requestAnimationFrame(() => {
          if (cancelled) return;
          panel?.focus({ preventScroll: true });
          markLoadingCovered(id);
          const tipsStartedAt=Date.now();
          tipsTimer=setInterval(()=>{
            if(sceneLoading.current?.id===id&&sceneLoading.current.phase!=='leaving'){
              tipStep=Math.min(LOADING_TIP_COUNT+1,Math.floor((Date.now()-tipsStartedAt)/LOADING_TIP_INTERVAL_MS));
              if(tipStep===LOADING_TIP_COUNT+1)clearInterval(tipsTimer);
            }
          },LOADING_TIP_INTERVAL_MS);
        });
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); clearInterval(tipsTimer); };
  });
</script>

{#if current}
  <div class="loading-cover" class:leaving={current.phase === 'leaving'} data-scene-loading-overlay data-scene-loading data-loading-id={current.id} data-loading-phase={current.phase} data-loading-region={current.regionId} data-loading-time={current.time} data-loading-weather={current.weather} style={loadingArtStyle(current.time, current.weather, current.regionId)} bind:this={panel} onkeydown={overlayKeydown} onkeyup={(event)=>event.stopPropagation()} tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="scene-loading-title" aria-busy={current.phase !== 'failed'}>
    <header class="loading-masthead"><span class="wordmark">都市生活<span class="wordmark-dot"></span></span><span class="edition">生活图景 / {district.number}</span></header>
    <main class="loading-composition">
      <div class="district-caption"><span class="caption-line"></span><span>{district.detail}</span><span class="caption-line"></span></div>
      <div class="loading-art-frame"><LoadingLandmark regionId={current.regionId} time={current.time} weather={current.weather} onReady={key=>{artReadyKey=key;}}/></div>
      <div class="loading-copy">
        <span class="district-index">DISTRICT / {district.number}</span>
        <h1 id="scene-loading-title">{district.name}</h1>
        <p class="loading-destination">{current.phase === 'failed' ? '暂时无法准备好场景' : current.kind === '3d' ? `正在准备${current.label}` : `正在前往${current.label}`}</p>
        <div class="loading-state" role="status" aria-live="polite">
          {#if current.phase === 'failed'}<span class="state-dot failed-dot"></span><span>{current.error || '请重新载入，或使用简化场景继续。'}</span>
          {:else}<span class="loading-orbit" aria-hidden="true"><i></i></span><span>{current.slow||tipIndex>=LOADING_TIP_COUNT ? '预计加载时间可能较长，请稍候' : '生活，即将继续'}</span>{/if}
        </div>
        {#if current.phase === 'failed' || current.slow}<div class="loading-actions">
          {#if current.retry}<button class="retry" onclick={() => current?.retry?.()}>重新载入</button>{/if}
          {#if current.fallback}<button onclick={() => current?.fallback?.()}>{current.kind === '3d' ? '使用 2D 场景' : '使用简化地图'}</button>{/if}
        </div>{/if}
      </div>
    </main>
    <aside class="loading-tip" data-loading-tip={feedback?'feedback':tipIndex>=LOADING_TIP_COUNT?'long-wait':tipIndex} aria-live="polite">
      <span class="tip-caption">{feedback?'反馈与帮助':tipIndex>=LOADING_TIP_COUNT?'加载提示':'都市小知识'}</span>
      <span>{feedback?`如果加载一直没有完成，欢迎加入官方群 QQ ${LOADING_FEEDBACK_GROUP}，反馈遇到的场景与问题；也可以在设置里选择 3D 或 2D 场景。`:tipIndex>=LOADING_TIP_COUNT?(current.phase==='failed'?'请重新载入场景。':'场景仍在准备中，请稍候。'):tips[tipIndex]}</span>
    </aside>
    <footer class="loading-footer"><span>每一处，都有日常</span><div class="loading-track" aria-hidden="true"><i></i></div><span class="footer-mark">URBAN LIFE</span></footer>
  </div>
{/if}

<style>
  .loading-cover{position:fixed;inset:0;z-index:15000;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding:clamp(22px,4.2vh,52px) clamp(24px,5.5vw,96px);color:var(--load-ink);background:var(--load-paper);font-family:var(--font-ui,"Microsoft YaHei",system-ui,sans-serif);opacity:1;transition:opacity 250ms ease;pointer-events:auto;touch-action:none;outline:none;contain:layout paint}.loading-cover.leaving{opacity:0}.loading-masthead{display:flex;justify-content:space-between;align-items:center;gap:16px;flex:none;letter-spacing:.08em}.wordmark{display:inline-flex;align-items:center;gap:12px;font-size:19px;font-weight:650;letter-spacing:.16em}.wordmark-dot{height:5px;width:5px;border-radius:50%;background:var(--load-accent)}.edition{font-size:10px;color:var(--load-muted);letter-spacing:.18em}.loading-composition{flex:1;min-height:0;width:min(1100px,100%);align-self:center;display:flex;flex-direction:column;justify-content:center;align-items:center;padding-top:clamp(6px,2vh,22px)}.district-caption{display:flex;align-items:center;justify-content:center;gap:17px;color:var(--load-muted);font-size:11px;letter-spacing:.2em;flex:none}.caption-line{height:1px;width:28px;background:var(--load-faint)}.loading-art-frame{width:100%;max-width:1000px;flex:0 1 auto;min-height:0;margin-top:3px}.loading-copy{text-align:center;flex:none;margin-top:clamp(-23px,-1.5vh,-4px);padding:0 8px 9px}.district-index{font-size:9px;letter-spacing:.3em;color:var(--load-muted)}h1{font-size:clamp(30px,3.6vw,48px);font-weight:500;line-height:1.3;letter-spacing:.16em;margin:9px 0 8px;text-indent:.16em}.loading-destination{font-size:13px;line-height:1.6;letter-spacing:.055em;color:var(--load-muted);margin:0}.loading-state{min-height:18px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:11px;letter-spacing:.07em;color:var(--load-muted);margin-top:18px;max-width:600px;line-height:1.7}.loading-orbit{position:relative;display:block;box-sizing:border-box;width:12px;height:12px;border:1px solid var(--load-faint);border-radius:50%;animation:orbit-turn 2s linear infinite;flex:none}.loading-orbit i{position:absolute;top:-2px;left:3px;height:3px;width:3px;border-radius:50%;background:var(--load-accent)}.state-dot{display:block;flex:none;width:4px;height:4px;border-radius:50%;background:var(--load-accent)}.loading-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:9px;margin-top:16px}.loading-actions button{border:1px solid var(--load-faint);padding:10px 17px;min-height:42px;border-radius:6px;background:transparent;color:var(--load-ink);font:inherit;font-size:12px;letter-spacing:.04em;cursor:pointer;touch-action:manipulation}.loading-actions button.retry{border-color:var(--load-accent);color:var(--load-accent)}.loading-actions button:hover{background:var(--load-fill)}.loading-actions button:focus-visible{outline:2px solid var(--load-accent);outline-offset:3px}.loading-footer{display:flex;align-items:center;justify-content:space-between;gap:30px;flex:none;font-size:10px;letter-spacing:.12em;color:var(--load-muted);padding-top:12px}.loading-track{height:1px;position:relative;flex:1;max-width:270px;background:var(--load-faint);overflow:hidden}.loading-track i{display:block;position:absolute;top:0;left:-35%;width:35%;height:1px;background:var(--load-accent);animation:loading-travel 2.5s ease-in-out infinite}.footer-mark{font-size:9px;letter-spacing:.27em}@keyframes orbit-turn{to{transform:rotate(360deg)}}@keyframes loading-travel{to{transform:translateX(390%)}}
  @media (max-width:650px) and (orientation:portrait){.loading-cover{padding:max(25px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left))}.wordmark{font-size:17px}.edition{font-size:9px;letter-spacing:.08em}.loading-composition{padding-top:0}.district-caption{font-size:10px;letter-spacing:.12em;gap:12px}.caption-line{width:17px}.loading-art-frame{width:calc(100% + 42px);margin:26px -21px 23px;max-width:none}.loading-copy{margin-top:0}h1{font-size:36px;margin-top:12px}.district-index{font-size:9px}.loading-state{margin-top:21px;font-size:11px;max-width:290px}.loading-footer{gap:18px;font-size:9px}.loading-track{max-width:76px}.footer-mark{font-size:8px;letter-spacing:.12em}}
  @media (max-height:600px) and (orientation:landscape){.loading-cover{padding:18px max(26px,env(safe-area-inset-right)) 15px max(26px,env(safe-area-inset-left))}.loading-masthead .wordmark{font-size:16px}.loading-composition{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(200px,1fr);grid-template-rows:1fr;gap:4px 24px;padding-top:2px}.district-caption{display:none}.loading-art-frame{align-self:center;width:calc(100% + 35px);margin-left:-20px;max-width:670px}.loading-copy{align-self:center;margin:0;padding-bottom:0}h1{font-size:32px}.loading-state{margin-top:15px;font-size:10px}.loading-destination{font-size:12px}.loading-footer{padding-top:6px;font-size:9px}.loading-actions{margin-top:10px;gap:6px}.loading-actions button{min-height:36px;padding:7px 12px;font-size:11px}.loading-track{max-width:170px}}
  @media (max-height:350px){.loading-cover{padding-top:12px;padding-bottom:10px}.loading-masthead .wordmark{font-size:14px}.loading-footer{display:none}.loading-actions button{min-height:32px}.loading-state{margin-top:8px}h1{margin-top:5px;font-size:28px}.loading-composition{grid-template-columns:minmax(0,1.2fr) minmax(210px,1fr)}}
  @media (prefers-reduced-motion:reduce){.loading-orbit,.loading-track i{animation:none}.loading-track i{left:32%}.loading-cover{transition-duration:100ms}}
  .loading-tip{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:baseline;width:min(650px,100%);box-sizing:border-box;min-height:44px;align-self:center;margin:8px 0 14px;padding:10px 16px;border-left:2px solid var(--load-faint);color:var(--load-muted);font-size:12px;line-height:1.7;flex:none;text-align:left}
  .tip-caption{font-size:10px;letter-spacing:.08em;color:var(--load-accent);white-space:nowrap}
  @media(max-width:650px) and (orientation:portrait){.loading-tip{padding:6px 10px;gap:9px;font-size:11px;min-height:62px;margin:10px 0 14px}.tip-caption{font-size:9px}}
  @media(max-height:600px) and (orientation:landscape){.loading-tip{min-height:34px;padding:4px 10px;margin:4px 0;font-size:10px;max-width:720px;gap:9px}.tip-caption{font-size:9px}.loading-art-frame{max-height:100%;overflow:hidden}}
</style>
