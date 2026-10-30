import {cleanDialogueText,dialogueLines,dialogueSourceLineAt,dialoguePortraitSourceLineAt} from './npcPortraits';

/** Explicit cast IDs belong to the scene; a name mentioned in a quote is not a speaker. */
export interface NpcSpeech {speakerId:string|null;text:string;portraitText?:string}
export interface NpcDialogueBeat {speakerId:string|null;text:string;portraitText:string}

const PAGE_TARGET=54, PAGE_MAX=80;
/** 按原句标点分页；动作括号与金额小数不截断，原文和发言人不改变。 */
function passages(raw:string,visible:(source:string)=>string,respectActions=true):string[]{
  if(visible(raw).length<=PAGE_TARGET)return[raw];
  const tokens:string[]=[];let start=0,depth=0;
  for(let i=0;i<raw.length;i++){
    const char=raw[i];if(respectActions){if(char==='（'||char==='(')depth++;else if(char==='）'||char===')')depth=Math.max(0,depth-1);}
    if(depth||!/[。！？!?；;]/.test(char))continue;
    while(i+1<raw.length&&/[』」”’"）)]/.test(raw[i+1]))i++;
    tokens.push(raw.slice(start,i+1));start=i+1;
  }
  if(start<raw.length)tokens.push(raw.slice(start));
  const small=tokens.flatMap(token=>{
    if(visible(token).length<=PAGE_MAX)return[token];
    const pieces:string[]=[];let from=0,brackets=0;
    for(let i=0;i<token.length;i++){
      if(respectActions){if(/[（(]/.test(token[i]))brackets++;else if(/[）)]/.test(token[i]))brackets=Math.max(0,brackets-1);}
      const comma=/[，,：:]/.test(token[i])&&!(/\d/.test(token[i-1]??'')&&/\d/.test(token[i+1]??''));
      if(!brackets&&comma&&visible(token.slice(from,i+1)).length>=24){pieces.push(token.slice(from,i+1));from=i+1;}
    }
    if(from<token.length)pieces.push(token.slice(from));
    return pieces.flatMap(piece=>{
      if(visible(piece).length<=PAGE_MAX)return[piece];
      // 极少数无标点长串仍需可阅读；按Unicode字符切分，避免切坏表情。
      if(respectActions&&(piece.includes('（')||piece.includes('(')))return[piece];
      const chars=Array.from(piece),parts:string[]=[];for(let i=0;i<chars.length;i+=PAGE_MAX)parts.push(chars.slice(i,i+PAGE_MAX).join(''));return parts;
    });
  });
  const result:string[]=[];let page='';
  for(const piece of small){
    if(page&&visible(page).length>=24&&visible(page+piece).length>PAGE_TARGET){result.push(page);page='';}
    page+=piece;
  }
  if(page)result.push(page);
  return result;
}
function paginate(beat:NpcDialogueBeat):NpcDialogueBeat[]{
  if(beat.text.length<=PAGE_TARGET)return[beat];
  const rawMatches=beat.portraitText&&cleanDialogueText(beat.portraitText)===beat.text;
  const raw=rawMatches?beat.portraitText:beat.text;
  const preserveRaw=beat.speakerId===null||!cleanDialogueText(raw).trim();
  const clean=preserveRaw?(s:string)=>s.trim():cleanDialogueText;
  return passages(raw,clean,!preserveRaw).map(source=>({
    speakerId:beat.speakerId,text:clean(source),
    // 分屏属于同一段原始发言，沿用该段的表情来源；不把后一个人物的动作带进来。
    portraitText:beat.portraitText,
  })).filter(page=>!!page.text);
}

export function npcDialogueBeats(text:string,ownerId:string,speeches?:readonly NpcSpeech[]):NpcDialogueBeat[]{
  if(speeches)return speeches.flatMap(speech=>(speech.speakerId===null?speech.text.split(/\n+/).map(line=>line.trim()).filter(Boolean):dialogueLines(speech.text)).map((line,index)=>({speakerId:speech.speakerId,text:line,portraitText:speech.speakerId?dialogueSourceLineAt(speech.portraitText??speech.text,index):''}))).flatMap(paginate);
  return dialogueLines(text).map((line,index)=>({speakerId:ownerId,text:line,portraitText:dialoguePortraitSourceLineAt(text,index,ownerId)||line})).flatMap(paginate);
}
