/**
 * v1.34 猫咪战斗立绘：素材索引与姿态选择（纯资源层，不含战斗逻辑）。
 *
 * 素材来自 docs/v133-plan/art（对立绘 → src/assets/cats/opponents，玩家立绘 → players），
 * 每只猫四姿态：idle / attack / hurt / enter。
 *
 * 资源用 import.meta.glob + ?url 引入：开发态是文件路径，构建后是 /assets/xxx.webp，
 * 再由 inline_single.py 统一内联成 data URI（与单文件 HTML 打包流程一致）。
 */

/** 立绘姿态 */
import actionFrames from './catActionFrames.json';
export type CatPose = "idle" | "attack" | "hurt" | "enter";
export interface CatPortraitAsset {src:string;frame?:{x:number;y:number;width:number;height:number;sheetWidth:number;sheetHeight:number}}
interface ActionSheetFrame {width:number;height:number;attack:number[];hurt:number[]}
const ACTION_MODULES=import.meta.glob<string>('../assets/cats/duel-actions/*/*_actions.png',{eager:true,query:'?url',import:'default'});
const ACTION_ART=Object.fromEntries(Object.entries(ACTION_MODULES).map(([path,url])=>[path.split('/').slice(-2).join('/').replace('_actions.png',''),url]));
const ACTION_FRAMES=actionFrames as Record<string,ActionSheetFrame>;
const ROUNDHEAD_MODULES=import.meta.glob<string>('../assets/cats/duel-roundhead-1498/roundhead_*.png',{eager:true,query:'?url',import:'default'});
const ROUNDHEAD_ART=Object.fromEntries(Object.entries(ROUNDHEAD_MODULES).map(([path,url])=>[path.split('/').pop()!.replace('.png',''),url]));
function actionPortrait(group:'players'|'opponents',key:string,pose:CatPose):CatPortraitAsset|undefined{
  if(pose!=='attack'&&pose!=='hurt')return undefined;
  if(key==='roundhead'&&ROUNDHEAD_ART[`roundhead_${pose}`])return {src:ROUNDHEAD_ART[`roundhead_${pose}`]};
  const id=group+'/'+key,src=ACTION_ART[id],sheet=ACTION_FRAMES[id],r=sheet?.[pose];
  return src&&r?{src,frame:{x:r[0],y:r[1],width:r[2],height:r[3],sheetWidth:sheet.width,sheetHeight:sheet.height}}:undefined;
}

// 泛型是「单个模块的默认导出类型」：?url 默认导出为 URL 字符串，故为 <string>。
// 写成 <Record<string,string>> 会让整体推断成 Record<string,Record<string,string>>，与 indexModules 不匹配。
// v1.42：运行时统一使用透明 WebP，避免大 PNG 进入开发/便携构建；PNG 保留为源素材。
const OPP_MODULES = import.meta.glob<string>("../assets/cats/opponents/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const PLR_MODULES = import.meta.glob<string>("../assets/cats/players/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

// 1.498：重新提取的对战待机立绘。原PNG与旧姿态继续留作源素材及回退。
const CLEAN_OPP_MODULES=import.meta.glob<string>("../assets/cats/duel-clean/opponents/*.png",{eager:true,query:'?url',import:'default'});
const CLEAN_PLR_MODULES=import.meta.glob<string>("../assets/cats/duel-clean/players/*.png",{eager:true,query:'?url',import:'default'});

/** 把 glob 结果索引成 { "burger_idle": "/assets/...webp" } */
function indexModules(mods: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(mods)) {
    const file = path.split("/").pop() ?? "";
    out[file.replace(/\.[^.]+$/, "")] = url;
  }
  return out;
}

const OPP_ART = {...indexModules(OPP_MODULES),...indexModules(CLEAN_OPP_MODULES)};
const PLR_ART = {...indexModules(PLR_MODULES),...indexModules(CLEAN_PLR_MODULES),...ROUNDHEAD_ART,...(ROUNDHEAD_ART.roundhead_idle?{roundhead_enter:ROUNDHEAD_ART.roundhead_idle}:{})};

/** 已接入立绘的对手 key（构建期检查用） */
export const OPPONENT_ART_KEYS: string[] = Array.from(
  new Set(Object.keys(OPP_ART).map((k) => k.replace(/_(idle|attack|hurt|enter)$/, ""))),
).sort();
/** 已接入立绘的玩家猫种 key */
export const PLAYER_ART_KEYS: string[] = Array.from(
  new Set(Object.keys(PLR_ART).map((k) => k.replace(/_(idle|attack|hurt|enter)$/, ""))),
).sort();

/**
 * 对手 id → 立绘 key。
 * 32 个对手 + Boss 共用 19 组立绘，按「名字语义 + 档位气质」分配；
 * 未列出的对手走 deriveKey 兜底（剥掉 opp_ / t1_ / wild_ 等前缀后按名字猜）。
 */
