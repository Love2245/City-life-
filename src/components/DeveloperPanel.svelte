<script lang="ts">
  import { onMount } from "svelte";
  import { gameState } from "../stores/gameStore.svelte";
  import { developerState, closeDeveloperPanel, runDeveloperAction as run, canRestoreDeveloperSnapshot, restoreDeveloperSnapshot } from "../stores/developerStore.svelte";
  import { DEVELOPER_ATTRS, DEVELOPER_STATS, DEVELOPER_SKILLS, type DeveloperAction } from "../game/core/developer";
  import { ITEMS } from "../game/core/items";
  import { DEVELOPER_ITEM_CATEGORIES, developerItemMatchesCategory } from "../game/core/developerInventory";
  import { allNpcs, npcPresenceAt } from "../game/core/npcs";
  import { STATE_LABEL, currentState } from "../game/core/relationships";
  import { LOCATIONS } from "../game/core/actions";
  import { REGIONS } from "../game/core/regions";
  import { weekdayOf, weekdayLabel } from "../game/core/calendar";
  import { getMaxStamina } from "../game/core/stats";
  import { NPC_TASK_DEFINITIONS, CURRENT_NPC_TASK_DEFINITIONS } from "../game/data/npcTaskData";
  import { DEVELOPER_TASK_PRESETS } from "../game/core/developerTasks";
  import { npcTaskSummary } from "../game/core/npcTasks";
  import { WEATHER_LABEL } from "../game/core/weather";
  import { VEHICLE_NAMES } from "../game/core/vehicle";
  import { MEMBERSHIPS } from "../game/core/membership";
  import { CATS } from "../game/core/cat";
  import { JOB_DEFS } from "../game/core/jobs";
  import type { NpcTaskId } from "../game/npcTaskTypes";
  import type { RelationState, WeatherId } from "../game/types";

  const tabs = [
    { id: "player", name: "角色与金钱", icon: "◈" }, { id: "items", name: "物品仓库", icon: "▣" },
    { id: "npcs", name: "人物关系", icon: "◎" }, { id: "time", name: "时间与地点", icon: "◷" },
    { id: "tasks", name: "任务与剧情", icon: "☷" }, { id: "world", name: "世界与宠物", icon: "◇" },
    { id: "state", name: "状态与快照", icon: "⌘" },
  ];
  let tab = $state("player"), panel = $state<HTMLElement>(), content = $state<HTMLElement>();
  let itemSearch = $state(""), itemGroup = $state("all"), itemQty = $state(1), itemLimit = $state(60);
  const itemResults = $derived(ITEMS.filter((item) => developerItemMatchesCategory(item,itemGroup) && `${item.name} ${item.id} ${(item.tags ?? []).join(" ")}`.toLowerCase().includes(itemSearch.toLowerCase())));
  const itemCategories = Object.entries(DEVELOPER_ITEM_CATEGORIES).map(([id,name])=>({id,name,count:ITEMS.filter(item=>developerItemMatchesCategory(item,id)).length}));
  function chooseItemCategory(id:string):void { itemGroup=id; itemLimit=60; if(content)content.scrollTop=0; }
  const npcs = allNpcs();
  let npcId = $state("npc_zhao_gang"), affinity = $state(40), relation = $state<"auto" | RelationState>("auto"), met = $state(true);
  const selectedNpc = $derived(npcs.find((n) => n.id === npcId));
  const selectedRel = $derived(gameState.relationships.find((r) => r.npcId === npcId));
  const presence = $derived(npcPresenceAt(npcId, { ...gameState.time, weekday: weekdayOf(gameState.time), seed: gameState.rng.seed }));
  let regionId = $state(gameState.region ?? "downtown_residential"), locationId = $state("map");
  const locations = $derived(LOCATIONS.filter((l) => l.regions?.includes(regionId)));
  let jumpMinutes = $state(60);
  let taskId = $state<NpcTaskId>("zhao_staff"), taskPreset = $state("start"), deadlineHours = $state(168);
  const taskQuest = $derived(gameState.quests.find((q) => q.npcTask?.taskId === taskId));
  const taskInfo = $derived(taskQuest ? npcTaskSummary(gameState, taskQuest) : null);
  let flagSearch = $state(""), flagKey = $state(""), flagKind = $state("true"), flagNumber = $state(0), flagLimit = $state(60);
  const flagResults = $derived(Object.entries(gameState.flags).filter(([key]) => key.toLowerCase().includes(flagSearch.toLowerCase())).sort(([a], [b]) => a.localeCompare(b)));
  let json = $state(""), jsonMessage = $state(""), catId = $state(CATS.find((c) => c.rarity !== "boss")?.id ?? ""), petLevel = $state(50);
  let memberDays = $state(30);
  let jobId = $state(JOB_DEFS.find((j) => j.kind === "formal")?.id ?? "");
  function formNumber(event: SubmitEvent, name = "value"): number { return Number(new FormData(event.currentTarget as HTMLFormElement).get(name)); }
  function editPlayer(event: SubmitEvent, group: "attrs" | "stats" | "skills" | "other", key: string): void { event.preventDefault(); run({ type: "player", group, key, value: formNumber(event) }); }
  function chooseNpc(): void { const r = gameState.relationships.find((r) => r.npcId === npcId); affinity = r?.affinity ?? 0; relation = r?.state === "blocked" || r?.state === "lover" ? r.state : "auto"; met = !!r; }
  function keydown(event: KeyboardEvent): void {
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); closeDeveloperPanel(); return; }
    if (event.key !== "Tab" || !panel) return;
    const elements = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]')].filter((e) => e.getClientRects().length);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel?.focus(); window.addEventListener("keydown", keydown, true);
    return () => { window.removeEventListener("keydown", keydown, true); previous?.focus(); };
  });
  function exportJson(): void { json = JSON.stringify(gameState, null, 2); jsonMessage = "已读取当前完整游戏状态，可编辑后导入，或下载到文件。"; }
  function download(): void {
    exportJson(); const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `都市生活-调试状态-${gameState.time.year}-${gameState.time.month}-${gameState.time.day}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function loadFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
    if (!file) return;
    if (file.size > 4_000_000) { jsonMessage = "文件超过4MB"; input.value = ""; return; }
    json = await file.text(); jsonMessage = "文件已载入编辑框，尚未应用。"; input.value = "";
  }
  function setDate(event: SubmitEvent): void {
    event.preventDefault(); const form = new FormData(event.currentTarget as HTMLFormElement);
    run({ type: "date", year: Number(form.get("year")), month: Number(form.get("month")), day: Number(form.get("day")), hour: Number(form.get("hour")), minute: Number(form.get("minute")) });
  }
  function setFlag(): void { run({ type: "flag", key: flagKey, value: flagKind === "delete" ? null : flagKind === "number" ? flagNumber : flagKind === "true" }); }
  function itemAction(id: string, mode: "set" | "add", quantity: number): void { run({ type: "item", id, mode, quantity }); }
  function active(action: DeveloperAction): void { run(action); }
</script>

<div class="developer-backdrop" role="presentation">
  <div class="developer-panel" role="dialog" aria-modal="true" aria-labelledby="developer-title" tabindex="-1" bind:this={panel}>
    <header class="developer-header">
      <div><span class="developer-kicker">URBAN LIFE · DEVELOPMENT</span><h2 id="developer-title">超级开发者模式 <span>已启用</span></h2></div>
      <button class="close" aria-label="关闭开发者面板" onclick={closeDeveloperPanel}>关闭 ×</button>
    </header>
    <div class="developer-context"><span>{gameState.player.name || "主角"} · ¥{gameState.player.money.toLocaleString()}</span><span>{gameState.time.year}年{gameState.time.month}月{gameState.time.day}日 {weekdayLabel(gameState.time)} {String(gameState.time.hour).padStart(2, "0")}:{String(gameState.time.minute).padStart(2, "0")}</span><span>{LOCATIONS.find((l) => l.id === gameState.locationId)?.name ?? "地图"} · v{gameState.version}</span></div>
    <div class="developer-body">
      <nav aria-label="调试分类">{#each tabs as t}<button class:chosen={tab === t.id} aria-pressed={tab === t.id} onclick={() => { tab = t.id; if(content)content.scrollTop=0; }}><span>{t.icon}</span>{t.name}</button>{/each}</nav>
      <div class="developer-content" bind:this={content}>
        {#if tab === "player"}
          <h3>角色与金钱</h3><p class="hint">修改会立即进入当前游戏，并由正常自动存档保存。每次成功操作前会留一份本局快照。</p>
          <div class="tool-card"><h4>现金</h4><form class="inline" onsubmit={(e) => { e.preventDefault(); run({ type: "money", mode: "set", value: formNumber(e) }); }}><input aria-label="现金金额" name="value" type="number" min="-1000000000" max="1000000000" step="0.01" value={gameState.player.money} required /><button type="submit">设定金额</button></form><div class="inline"><button onclick={() => active({ type: "money", mode: "add", value: 1000 })}>＋1,000</button><button onclick={() => active({ type: "money", mode: "add", value: 10000 })}>＋10,000</button><button onclick={() => active({ type: "money", mode: "add", value: 1000000 })}>＋1,000,000</button><button onclick={() => active({ type: "money", mode: "set", value: 0 })}>现金归零</button></div></div>
          <div class="inline"><button class="primary" onclick={() => active({ type: "recover" })}>恢复全部状态</button><button onclick={() => active({ type: "revive" })}>清除本局结局并恢复</button><button onclick={() => active({ type: "cancelActivity" })}>取消进行中的活动</button></div>
          <p class="hint">取消活动会放弃尚未结算的工作、钓鱼或休闲奖励。清除结局可继续本局，个人档案中的命运点和历史记录保留。</p>
          <div class="two-col"><div class="tool-card"><h4>生存状态</h4>{#each Object.entries(DEVELOPER_ATTRS) as [key, label]}<form class="field" onsubmit={(e) => editPlayer(e, "attrs", key)}><label for={`dev-${key}`}>{label}</label><input id={`dev-${key}`} name="value" type="number" min="0" max={key === "stamina" ? getMaxStamina(gameState) : 100} step="1" value={gameState.player.attrs[key as keyof typeof DEVELOPER_ATTRS]} required /><button type="submit">设置</button></form>{/each}{#each ["stress", "debt"] as key}<form class="field" onsubmit={(e) => editPlayer(e, "other", key)}><label for={`dev-${key}`}>{key === "stress" ? "压力" : "债务"}</label><input id={`dev-${key}`} name="value" type="number" min="0" max={key === "stress" ? 100 : 1000000000} value={key === "stress" ? gameState.player.stress : gameState.player.debt} required /><button type="submit">设置</button></form>{/each}</div>
          <div class="tool-card"><h4>基础成长属性</h4><p class="hint">编辑基础值，装备加成会重新计算。</p>{#each Object.entries(DEVELOPER_STATS) as [key, label]}<form class="field" onsubmit={(e) => editPlayer(e, "stats", key)}><label for={`dev-${key}`}>{label}</label><input id={`dev-${key}`} name="value" type="number" min="0" max="100" value={(gameState.player.baseStats ?? gameState.player.stats)[key as keyof typeof DEVELOPER_STATS]} required /><button type="submit">设置</button></form>{/each}</div></div>
          <div class="tool-card"><h4>技能等级 · 0—10</h4><div class="two-col">{#each Object.entries(DEVELOPER_SKILLS) as [key, label]}<form class="field" onsubmit={(e) => editPlayer(e, "skills", key)}><label for={`dev-${key}`}>{label}</label><input id={`dev-${key}`} name="value" type="number" min="0" max="10" step="0.1" value={gameState.player.skills[key as keyof typeof DEVELOPER_SKILLS]} required /><button type="submit">设置</button></form>{/each}</div></div>
        {:else if tab === "items"}
          <h3>物品仓库</h3><p class="hint">包括正式任务道具，可搜索中文名称或内部ID。添加数量与设定总数分开操作；家用设备沿用原有加成规则。</p>
          <div class="warehouse-tools"><div class="warehouse-categories" role="group" aria-label="物品分类">{#each itemCategories as category}<button class:chosen={itemGroup===category.id} aria-pressed={itemGroup===category.id} data-item-category={category.id} onclick={()=>chooseItemCategory(category.id)}>{category.name}<span>{category.count}</span></button>{/each}</div><div class="inline"><input class="grow" aria-label="搜索物品" placeholder="搜索当前分类：名称、ID或标签" bind:value={itemSearch} oninput={() => itemLimit = 60} /><label>数量 <input class="short" aria-label="物品操作数量" type="number" min="0" max="99999" step="1" bind:value={itemQty} /></label></div></div>
          <details class="tool-card"><summary>批量生成当前分类</summary><p class="hint">按上方分类为每种物品增加指定数量，搜索词不影响批量范围。不会触发消费或发放任务奖励。</p><button onclick={() => active({ type: "itemBatch", group: itemGroup, quantity: itemQty })}>批量添加</button></details>
          <p class="hint">共{itemResults.length}种物品 · 显示前{Math.min(itemLimit, itemResults.length)}种</p>
          <div class="record-list">{#each itemResults.slice(0, itemLimit) as item (item.id)}<div class="record"><div><strong>{item.icon} {item.name}</strong><small>{item.id} · 背包 {gameState.inventory[item.id] ?? 0}</small></div><div class="inline compact"><button onclick={() => itemAction(item.id, "add", itemQty)}>增加</button><button onclick={() => itemAction(item.id, "set", itemQty)}>设总数</button><button onclick={() => itemAction(item.id, "set", 0)}>移除</button></div></div>{/each}</div>
          {#if itemLimit < itemResults.length}<button onclick={() => itemLimit += 60}>再显示60种</button>{/if}
        {:else if tab === "npcs"}
          <h3>人物关系</h3><div class="inline"><select class="grow" aria-label="选择人物" bind:value={npcId} onchange={chooseNpc}>{#each npcs as npc}<option value={npc.id}>{npc.name} · {npc.id}</option>{/each}</select><button onclick={chooseNpc}>读取当前值</button></div>
          <div class="tool-card"><h4>{selectedNpc?.name}</h4><p>当前：{selectedRel ? `${selectedRel.affinity}好感 · ${STATE_LABEL[currentState(selectedRel)]}` : "尚未认识"}</p><p class="hint">{presence ? `此刻在${REGIONS.find((r) => r.id === presence.regionId)?.name ?? ""} · ${LOCATIONS.find((l) => l.id === presence.locationId)?.name ?? presence.locationId}` : "此刻不在可见地点"}</p><div class="inline"><label>好感 <input aria-label="人物好感" type="number" min="0" max="100" step="1" bind:value={affinity} /></label><label>关系 <select aria-label="关系状态" bind:value={relation}><option value="auto">按好感自动分档</option><option value="lover" disabled={!selectedNpc?.romanceable}>恋人</option><option value="blocked">拉黑</option></select></label><label class="checkbox"><input type="checkbox" bind:checked={met} />已经认识</label><button class="primary" onclick={() => active({ type: "npc", id: npcId, affinity, relation, met })}>应用人物关系</button></div><p class="hint">设为未认识会删除此人的关系和联系人；借款等关系记录也会移除。历史剧情与任务结果保留。</p><div class="inline"><button onclick={() => active({ type: "findNpc", id: npcId, next: false })}>前往此人当前位置</button><button onclick={() => active({ type: "findNpc", id: npcId, next: true })}>定位最近一次在场时间</button><button onclick={() => active({ type: "resetChats", id: npcId })}>重置此人今日聊天次数</button></div></div>
          <div class="tool-card"><h4>批量与出场条件</h4><div class="inline">{#each [20, 40, 70, 100] as n}<button onclick={() => active({ type: "npcAll", affinity: n })}>全员认识 · 好感{n}</button>{/each}<button onclick={() => active({ type: "introductions" })}>完成泊月三人介绍事件</button><button onclick={() => active({ type: "resetChats" })}>重置全员今日聊天次数</button></div><p class="hint">跳到人物的在场时间会直接调整时钟并检查任务过期，不模拟沿途日结。介绍事件完成标记与认识人物可分别测试。</p></div>
        {:else if tab === "time"}
          <h3>时间与地点</h3><div class="tool-card"><h4>按游戏规则推进</h4><p class="hint">经过午夜会执行日结、工资与缺勤、租金、物品有效期和任务期限检查；可能触发结局。</p><div class="inline"><label>分钟 <input aria-label="推进分钟数" type="number" min="1" max="43200" step="1" bind:value={jumpMinutes} /></label><button class="primary" onclick={() => active({ type: "advance", minutes: jumpMinutes })}>推进</button>{#each [5, 30, 60, 1440, 10080] as m}<button onclick={() => active({ type: "advance", minutes: m })}>{m < 60 ? `${m}分钟` : m < 1440 ? "1小时" : m === 1440 ? "1天" : "7天"}</button>{/each}</div></div>
          <div class="tool-card"><h4>直接定位日期</h4><p class="hint">使用游戏内每月30天的日历。只修改日期并检查NPC任务期限，不补算日结或撤销已发生的事件。</p><form class="inline date-form" onsubmit={setDate}>{#each [{ key: "year", name: "年", min: 2026, max: 9999 }, { key: "month", name: "月", min: 1, max: 12 }, { key: "day", name: "日", min: 1, max: 30 }, { key: "hour", name: "时", min: 0, max: 23 }, { key: "minute", name: "分", min: 0, max: 59 }] as f}<label>{f.name}<input aria-label={`定位${f.name}`} name={f.key} type="number" min={f.min} max={f.max} step="1" value={gameState.time[f.key as "year" | "month" | "day" | "hour" | "minute"]} required /></label>{/each}<button type="submit">设定日期与时间</button></form></div>
          <div class="tool-card"><h4>地点传送</h4><div class="inline"><select aria-label="传送区域" bind:value={regionId} onchange={() => locationId = "map"}>{#each REGIONS as r}<option value={r.id}>{r.name} · {r.id}</option>{/each}</select><select class="grow" aria-label="传送地点" bind:value={locationId}><option value="map">区域地图</option>{#each locations as loc}<option value={loc.id}>{loc.name} · {loc.id}</option>{/each}</select><button class="primary" onclick={() => active({ type: "teleport", locationId, regionId })}>立即传送</button><button onclick={() => active({ type: "routes" })}>解锁通行路线</button></div><p class="hint">传送不耗时，设施营业与人物排班仍按游戏规则。工作、钓鱼或休闲进行中需先结束或取消活动。</p></div>
        {:else if tab === "tasks"}
          <h3>任务与剧情</h3><p class="hint">准备场景会覆盖所选任务及其专属物品。过去拿到的金钱和好感不倒扣，准备本身不发奖励。修改日期的场景也可能使其他任务到期。</p>
          <div class="tool-card"><div class="inline"><select aria-label="选择调试任务" bind:value={taskId} onchange={() => taskPreset = "start"}>{#each CURRENT_NPC_TASK_DEFINITIONS as t}<option value={t.id}>{t.title}</option>{/each}</select><select class="grow" aria-label="任务场景" bind:value={taskPreset}>{#each (DEVELOPER_TASK_PRESETS[taskId] ?? []) as preset}<option value={preset.id}>{preset.name}</option>{/each}</select><button class="primary" onclick={() => active({ type: "task", id: taskId, preset: taskPreset })}>准备任务场景</button></div><div class="inline"><button onclick={() => active({ type: "npc", id: NPC_TASK_DEFINITIONS[taskId].npcId, affinity: taskId === "zhao_staff" ? 40 : 20, relation: "auto", met: true })}>设置委托人所需好感</button><button onclick={() => active({ type: "findNpc", id: NPC_TASK_DEFINITIONS[taskId].npcId, next: true })}>前往委托人最近在场处</button></div>
          {#if taskQuest && taskInfo}<div class="task-status"><strong>{taskQuest.title} · {taskQuest.status}</strong><p>{taskInfo.stageLabel} · {taskInfo.deadlineText}</p>{#each taskInfo.lines as line}<p>{line}</p>{/each}{#if taskQuest.npcTask?.failureReason}<p>{taskQuest.npcTask.failureReason}</p>{/if}<details><summary>查看完整任务数据</summary><pre>{JSON.stringify(taskQuest, null, 2)}</pre></details></div>{:else}<p class="hint">这项任务尚未接取。</p>{/if}
          <div class="inline"><label>剩余小时 <input class="short" aria-label="任务剩余小时" type="number" min="1" max="8760" bind:value={deadlineHours} /></label><button disabled={taskQuest?.status !== "active"} onclick={() => active({ type: "taskDeadline", id: taskId, hours: deadlineHours })}>重设总期限</button></div></div>
          <h4>剧情标记</h4><p class="hint">修改单个标记可重放事件或调整解锁条件。只支持布尔值和数值；多字段剧情可以在“状态与快照”编辑完整状态。</p>
          <div class="tool-card"><div class="inline"><input class="grow" aria-label="标记名称" placeholder="内部标记名" bind:value={flagKey} /><select aria-label="标记类型" bind:value={flagKind}><option value="true">true</option><option value="false">false</option><option value="number">数值</option><option value="delete">删除</option></select>{#if flagKind === "number"}<input class="short" aria-label="标记数值" type="number" bind:value={flagNumber} />{/if}<button onclick={setFlag}>应用标记</button></div><input aria-label="搜索剧情标记" placeholder="搜索现有标记" bind:value={flagSearch} oninput={() => flagLimit = 60} /><div class="flag-list">{#each flagResults.slice(0, flagLimit) as [key, value]}<button onclick={() => { flagKey = key; flagKind = typeof value === "boolean" ? String(value) : "number"; flagNumber = typeof value === "number" ? value : 0; }}>{key}<b>{String(value)}</b></button>{/each}</div>{#if flagLimit < flagResults.length}<button onclick={() => flagLimit += 60}>再显示60项</button>{/if}</div>
        {:else if tab === "world"}
          <h3>世界与宠物</h3><div class="tool-card"><h4>当前天气</h4><div class="inline">{#each Object.entries(WEATHER_LABEL) as [id, name]}<button class:chosen={gameState.weather.id === id} onclick={() => active({ type: "weather", id: id as WeatherId })}>{name}</button>{/each}</div><p class="hint">设置今天的天气，次日恢复正常天气推算。</p></div>
          <div class="tool-card"><h4>载具</h4>{#each Object.entries(VEHICLE_NAMES) as [id, name]}<div class="record"><span>{name} · {gameState.vehicles[id]?.owned ? "已拥有" : gameState.vehicles[id] ? "租用中" : "未拥有"}</span><div class="inline"><button onclick={() => active({ type: "vehicle", id, owned: true })}>授予所有权</button><button onclick={() => active({ type: "vehicle", id, owned: false })}>移除</button></div></div>{/each}<p class="hint">调试操作不处理租赁押金或退款。</p></div>
          <div class="tool-card"><h4>会籍</h4><div class="inline"><label>有效天数 <input class="short" type="number" min="0" max="3600" bind:value={memberDays} /></label>{#each Object.values(MEMBERSHIPS) as m}<button onclick={() => active({ type: "membership", id: m.id, days: memberDays })}>设置{m.name}</button><button onclick={() => active({ type: "membership", id: m.id, days: 0 })}>移除{m.name}</button>{/each}</div></div>
          <div class="tool-card"><h4>正式职业</h4><p>当前：{JOB_DEFS.find((j) => j.id === gameState.career.jobId)?.name ?? "没有正式岗位"}</p><p class="hint">调试入职绕过应聘属性要求，建立真实排班和发薪合同。换岗或离职时，旧岗位未发工资按正常离职规则结算。</p><div class="inline"><select class="grow" aria-label="选择正式岗位" bind:value={jobId}>{#each JOB_DEFS.filter((j) => j.kind === "formal") as job}<option value={job.id}>{job.name} · {job.id}</option>{/each}</select><button onclick={() => active({ type: "job", id: jobId })}>调试入职 / 换岗</button><button onclick={() => active({ type: "job", id: null })}>正常结算后离职</button></div></div>
          <div class="tool-card"><h4>宠物</h4><div class="inline"><select aria-label="选择猫咪" class="grow" bind:value={catId}>{#each CATS.filter((c) => c.rarity !== "boss") as cat}<option value={cat.id}>{cat.name} · {cat.id}</option>{/each}</select><button onclick={() => active({ type: "cat", id: catId })}>生成正式宠物</button><label>等级 <input class="short" type="number" min="1" max="100" bind:value={petLevel} /></label></div>{#each gameState.pets as pet}<div class="record"><span>{pet.icon} {pet.name} · Lv.{pet.level} · {pet.uid}</span><button onclick={() => active({ type: "catLevel", uid: pet.uid, level: petLevel })}>调整等级并补满照料</button></div>{/each}</div>
        {:else}
          <h3>状态与快照</h3><div class="tool-card"><h4>最近一次操作前</h4><p class="hint">恢复整局状态，包括物品、金钱、时间、任务和人物关系。只保留最近一次成功调试前的快照，退出或切换存档后不再可用。个人档案记录独立保存。</p><button class="primary" disabled={!canRestoreDeveloperSnapshot()} onclick={restoreDeveloperSnapshot}>恢复调试前快照</button></div>
          <div class="tool-card"><h4>完整游戏状态 JSON</h4><p class="hint">可以编辑职业、房产、股票、手机、成就及其他存档字段。导入先做格式与版本校验，成功后整局替换；开发者开关独立保存。请使用由这里导出的完整状态文件。</p><div class="inline"><button onclick={exportJson}>读取当前状态</button><button onclick={download}>下载JSON</button><label class="file-button">从文件载入<input type="file" accept="application/json,.json" onchange={loadFile} /></label><button class="primary" disabled={!json.trim()} onclick={() => { if (run({ type: "import", json })) jsonMessage = "导入成功"; }}>应用编辑后的完整状态</button></div><p class="hint" aria-live="polite">{jsonMessage}</p><textarea aria-label="完整游戏状态JSON" rows="18" spellcheck="false" bind:value={json} placeholder="点击“读取当前状态”，或从文件载入。"></textarea></div>
          <div class="tool-card"><h4>本次会话操作记录</h4>{#each developerState.history as line}<p class="history-line">{line}</p>{/each}{#if !developerState.history.length}<p class="hint">尚未执行调试操作。</p>{/if}</div>
        {/if}
      </div>
    </div>
    <footer class:error={developerState.error}><span role="status">{developerState.message || "调试工具已就绪 · 修改会保存到当前游戏"}</span><button disabled={!canRestoreDeveloperSnapshot()} onclick={restoreDeveloperSnapshot}>撤回最近调试</button></footer>
  </div>
</div>

<style>
  .warehouse-tools { position:sticky;top:-22px;z-index:2;margin:0 -4px 12px;padding:12px 4px 8px;background:#101923;box-shadow:0 8px 14px #101923dd;border-bottom:1px solid #344a5b; }
  .warehouse-categories { display:flex;flex-wrap:wrap;gap:6px; }
  .warehouse-categories button { display:flex;align-items:center;gap:7px;font-size:12px;padding:6px 10px;min-height:34px;white-space:nowrap; }
  .warehouse-categories button span { color:#8fa5b6;font-size:10px; }
  @media(max-width:760px){.warehouse-tools{top:-16px}.warehouse-categories{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}}
  @media(max-height:520px){.warehouse-tools{top:-12px;padding-top:6px}.warehouse-categories{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}}
  .developer-backdrop { position: fixed; inset: 0; z-index: 12000; background: #050b14e8; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); display: grid; place-items: center; color: #e9edf3; font: 14px/1.55 system-ui, sans-serif; }
  .developer-panel { width: min(1180px, 100%); height: min(850px, 100%); min-height: 0; display: flex; flex-direction: column; border: 1px solid #3e5467; border-radius: 18px; background: #101923; box-shadow: 0 30px 100px #0009; overflow: hidden; outline: none; }
  .developer-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 21px 26px 14px; background: linear-gradient(120deg, #213446, #142332); }
  .developer-kicker { color: #acbfcc; font-size: 10px; letter-spacing: .17em; } h2 { margin: 4px 0 0; font-size: 23px; } h2 span { font-size: 11px; padding: 3px 8px; border: 1px solid #528b78; border-radius: 20px; color: #b1e2c8; vertical-align: middle; margin-left: 8px; }
  .developer-context { display: flex; flex-wrap: wrap; gap: 5px 24px; padding: 10px 26px; border-bottom: 1px solid #2b3c4c; color: #abbfcc; font-size: 12px; }
  .developer-body { display: flex; flex: 1; min-height: 0; } nav { width: 180px; flex-shrink: 0; padding: 16px 12px; background: #0d151e; overflow-y: auto; border-right: 1px solid #283748; } nav button { display: flex; gap: 10px; align-items: center; width: 100%; margin-bottom: 5px; padding: 12px 10px; border: 0; background: transparent; text-align: left; } nav button span { width: 20px; color: #d2ad6a; font-size: 18px; }
  .developer-content { flex: 1; min-width: 0; overflow-y: auto; overscroll-behavior: contain; padding: 22px 26px 32px; scrollbar-gutter: stable; } h3 { margin: 0 0 8px; font-size: 21px; } h4 { margin: 0 0 12px; color: #eed19d; font-size: 15px; } p { margin: 8px 0; } .hint { color: #9aafbd; font-size: 12px; line-height: 1.7; }
  button, input, select, textarea { font: inherit; color: inherit; box-sizing: border-box; } button, .file-button { cursor: pointer; border: 1px solid #395065; border-radius: 7px; padding: 8px 12px; min-height: 38px; background: #1b2a38; touch-action: manipulation; } button:hover, .file-button:hover { background: #293d4e; border-color: #6c8da5; } button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible, .file-button:focus-within { outline: 2px solid #ffdb8d; outline-offset: 2px; } button:disabled { opacity: .4; cursor: default; } button.chosen { color: #ffdfa2; background: #383324; box-shadow: inset 3px 0 #f0c777; } button.primary { background: #dec087; color: #17212b; border-color: #dec087; font-weight: 600; } .close { flex-shrink: 0; }
  input, select, textarea { min-width: 0; max-width: 100%; border: 1px solid #3b5060; border-radius: 6px; background: #0c1620; padding: 8px 10px; min-height: 38px; } input[type="number"] { width: 120px; } input.short { width: 90px; } input[type="checkbox"] { width: 18px; min-height: 18px; accent-color: #dfbd7b; } input[type="file"] { width: 1px; height: 1px; min-height: 0; opacity: 0; position: absolute; overflow: hidden; } textarea { width: 100%; resize: vertical; font: 12px/1.6 ui-monospace, Consolas, monospace; tab-size: 2; } select { max-width: 100%; } label { display: inline-flex; align-items: center; gap: 7px; color: #c1cdd7; } .checkbox { padding: 6px; } .file-button { position: relative; }
  .tool-card { border: 1px solid #2d4050; border-radius: 11px; background: #14212d; padding: 16px; margin: 16px 0; } .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; } .two-col > .tool-card { margin: 0; } .two-col { margin: 16px 0; } .inline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 8px 0; } .grow { flex: 1 1 180px; } .field { display: grid; grid-template-columns: minmax(50px, 1fr) minmax(55px, 90px) auto; align-items: center; gap: 8px; margin: 9px 0; } .field input { width: 100%; } .record { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #2b3d4b; } .record > div:first-child { min-width: 0; } .record small { display: block; overflow-wrap: anywhere; color: #8fa5b6; font: 11px/1.6 ui-monospace, monospace; } .record-list { border-top: 1px solid #2b3d4b; } .compact { flex-shrink: 0; } .compact button { font-size: 12px; padding: 6px 10px; }
  .date-form input { width: 72px; } .date-form label:first-child input { width: 95px; } .task-status { padding: 12px 0; } .task-status p { color: #b5c5cf; font-size: 12px; } pre { max-width: 100%; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; color: #bed0dd; } summary { cursor: pointer; color: #c9b17f; } .flag-list { margin: 12px 0; } .flag-list button { display: flex; justify-content: space-between; gap: 15px; width: 100%; background: transparent; border: 0; border-bottom: 1px solid #2b3d4b; border-radius: 0; text-align: left; overflow-wrap: anywhere; font: 11px/1.6 ui-monospace, monospace; } .flag-list b { flex-shrink: 0; color: #dfc78c; } .history-line { font-size: 12px; color: #abbfcd; overflow-wrap: anywhere; }
  footer { padding: 10px 20px; background: #152c2c; border-top: 1px solid #35514f; color: #bee1d0; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; min-height: 58px; } footer.error { background: #39272a; color: #ffd0ca; border-color: #71474b; } footer button { flex-shrink: 0; }
  @media (max-width: 760px) { .developer-backdrop { padding: max(6px, env(safe-area-inset-top)) max(6px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(6px, env(safe-area-inset-left)); } .developer-panel { border-radius: 10px; height: 100%; } .developer-header { padding: 12px 14px; gap: 8px; } h2 { font-size: 18px; } .developer-context { padding: 8px 14px; gap: 3px 12px; } .developer-body { flex-direction: column; } nav { display: flex; width: auto; border-right: 0; border-bottom: 1px solid #283748; padding: 6px; overflow-x: auto; overflow-y: hidden; flex-shrink: 0; } nav button { width: auto; white-space: nowrap; margin: 0; padding: 8px 12px; } nav button span { display: none; } .developer-content { padding: 16px 14px 24px; } .two-col { grid-template-columns: 1fr; } .record { flex-wrap: wrap; gap: 5px; } .compact { margin: 2px 0; } footer { padding: 8px 12px; } }
  @media (max-height: 520px) and (min-width: 761px) { .developer-header { padding: 8px 18px; } h2 { font-size: 18px; } .developer-kicker { display: none; } .developer-context { padding: 5px 18px; } nav { width: 155px; padding: 8px; } nav button { padding: 8px; } .developer-content { padding: 12px 18px; } }
</style>
