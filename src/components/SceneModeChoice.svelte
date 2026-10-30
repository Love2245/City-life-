<script lang="ts">
  import type {SceneMode} from '../lib/sceneMode';
  import flatPreview from '../assets/ui/scene-choice/room-2d.webp';
  import roomPreview from '../assets/ui/scene-choice/room-3d.webp';
  let {value,onChange}:{value:SceneMode;onChange:(value:SceneMode)=>void}=$props();
  const choices=[
    {id:'2d' as const,title:'2D 画面',tag:'轻便省电',image:flatPreview,alt:'游戏住宅的 2D 固定视角截图',description:'固定方向切换，加载更快，适合轻松游玩。'},
    {id:'3d' as const,title:'3D 画面',tag:'自由视角',image:roomPreview,alt:'游戏住宅的 3D 可旋转视角截图',description:'自由移动、旋转和缩放，近看房间与家具。'},
  ];
</script>

<fieldset class="scene-choice">
  <legend>选择你喜欢的场景画面</legend>
  <p class="choice-intro">两种画面使用相同的玩法与进度，之后可以在画面设置中随时切换。</p>
  <div class="scene-choices">
    {#each choices as choice}
      <label class="scene-card" class:selected={value===choice.id}>
        <img src={choice.image} alt={choice.alt} width="932" height="430" decoding="async"/>
        <div class="card-copy">
          <div class="card-title"><strong>{choice.title}</strong><span>{choice.tag}</span><input type="radio" name="new-game-scene-mode" value={choice.id} checked={value===choice.id} aria-label={choice.title} onchange={()=>onChange(choice.id)}/></div>
          <p>{choice.description}</p>
        </div>
      </label>
    {/each}
  </div>
  <small>以上为游戏内住宅截图。场景中的家具、人物与天气会随游戏进度变化。</small>
</fieldset>

<style>
  .scene-choice{min-width:0;padding:0;margin:0;border:0}
  legend{padding:0;font-size:clamp(20px,2.5vw,27px);font-weight:700;letter-spacing:.03em}
  .choice-intro{margin:10px 0 20px;color:var(--text-dim);font-size:14px;line-height:1.7}
  .scene-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .scene-card{display:block;min-width:0;overflow:hidden;border:2px solid var(--border);border-radius:15px;background:var(--bg-card);cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}
  .scene-card:hover,.scene-card:focus-within{border-color:var(--accent-2,var(--accent));box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-2,var(--accent)) 15%,transparent)}
  .scene-card.selected{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
  img{display:block;width:100%;height:auto;aspect-ratio:932/430;object-fit:cover;background:#302d28}
  .card-copy{padding:15px 17px 17px}.card-title{display:flex;align-items:center;gap:10px}.card-title strong{font-size:19px;line-height:1.4}.card-title span{font-size:11px;color:var(--text-dim);border:1px solid var(--border);border-radius:20px;padding:3px 8px}
  input{width:19px;height:19px;margin-left:auto;flex:none;accent-color:var(--accent);cursor:pointer}
  .card-copy p{margin:9px 0 0;color:var(--text-dim);font-size:13px;line-height:1.65}
  small{display:block;margin-top:14px;color:var(--text-dim);font-size:11px;line-height:1.6;opacity:.8}
  @media(max-width:520px){.scene-choices{grid-template-columns:1fr;gap:14px}.choice-intro{margin-bottom:15px}}
  @media(prefers-reduced-motion:reduce){.scene-card{transition:none}}
</style>
