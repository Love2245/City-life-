<script lang="ts">
  /**
   * 小游戏合集：统一呈现工作/行动玩法、手机小游戏与猫咪对战试玩。
   * 纯游玩：back() 只清空 picked，不调 applyMiniGameReward、不写 gameState、不结算。
   * 配置取 getMiniGameConfig（非技能减时层 ...For），独立模式使用各玩法的数据层时限。
   */
  import { goto, quickCatBattle } from "../stores/gameStore.svelte";
  import { getMiniGameConfig, configuredMiniGameKeys, type MiniGameConfig } from "../game/core/minigame";
  import { loadMiniGameSceneUrl } from "../lib/minigameVisuals";
  import { beginMinigameMusic } from "../lib/audio";
  import MiniGameHost from "../components/layout/MiniGameHost.svelte";
  import ArcadeGameIcon from "../components/ArcadeGameIcon.svelte";
  import Phone2048 from "../components/layout/minigames/Phone2048.svelte";
  import PhoneMinesweeper from "../components/layout/minigames/PhoneMinesweeper.svelte";
  import PhoneSnake from "../components/layout/minigames/PhoneSnake.svelte";
  import PhoneSokoban from "../components/layout/minigames/PhoneSokoban.svelte";
  import { uniqueMiniGameEntries } from "../lib/arcadeCatalog";
  import {homePlanFor} from '../game/core/homeInterior';
  import {HOME_TOUR_GROUPS} from '../game/core/homeTourCatalog';
  import {COMPANY_OFFICES} from '../game/core/companyOffice';
  import {COMPANY_STAGES} from '../game/core/companyConfig';
  let tourCategory=$state('basic');
  const tourGroups=[...HOME_TOUR_GROUPS.map(g=>({id:g.id,name:g.name})),{id:'office',name:'办公室'}];
  const tourCount=HOME_TOUR_GROUPS.reduce((n,g)=>n+g.homes.length,0);
  interface GroupDef {
    id: string;
    name: string;
    icon: string;
    types: string[];
  }
  /** 分组规则：按 cfg.type 自动归并（memory 数据层暂未使用，保留兼容） */
  const GROUPS: GroupDef[] = [
    { id: "restaurant", name: "餐饮制作", icon: "meal", types: ["restaurant"] },
    { id: "delivery", name: "配送出行", icon: "scooter", types: ["delivery"] },
    { id: "checkout", name: "收银零售", icon: "register", types: ["checkout"] },
    { id: "factory", name: "工厂分拣", icon: "factory", types: ["factory"] },
    { id: "dispatch", name: "调度接待", icon: "dispatch", types: ["dispatch"] },
    { id: "reflex", name: "记忆反应", icon: "tiles", types: ["sequence", "memory", "whack"] },
    { id: "brain", name: "知识棋类", icon: "clipboard", types: ["quiz", "sort", "chess"] },
    { id: "rhythm", name: "节奏律动", icon: "rhythm", types: ["rhythm"] },
    { id: "amusement", name: "游乐场", icon: "bowling", types: ["bowling", "darts", "ringtoss"] },
  ];

  interface PhoneGameDef {
    id: string;
    name: string;
  }
  /** 手机 4 款：硬编码（禁止写入 minigames.json，configConsistency 要求 key 是真实 jobId/actionId） */
  const PHONE_GAMES: PhoneGameDef[] = [
    { id: "2048", name: "2048" },
    { id: "minesweeper", name: "扫雷" },
    { id: "snake", name: "贪吃蛇" },
    { id: "sokoban", name: "推箱子" },
  ];

  type Picked =
    | { kind: "job"; key: string; title: string; cfg: MiniGameConfig }
    | { kind: "phone"; id: string; title: string }
    | { kind: "home"; id: string; title: string }
    | { kind: "office"; stage: number; title: string };
  let result = $state<number | null>(null);
  let resultReason = $state('');
  let picked = $state<Picked | null>(null);
  let phoneSceneUrl = $state<string | undefined>(undefined);
  /** 街机模式此前的 paused 链路完全缺失：最小化窗口片刻，倒计时在玩家看不见时耗尽，
   *  回来即判负。用页面可见性派生，与 MiniGameModal 的后台暂停口径一致。 */
  let arcadeHidden = $state(false);
  $effect(() => {
    const onVisibility = () => { arcadeHidden = document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => document.removeEventListener("visibilitychange", onVisibility);
  });
  const playingPhoneGame = $derived(picked?.kind === "phone");
  $effect(() => {
    if (playingPhoneGame) return beginMinigameMusic();
  });

  /** 全量配置（含 key，供分组与点击） */
  const allEntries = configuredMiniGameKeys()
    .map((key) => ({ key, cfg: getMiniGameConfig(key) }))
    .filter((x): x is { key: string; cfg: MiniGameConfig } => Boolean(x.cfg));
  // Equivalent jobs remain playable at their workplaces; the catalogue lists one canonical card per config.
  const entries = uniqueMiniGameEntries(allEntries);

  function gamesOf(types: string[]): { key: string; cfg: MiniGameConfig }[] {
    return entries.filter((e) => types.includes(e.cfg.type));
  }

  function pickJob(key: string, cfg: MiniGameConfig): void {
    result = null; resultReason = '';
    picked = { kind: "job", key, title: cfg.title, cfg };
  }
  function pickPhone(p: PhoneGameDef): void {
    picked = { kind: "phone", id: p.id, title: p.name };
    phoneSceneUrl = undefined;
    const selectedId = p.id;
    void loadMiniGameSceneUrl(`phone-${selectedId}`).then((url) => {
      if (picked?.kind === "phone" && picked.id === selectedId) phoneSceneUrl = url;
    });
  }
  /** 返回列表：纯游玩，不结算不写存档 */
  function back(): void {
    result = null; resultReason = '';
    picked = null;
    phoneSceneUrl = undefined;
  }
</script>

<div class="arcade-root" class:home-touring={picked?.kind==='home'||picked?.kind==='office'} class:restaurant-playing={picked?.kind === 'job' && picked.cfg.type === 'restaurant'} class:delivery-playing={picked?.kind === 'job' && picked.cfg.type === 'delivery'} class:factory-playing={picked?.kind === 'job' && picked.cfg.type === 'factory'} class:checkout-playing={picked?.kind === 'job' && picked.cfg.type === 'checkout'}>
  {#if picked?.kind==='home'}
    {#await import('../components/layout/HomeTour.svelte')}
      <p role="status">正在布置房间…</p>
    {:then {default: HomeTour}}
    <HomeTour homeId={picked.id} onExit={back}/>
    {:catch}
      <p role="status">房间暂时无法加载。<button class="btn" onclick={back}>返回列表</button></p>
    {/await}
  {:else if picked?.kind==='office'}
    {#await import('../components/layout/OfficeTour.svelte')}<p role="status">正在准备办公室参观…</p>
    {:then {default: OfficeTour}}<OfficeTour stage={picked.stage} onExit={back}/>
    {:catch}<p role="status">办公室暂时无法加载。<button class="btn" onclick={back}>返回列表</button></p>{/await}
  {:else if picked}
    <div class="arcade-play">
      <div class="arcade-play-head">
        <button class="btn" onclick={back}>← 返回列表</button>
        <span class="arcade-play-title"><ArcadeGameIcon gameKey={picked.kind === "job" ? picked.key : `phone-${picked.id}`} gameType={picked.kind === "job" ? picked.cfg.type : "phone"} title={picked.title} compact /> {picked.title}</span>
        <span class="dim small">独立小游戏 · 纯游玩不结算</span>
      </div>
      <!-- v1.44.4 复用全屏舞台的类名：mobile.css 里各引擎的「整机一屏放下」规则
           （餐厅/收银/象棋 …）全部以 .mg-stage.fs 为前缀，独立小游戏此前只写 .arcade-stage，
           导致这些规则在街机里一条都不匹配 → 内容按自然高度铺开、底部被切掉。 -->
      <div class="arcade-stage mg-stage fs">
        {#if picked.kind === "job"}
          {#if result !== null}
            <div class="arcade-result"><span>{resultReason||'本轮完成'}</span><h2>{picked.title}</h2><strong>{Math.round(result*100)}<small> / 100</small></strong><p>练习成绩，不扣体力、不影响存档收益。</p><button class="btn" onclick={()=>{result=null;resultReason='';}}>再玩一次</button><button class="btn" onclick={back}>返回列表</button></div>
          {:else}
            <MiniGameHost cfg={picked.cfg} onFinish={(ratio,_completed,final=true,reason)=>{if(final){result=ratio;resultReason=reason??'';}}} onSkip={back} stallStamina={100} stallHour={12} sceneKey={picked.key} practice={true} paused={arcadeHidden} />
          {/if}
        {:else}
          <div class="arcade-phone-scene" style={phoneSceneUrl ? `--phone-scene:url("${phoneSceneUrl}")` : undefined}>
            {#if picked.id === "2048"}
              <Phone2048 />
            {:else if picked.id === "minesweeper"}
              <PhoneMinesweeper />
            {:else if picked.id === "snake"}
              <PhoneSnake />
            {:else}
              <PhoneSokoban />
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="arcade-list">
      <div class="arcade-head">
        <button class="btn" onclick={() => goto("menu")}>← 主菜单</button>
        <span class="arcade-title"><ArcadeGameIcon gameKey="arcade" gameType="brain" compact /> 小游戏合集</span>
        <span class="dim small">共 {entries.length + PHONE_GAMES.length + 1} 款小游戏 · {tourCount} 处住所 · 4 处办公室可参观</span>
      </div>

      <div class="arcade-groups">
        <section class="arcade-group" aria-label="房屋参观" data-arcade-category="homes">
          <div class="arcade-group-head">房屋与办公室参观</div>
          <nav class="tour-categories" aria-label="参观类别">{#each tourGroups as group}<button class="btn" aria-pressed={tourCategory===group.id} data-tour-category={group.id} onclick={()=>tourCategory=group.id}>{group.name}</button>{/each}</nav>
          {#if tourCategory==='office'}
            <p class="arcade-summary">独立参观四种办公场地，不推进时间，不影响公司经营。</p>
            <div class="arcade-cards">{#each COMPANY_STAGES as office}{@const p=COMPANY_OFFICES[office.stage-1]!}<button class="arcade-card" data-tour-office={office.stage} onclick={()=>picked={kind:'office',stage:office.stage,title:office.name}}>
              <svg class="home-card-plan" viewBox={'-1 -1 '+(p.size[0]+2)+' '+(p.size[1]+2)} aria-hidden="true"><polygon points={p.outline.map(point=>point.join(',')).join(' ')} fill="#b8c7be" stroke="#edf4eb" stroke-width=".12"/>{#each p.desks as [x,z]}<rect x={x-.6} y={z-.35} width="1.2" height=".7" rx=".07" fill="#8b826d"/>{/each}</svg>
              <span class="arcade-card-name">{office.name}</span><span class="arcade-summary">{office.capacity}人工位 · 办公室参观</span>
            </button>{/each}</div>
          {:else}
            {@const group=HOME_TOUR_GROUPS.find(g=>g.id===tourCategory)!}<p class="arcade-summary">{group.description}</p>
            <div class="arcade-cards">{#each group.homes as home}{@const p=homePlanFor(home.id)}<button class="arcade-card" data-tour-home={home.id} onclick={()=>picked={kind:'home',id:home.id,title:home.name}}>
              <svg class="home-card-plan" viewBox={'-1 -1 '+(p.size[0]+2)+' '+(p.size[1]+2)} aria-hidden="true"><polygon points={p.outline.map(point=>point.join(',')).join(' ')} fill="#c7b38f" stroke="#efe4ce" stroke-width=".12"/>{#each p.rooms.filter(r=>r.type==='bath'||r.type==='kitchen'||r.type==='entry') as r}<rect x={r.rect[0]} y={r.rect[1]} width={r.rect[2]} height={r.rect[3]} fill={r.type==='bath'?'#849b9a':r.type==='kitchen'?'#a6ad90':'#9a886b'}/>{/each}<rect x={p.anchors.bed!.position[0]-.6} y={p.anchors.bed!.position[1]-.9} width="1.2" height="1.8" rx=".12" fill="#ede8d4"/></svg>
              <span class="arcade-card-name">{home.name}</span><span class="arcade-summary">{p.title}</span>
            </button>{/each}</div>
          {/if}
        </section>
        {#each GROUPS as g (g.id)}
          {@const items = gamesOf(g.types)}
          {#if items.length > 0}
            <section class="arcade-group">
              <div class="arcade-group-head">
                <ArcadeGameIcon gameKey={g.icon} gameType={g.id} compact />
                {g.name}
                <span class="dim small">（{items.length}）</span>
              </div>
              <div class="arcade-cards">
                {#each items as it (it.key)}
                  <button class="arcade-card" onclick={() => pickJob(it.key, it.cfg)}>
                    <ArcadeGameIcon gameKey={it.key} gameType={it.cfg.type} title={it.cfg.title} />
                    <span class="arcade-card-name">{it.cfg.title}</span><span class="arcade-summary">{it.cfg.desc}</span>
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        {/each}

        <section class="arcade-group">
          <div class="arcade-group-head">
            <ArcadeGameIcon gameKey="cat" gameType="cat" compact />
            休闲对战
            <span class="dim small">（1）</span>
          </div>
          <div class="arcade-cards">
            <button class="arcade-card" onclick={quickCatBattle}>
              <ArcadeGameIcon gameKey="cat-battle" gameType="cat" title="喵喵对决" />
              <span class="arcade-card-name">喵喵对决</span>
              <span class="arcade-summary">直接进入一场轻松的猫咪对战，试玩不扣属性、不影响生活存档。</span>
            </button>
          </div>
        </section>

        <section class="arcade-group">
          <div class="arcade-group-head">
            <ArcadeGameIcon gameKey="phone" gameType="phone" compact />
            手机休闲
            <span class="dim small">（{PHONE_GAMES.length}）</span>
          </div>
          <div class="arcade-cards">
            {#each PHONE_GAMES as p (p.id)}
              <button class="arcade-card" onclick={() => pickPhone(p)}>
                <ArcadeGameIcon gameKey={`phone-${p.id}`} gameType="phone" title={p.name} />
                <span class="arcade-card-name">{p.name}</span>
              </button>
            {/each}
          </div>
        </section>
      </div>
    </div>
  {/if}
</div>

<style>
  .arcade-root.home-touring{padding:0!important;overflow:hidden;background:#c6b18e}.home-card-plan{height:82px;width:100%;max-width:170px}
  /* Keep the driving/work surface available on phone-sized landscape screens. */
  @media(max-width:600px) {
    .arcade-root.delivery-playing,.arcade-root.factory-playing{padding:8px;overflow:hidden;}
    .delivery-playing .arcade-play-head,.factory-playing .arcade-play-head{flex-wrap:nowrap;gap:7px;min-height:30px;}
    .delivery-playing .arcade-play-head .btn,.factory-playing .arcade-play-head .btn{min-height:30px;padding:5px 9px;font-size:11px;}
    .delivery-playing .arcade-play-title,.factory-playing .arcade-play-title{font-size:13px;}
    .delivery-playing .arcade-play-head .small,.factory-playing .arcade-play-head .small{display:none;}
    .delivery-playing .arcade-stage,.factory-playing .arcade-stage{margin-top:7px;}
  }
  @media(max-height:580px) {
    .arcade-root.delivery-playing,.arcade-root.factory-playing{padding:6px 8px;overflow:hidden;}
    .delivery-playing .arcade-play-head,.factory-playing .arcade-play-head{flex-wrap:nowrap;gap:8px;min-height:28px;}
    .delivery-playing .arcade-play-head .btn,.factory-playing .arcade-play-head .btn{min-height:28px;padding:4px 10px;font-size:11px;}
    .delivery-playing .arcade-play-title,.factory-playing .arcade-play-title{font-size:13px;}
    .delivery-playing .arcade-play-title :global(.gi-emoji),.factory-playing .arcade-play-title :global(.gi-emoji){font-size:16px!important;}
    .delivery-playing .arcade-play-head .small,.factory-playing .arcade-play-head .small{display:none;}
    .delivery-playing .arcade-stage,.factory-playing .arcade-stage{margin-top:6px;}
  }
  .arcade-root.factory-playing { display:flex; flex-direction:column; background:#172831; }
  .factory-playing .arcade-play { height:100%; min-height:0; display:flex; flex-direction:column; }
  .factory-playing .arcade-play-head { flex-shrink:0; }
  .factory-playing .arcade-stage { flex:1; min-height:0; width:100%; max-width:1360px; display:flex; }
  .factory-playing .arcade-stage :global(.mgh-game) { min-height:0; height:100%; }
  .arcade-root.checkout-playing { display:flex; flex-direction:column; background:#65765e; }
  .checkout-playing .arcade-play { height:100%; min-height:0; display:flex; flex-direction:column; }
  .checkout-playing .arcade-play-head { flex-shrink:0; }
  .checkout-playing .arcade-stage { flex:1; min-height:0; width:100%; max-width:1180px; display:flex; margin-top:10px; }
  .checkout-playing .arcade-stage :global(.mgh-game) { min-height:0; height:100%; }
  .arcade-root.delivery-playing { display:flex; flex-direction:column; background:#36534e; }
  .delivery-playing .arcade-play { height:100%; min-height:0; display:flex; flex-direction:column; }
  .delivery-playing .arcade-play-head { flex-shrink:0; }
  .delivery-playing .arcade-stage { flex:1; min-height:0; width:100%; max-width:1360px; display:flex; }
  .delivery-playing .arcade-stage :global(.mgh-game) { min-height:0; height:100%; }
  .arcade-root.restaurant-playing { display:flex; flex-direction:column; background:radial-gradient(ellipse at top,#a5794e,#493321); }
  .restaurant-playing .arcade-play { height:100%; min-height:0; display:flex; flex-direction:column; }
  .restaurant-playing .arcade-play-head { flex-shrink:0; }
  .restaurant-playing .arcade-stage { flex:1; min-height:0; width:100%; max-width:1180px; display:flex; }
  .restaurant-playing .arcade-stage :global(.mgh-game) { min-height:0; height:100%; }
  .restaurant-playing .arcade-stage :global(.rg) { height:100%; min-height:0; overflow:auto; }
 .arcade-root { --text-main:#f4eddf; --text-dim:#c1ccd3; --bg-card:#233441; --border:#5b7079; color:#f4eddf; }
 .arcade-summary { font-size:11px; line-height:1.5; color:#c5d1d5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
 .arcade-result { padding:40px; text-align:center; background:#1b2f3c; border:1px solid #a99567; border-radius:22px; }
 .arcade-result strong { display:block; font-size:64px; color:#f5cb72; }
 .arcade-result small {font-size:20px;} .arcade-result button {margin:8px;}
 .arcade-phone-scene { --text-main:#f4eddf; --text-dim:#c1ccd3; --bg-card:#233441; --border:#5b7079; color:#f4eddf; max-width:560px; margin:auto; }
 @media(max-width:600px){ .arcade-root {padding:12px;} .arcade-cards{grid-template-columns:repeat(2,minmax(0,1fr));} }

  .arcade-root {
    height: 100%;
    overflow-y: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    background:
      linear-gradient(rgba(10, 14, 26, 0.6), rgba(10, 14, 26, 0.78)),
      var(--grad-sky);
    padding: 24px;
  }
  .arcade-head,
  .arcade-play-head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .arcade-title {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 1px;
  }
  .arcade-play-title {
    font-size: 17px;
    font-weight: 800;
    flex: 1;
    text-align: center;
  }
  .arcade-groups {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    max-width: 1080px;
  }
  .arcade-group-head {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-main, #eef1ff);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .arcade-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    grid-auto-rows: 1fr;
    align-items: stretch;
  }
  .arcade-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 12px 10px;
    box-sizing: border-box;
    border-radius: 14px;
    background: var(--bg-card, #181d33);
    border: 1px solid var(--border, #2a3050);
    color: var(--text-main, #eef1ff);
    cursor: pointer;
    min-height: 188px;
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .arcade-card-name,
  .arcade-summary { width: 100%; }
  .arcade-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent, #ffd166);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }
  .arcade-card-name {
    min-height: 2.6em;
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .arcade-stage {
    width: min(100%, 900px);
    margin-top: 16px;
    max-width: 900px;
    margin-left: auto;
    margin-right: auto;
    /* v1.44.5：独立小游戏继承 App 的 UI 缩放，避免手机设置比例与游戏内容脱节。 */
  }
  .arcade-phone-scene {
    min-height: 420px;
    padding: 14px;
    border-radius: 18px;
    background-image: linear-gradient(rgba(10, 14, 26, 0.52), rgba(10, 14, 26, 0.78)), var(--phone-scene, none), linear-gradient(145deg, rgba(96, 139, 210, 0.16), rgba(18, 24, 44, 0.92));
    background-size: cover;
    background-position: center;
  }
  .arcade-play {
    display: flex;
    flex-direction: column;
  }
  .small {
    font-size: 11px;
  }
  .arcade-root::-webkit-scrollbar { display: none; width: 0; height: 0; }
  @media(max-width:600px) {
    .arcade-root { padding: 12px; }
    .arcade-head { gap: 8px; }
    .arcade-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .arcade-card { min-height: 170px; padding: 10px 8px; }
  }
.tour-categories{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.tour-categories button[aria-pressed=true]{border-color:var(--accent-2,#bdc99e);background:color-mix(in srgb,var(--accent-2,#bdc99e) 15%,transparent)}
</style>

