<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { dialogueGlyphs, dialogueGlyphDelay } from '../../lib/dialogueReveal';
  import { fade } from "svelte/transition";
  import { motionDurationMs, motionEasing } from "../../lib/motion";
  import { gameState, replaceState } from "../../stores/gameStore.svelte";
  import { uiState, closeNpcTalk, showToast, openNpcTaskPanel } from "../../stores/uiStore.svelte";
  import { npcTaskImage } from '../../lib/npcTaskVisuals';
  import { formatDuration } from '../../game/core/quests';
  import { signed } from '../../lib/format';
  import {
    advanceNpcConversation,
    beginNpcFormalConversation,
    beginNpcConversation,
    beginNpcIntroduction,
    commitNpcConversation,
    npcFormalTopics,
    npcCasualTopics,
    npcConversationView,
    type NpcFormalTopic,
    type NpcConversationSession,
    type NpcConversationSummary,
  } from "../../game/core/npcTalk";
  import { getNpcDef, npcKnownName,npcDescriptor,npcConversationName, type NpcTalkOption } from "../../game/core/npcs";
  import {findRelationship} from '../../game/core/relationships';
  import {npcDialogueBeats} from '../../game/core/npcDialoguePlayback';
  import { weekdayOf } from "../../game/core/calendar";
  import { equippedClothing } from "../../game/core/clothing";
  import { npcWeatherOutfitForConditions, outfitContextForNpc } from "../../game/core/npcOutfits";
  import { currentSeason, currentWeather } from "../../game/core/weather";
  import {
    dialogueLines,
    dialoguePortraitSourceLineAt,
    dialogueSourceLineAt,
    npcPortraitForDialogue,
    preloadNpcPortraitArt,
    playerPortraitForReply,
    playerReplyText,
  } from "../../game/core/npcPortraits";
  import PortraitStack from "./PortraitStack.svelte";
  import {dialogueStageFor} from '../../game/core/npcDialogueStaging';

  const STAGE_LABELS = {
    meet: "初见",
    acquaintance: "相识",
    friend: "朋友",
    close_friend: "挚友",
  } as const;

  let session = $state<NpcConversationSession | null>(null);
  let summary = $state<NpcConversationSummary | null>(null);
  let errorText = $state("");
  let settlementError = $state("");
  let phase = $state<"npc" | "player">("npc");
  let lineIndex = $state(0);
  let queuedReply = $state<{
    session: NpcConversationSession;
    previousSession: NpcConversationSession;
    option: NpcTalkOption;
    text: string;
    sourceText:string;
  } | null>(null);
  let rememberedPortraitLines=$state<Record<string,string>>({});
  // 这是一个只跟随当前入口的非响应式标记。它不能改成 $state：初始化
  // effect 自己会写回该值，若追踪它会形成 effect 自触发循环。
  let activeTrigger = "";

  const npcId = $derived(uiState.npcTalk?.npcId ?? "");
  const def = $derived(npcId ? getNpcDef(npcId) : undefined);
  const formalTopics = $derived(
    uiState.npcTalk?.entry === "formal-menu" || uiState.npcTalk?.entry === "choose"
      ? npcFormalTopics(gameState, npcId)
      : [],
  );
  const casualTopics = $derived(uiState.npcTalk?.entry === "chat-menu" ? npcCasualTopics(gameState, npcId) : []);
  const view = $derived(session ? npcConversationView(gameState, session) : null);
  // 打开入口后，Svelte effect 需要一个渲染周期创建临时会话；这段时间不能
  // 误显示成“对话内容暂缺”，否则用户会以为 NPC 没有台词。
  const dialoguePreparing = $derived(
    !!uiState.npcTalk
      && uiState.npcTalk.entry !== "choose"
      && uiState.npcTalk.entry !== "formal-menu"
      && uiState.npcTalk.entry !== "chat-menu"
      && !session && !summary && !errorText,
  );
  const stageLabel = $derived(view ? STAGE_LABELS[view.stageKey] : "交流");
  const conversationLabel = $derived(
    !view ? "交流"
      : view.conversationKind === "introduction" ? (view.conversationTitle ?? "共同初见")
      : view.conversationKind === "topic" ? (view.conversationTitle ?? "聊聊近况")
      : view.conversationKind === "context" ? (view.conversationTitle ?? "忙里说两句")
      : view.conversationKind === "task" ? (view.conversationTitle ?? "办理委托")
      : view.conversationKind === "meet" ? "首次相遇"
          : view.conversationKind === "greeting" ? "打个招呼"
            : view.conversationKind === "daily" ? "日常交流"
              : view.conversationKind === "limit" ? "今天先聊到这里"
              : view.conversationKind === 'group' ? (view.conversationTitle??'三人对话')
              : view.conversationKind === "formal" ? (view.conversationTitle ?? "正式对话")
              : view.conversationKind === "event"
                ? (view.conversationTitle && !view.conversationTitle.startsWith("触发条件：")
                  ? `特殊事件 · ${view.conversationTitle}`
                : "特殊事件")
              : stageLabel,
  );
  const currentNpcBeats=$derived(npcDialogueBeats(view?.text??'',npcId,view?.speeches));
  const currentNpcLines = $derived(currentNpcBeats.map(beat=>beat.text));
  const currentBeat=$derived(currentNpcBeats[Math.min(lineIndex,Math.max(0,currentNpcBeats.length-1))]);
  const speakingActorId=$derived(phase==='player'?'player':currentBeat?.speakerId??null);
  const groupCast=$derived(view?.participants??[]);
  const groupConversation=$derived(groupCast.length>1);
  const focusedNpcId=$derived([...currentNpcBeats.slice(0,phase==='player'?currentNpcBeats.length:Math.min(lineIndex+1,currentNpcBeats.length))].reverse().find(beat=>groupCast.includes(beat.speakerId??''))?.speakerId??groupCast[0]??npcId);
  const currentLines = $derived(
    phase === "player" ? dialogueLines(queuedReply?.text ?? "") : currentNpcLines,
  );
  // 台词读完后回答栏才出现，但底部仍保留刚读完的最后一句，不留空框。
  const currentLine = $derived(
    currentLines[lineIndex] ?? currentLines[currentLines.length - 1] ?? "",
  );
  const currentNpcPortraitLine = $derived(
    view?.speeches ? (phase==='npc'&&currentBeat?.speakerId===npcId?currentBeat.portraitText:rememberedPortraitLines[npcId]??'') : (dialoguePortraitSourceLineAt(
      view?.text ?? "",
      phase === "npc" ? lineIndex : Math.max(0,currentNpcLines.length-1),
      npcId,
    )
      || (phase === "npc" ? currentLine : currentNpcLines[currentNpcLines.length-1] ?? "")),
  );
  const canAdvanceDialogue = $derived(
    !!session && !summary && currentLines.length > 0 && lineIndex < currentLines.length,
  );
  const choicesVisible = $derived(
    phase === "npc" && !!session && !!view && lineIndex >= currentNpcLines.length,
  );
  let reducedDialogueMotion=$state(false);
  let revealState=$state({key:'',count:0});
  const revealKey=$derived([npcId,uiState.npcTalk?.entry,view?.nodeId,phase,lineIndex,currentLine].join('\u001f'));
  const revealGlyphs=$derived(dialogueGlyphs(currentLine));
  const spokenNpcLine=$derived(canAdvanceDialogue&&phase==='npc'&&speakingActorId!==null&&speakingActorId!=='player');
  const lineRevealed=$derived(!spokenNpcLine||reducedDialogueMotion||(revealState.key===revealKey&&revealState.count>=revealGlyphs.length));
  const displayedLine=$derived(lineRevealed?currentLine:revealGlyphs.slice(0,revealState.key===revealKey?revealState.count:0).join(''));
  onMount(()=>{
    const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if(!media)return;
    const update=()=>{reducedDialogueMotion=media.matches;};update();
    media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update);
  });
  $effect(()=>{
    const key=revealKey,glyphs=revealGlyphs,animate=spokenNpcLine&&!reducedDialogueMotion;
    untrack(()=>{if(revealState.key!==key)revealState={key,count:animate?0:glyphs.length};});
    if(!animate)return;
    let timer:ReturnType<typeof setTimeout>;
    function step(){
      const current=untrack(()=>revealState);
      if(current.key!==key||current.count>=glyphs.length)return;
      revealState={key,count:current.count+1};
      timer=setTimeout(step,dialogueGlyphDelay(glyphs[current.count]));
    }
    timer=setTimeout(step,32);return()=>clearTimeout(timer);
  });
  const lastReply = $derived(
    phase === "player"
      ? dialogueSourceLineAt(queuedReply?.sourceText ?? "",lineIndex)
      : currentBeat?.speakerId==='player'?currentBeat.portraitText:"",
  );
  $effect(() => {
    if(npcId)void preloadNpcPortraitArt(npcId,currentOutfitContext,npcWeatherOutfitForConditions(currentSeason(gameState),currentWeather(gameState)))
      .catch(error=>console.warn('NPC portrait preload failed',error));
  });

  const currentOutfitContext = $derived(outfitContextForNpc(
    npcId,
    gameState.locationId,
    { ...gameState.time, seed: gameState.rng.seed, weekday: weekdayOf(gameState.time), hour: gameState.time.hour, minute: gameState.time.minute },
  ));
  const playerPortrait = $derived(playerPortraitForReply(lastReply, equippedClothing(gameState)));
  const npcPortrait = $derived(view
    ? npcPortraitForDialogue(
      npcId,
      currentNpcPortraitLine,
      view.stageKey,
      view.nodeId,
      true,
      currentOutfitContext,
      npcWeatherOutfitForConditions(currentSeason(gameState), currentWeather(gameState)),
    )
    : null);
  const portraitStage=$derived(dialogueStageFor(npcId,npcPortrait,groupCast));
  const supportingInfo=$derived(groupCast.filter(id=>id!==npcId).map(id=>{
    const r=findRelationship(gameState,id),stageKey=r&&(r.state==='lover'||r.affinity>=70)?'close_friend' as const:r&&r.affinity>=40?'friend' as const:'acquaintance' as const;
    const outfit=outfitContextForNpc(id,gameState.locationId,{...gameState.time,seed:gameState.rng.seed,weekday:weekdayOf(gameState.time)});
    const weather=npcWeatherOutfitForConditions(currentSeason(gameState),currentWeather(gameState));
    return{id,stageKey,outfit,weather};
  }));
  $effect(()=>{for(const info of supportingInfo)void preloadNpcPortraitArt(info.id,info.outfit,info.weather).catch(error=>console.warn('NPC portrait preload failed',error));});
  const npcActors=$derived((groupConversation?groupCast:[npcId]).map(id=>{
    if(id===npcId)return{id,portrait:npcPortrait,stage:portraitStage.npc,displayName:view?.participantNames?.[id]??view?.displayName??'',descriptor:view?.descriptor??''};
    const info=supportingInfo.find(actor=>actor.id===id)!;
    const line=phase==='npc'&&currentBeat?.speakerId===id?currentBeat.portraitText:rememberedPortraitLines[id]??'';
    const portrait=npcPortraitForDialogue(id,line,info.stageKey,view?.nodeId??'',true,info.outfit,info.weather);
    return{id,portrait,stage:dialogueStageFor(id,portrait,groupCast).npc,displayName:view?.participantNames?.[id]??npcConversationName(id,info.stageKey),descriptor:npcDescriptor(id)};
  }));
  const speakerName=$derived(speakingActorId==='player'?gameState.player.name:speakingActorId===null?'旁白':npcActors.find(actor=>actor.id===speakingActorId)?.displayName??view?.displayName??'');
  const speakerTag=$derived(speakingActorId==='player'?'你的回应':speakingActorId===null?'场景':'正在说话');
  $effect(()=>{const beat=currentBeat;if(view?.speeches&&phase==='npc'&&beat?.speakerId&&beat.speakerId!=='player'&&untrack(()=>rememberedPortraitLines[beat.speakerId!])!==beat.portraitText)rememberedPortraitLines={...untrack(()=>rememberedPortraitLines),[beat.speakerId]:beat.portraitText};});

  /** 每次打开入口只创建一次临时会话；关闭后清空，不写入 GameState。 */
  $effect(() => {
    const trigger = uiState.npcTalk;
    const key = trigger ? `${trigger.entry}:${trigger.npcId}:${trigger.topicId ?? ""}` : "";
    if (!trigger || !key) {
      activeTrigger = "";
      session = null;
      summary = null;
      errorText = "";
      return;
    }
    if (key === activeTrigger) return;

    activeTrigger = key;
    summary = null;
    errorText = "";
    phase = "npc";
    settlementError = "";
    lineIndex = 0;
    queuedReply = null;
    rememberedPortraitLines={};
    session = null;

    if (trigger.entry === "choose" || trigger.entry === "formal-menu" || trigger.entry === "chat-menu") return;

    // beginNpcConversation / npcConversationView 只是在当前状态上读取数据。
    // 不让这个 effect 订阅整份 gameState，否则场景状态变化时可能重复清空并
    // 重建会话；同时用 try/catch 把旧存档或异常数据从“永久加载”变成可关闭错误。
    try {
      const started = untrack(() => trigger.entry === "introduction" ? beginNpcIntroduction(gameState, trigger.topicId ?? "") : trigger.entry === "formal"
        ? beginNpcFormalConversation(gameState, trigger.npcId, trigger.topicId ?? "")
        : beginNpcConversation(gameState, trigger.npcId, trigger.entry as "meet" | "chat", trigger.topicId));
      if (!started.ok || !started.session) {
        session = null;
        errorText = started.reason ?? "现在还不能开始这段对话";
        return;
      }
      // 开始时就验证一次视图，避免异常数据进入“有会话但没有内容”的空白界面。
      // 正常情况下该校验永远成功；失败时给出明确的可关闭错误，而不是静默空框。
      if (!untrack(() => npcConversationView(gameState, started.session!))) {
        session = null;
        errorText = "这段交流暂时无法载入，请稍后再试";
        return;
      }
      session = started.session;
    } catch (error) {
      console.error("Failed to initialize NPC conversation", error);
      session = null;
      errorText = "这段交流暂时无法载入，请稍后再试";
    }
  });

  // 对话进行中也允许随时退出，避免误触 NPC 后只能把整段对话走完。
  $effect(() => {
    if (!uiState.npcTalk) return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (uiState.npcTaskPanel) return;
      event.preventDefault();
      exitDialogue();
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  function settle(endedSession: NpcConversationSession, previousSession: NpcConversationSession): boolean {
    try {
      const committed = commitNpcConversation(gameState, endedSession);
      if (!committed.ok || !committed.summary) {
        settlementError = committed.reason ?? "这段对话暂时无法结算，请重选回答或结束对话";
        session = previousSession;
        phase = "npc";
        const previousView = npcConversationView(gameState, previousSession);
        lineIndex = dialogueLines(previousView?.text ?? "").length;
        queuedReply = null;
        showToast(`🚫 ${committed.reason ?? "这段对话暂时无法结算"}`);
        return false;
      }
      if (committed.state) replaceState(committed.state, { sameSession: true });
      session = endedSession;
      queuedReply = null;
      phase = "npc";
      summary = committed.summary;
      settlementError = "";
      return true;
    } catch (error) {
      console.error("Failed to settle NPC conversation", error);
      session = previousSession;
      phase = "npc";
      queuedReply = null;
      lineIndex = dialogueLines(npcConversationView(gameState, previousSession)?.text ?? "").length;
      showToast("这次交流未能完成，请重选回答或结束对话；进度不会重复结算");
      settlementError = "这次交流未能完成，请重新选择回答，或点击结束对话返回场景";
      return false;
    }
  }

  function pick(index: number): void {
    if (!session || !choicesVisible || !view) return;
    settlementError = "";
    const previousSession = session;
    const advanced = advanceNpcConversation(gameState, session, index);
    if (!advanced.ok || !advanced.session) {
      settlementError = advanced.reason ?? "这段交流暂时不能继续，请重新选择或结束对话";
      showToast(`🚫 ${advanced.reason ?? "没法继续聊"}`);
      return;
    }
    const option = view.options[index];
    if (!option) return;
    // 确认任务动作当场提交；结束对话不会撤销已经确认的交接或付款。
    if (previousSession.npcTaskTopicId && advanced.session.status === 'ended') {
      settle(advanced.session, previousSession);
      return;
    }
    const replyText = playerReplyText(option, gameState.player.name);
    // v1.43.1 防御：以「清洗后能否产出至少一行」为准。原始文本非空但清洗后为空
    // （例如整段只是无法保留的括号动作）时，若进入玩家阶段将没有任何可播放/可点击
    // 内容 → 真卡死。这种情况直接按「无需播放」处理，立即推进到下一节点。
    const replyLines = replyText ? dialogueLines(replyText) : [];
    // 离开/结束交流是界面操作，不再把它伪装成主角的一句台词；没有
    // 可播放的主角回应时也直接进入下一节点，避免空白或万能应答。
    if (option.leave || replyLines.length === 0) {
      if (advanced.session.status === "ended") {
        const settled = settle(advanced.session, previousSession);
        if (settled && option.leave) closeNpcTalk();
      } else {
        session = advanced.session;
        phase = "npc";
        lineIndex = 0;
      }
      return;
    }
    queuedReply = {
      session: advanced.session,
      previousSession,
      option,
      text: replyText,
      sourceText:option.playerReply?.trim()||option.label,
    };
    phase = "player";
    lineIndex = 0;
  }

  function advanceDialogue(): void {
    if (!canAdvanceDialogue || !session) return;
    if(!lineRevealed){revealState={key:revealKey,count:revealGlyphs.length};return;}
    if (lineIndex + 1 < currentLines.length) {
      lineIndex += 1;
      return;
    }

    if (phase === "player") {
      const next = queuedReply;
      if (!next) return;
      if (next.session.status === "ended") {
        settle(next.session, next.previousSession);
        return;
      }
      session = next.session;
      queuedReply = null;
      phase = "npc";
      lineIndex = 0;
      return;
    }

    // 最后一行 NPC 台词读完后，再显示回答栏；不把选项和台词挤在同一拍。
    lineIndex = currentLines.length;
  }

  function exitDialogue(): void {
    // Escape 与显式结束共用此出口。普通未完成交流直接丢弃临时会话；
    // 第四、五次边界提示则需要记录一次，其中第五次统一扣 2 点好感。
    if (session?.chatLimitNotice && !summary) {
      const ended: NpcConversationSession = session.status === "ended"
        ? session
        : { ...session, status: "ended", endReason: "leave" };
      settle(ended, session);
      return;
    }
    closeNpcTalk();
  }

  function chooseChat(): void {
    if (!npcId) return;
    uiState.npcTalk = { npcId, entry: "chat-menu" };
  }

  function chooseCasualTopic(topicId: string): void {
    const topic = casualTopics.find(candidate => candidate.id === topicId);
    if (!npcId || !topic) return;
    if (topic.playerThought) { showToast(`你心想：${topic.playerThought}`); return; }
    uiState.npcTalk = { npcId, entry: 'chat', topicId };
  }

  function chooseFormal(): void {
    if (!npcId) return;
    uiState.npcTalk = { npcId, entry: "formal-menu" };
  }

  function startFormalTopic(topic: NpcFormalTopic): void {
    if (!npcId) return;
    uiState.npcTalk = { npcId, entry: "formal", topicId: topic.id };
  }

  function returnToInteractionChoice(): void {
    if (!npcId) return;
    uiState.npcTalk = { npcId, entry: "choose" };
  }

  /** v1.43.1：剩余未读句数，用于进度提示，消除“台词被截断”的错觉。 */
  const remainingLines = $derived(Math.max(0, currentLines.length - lineIndex - 1));

  /**
   * v1.43.1 修复：点击舞台任意区域即可推进台词（呼应「点击任意处继续对话」提示）。
   * 这是唯一的推进入口——台词框、立绘、姓名/角色标签都不再是独立的点击句柄，
   * 全部冒泡到本函数统一处理，从根本上消除「点了没反应、只有结束按钮能用」的卡死感。
   *
   * 仅「选择回答 / 结束对话 / 继续」这类真正要执行动作的可交互按钮被拦截，
   * 其余区域（台词框、立绘、空白）一律视为「推进」。
   */
  function onStageClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".choice-btn, .continue-btn, .end-dialogue-btn, .choice-end-btn")) return;
    if (canAdvanceDialogue) advanceDialogue();
  }
