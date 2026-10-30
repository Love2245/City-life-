/**
 * NPC 对话立绘选择。
 *
 * 所有图片都以静态 glob 纳入 Vite 构建，便携版构建时会随 HTML 一并内联。
 * NPC 的完整对话立绘由正在播放的台词内容推导；
 * 主角按正在播放的回应判断动作，实际穿搭优先于动作差分。
 */
import type { NpcTalkOption, NpcTalkStageKey, NpcOutfitContext } from "./npcs";
import type { NpcWeatherOutfit } from "./npcOutfits";
import { npcDialogueMoodForText } from "./npcDialogueEmotion";
import type { NpcDialogueIntensity, NpcDialogueMoodCode, DialogueVisualLevel, DialogueEmotionCategory } from "./npcDialogueEmotion";
import {npcBodyVariantSafe} from './npcFaceAtlases';
import {npcDialogueArtFor,type DialogueArtFrame} from './npcDialogueArt';
import {unmaskedPortraitSources} from './npcUnmaskedPortraits';
import type { ClothingSlot } from "./clothingConstants";
import itemData from "../data/items.json";
import { resolveWholePlayerOutfit } from "./playerOutfitResolver";

export type NpcPortraitVariant =
  | "default"
  | "emotion_happy"
  | "emotion_disappointed"
  | "emotion_angry"
  | "emotion_surprised"
  | "emotion_embarrassed"
  | "emotion_sad"
  | "emotion_worried"
  | "emotion_confident"
  | "expression_smile"
  | "expression_angry"
  | "expression_surprised"
  | "expression_embarrassed"
  | "expression_sad" | "expression_worried" | "expression_confident" | "expression_thinking"
  | "action_arms_crossed"
  | "action_hands_on_hips"
  | "action_thinking"
  | "action_shrug";

type DialogueEmotionVariant = Extract<
  NpcPortraitVariant,
  | "emotion_happy"
  | "emotion_disappointed"
  | "emotion_angry"
  | "emotion_surprised"
  | "emotion_embarrassed"
  | "emotion_sad"
  | "emotion_worried"
  | "emotion_confident"
>;

/** 素材库中的情绪图已经把下列姿势和表情画在同一张全身图里。 */
const COMBINED_EMOTION_POSES: Record<DialogueEmotionVariant, NpcPortraitVariant> = {
  emotion_happy: "action_hands_on_hips",
  emotion_disappointed: "action_thinking",
  emotion_angry: "action_arms_crossed",
  emotion_surprised: "action_shrug",
  emotion_embarrassed: "action_shrug",
  emotion_sad: "action_thinking",
  emotion_worried: "action_thinking",
  emotion_confident: "action_hands_on_hips",
};

export type PlayerPortraitVariant = Extract<
  NpcPortraitVariant,
  "default" | "action_arms_crossed" | "action_hands_on_hips" | "action_thinking" | "action_shrug"
>;

export interface DialoguePortrait<TVariant extends NpcPortraitVariant = NpcPortraitVariant> {
  variant: TVariant;
  source: string | null;
  /** 六种基础情绪代码与当前回应的表现强度，便于游戏界面和对白审计复核。 */
  moodCode?: NpcDialogueMoodCode;
  moodIntensity?: NpcDialogueIntensity;
  moodNuance?: string;
  emotionCategory?:DialogueEmotionCategory;
  visualLevel?:DialogueVisualLevel;
  assetVariant?:NpcPortraitVariant;
  /** A complete half-body portrait cropped from an authored emotion sheet. */
  atlas?:DialogueArtFrame;
  kind?:'dialogue-bust';
  /** v1.45 透明叠层；为空时沿用 source 单图回退。 */
  layers?: string[];
  /** 与 layers 对应的素材贴合校准，仅作用于指定层。 */
  layerTransforms?: string[];
  layerMasks?: string[];
  layerRecipes?:Array<{matrix?:string;alphaCutoff?:number}>;
  /** NPC 站在右侧时是否需要水平翻转，保证视线朝向玩家。 */
  flipX?: boolean;
}