const OPPONENT_ART_MAP: Record<string, string> = {
  // 野外 / 街头（prototype 立绘）
  wild_stray: "stray",
  wild_alley: "bully",
  wild_rival: "tiger",
  owner_granny: "white",
  owner_kid: "minion",
  owner_chef: "burger",
  owner_gamer: "mechat",
  owner_mystic: "ghost",
  wild_legend: "killerqueen",
  // 初级赛事
  t1_rookie: "minion",
  t1_breeder: "white",
  t1_ace: "lightning",
  // 普通档位池
  opp_piglet: "piglet",
  opp_rage: "frenzied",
  opp_burger: "burger",
  opp_lightning: "lightning",
  opp_fatty: "chubby",
  opp_web: "webbing",
  // 中级赛事
  t2_tech: "mechat",
  t2_mystic: "necromancer",
  t2_champ: "tiger",
  // 中级档位池
  opp_scab: "mangy",
  opp_skeleton: "skeleton",
  opp_ghost: "ghost",
  opp_snowman: "snowman",
  opp_marshmallow: "marshmallow",
  // Boss 档位赛事
  t3_legend: "mangy",
  t3_elite: "mechat",
  t3_king: "killerqueen",
  // Boss 档位池
  opp_necro: "necromancer",
  opp_killer: "killerqueen",
  opp_machine: "mechat",
  // 最终 Boss（圆头猫咪立绘在 players 目录，且 UI 会放大呈现）
  roundhead: "roundhead",
};

export type CatNativeFacing='left'|'right'|'front';
/** 逐张按原始头部与身体朝向记录；镜像只应用于立绘层。 */
export const CAT_NATIVE_FACING:Record<string,CatNativeFacing>={
  orange:'left',cow:'right',black:'left',mint:'left',glass:'left',android:'right',spider:'right',golden:'left',roundhead:'front',white:'left',
  stray:'left',ghost:'left',bully:'left',burger:'left',chubby:'front',frenzied:'left',killerqueen:'left',lightning:'left',mangy:'left',marshmallow:'left',
  mechat:'left',minion:'right',necromancer:'left',piglet:'left',skeleton:'right',snowman:'left',tiger:'right',webbing:'left',
};
function mirrorToward(key:string,desired:'left'|'right'):1|-1{
  const facing=CAT_NATIVE_FACING[key]??'left';return facing==='front'||facing===desired?1:-1;
}
export function playerBattleScaleX(catId:string):1|-1{return mirrorToward(catId,'right');}
export function opponentBattleScaleX(opponentId:string):1|-1{return mirrorToward(OPPONENT_ART_MAP[opponentId]??deriveKey(opponentId,OPP_ART)??opponentId,'left');}

/** 从对手 id 猜立绘 key：剥前缀后逐个词匹配（opp_burger → burger） */
function deriveKey(id: string, pool: Record<string, string>): string | undefined {
  const keys = new Set(Object.keys(pool).map((k) => k.replace(/_(idle|attack|hurt|enter)$/, "")));
  const parts = id.split("_");
  for (let i = parts.length - 1; i >= 0; i--) {
    const tail = parts.slice(i).join("_");
    if (keys.has(tail)) return tail;
  }
  return undefined;
}

/** 按姿态取图，缺姿态回退 idle */
function pick(pool: Record<string, string>, key: string | undefined, pose: CatPose): string | undefined {
  if (!key) return undefined;
  return pool[`${key}_${pose}`] ?? pool[`${key}_idle`];
}

/** 对手立绘（按姿态） */
export function opponentArt(opponentId: string, pose: CatPose = "idle"): string | undefined {
  const key = OPPONENT_ART_MAP[opponentId] ?? deriveKey(opponentId, OPP_ART);
  return pick(OPP_ART, key, pose) ?? pick(PLR_ART, key, pose);
}

/**
 * 玩家猫咪立绘（按姿态）。
 * 猫种 id 与立绘 key 同名（orange / cow / black / mint / glass / android / spider / golden / roundhead），
 * 直接命中；未接入立绘的猫种返回 undefined，由调用方回退到 emoji 图标。
 */
export function playerArt(catId: string, pose: CatPose = "idle"): string | undefined {
  return pick(PLR_ART, catId, pose);
}

/** Runtime action viewports use untouched two-pose sheets, with original idle art. */
export function playerBattlePortrait(catId:string,pose:CatPose='idle'):CatPortraitAsset|undefined{
  const action=actionPortrait('players',catId,pose);if(action)return action;
  const src=playerArt(catId,pose==='enter'?'idle':pose);return src?{src}:undefined;
}
export function opponentBattlePortrait(opponentId:string,pose:CatPose='idle'):CatPortraitAsset|undefined{
  const key=OPPONENT_ART_MAP[opponentId]??deriveKey(opponentId,OPP_ART)??opponentId;
  const action=actionPortrait('opponents',key,pose)??actionPortrait('players',key,pose);if(action)return action;
  const src=opponentArt(opponentId,pose==='enter'?'idle':pose);return src?{src}:undefined;
}

/** 该对手是否已接入立绘（未接入时 UI 回退 emoji） */
export function hasOpponentArt(opponentId: string): boolean {
  return !!opponentArt(opponentId);
}
/** 该猫种是否已接入立绘 */
export function hasPlayerArt(catId: string): boolean {
  return !!playerArt(catId);
}

/**
 * 战斗动画状态 → 立绘姿态。
 * 战斗里有 defend / heal / dodge 等动画，立绘只有四姿态，这里做归并。
 */
export function poseOfAnim(anim: string): CatPose {
  if (anim === "attack") return "attack";
  if (anim === "hurt") return "hurt";
  if (anim === "enter") return "enter";
  return "idle";
}
