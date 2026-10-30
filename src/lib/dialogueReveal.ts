/** 字幕按完整字符显示，组合音标和表情不会被拆开。 */
export function dialogueGlyphs(text:string):string[] {
  const Segmenter=(Intl as unknown as {Segmenter?:new(locale:string,options:{granularity:string})=>{segment(text:string):Iterable<{segment:string}>}}).Segmenter;
  if(Segmenter)return Array.from(new Segmenter('zh',{granularity:'grapheme'}).segment(text),part=>part.segment);
  const result:string[]=[];let joinNext=false;
  for(const glyph of Array.from(text)){
    const code=glyph.codePointAt(0)!,previous=result[result.length-1];
    const mark=/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f]/u.test(glyph)||(code>=0x1f3fb&&code<=0x1f3ff);
    const flag=code>=0x1f1e6&&code<=0x1f1ff&&previous&&Array.from(previous).length===1&&previous.codePointAt(0)!>=0x1f1e6&&previous.codePointAt(0)!<=0x1f1ff;
    if(previous&&(joinNext||glyph==='\u200d'||mark||flag))result[result.length-1]+=glyph;else result.push(glyph);
    joinNext=glyph==='\u200d';
  }
  return result;
}

/** 约每秒 30 字，逗号和句末留一点自然停顿；仅控制字幕，不推进游戏时间。 */
export function dialogueGlyphDelay(glyph:string):number {
  return /[。！？!?…]/.test(glyph)?170:/[，、；：,;:]/.test(glyph)?95:32;
}