/** 用绝对项目路径让 Vite 可静态分析，不能改成运行时动态 import。 */
const portraitSources = import.meta.glob([
  "/src/assets/portraits/player/*.png",
], {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;


/** v1.45 主角透明叠层和 NPC 场景服装包；资源缺失时继续走旧立绘回退。 */
const playerOutfitSetSources = import.meta.glob("/src/assets/portraits/player/outfit-sets-v1/*.png", { eager: true, import: "default", query: "?url" }) as Record<string, string>;
const playerLayerSources = import.meta.glob(["/src/assets/portraits/player/layers/baseball_cap/*.png", "/src/assets/portraits/player/layers/knit_cap/*.png"], {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;
const decodedPortraits=new Map<string,Promise<void>>();
const SCENARIO_BUST_NPCS=new Set(['npc_fan_kejie','npc_fan_kexi','npc_jack_fanma']);

/** 工作时用制服，其余沿用天气优先级；杰克的训练背心也用于运动场合。 */
function scenarioDialogueArt(npcId:string,category:DialogueEmotionCategory,context?:NpcOutfitContext,weather?:NpcWeatherOutfit|null):DialogueArtFrame|undefined{
  return (context==='service'?npcDialogueArtFor(npcId,category,'service'):undefined)
    ?? (weather?npcDialogueArtFor(npcId,category,weather):undefined)
    ?? (npcId==='npc_jack_fanma'&&context==='outdoor'?npcDialogueArtFor(npcId,category,'summer'):undefined);
}

function decodePortrait(source:string|null|undefined):Promise<void>{
  if(!source||typeof Image==='undefined'||typeof Image.prototype.decode!=='function')return Promise.resolve();
  let pending=decodedPortraits.get(source);
  if(!pending){
    const image=new Image();image.src=source;
    pending=image.decode();decodedPortraits.set(source,pending);
    pending.catch(()=>decodedPortraits.delete(source));
  }
  return pending;
}

/** 兼容旧调用；清晰资源 URL 同步可用，图片仍由浏览器按需解码。 */
export function preloadUnmaskedPortraits(): Promise<void> {
  return Promise.resolve();
}

/** Decode the current complete portrait sheet before the dialogue reveals it. */
export async function preloadNpcPortraitArt(npcId:string,context?:NpcOutfitContext,weather?:NpcWeatherOutfit|null):Promise<void>{
  await preloadUnmaskedPortraits();
  const base=makeNpcPortrait(npcId,'default',true,context,weather);
  const art=scenarioDialogueArt(npcId,'neutral',context,weather)??npcDialogueArtFor(npcId,'neutral');
  await decodePortrait(art?.source??base.source);
}

function portraitSource(owner: string, variant: NpcPortraitVariant, unmasked = false): string | null {
  return exactPortraitSource(owner, variant, unmasked)
    ?? exactPortraitSource(owner, "default", unmasked);
}

function exactPortraitSource(owner: string, variant: NpcPortraitVariant, _unmasked = false): string | null {
  // NPC 的旧图本身就烘焙了马赛克，任何缺图回退也只能选清晰素材。
  return owner === 'player'
    ? portraitSources[`/src/assets/portraits/player/${variant}.png`] ?? null
    : unmaskedPortraitSources[`/src/assets/portraits/unmasked-clean/${owner}/${variant}.png`] ?? null;
}

function combinedEmotionSource(owner: string, variant: DialogueEmotionVariant, _unmasked = false): string | null {
  const sources = unmaskedPortraitSources;
  const base = "/src/assets/portraits/unmasked-clean";
  // Missing art must not turn worry into grief or calm confidence into jubilation.
  return sources?.[`${base}/${owner}/${variant}.png`]
    ?? null;
}

function npcWeatherOutfitSource(
  npcId: string,
  weatherOutfit: NpcWeatherOutfit,
  variant: NpcPortraitVariant,
  _unmasked = false,
): string | null {
  const base = `/src/assets/portraits/unmasked-clean/npc_weather/${npcId}/${weatherOutfit}`;
  const sources = unmaskedPortraitSources;
  return sources?.[`${base}/${variant}.png`]
    ?? sources?.[`${base}/default.png`]
    ?? null;
}

function npcWeatherOutfitVariantSource(
  npcId: string,
  weatherOutfit: NpcWeatherOutfit,
  variant: NpcPortraitVariant,
  _unmasked = false,
): string | null {
  const base = `/src/assets/portraits/unmasked-clean/npc_weather/${npcId}/${weatherOutfit}`;
  const sources = unmaskedPortraitSources;
  return sources?.[`${base}/${variant}.png`] ?? null;
}

const garmentLayers: Record<string, string> = Object.fromEntries(
  itemData.items.filter((item) => item.outfitLayer).map((item) => [item.id, item.outfitLayer!]),
);

const NPC_NEEDS_HORIZONTAL_FLIP = new Set([
  // 这几张原图的视线朝右，放在对话框右侧时应翻到朝向主角。
  "npc_flower_market_owner",
  "npc_snack_street_vendor",
]);

function makeNpcPortrait(
  owner: string,
  variant: NpcPortraitVariant,
  unmasked = false,
  context?: NpcOutfitContext,
  weatherOutfit?: NpcWeatherOutfit | null,
): DialoguePortrait {
  const emotionPose = variant in COMBINED_EMOTION_POSES
    ? COMBINED_EMOTION_POSES[variant as DialogueEmotionVariant]
    : null;
  const portraitVariant = emotionPose ?? variant;
  const directEmotionSource = emotionPose
    ? combinedEmotionSource(owner, variant as DialogueEmotionVariant, unmasked)
    : null;
  // 老角色没有整身暧昧图时，回落到轻微脸红表情，不借用惊讶图误演成错愕。
  const restrainedBlushFallback = variant === "emotion_embarrassed"
    ? portraitSource(owner, "expression_embarrassed", unmasked)
    : null;
  const weatherVariantSource = weatherOutfit
    ? npcWeatherOutfitVariantSource(owner, weatherOutfit, portraitVariant, unmasked)
    : null;
  void context;
  const directVariantSource = exactPortraitSource(owner, portraitVariant, unmasked);
  const weatherDefaultSource = weatherOutfit
    ? npcWeatherOutfitSource(owner, weatherOutfit, "default", unmasked)
    : null;
  return {
    variant,
    assetVariant:directEmotionSource?variant:restrainedBlushFallback?'expression_embarrassed':weatherVariantSource||directVariantSource?portraitVariant:'default',
    source: directEmotionSource
      ?? restrainedBlushFallback
      ?? weatherVariantSource
      ?? directVariantSource
      ?? weatherDefaultSource
      ?? portraitSource(owner, portraitVariant, unmasked),
    flipX: NPC_NEEDS_HORIZONTAL_FLIP.has(owner),
  };
}

export function npcPortraitForContext(
  npcId: string,
  context: NpcOutfitContext,
  variant: NpcPortraitVariant,
  unmasked = true,
  weatherOutfit?: NpcWeatherOutfit | null,
): DialoguePortrait {
  const art=SCENARIO_BUST_NPCS.has(npcId)?scenarioDialogueArt(npcId,'neutral',context,weatherOutfit):undefined;
  if(art)return{source:art.source,atlas:art,kind:'dialogue-bust',variant,assetVariant:'default',flipX:NPC_NEEDS_HORIZONTAL_FLIP.has(npcId)};
  return makeNpcPortrait(npcId, variant, unmasked, context, weatherOutfit);
}

/** 按正在播放的这一句台词选择一张同时包含姿势和神态的 NPC 立绘。 */
export function npcPortraitForDialogue(
  npcId: string,
  text: string,
  _stage: NpcTalkStageKey,
  _nodeId: string,
  _unmasked = true,
  context?: NpcOutfitContext,
  weatherOutfit?: NpcWeatherOutfit | null,
): DialoguePortrait {
  const resolvedMood = npcDialogueMoodForText(npcId, text);
  const weatherBase=weatherOutfit?npcWeatherOutfitVariantSource(npcId,weatherOutfit,'default',true):null;
  const art=scenarioDialogueArt(npcId,resolvedMood.category??'neutral',context,weatherOutfit)
    ?? npcDialogueArtFor(npcId,resolvedMood.category??'neutral');
  if(art){
    return{
      source:art.source,atlas:art,kind:'dialogue-bust',variant:resolvedMood.variant,assetVariant:'default',
      flipX:NPC_NEEDS_HORIZONTAL_FLIP.has(npcId),emotionCategory:resolvedMood.category,
      visualLevel:resolvedMood.intensity>0?1:0,moodCode:resolvedMood.code,
      moodIntensity:resolvedMood.intensity,moodNuance:resolvedMood.nuance,
    };
  }
  const requested=resolvedMood.visualLevel===1?'default':resolvedMood.variant;
  const bodyVariant=npcBodyVariantSafe(npcId,requested)?requested:'default';
  let portrait=makeNpcPortrait(npcId,bodyVariant,true,context,weatherOutfit);
  const bodyChanged=portrait.assetVariant!=='default';
  // A missing winter/summer/rain action must not remove the worn weather outfit.
  // Keep that outfit and express the emotion on the face instead.
  if(weatherOutfit&&bodyChanged&&weatherBase&&portrait.source!==npcWeatherOutfitVariantSource(npcId,weatherOutfit,portrait.assetVariant!,true)){
    portrait=makeNpcPortrait(npcId,'default',true,context,weatherOutfit);
  }
  const renderedBodyChanged=portrait.assetVariant!=='default';
  return {
    ...portrait,
    variant:resolvedMood.variant,
    emotionCategory:resolvedMood.category,
    visualLevel:renderedBodyChanged?2:resolvedMood.intensity>0?1:0,
    moodCode: resolvedMood.code,
    moodIntensity: resolvedMood.intensity,
    moodNuance: resolvedMood.nuance,
  };
}

/** The current spoken paragraph decides a gesture, while the worn outfit stays locked. */
export function playerPortraitForReply(
  reply?: string,
  outfit?: Record<ClothingSlot, string | undefined>,
): DialoguePortrait<PlayerPortraitVariant> {
  let variant: PlayerPortraitVariant = "default";
  const mood=npcDialogueMoodForText('player',reply??'');
  if(mood.visualLevel===2){
    const body=mood.variant.startsWith('action_')?mood.variant:COMBINED_EMOTION_POSES[mood.variant as DialogueEmotionVariant];
    variant=(body??'default') as PlayerPortraitVariant;
  }
  const resolved = outfit
    ? resolveWholePlayerOutfit(outfit, playerOutfitSetSources, playerLayerSources, garmentLayers)
    : undefined;
  // 有当前穿搭时，立绘动作必须和整套服装使用同一姿势；某件衣服没有动作差分时
  // 由 resolver 回退为该穿搭的 default 全套，而不是混用旧的无穿搭动作立绘。
  const renderedVariant = (resolved?.variant ?? (outfit ? "default" : variant)) as PlayerPortraitVariant;
  return {
    variant: renderedVariant,
    source: resolved ? null : portraitSource("player", renderedVariant),
    layers: resolved?.layers,
    layerTransforms: resolved?.layerTransforms,
    layerRecipes:resolved?.layerRecipes,
    moodCode:mood.code,moodIntensity:mood.intensity,emotionCategory:mood.category,
    visualLevel:renderedVariant==='default'?(mood.intensity>0?1:0):2,
  };
}

const BASIC_ACTION_WORDS = /(点(?:了?下?)?头|摇(?:了摇|了下)?头|抬头|低头|看向|看了.*一眼|看着|看手机|笑|皱眉|叹气|摊手|耸肩|摆(?:摆|了)手|挥手|抱臂|叉腰|想了想|愣(?:住|了一下)?|挪了挪|挪开|腾出|让出|停下|放下|放(?:在|着)|拿起|拿出|拿开|接过|递(?:了|给|来)?|推过来|合上|翻开|翻过去|打开|收起|指了指|示意|努了努嘴|拍(?:了拍|了下)|起身|坐(?:回去|下来|着|下)|站(?:起来|着|在旁边|在花摊前)|转身|转过来|走来走去|走了|走开|伸手|收回|揉了揉|擦了擦|喝了口|吃了一口|抿了抿|画(?:了(?:个|两笔)?|得很细)|继续画|清出来|整理|偏了偏|搬花盆|写着|留下|等你|掏出|抽了口烟|掐了烟|戴上|摘下|扣上|把|将)/;
const INNER_THOUGHT_WORDS = /(心里|暗自|其实|觉得|认为|意识|想起|想着|注意到|仿佛|似乎|没想到|担心|回想|记得|感觉|以为|不由得|故意|忍不住|希望|决定|明白了|反应)/;
const NARRATOR_ACTION_WORDS = /(的时候|之后|之前|看见|听见|路过|经过|忽然|突然|一边|仿佛|像是|正要|刚要|准备|随后|等到|看到|听到|走到|来到|离开|回头)/;

/** 从括号中只保留短小、可见的动作，去掉心理活动和上帝视角说明。 */
function basicActionText(raw: string): string {
  const content = raw.trim().replace(/\s+/g, "");
  // 台词框只留下能一眼看懂的小动作；心理描写、叙述镜头和带情节转折的说明
  // 会让对话读起来像剧本注释，因此全部省略。
  if (!content) return "";

  const clauses = content
    .split(/[。！？!?；;]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);

  // v1.43.1 第一优先：整段短小、无心理描写的从句原样保留。
  // 这是最接近作者原稿（“（她看见你，点了下头。）”）的形态；旧行为会把它压缩成
  // 一个动词甚至整段丢弃，导致台词失去上下文、读起来像被从中截断。
  const shortClause = clauses.find((clause) =>
    !INNER_THOUGHT_WORDS.test(clause)
    && clause.length <= 24
    && !/^[，,、。：:；;]/.test(clause),
  );
  if (shortClause) return `（${shortClause.replace(/[，,、]+$/, "")}。）`;

  for (const candidate of clauses) {
    if (INNER_THOUGHT_WORDS.test(candidate)) continue;
    const verb = candidate.match(BASIC_ACTION_WORDS);
    if (!verb || verb.index === undefined) continue;

    const matchedAction = candidate
      .slice(verb.index)
      .split(/[，,、：:“”"「」]/, 1)[0]
      .replace(/^(?:就|然后|接着|于是|只是|继续)/, "")
      .trim();
    const prefix = candidate
      .slice(0, verb.index)
      .replace(/^(?:就|然后|接着|于是|只是|继续)/, "")
      .trim();
    // 保留“她抬头”“朝旁边努了努嘴”这种很短的主体/方向，避免动作被
    // 清理得像孤零零的关键词；长叙述仍只取动作本身。
    let action = prefix && prefix.length <= 4 && !/[，,、：:“”"「」]/.test(prefix)
      ? `${prefix}${matchedAction}`
      : matchedAction;
    if (action.length > 28) action = verb[0];
    if (!action || action.length > 28 || NARRATOR_ACTION_WORDS.test(action)) continue;
    return `（${action.replace(/[，,、]+$/, "")}。）`;
  }

  // v1.43.1 兜底：没有命中动作词库时，保留第一个短小可见的从句。
  // 旧行为是整段括号直接丢弃，导致台词失去上下文、读起来像被从中截断。
  // 仍剔除心理描写，且限长，避免台词框变成剧本注释。
  const fallback = clauses.find((clause) =>
    !INNER_THOUGHT_WORDS.test(clause)
    && clause.length <= 24
    && !/^[，,、。：:；;]/.test(clause),
  );
  return fallback ? `（${fallback.replace(/[，,、]+$/, "")}。）` : "";
}

/** 清理一段台词，但保留换行；换行仍然代表一次点击播放。 */
export function cleanDialogueText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/（([^（）]*)）|\(([^()]*)\)/g, (_match, fullWidth: string | undefined, ascii: string | undefined) => {
    const action = basicActionText(fullWidth ?? ascii ?? "");
      return action;
    }))
    .map((line) => line
      .replace(/(?:\.{2,}|…+|。{2,})/g, "")
      .replace(/^[，、。！？!?]+/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([，。！？、])/g, "$1")
      .replace(/。(?=[，、])/g, "")
      .replace(/，(?=[。！？])/g, "")
      .replace(/([。！？])\1+/g, "$1")
      .trim())
    .filter(Boolean)
    .join("\n");
}

/** 把一段物理换行的台词拆成逐次点击播放的行。 */
export function dialogueLines(text: string): string[] {
  const cleaned = cleanDialogueText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (cleaned.length > 0) return cleaned;

  // 某些旧版 NPC 节点只有较长的动作描写；cleanDialogueText 会按规则
  // 隐去这类导演说明，但不能因此让对话框变成空白。保留原始短行作为
  // 最后的可见回退，保证旧存档/旧 NPC 仍然有可读内容。
  const rawLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*NPC台词：\s*/, "").trim())
    .filter((line) => line && !/^[.…。]+$/.test(line));
  return rawLines.length > 0 ? rawLines : (text.trim() ? ["（沉默。）"] : []);
}

/** 与 dialogueLines 的显示行顺序对应，但保留原始括号动作供立绘识别。 */
export function dialogueSourceLineAt(text: string, targetIndex: number): string {
  const rawLines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const visibleLines = rawLines.filter((line) => cleanDialogueText(line).trim());
  const fallbackLines = rawLines
    .map((line) => line.replace(/^\s*NPC台词：\s*/, "").trim())
    .filter((line) => line && !/^[.…。]+$/.test(line));
  const sourceLines = visibleLines.length > 0 ? visibleLines : fallbackLines;
  if (sourceLines.length === 0) return text.trim();
  const index = Math.max(0, Math.min(Math.floor(targetIndex), sourceLines.length - 1));
  return sourceLines[index] ?? sourceLines[sourceLines.length - 1] ?? "";
}

/** Every paragraph uses only its own raw text; previous emotions never bleed forward. */
export function dialoguePortraitSourceLineAt(text: string, targetIndex: number, npcId = "npc_unknown"): string {
  void npcId;return dialogueSourceLineAt(text,targetIndex);
}

function stripReplyAction(text: string): { action: string; speech: string } {
  const actionMatch = text.match(/^（[^）]+）/);
  if (!actionMatch) return { action: "", speech: text };
  return {
    action: cleanDialogueText(actionMatch[0]).split("\n")[0] ?? "",
    speech: text.slice(actionMatch[0].length).trim(),
  };
}

/**
 * 选项可以简短；点选后优先使用数据中明确写好的完整回应。
 * 没有完整回应时直接沿用选项文本，绝不再给所有选择硬塞同一种结束语。
 */
export function playerReplyText(option?: NpcTalkOption, _playerName = "阿城"): string {
  const explicit = cleanDialogueText(option?.playerReply?.trim() ?? "");
  if (explicit) return explicit;

  const raw = option?.label?.trim() ?? "";
  if (!raw) return "";
  // These are interface operations, not a line the player says aloud.
  if(/^(?:继续|结束交流|结束对话)$/.test(raw))return "";

  const { action, speech } = stripReplyAction(raw);
  if (!speech) return action;

  const directReply = cleanDialogueText(speech)
    .replace(/\n+/g, " ")
    .replace(/。(?=[，、])/g, "")
    .replace(/，(?=[。！？])/g, "")
    .replace(/([。！？])\1+/g, "$1")
    .trim();
  if (!directReply) return action;
  return action ? `${action}\n${directReply}` : directReply;
}