</script>

{#if uiState.npcTalk}
  <div class="npc-overlay" transition:fade={{ duration: motionDurationMs("--dur-base"), easing: motionEasing("--ease-out") }}>
    <div
      class="npc-stage"
      role="dialog"
      aria-modal="true"
      aria-label={groupConversation?`与${npcActors.map(actor=>npcKnownName(actor.id)).join('、')}对话`:def ? `与${npcKnownName(npcId)}对话` : "与 NPC 对话"}
      tabindex="-1"
      onclick={onStageClick}
      onkeydown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !(event.target as Element)?.closest("button")) {
          event.preventDefault();
          onStageClick(event);
        }
      }}
    >
      {#if uiState.npcTalk?.entry === "choose"}
        <section class="interaction-menu" aria-label="选择交谈方式">
          <div class="interaction-kicker">与 NPC 交流</div>
          <h2>和{npcKnownName(npcId)}聊些什么？</h2>
          <p>闲聊日常和人物故事；正式对话办理任务，不占用闲聊次数。</p>
          <button type="button" class="interaction-option" onclick={chooseChat}>
            <span>💬 闲聊</span><small>日常问候与轻松交流</small>
          </button>
          <button type="button" class="interaction-option" onclick={chooseFormal}>
            <span>📌 正式对话</span><small>{formalTopics.length > 0 ? "任务接取、跟进与交付" : "暂时没有需要办理的任务"}</small>
          </button>
          <button type="button" class="menu-cancel" onclick={closeNpcTalk}>暂不交谈</button>
        </section>
      {:else if uiState.npcTalk?.entry === "chat-menu"}
        <section class="formal-topics-panel" aria-label="闲聊话题">
          <header class="topics-head"><div><div class="interaction-kicker">闲聊</div><h2>和{npcKnownName(npcId)}聊点日常</h2></div><button type="button" class="end-dialogue-btn" onclick={returnToInteractionChoice}>返回</button></header>
          <div class="formal-topic-list">
            <button type="button" class="formal-topic" onclick={() => uiState.npcTalk = { npcId, entry: "chat" }}><strong>随便聊聊</strong><small>打个招呼，随机聊一件还没说过的事。</small></button>
            {#each casualTopics as topic (topic.id)}
              <button type="button" class="formal-topic" data-casual-topic={topic.id} onclick={() => chooseCasualTopic(topic.id)}><strong>{topic.label}</strong><small>{topic.description}</small></button>
            {/each}
          </div>
          <div class="topics-foot"><button type="button" class="menu-cancel" onclick={closeNpcTalk}>结束</button></div>
        </section>
      {:else if uiState.npcTalk?.entry === "formal-menu"}
        <section class="formal-topics-panel" aria-label="正式对话话题">
          <header class="topics-head">
            <div>
              <div class="interaction-kicker">正式对话</div>
              <h2>和{npcKnownName(npcId)}商量事情</h2>
            </div>
            <button type="button" class="end-dialogue-btn" onclick={returnToInteractionChoice}>返回</button>
          </header>
          {#if formalTopics.length === 0}
            <div class="topics-empty">似乎没什么重要的事情</div>
          {:else}
            <div class="formal-topic-list">
              {#each formalTopics as topic (topic.id)}
                <button type="button" class="formal-topic" onclick={() => startFormalTopic(topic)}>
                  <span class="topic-category">{topic.category === "done" ? "已完成" : topic.category === "failed" ? "未完成" : topic.category === "delivery" ? "待交付" : topic.category === "active" ? "进行中" : "委托"}</span>
                  <strong>{topic.label}</strong>
                  <small>{topic.description}</small>
                </button>
              {/each}
            </div>
          {/if}
          <div class="topics-foot">
            <button type="button" class="menu-cancel" onclick={closeNpcTalk}>结束</button>
          </div>
        </section>
      {:else if errorText}
        <section class="dialogue-error" aria-live="polite">
          <div class="error-title">对话暂时无法开始</div>
          <p>{errorText}</p>
          <button type="button" class="continue-btn" onclick={exitDialogue}>继续</button>
        </section>
      {:else if summary}
        <header class="stage-head result-head">
          <div>
            <div class="eyebrow">交流结束</div>
            <div class="stage-title">{npcKnownName(npcId) || "这段对话"}</div>
          </div>
          <div class="stage-state">{summary.endReason === "leave" ? "你选择了离开" : "这次交流告一段落"}</div>
        </header>

        <section class="result-panel" aria-live="polite">
          <div class="result-kicker">本次交流</div>
          <p class="result-text">{summary.text}</p>
          {#if summary.artId && npcTaskImage(summary.artId)}
            <button class="task-art-card" onclick={() => openNpcTaskPanel({ kind: 'art', artId: summary!.artId! })}>
              <img src={npcTaskImage(summary.artId)} alt="这次委托的事件图卡" /><span>查看事件图卡</span>
            </button>
          {/if}
          {#if summary.deltas.length > 0}
            <div class="result-deltas" aria-label="本次变化">
              {#each summary.deltas as delta (`${delta.key}:${delta.value}`)}
                <div class="result-delta" class:negative={delta.value < 0}>
                  <span>{delta.label}</span>
                  <strong>{signed(delta.value)}</strong>
                </div>
              {/each}
            </div>
          {:else}
            <div class="quiet-result">没有发生额外变化。</div>
          {/if}
          {#if summary.commissionTitles.length > 0 || summary.contactAdded}
            <div class="result-extras" aria-label="任务与联系人变化">
              {#if summary.commissionTitles.length > 0}
                <div>任务：{summary.commissionTitles.join("、")}</div>
              {/if}
              {#if summary.contactAdded}
                <div>联系人：已新增 {summary.contactNames?.join('、')??npcKnownName(npcId)??"NPC"}</div>
              {/if}
            </div>
          {/if}
          <div class="result-foot">
            {#if summary.timeCost > 0}
              本次办理消耗 {formatDuration(summary.timeCost)}
            {:else}
              没有消耗时间
            {/if}
          </div>
        </section>

        <div class="result-actions">
          <button type="button" class="continue-btn" onclick={exitDialogue}>继续</button>
        </div>
      {:else if view && session}
        <header class="stage-head">
          <div>
            <div class="eyebrow">{groupConversation?'三人交流':'NPC 交流'}</div>
            <div class="stage-title">{conversationLabel}</div>
          </div>
          <div class="stage-actions">
            <div class="stage-state">{view.stateLabel}</div>
            <button type="button" class="end-dialogue-btn" onclick={exitDialogue} aria-label="结束当前对话">结束对话</button>
          </div>
        </header>

        <main
          class="character-layout"
          class:choices-visible={choicesVisible}
          class:group-conversation={groupConversation}
          class:tall-group={groupCast.includes('npc_jack_fanma')}
          data-node-id={view.nodeId}
          data-conversation-kind={view.conversationKind}
          data-speaker-id={speakingActorId??'narrator'}
          data-group-scene={session.groupSceneId ?? session.introductionId}
        >
          <section class="character-side player-side" class:speaking={speakingActorId==='player'} aria-label="玩家立绘位置" style={portraitStage.player.css} data-height-cm={portraitStage.player.heightCm}>
            <div class="portrait-slot player-portrait-slot" data-portrait-variant={playerPortrait.variant} data-portrait-intensity={playerPortrait.moodIntensity??0} data-portrait-visual-level={playerPortrait.visualLevel??0}>
              <div class="portrait-mount" data-portrait-mount="player">
                <PortraitStack
                  portrait={playerPortrait}
                  className="portrait-image player-portrait-image"
                  alt={`${gameState.player.name}的人物立绘`}
                  zoomable
                />
              </div>
            </div>
            <div class="character-name">{gameState.player.name}</div>
            <div class="character-role">玩家</div>
          </section>

          <section class="choice-panel" class:choice-hidden={!choicesVisible} aria-label="回答选项" aria-hidden={!choicesVisible}>
            {#if choicesVisible}
              <div class="choice-kicker">选择你的回答</div>
              {#if settlementError}<p class="choice-error" role="alert">{settlementError}</p>{/if}
              <div class="choice-list">
                {#each view.options as option, index (`${view.nodeId}:${index}:${option.label}`)}
                  <button
                    type="button"
                    class="choice-btn"
                    class:leave-choice={option.leave}
                    disabled={!!option.disabledReason}
                    title={option.disabledReason}
                    onclick={() => pick(index)}
                  >
                    <span>{option.label}</span>
                    {#if option.disabledReason}<small>{option.disabledReason}</small>{/if}
                    {#if option.leave}<small>离开</small>{/if}
                  </button>
                {/each}
              </div>
              <!-- v1.43.1：选项旁补一个显式「结束对话」，避免玩家只看到顶部角落的入口 -->
              <div class="choice-foot">
                <button type="button" class="choice-end-btn" onclick={exitDialogue}>结束对话</button>
              </div>
            {/if}
          </section>

          <div class="npc-cast" class:paired={groupConversation} aria-label={groupConversation?'同场 NPC 立绘':'NPC 立绘'}>
          {#each npcActors as actor,index(actor.id)}
          <section class="character-side npc-side" class:actor-departed={view.presentParticipants && !view.presentParticipants.includes(actor.id)} aria-hidden={view.presentParticipants && !view.presentParticipants.includes(actor.id)} class:speaking={speakingActorId===actor.id} class:in-front={focusedNpcId===actor.id} aria-label={groupConversation?`${actor.displayName}立绘位置`:'NPC 立绘位置'} style={`${actor.stage.css}--cast-slot:${index};`} data-npc-id={actor.id} data-height-cm={actor.stage.heightCm} data-speaking={speakingActorId===actor.id} data-in-front={focusedNpcId===actor.id}>
            <div
              class="portrait-slot npc-portrait-slot"
              data-portrait-variant={actor.portrait?.variant ?? "default"}
              data-portrait-emotion={actor.portrait?.moodCode ?? "$0"}
              data-portrait-intensity={actor.portrait?.moodIntensity ?? 0}
              data-portrait-visual-level={actor.portrait?.visualLevel??0}
              data-portrait-category={actor.portrait?.emotionCategory??'neutral'}
              data-portrait-mask="none"
              data-portrait-face="clear"
            >
              <div class="portrait-mount" data-portrait-mount="npc">
                <PortraitStack
                  portrait={actor.portrait}
                  className="portrait-image npc-portrait-image"
                  alt={`${actor.displayName}的人物立绘`}
                  zoomable
                />
              </div>
            </div>
            <div class="character-name">{actor.displayName}</div>
            <div class="character-role">{actor.descriptor}</div>
          </section>
          {/each}
          </div>
        </main>

        <button
          type="button"
          class="dialogue-box"
          class:dialogue-can-advance={canAdvanceDialogue}
          class:dialogue-awaiting-choice={choicesVisible}
          class:group-dialogue={groupConversation}
          tabindex={canAdvanceDialogue ? 0 : -1}
          aria-label={canAdvanceDialogue ? lineRevealed ? "点击任意处继续播放台词" : "点击任意处显示完整台词" : "当前台词"}
          onclick={(event) => { event.stopPropagation(); advanceDialogue(); }}
        >
          <div class="speaker-line">
            <span class="speaker-name">{speakerName}</span>
            <span class="speaker-tag">{speakerTag}</span>
            {#if currentLines.length > 1}
              <span class="line-counter">第 {Math.min(lineIndex + 1, currentLines.length)} / {currentLines.length} 句</span>
            {/if}
          </div>
          <p aria-label={currentLine} aria-busy={!lineRevealed} data-revealing={!lineRevealed}>{displayedLine}</p>
          <span class="speech-announcement" role="status" aria-live="polite">{currentLine}</span>
          {#if canAdvanceDialogue}
            <span class="advance-hint">
              {!lineRevealed ? `正在说话 · 点击显示整段${remainingLines>0?` · 还有 ${remainingLines} 句`:''}` : remainingLines > 0 ? `还有 ${remainingLines} 句 · 点击任意处朗读下一句` : "点击任意处进入回答"}
            </span>
          {:else if choicesVisible}
            <span class="advance-hint choice-hint">↑ 请在上方选择你的回答，或点右上角「结束对话」</span>
          {/if}
        </button>
      {:else if dialoguePreparing}
        <section class="dialogue-loading" aria-live="polite">
          <div class="loading-title">正在准备对话</div>
          <p>正在载入这段交流……</p>
        </section>
      {:else}
        <section class="dialogue-error" aria-live="polite">
          <div class="error-title">对话内容暂缺</div>
          <p>这段交流还没有准备好。</p>
          <button type="button" class="continue-btn" onclick={exitDialogue}>继续</button>
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .speech-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .dialogue-box p { min-height: 1.75em; }
  .task-art-card { display: flex; align-items: center; gap: 12px; padding: 8px; margin: 12px 0; border: 1px solid var(--stroke, #4c566a); border-radius: 10px; background: #ffffff09; color: inherit; cursor: pointer; }
  .task-art-card img { width: 128px; height: 72px; object-fit: cover; border-radius: 6px; }
  .choice-btn:disabled { opacity: .55; cursor: default; }
  .npc-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: flex;
    align-items: stretch;
    justify-content: center;
    padding: 0;
    color: #f4f1e9;
    background: rgba(0, 0, 0, 0.08);
    backdrop-filter: blur(2px);
  }

  .npc-stage {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0;
    outline: none;
    overflow: clip;
  }

  .interaction-menu,
  .formal-topics-panel {
    grid-row: 2;
    align-self: center;
    justify-self: center;
    width: min(560px, calc(100% - 32px));
    max-height: min(78vh, 720px);
    box-sizing: border-box;
    overflow: auto;
    padding: clamp(20px, 4vw, 34px);
    border: 1px solid rgba(255, 218, 146, 0.3);
    border-radius: 18px;
    background: linear-gradient(145deg, rgba(15, 25, 42, 0.97), rgba(23, 29, 47, 0.96));
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.45);
  }

  .interaction-kicker { color: #e7c57e; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; }
  .interaction-menu h2,
  .topics-head h2 { margin: 6px 0 0; color: #fff7df; font-size: clamp(20px, 3vw, 27px); }
  .interaction-menu > p { margin: 10px 0 20px; color: rgba(255, 255, 255, 0.67); font-size: 13px; line-height: 1.6; }

  .interaction-option,
  .formal-topic {
    width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 5px;
    padding: 14px 16px; border: 1px solid rgba(255, 255, 255, 0.13); border-radius: 12px;
    background: rgba(255, 255, 255, 0.055); color: #fff5d9; font: inherit; text-align: left; cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }
  .interaction-option + .interaction-option { margin-top: 10px; }
  .interaction-option span { font-size: 16px; font-weight: 800; }
  .interaction-option small,
  .formal-topic small { color: rgba(255, 255, 255, 0.62); line-height: 1.5; }
  .interaction-option:hover,
  .formal-topic:hover { border-color: rgba(255, 218, 146, 0.65); background: rgba(119, 91, 43, 0.2); transform: translateY(-1px); }
  .menu-cancel { min-height: 38px; padding: 7px 15px; border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 999px; background: transparent; color: rgba(255, 255, 255, 0.72); font: inherit; font-size: 12px; cursor: pointer; }
  .interaction-menu > .menu-cancel { display: block; margin: 16px auto 0; }
  .topics-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .topics-empty { padding: 40px 10px; color: rgba(255, 255, 255, 0.72); text-align: center; }
  .formal-topic-list { display: grid; gap: 9px; margin-top: 18px; }
  .formal-topic { display: grid; grid-template-columns: auto 1fr; column-gap: 10px; }
  .formal-topic strong { align-self: center; font-size: 14px; }
  .formal-topic small { grid-column: 2; font-size: 12px; }
  .topic-category { align-self: center; padding: 4px 7px; border-radius: 999px; background: rgba(255, 218, 146, 0.12); color: #f0d28d; font-size: 10px; font-weight: 800; white-space: nowrap; }
  .topics-foot { display: flex; justify-content: center; margin-top: 16px; }

  @media (max-width: 600px) {
    .interaction-menu,
    .formal-topics-panel { width: calc(100% - 20px); max-height: 84vh; padding: 18px; }
    .formal-topic { grid-template-columns: 1fr; }
    .formal-topic small { grid-column: 1; }
  }

  .stage-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 18px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.56);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
    margin: 12px clamp(12px, 3vw, 42px) 0;
  }

  .eyebrow,
  .choice-kicker,
  .result-kicker {
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .stage-title {
    margin-top: 2px;
    color: #fff7df;
    font-size: clamp(17px, 2vw, 24px);
    font-weight: 800;
  }

  .stage-state {
    flex: 0 0 auto;
    color: rgba(255, 255, 255, 0.72);
    font-size: 12px;
  }

  .stage-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex: 0 0 auto;
  }

  .end-dialogue-btn {
    min-height: 34px;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.34);
    color: rgba(255, 255, 255, 0.76);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }

  .end-dialogue-btn:hover {
    border-color: rgba(255, 218, 146, 0.62);
    background: rgba(87, 64, 31, 0.62);
    color: #fff3d0;
  }

  .character-layout {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 330px) minmax(0, 1fr);
    grid-template-areas: "player choices npc";
    align-items: end;
    gap: clamp(12px, 2vw, 32px);
    padding: 0 clamp(12px, 3vw, 42px);
  }

  .character-layout:not(.choices-visible) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas: "player npc";
  }

  .player-side { grid-area: player; }
  .choice-panel { grid-area: choices; }
  .npc-side { grid-area: npc; }
  .npc-side.actor-departed { visibility:hidden; pointer-events:none; }
  .npc-cast {grid-area:npc;position:relative;min-width:0;min-height:0;height:100%;}

  .character-side {
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
  }

  .portrait-slot {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: flex;
    position: relative;
    align-items: flex-start;
    justify-content: center;
    /* Both actors share a half-body window, while original canvases stay intact. */
    overflow: hidden;
  }

  .portrait-mount {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: visible;
    /* Percentage framing follows the stage consistently at every UI zoom. */
  }

  :global(.portrait-stack[data-portrait-class~="portrait-image"]) {
    position: absolute;
    top: var(--dialogue-art-top, 0);
    bottom: auto;
    left: 50%;
    width: auto;
    aspect-ratio: 1024 / 1536;
    max-width: none;
    height: var(--dialogue-art-height, 210%);
    filter: drop-shadow(0 16px 16px rgba(0, 0, 0, 0.4));
    pointer-events: none;
    user-select: none;
  }

  :global(.portrait-stack[data-portrait-class~="portrait-image"] .portrait-stack-image) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center top;
  }

  :global(.portrait-stack[data-portrait-class~="portrait-image"][data-portrait-layered="true"] .portrait-stack-art),
  :global(.portrait-stack[data-portrait-class~="portrait-image"] .portrait-stack-art) {
    top: 0;
    bottom: auto;
    width: 100%;
    height: auto;
    aspect-ratio: 2 / 3;
  }

  :global(.portrait-stack[data-portrait-class~="player-portrait-image"]) {
    left: 50%;
    transform: translateX(calc(-1 * var(--dialogue-art-origin-x, 50%)));
  }

  :global(.portrait-stack[data-portrait-class~="npc-portrait-image"]) {
    left: 50%;
    transform: translateX(calc(-1 * var(--dialogue-art-origin-x, 50%)));
  }

  :global(.portrait-stack[data-portrait-class~="npc-portrait-image"][data-portrait-kind="dialogue-bust"]) {
    height:var(--dialogue-art-height,110%);
  }

  :global(.portrait-stack.portrait-flipped[data-portrait-class~="npc-portrait-image"]) {
    left: 50%;
    transform: translateX(calc(-1 * var(--dialogue-art-origin-x, 50%))) scaleX(-1);
  }

  :global(.portrait-stack.portrait-flipped[data-portrait-class~="player-portrait-image"]) {
    left: 50%;
    transform: translateX(calc(-1 * var(--dialogue-art-origin-x, 50%))) scaleX(-1);
  }

  .character-name {
    position: absolute;
    z-index: 1;
    bottom: 31px;
    color: #fff7df;
    font-size: 17px;
    font-weight: 800;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
    pointer-events: none;
  }

  .character-role {
    position: absolute;
    z-index: 1;
    bottom: 12px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
    pointer-events: none;
  }

  .player-side .character-name,
  .player-side .character-role { left: 8%; }
  .npc-side .character-name,
  .npc-side .character-role { right: 8%; text-align: right; }

  .choice-panel {
    position: relative;
    z-index: 12;
    width: 100%;
    align-self: end;
    margin-bottom: clamp(8px, 1.5vh, 16px);
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.62);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.26);
  }

  .choice-panel.choice-hidden {
    display: none;
    pointer-events: none;
  }

  .choice-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-top: 12px;
  }
  .choice-error { margin:8px 0 12px;padding:9px 10px;border:1px solid #e29f7166;border-radius:8px;background:#442c22bb;color:#ffe0bd;font-size:12px;line-height:1.5; }

  .choice-btn,
  .continue-btn {
    min-height: 46px;
    border: 1px solid rgba(255, 218, 146, 0.38);
    border-radius: 8px;
    background: rgba(35, 30, 22, 0.86);
    color: #fff3d0;
    font: inherit;
    font-size: 14px;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
  }

  .choice-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
  }

  .choice-btn:hover {
    border-color: rgba(255, 218, 146, 0.75);
    background: rgba(87, 64, 31, 0.9);
    transform: translateY(-1px);
  }

  .choice-btn:focus-visible,
  .continue-btn:focus-visible,
  .end-dialogue-btn:focus-visible {
    outline: 2px solid #fff1b3;
    outline-offset: 2px;
  }

  .choice-btn small {
    flex: 0 0 auto;
    color: rgba(255, 255, 255, 0.52);
    font-size: 10px;
  }

  .choice-btn.leave-choice {
    border-color: rgba(255, 255, 255, 0.22);
    background: rgba(0, 0, 0, 0.42);
    color: rgba(255, 255, 255, 0.76);
  }

  .dialogue-box,
  .result-panel,
  .dialogue-error {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(8, 8, 8, 0.82), rgba(0, 0, 0, 0.7));
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.3);
  }

  .dialogue-box {
    position: relative;
    z-index: 20;
    width: 100%;
    min-height: clamp(148px, 24vh, 230px);
    box-sizing: border-box;
    padding: 22px clamp(20px, 3vw, 48px) 28px;
    border-radius: 14px 14px 0 0;
    border-bottom: 0;
    appearance: none;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .dialogue-box.dialogue-can-advance {
    cursor: pointer;
  }

  .dialogue-box.dialogue-can-advance:hover {
    border-color: rgba(255, 218, 146, 0.38);
  }

  .speaker-line {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .speaker-name {
    color: #ffd98d;
    font-size: 14px;
    font-weight: 800;
  }

  .speaker-tag {
    color: rgba(255, 255, 255, 0.42);
    font-size: 11px;
  }

  .advance-hint {
    float: right;
    margin-top: 12px;
    color: rgba(255, 218, 146, 0.58);
    font-size: 11px;
  }

  /* v1.43.1：句子进度 + 选项态提示 + 选项旁结束按钮 */
  .line-counter {
    margin-left: auto;
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .dialogue-box.dialogue-awaiting-choice {
    cursor: default;
    opacity: 0.9;
  }

  .advance-hint.choice-hint {
    color: rgba(255, 218, 146, 0.92);
    float: none;
    display: block;
    text-align: center;
  }

  .choice-foot {
    display: flex;
    justify-content: center;
    margin-top: 12px;
  }

  .choice-end-btn {
    min-height: 34px;
    padding: 7px 18px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.32);
    color: rgba(255, 255, 255, 0.74);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }

  .choice-end-btn:hover {
    border-color: rgba(255, 218, 146, 0.6);
    background: rgba(87, 64, 31, 0.55);
    color: #fff3d0;
  }

  .dialogue-box p,
  .result-text {
    margin: 8px 0 0;
    color: rgba(255, 255, 255, 0.9);
    font-size: clamp(14px, 1.25vw, 17px);
    line-height: 1.75;
    white-space: pre-wrap;
  }

  .result-head {
    grid-row: 1;
  }

  .result-panel {
    grid-row: 2;
    align-self: center;
    width: min(720px, 100%);
    justify-self: center;
    padding: 24px;
  }

  .result-text {
    color: #fff7df;
  }

  .result-deltas {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin-top: 18px;
  }

  .result-delta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    border: 1px solid rgba(144, 220, 169, 0.25);
    border-radius: 7px;
    background: rgba(58, 116, 75, 0.18);
    color: rgba(255, 255, 255, 0.74);
    font-size: 12px;
  }

  .result-delta strong {
    color: #b8f0c6;
    font-size: 14px;
  }

  .result-delta.negative {
    border-color: rgba(255, 142, 142, 0.26);
    background: rgba(116, 50, 50, 0.18);
  }

  .result-delta.negative strong {
    color: #ffb2b2;
  }

  .quiet-result,
  .result-extras,
  .result-foot,
  .dialogue-error p {
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }

  .quiet-result {
    margin-top: 18px;
  }

  .result-extras {
    display: grid;
    gap: 5px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.72);
  }

  .result-foot {
    margin-top: 18px;
    text-align: right;
  }

  .result-actions {
    grid-row: 3;
    display: flex;
    justify-content: flex-end;
    margin: 0 clamp(12px, 3vw, 42px) 18px;
  }

  .continue-btn {
    min-width: 120px;
    padding: 10px 18px;
    background: rgba(117, 88, 34, 0.82);
    color: #fff1bf;
    font-weight: 800;
    text-align: center;
  }

  .continue-btn:hover {
    background: rgba(151, 111, 43, 0.92);
  }

  .dialogue-error {
    align-self: center;
    width: min(440px, 100%);
    padding: 24px;
    text-align: center;
  }

  .dialogue-loading {
    align-self: center;
    width: min(440px, 100%);
    padding: 24px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.42);
    text-align: center;
  }

  .loading-title {
    color: #fff1bf;
    font-size: 18px;
    font-weight: 800;
  }

  .dialogue-loading p {
    margin: 10px 0 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 13px;
  }

  .error-title {
    color: #fff1bf;
    font-size: 18px;
    font-weight: 800;
  }

  .dialogue-error .continue-btn {
    margin-top: 14px;
  }

  @media (max-width: 1080px) {
    .character-layout {
      grid-template-columns: minmax(0, 1fr) minmax(230px, 280px) minmax(0, 1fr);
      gap: 12px;
    }

    .portrait-slot {
      min-height: 0;
    }
  }

  @media (max-height: 700px) {
    .npc-overlay {
      padding: 0;
    }

    .npc-stage {
      gap: 0;
    }

    .stage-head {
      margin-top: 8px;
    }

    .portrait-slot {
      min-height: 0;
    }

    :global(.portrait-stack[data-portrait-class~="portrait-image"]) {
      height: var(--dialogue-art-height,210%);
    }

    .dialogue-box {
      min-height: clamp(126px, 22vh, 170px);
      padding: 14px 16px 18px;
    }

    .choice-panel {
      padding: 12px;
      margin-bottom: 8px;
    }
  }

  @media (max-width: 720px) {
    .character-layout {
      grid-template-columns: 1fr 1fr;
      grid-template-areas: "player npc" "choices choices";
      overflow-y: auto;
      padding: 0 12px;
    }

    .character-layout:not(.choices-visible) {
      grid-template-columns: 1fr 1fr;
      grid-template-areas: "player npc";
      overflow: hidden;
      height: 100%;
      max-height: 90vw;
      align-self: end;
    }

    .portrait-slot {
      min-height: 220px;
    }
  }
  .character-layout.group-conversation,
  .character-layout.group-conversation:not(.choices-visible) {position:relative;grid-template-columns:minmax(0,.39fr) minmax(0,.61fr);grid-template-areas:"player npc";gap:0;overflow:hidden;}
  .npc-cast.paired {overflow:visible;isolation:isolate;}
  .npc-cast.paired .npc-side {position:absolute;bottom:0;left:calc(var(--cast-slot)*25% + 9%);width:66%;z-index:2;}
  .npc-cast.paired .npc-side.in-front {z-index:4;}
  .npc-cast.paired .portrait-slot {overflow:visible;opacity:1;transition:opacity 220ms ease-out,filter 220ms ease-out;}
  .npc-cast.paired .npc-side:not(.speaking) .portrait-slot {opacity:.76;filter:brightness(.94) saturate(.94);}
  .group-conversation .player-side .portrait-slot {overflow:visible;transition:filter 200ms ease-out;}
  .group-conversation .player-side:not(.speaking) .portrait-slot {filter:brightness(.92);}
  .npc-cast.paired .character-name,.npc-cast.paired .character-role {left:50%;right:auto;transform:translateX(-50%);text-align:center;white-space:nowrap;max-width:94%;overflow:hidden;text-overflow:ellipsis;}
  .group-conversation .choice-panel {position:absolute;grid-area:auto;left:39%;bottom:8px;width:min(340px,48%);max-height:60%;overflow:auto;transform:translateX(-50%);z-index:20;box-sizing:border-box;background:rgba(12,18,29,.94);}
  @media(max-width:720px){
    .character-layout.group-conversation,.character-layout.group-conversation:not(.choices-visible){grid-template-columns:minmax(0,.35fr) minmax(0,.65fr);grid-template-areas:"player npc";height:100%;max-height:84vw;align-self:end;padding:0 4px;overflow:hidden;}
    .npc-cast.paired .npc-side{left:calc(var(--cast-slot)*58% - 10%);}
    .tall-group .npc-cast.paired .npc-side{left:calc(var(--cast-slot)*48% - 10%);}
    .npc-cast.paired .character-name{font-size:12px;bottom:12px;}
    .npc-cast.paired .character-role{display:none;}
    .group-conversation .choice-panel{left:50%;bottom:4px;width:calc(100% - 16px);max-height:52%;padding:10px;margin:0;}
    .group-conversation .choice-list{gap:6px;margin-top:6px;}
    .group-conversation .choice-btn{min-height:38px;font-size:12px;padding:7px 9px;}
    .group-conversation .choice-list{display:grid;grid-template-columns:1fr 1fr;margin-top:0;}
    .group-conversation .choice-kicker,.group-conversation .choice-foot{display:none;}
  }
  @media(max-height:450px){
    .character-layout.group-conversation,.character-layout.group-conversation:not(.choices-visible){grid-template-columns:minmax(0,.3fr) minmax(0,.7fr);}
    .npc-cast.paired .npc-side{left:calc(var(--cast-slot)*20% + 14%);}
    .npc-cast.paired .character-name{max-width:28%;font-size:12px;bottom:12px;}
    .npc-cast.paired .character-role{display:none;}
    .group-conversation .choice-panel{left:34%;width:27%;max-height:100%;padding:8px;margin:0;}
    .group-conversation .choice-list{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;}
    .group-conversation .choice-btn{font-size:12px;min-height:34px;padding:6px 8px;}
    .group-conversation .choice-foot,.group-conversation .choice-kicker{display:none;}
    .group-dialogue.dialogue-awaiting-choice{min-height:84px;padding:8px 12px;}
    .group-dialogue.dialogue-awaiting-choice .choice-hint{display:none;}
  }
  @media(prefers-reduced-motion:reduce){.npc-cast.paired .npc-side,.npc-cast.paired .portrait-slot,.group-conversation .player-side .portrait-slot{transition:none;}}
</style>

