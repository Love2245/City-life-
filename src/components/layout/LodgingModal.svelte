<script lang="ts">
  import { fade } from "svelte/transition";
  import {
    HOUSING,
    selectLodging,
    nightlyCost,
    getEffectiveLodging,
    awayNightTier,
    currentResidenceName,
    switchOwnedResidence,
  } from "../../game/core/housing";
  import { getRegion } from "../../game/core/regions";
  import { gameState } from "../../stores/gameStore.svelte";
  import { uiState, showToast } from "../../stores/uiStore.svelte";
  import { currentWeather } from "../../game/core/weather";
  import { moveTo } from "../../game/core/actions";
  import { isResidenceLocation, residenceLocationId, hasTempleStay } from "../../game/core/residence";
  import {ownedProperties,propertyIsRented,propertyMonthlyRent,monthlyPropertyIncome,PROPERTY_RENT_PERIOD_DAYS} from '../../game/core/propertyPortfolio';
  const tiers = HOUSING.nightly;
  const current = $derived(getEffectiveLodging(gameState));
  const residenceName = $derived(currentResidenceName(gameState));
  /** 固定住房借宿时保留常住登记、租约或产权。 */
  const hasHome = $derived(gameState.living.mode !== "nightly");
  const away = $derived(awayNightTier(gameState));
  const coldwave = $derived(currentWeather(gameState) === "coldwave");
  const canStayAtTemple = $derived(gameState.locationId === "temple" && hasTempleStay(gameState));
  const properties=$derived(ownedProperties(gameState));
  const rentalIncome=$derived(monthlyPropertyIncome(gameState));

  function chooseOwned(id:string):void{
    const result=switchOwnedResidence(gameState,id);
    if(!result.ok){showToast(result.reason??'暂时不能更换住宅');return;}
    uiState.modal=null;
    showToast(`已将${currentResidenceName(gameState)}设为常住地址，其余产权房自动出租。请前往新住处入住。`);
  }

  function choose(id: string): void {
    // 登记实际入住地址；居家功能只在对应建筑开放。
    const tier = tiers.find((candidate) => candidate.id === id);
    if (id === "camping_lodging" && gameState.locationId !== "camping_base") {
      showToast("请先前往野营基地登记扎营住宿");
      return;
    }
    if (!selectLodging(gameState, id)) {
      const cost = tier ? nightlyCost(gameState, tier.price) : 0;
      showToast(tier ? `🚫 现金不够：今晚需 ¥${cost}，换一个档位吧` : "🚫 房源不可用");
      return;
    }
    uiState.modal = null;
    showToast(isResidenceLocation(gameState)
      ? `已入住${tier?.name}，这里可使用完整居家功能`
      : `已登记${tier?.name}，请从对应地图建筑前往住处`);
  }

  /** 抵达常住建筑时退掉借宿登记。 */
  function goHome(): void {
    const result = moveTo(gameState, residenceLocationId(gameState, true));
    if (!result.ok) {
      showToast(result.reason ?? "请先前往常住建筑办理退房");
      return;
    }
    uiState.modal = null;
  }
  function goCurrent(): void {
    const result = moveTo(gameState, residenceLocationId(gameState));
    if (!result.ok) { showToast(result.reason ?? "暂时无法前往住处"); return; }
    uiState.modal = null;
  }

  /**
   * v1.43：标签直接用房源的真实归属区域，而不是旧的「住宅区 / 市中心」二选一。
   * 例：青年旅舍在老城区（火车站附近）、寺庙禅房在城市边缘。
   */
  function regionLabel(regionId?: string): string {
    if (!regionId) return "未知区域";
    return getRegion(regionId)?.name ?? regionId;
  }

  function recoveryLabel(r: number): string {
    return `${Math.round(r * 100)}%`;
  }
</script>

