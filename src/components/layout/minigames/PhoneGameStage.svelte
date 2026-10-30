<script lang="ts">
 import type {Snippet} from 'svelte';
 let {title,description,hud,boardView,feedback,controls}:{title:string;description:string;hud:Snippet;boardView:Snippet;feedback:Snippet;controls:Snippet}=$props();
</script>
<div class="pg-layout">
 <section class="pg-arena" aria-label={`${title}游戏区`}>
  <div class="pg-hud">{@render hud()}</div>
  <div class="pg-board-wrap">{@render boardView()}</div>
  <div class="pg-feedback" aria-live="polite">{@render feedback()}</div>
 </section>
 <aside class="pg-side" aria-label="游戏说明与操作">
  <div class="pg-guide"><small>这一局，慢慢来</small><h2>{title}</h2><p>{description}</p></div>
  <div class="pg-controls">{@render controls()}</div>
  <p class="pg-key-hint">键盘与触屏按钮均可操作<br/>返回列表时结束本局</p>
 </aside>
</div>
<style>
 .pg-layout{box-sizing:border-box;width:100%;height:100%;min-height:0;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) clamp(190px,25vw,300px);gap:clamp(12px,2vw,28px);color:var(--text-main,#eaf1ed)}
 .pg-arena{display:flex;flex-direction:column;min-height:0;min-width:0;padding:clamp(8px,1.5vw,18px);border:1px solid #9dbfb63b;border-radius:18px;background:linear-gradient(135deg,#24464b99,#122e38c9);box-shadow:inset 0 1px #ffffff0a,0 12px 28px #0002;gap:8px}
 .pg-hud{flex:none;min-height:44px}.pg-hud>:global(div){display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;font-size:14px;font-weight:700;width:100%}.pg-hud :global(button),.pg-controls :global(button){min-width:44px;min-height:44px;padding:7px 14px;border:1px solid #b0c6b655;border-radius:10px;background:#ffffff0e;color:var(--accent,#efd297);font:600 13px system-ui;cursor:pointer;touch-action:manipulation}.pg-hud :global(button.on){background:#edcf86;color:#21383e}
 .pg-board-wrap{container-type:size;flex:1;min-height:0;min-width:0;display:flex;justify-content:center;align-items:center}
 .pg-board-wrap>:global(div){box-sizing:border-box;width:min(100cqw,100cqh,580px);height:auto;aspect-ratio:1;flex:none;max-width:100%;max-height:100%;container-type:inline-size}
 .pg-feedback{flex:none;min-height:34px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:13px;line-height:1.5;color:#c6d6cd}.pg-feedback>:global(div){font-size:inherit}.pg-feedback :global(.ok),.pg-feedback :global(.ms-ok){color:#9fe7ad}.pg-feedback :global(.bad),.pg-feedback :global(.ms-bad){color:#ffb1a2}
 .pg-side{display:flex;flex-direction:column;justify-content:center;align-items:stretch;gap:22px;min-height:0;min-width:0;overflow:auto;padding:16px 12px}.pg-guide small{font-size:10px;letter-spacing:3px;color:#b9c5ac}.pg-guide h2{margin:7px 0 10px;font-size:clamp(22px,3vw,34px);color:#eed5a2;line-height:1.2}.pg-guide p{margin:0;font-size:14px;line-height:1.8;color:#c3d6cd}.pg-controls{display:flex;justify-content:center;align-items:center}.pg-controls :global(.g2-pad),.pg-controls :global(.sn-pad),.pg-controls :global(.sk-pad){display:flex;flex-direction:column;align-items:center;gap:7px}.pg-controls :global(.g2-pad-row),.pg-controls :global(.pad-row),.pg-controls :global(.sk-row){display:flex;gap:7px}.pg-controls :global(button){width:auto;min-height:44px;font-size:13px;box-shadow:0 3px #0c2027}.pg-controls :global(.g2-pad button),.pg-controls :global(.sn-pad button),.pg-controls :global(.sk-pad button){width:56px;height:50px;font-size:22px}.pg-controls :global(button:active){transform:translateY(2px);box-shadow:none;background:#e3c78c;color:#19333c}.pg-key-hint{margin:0;font-size:11px;text-align:center;line-height:1.8;color:#99b2a9}
 @media(max-height:520px) and (orientation:landscape){.pg-arena{padding:7px 12px;gap:4px;border-radius:12px}.pg-side{gap:12px;padding:4px 8px}.pg-guide h2{font-size:22px;margin:5px 0 7px}.pg-guide small{display:none}.pg-guide p{font-size:12px;line-height:1.6}.pg-key-hint{font-size:10px}.pg-feedback{min-height:27px;font-size:11px}.pg-controls :global(.g2-pad button),.pg-controls :global(.sn-pad button),.pg-controls :global(.sk-pad button){width:52px;height:46px}}
 @media(orientation:portrait){.pg-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto;gap:10px}.pg-side{padding:4px 10px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;overflow:visible}.pg-guide small,.pg-key-hint{display:none}.pg-guide h2{font-size:22px;margin:0 0 8px}.pg-guide p{font-size:12px;line-height:1.6}.pg-controls :global(.g2-pad button),.pg-controls :global(.sn-pad button),.pg-controls :global(.sk-pad button){width:48px;height:44px;min-height:44px}.pg-arena{padding:9px 12px}.pg-feedback{font-size:12px;min-height:38px}}
</style>