<div class="overlay hud-scope" onclick={() => (uiState.modal = null)} transition:fade={{ duration: 150 }}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="modal-head">
      <div class="modal-title">🛏️ 选择当前住宿</div>
      <button class="close" onclick={() => (uiState.modal = null)}>✕</button>
    </div>
    <p class="hint">当前住处：{residenceName} · {regionLabel(current.region)}</p>
    {#if !isResidenceLocation(gameState)}
      <div class="home-row"><button class="home-btn" onclick={goCurrent}>前往当前住处</button></div>
    {/if}
    {#if hasHome}
      <p class="hint">
        可以住在常住地址，也可以登记借宿。当前入住建筑提供完整居家功能；返回常住建筑时退房。
        {#if away}当前已选：{away.name}。{/if}
      </p>
      {#if away}<div class="home-row">
        <button class="home-btn" onclick={goHome}>🏠 返回常住地址</button>
      </div>{/if}
    {:else}
      <p class="hint">登记后解锁对应地图建筑，再前往入住。签约月租或购房请去市中心核心商业区的房屋租赁所。</p>
    {/if}
    <p class="hint">市中心两家大酒店入住时预付首晚，含住客堂食；其他按晚住宿在睡觉时结算。月租与购房在市中心核心商业区的房屋租赁所办理，成功后解锁地图入口。</p>
    {#if coldwave}
      <p class="weather-price-note">🥶 寒潮期间住宿费上浮 30%，下方显示的是今晚实际价格。</p>
    {/if}

    {#if properties.length}
      <section class="owned-list" aria-label="我的产权房">
        <h3>🏘️ 我的产权房 · {properties.length}套</h3>
        <p class="hint">自住一套，其余自动出租；当前出租月租合计 ¥{rentalIncome}，每满30个出租日到账。</p>
        {#each properties as property,index (property.id)}
          {@const tier=HOUSING.buy.find(t=>t.id===property.housingId)!}
          {@const rented=propertyIsRented(gameState,property)}
          <div class="owned-card" class:active={!rented}>
            <div><strong>{tier.icon} {tier.name} · 第{index+1}套</strong><p>{rented?`出租中 · ¥${propertyMonthlyRent(tier.id)}/月 · 再出租${PROPERTY_RENT_PERIOD_DAYS-property.rentalDays}天收租`:'当前自住 · 免房租'}</p></div>
            <button disabled={!rented} onclick={()=>chooseOwned(property.id)} aria-label={`将${tier.name}第${index+1}套设为自住`}>{rented?'改为自住':'正在自住'}</button>
          </div>
        {/each}
      </section>
    {/if}
    <div class="tier-list">
      {#each tiers.filter((t) => !t.hidden || (t.id === "temple" && canStayAtTemple)) as tier}
        {@const tonightCost = nightlyCost(gameState, tier.price)}
        <button
          class="tier-card"
          class:selected={current.id === tier.id}
          disabled={tier.id === "camping_lodging" && gameState.locationId !== "camping_base"}
          onclick={() => choose(tier.id)}
        >
          <div class="tier-top">
            <span class="gi-emoji" style="font-size:32px;line-height:1">{tier.icon}</span>
            <div class="tier-info">
              <div class="tier-name">{tier.name}</div>
              <div class="tier-desc">{tier.desc}</div>
              {#if tier.id === "camping_lodging" && gameState.locationId !== "camping_base"}<small>请到野营基地登记</small>{/if}
            </div>
            <span class="tier-price" class:free={tonightCost === 0}>
              {tonightCost === 0 ? "免费" : `¥${tonightCost}/晚`}
            </span>
          </div>
          <div class="tier-tags">
            <span class="tag info">📍 {regionLabel(tier.region)}</span>
            <span class="tag info">恢复 {recoveryLabel(tier.recovery)}</span>
            {#if tier.moodBonus !== 0}
              <span class="tag {tier.moodBonus > 0 ? "gain" : "cost"}">
                心情 {tier.moodBonus > 0 ? `+${tier.moodBonus}` : tier.moodBonus}
              </span>
            {/if}
            {#if tier.facilities.includes("shower")}
              <span class="tag info">🫧 可洗澡</span>
            {/if}
            {#if tier.sideEffects}
              <span class="tag cost">
                {tier.sideEffects.health ? `健康${tier.sideEffects.health} ` : ""}
                {tier.sideEffects.stress ? `压力+${tier.sideEffects.stress} ` : ""}
                {tier.sideEffects.hygiene ? `干净${tier.sideEffects.hygiene}` : ""}
              </span>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .owned-list{margin:16px 0 22px}.owned-list h3{font-size:15px;margin:0}.owned-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;margin-top:8px;border:1px solid var(--border);border-radius:10px;background:var(--bg-soft)}.owned-card.active{border-color:var(--accent)}.owned-card strong{font-size:13px}.owned-card p{font-size:12px;color:var(--text-dim);margin:6px 0 0}.owned-card button{min-width:80px;min-height:44px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-main);font:inherit;font-size:12px}.owned-card button:disabled{opacity:.6}
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(8, 10, 18, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    width: 480px;
    max-height: 80vh;
    overflow-y: auto;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-title {
    font-size: 17px;
    font-weight: 700;
  }
  .close {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-dim);
    font-size: 13px;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .close:hover { background: rgba(255, 90, 90, 0.2); color: #ff6b6b; }
  .close:active { transform: scale(0.92); }
  /* v1.43：有固定住处时，提供「今晚睡自己家」的取消入口 */
  .home-row { display: flex; justify-content: flex-end; margin: 10px 0 4px; }
  .home-btn {
    min-height: 36px;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-main, #eef1ff);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .home-btn:hover { background: rgba(255, 209, 102, 0.16); border-color: rgba(255, 209, 102, 0.45); }
  .hint {
    font-size: 12.5px;
    color: var(--text-dim);
    margin: 8px 0 14px;
  }
  .weather-price-note {
    margin: -4px 0 12px;
    color: #b9d9ff;
    font-size: 12px;
  }
  .tier-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tier-card {
    text-align: left;
    padding: 14px;
    border-radius: 12px;
    background: var(--bg-soft);
    border: 1px solid var(--border);
    transition: all 0.15s ease;
  }
  .tier-card:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }
  .tier-card:active { transform: translateY(0) scale(0.99); }
  .tier-card.selected {
    border-color: var(--accent);
    background: rgba(255, 209, 102, 0.08);
  }
  .tier-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tier-icon {
    font-size: 26px;
  }
  .tier-info {
    flex: 1;
    min-width: 0;
  }
  .tier-name {
    font-size: 14.5px;
    font-weight: 700;
  }
  .tier-desc {
    font-size: 12px;
    color: var(--text-dim);
    margin-top: 2px;
  }
  .tier-price {
    font-size: 14px;
    font-weight: 800;
    color: var(--accent);
    white-space: nowrap;
  }
  .tier-price.free {
    color: var(--ok);
  }
  .tier-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
</style>
