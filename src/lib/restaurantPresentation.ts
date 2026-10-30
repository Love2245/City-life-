import type { RestaurantCfg } from '../game/core/minigame';
import burger from '../assets/ui/v1.475/burger-kitchen-v1.png';
import cafe from '../assets/ui/v1.475/restaurant/cafe-illustrated-v3.svg';
import western from '../assets/ui/v1.475/restaurant/western-illustrated-v3.svg';
import netbar from '../assets/ui/v1.475/restaurant/netbar-illustrated-v3.svg';
import night from '../assets/ui/v1.475/restaurant/netbar-night-illustrated-v3.svg';
import street from '../assets/ui/v1.475/restaurant/street-illustrated-v3.svg';
import fair from '../assets/ui/v1.475/restaurant/fair-illustrated-v3.svg';

export function restaurantPresentation(cfg: RestaurantCfg) {
  if (cfg.craftMode === 'cocktail') return { id:'cocktail', brand:'泊月 · 夜总会', title:'酒保调酒台', background:cocktailBackdrop, accent:'#ac7446', border:'#6f547b', paper:'#f7eedb', ink:'#443249', soft:'#e6d8cf', cue:'配料 · 加冰 · 摇匀 · 装饰' };
  if (cfg.mode === 'burger') return { id:'burger', brand:'都市小食堂', title:'汉堡备餐', background:burger, accent:'#a76037', border:'#915427', paper:'#fff3d9', ink:'#563820', soft:'#eed9b1', cue:'接单 · 组装 · 出餐' };
  if (cfg.ingredients.some(i => i.id === 'skewer')) {
    return cfg.title.includes('周末')
      ? { id:'fair', brand:'周末食集', title:'集市小吃摊', background:fair, accent:'#af4e45', border:'#a65b3b', paper:'#fff2df', ink:'#6a392c', soft:'#f2d5b7', cue:'接单 · 烤制 · 招待' }
      : { id:'street', brand:'街角夜市', title:'炭火小吃摊', background:street, accent:'#b66532', border:'#6c4933', paper:'#fff0d9', ink:'#563c2b', soft:'#edcda2', cue:'接单 · 烤制 · 出餐' };
  }
  if (cfg.mode !== 'cup') return { id:'western', brand:'暮色餐厅', title:'西餐摆盘', background:western, accent:'#863f4c', border:'#6f3b42', paper:'#fff7ed', ink:'#59363b', soft:'#ead9cb', cue:'接单 · 摆盘 · 上菜' };
  if (cfg.ingredients.some(i => i.id === 'cup')) {
    return cfg.title.includes('夜')
      ? { id:'netbar-night', brand:'午夜补给站', title:'夜班饮品吧', background:night, accent:'#68518e', border:'#434064', paper:'#f0edf9', ink:'#433c5c', soft:'#d9d2e9', cue:'接单 · 调饮 · 补给' }
      : { id:'netbar', brand:'城市网咖', title:'网吧饮品吧', background:netbar, accent:'#3c7d94', border:'#456878', paper:'#eff6f8', ink:'#365262', soft:'#cfe2e9', cue:'接单 · 调饮 · 配餐' };
  }
  return { id:'cafe', brand:'街角咖啡', title:'咖啡师出杯', background:cafe, accent:'#607a53', border:'#6f7555', paper:'#fbf6e9', ink:'#4f543b', soft:'#e4e4cd', cue:'接单 · 萃取 · 出杯' };
}

const cocktailBackdrop = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="night" x2="0" y2="1"><stop stop-color="#251f3c"/><stop offset="1" stop-color="#514057"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#night)"/><path d="M0 270H1600M0 440H1600" stroke="#b69258" stroke-width="12"/><g fill="#4d6967" stroke="#caac7c" stroke-width="5"><path d="M130 130h32v45h25v92h-82v-92h25zM360 120h32v50h25v97h-82v-97h25zM1030 120h32v50h25v97h-82v-97h25zM1330 140h32v40h25v87h-82v-87h25z"/></g><g fill="#a77b43" stroke="#decbb5" stroke-width="4"><path d="M230 320h30v35h28v80h-86v-80h28zM570 310h30v35h28v90h-86v-90h28zM1230 310h30v35h28v90h-86v-90h28z"/></g><text x="800" y="180" text-anchor="middle" font-family="serif" font-size="68" fill="#e1bd94">MOONLIGHT BAR</text><path d="M0 720H1600V1000H0Z" fill="#443335"/><path d="M0 730H1600" stroke="#ad8768" stroke-width="18"/></svg>')}`;

export function cocktailIngredientArt(id:string):string {
  const palette:Record<string,string>={beer:'#d79e31',gin:'#709b9a',tonic:'#82bcc1',syrup:'#a05c45',wine:'#7f344c',whisky:'#ba792e',cognac:'#975d30',water:'#82bcc1'};
  if(id==='cup')return cocktailGlassArt([],false);
  if(id==='ice')return '<g fill="#c8e9f2" stroke="#73a4b8" stroke-width="2"><rect x="39" y="40" width="34" height="31" rx="5" transform="rotate(-14 56 55)"/><rect x="72" y="59" width="33" height="31" rx="5" transform="rotate(12 88 75)"/><path d="M46 45l16-3m17 23h17" stroke="#fff" stroke-width="4"/></g>';
  if(id==='lime')return '<circle cx="73" cy="63" r="28" fill="#5d8c47" stroke="#a8c364" stroke-width="4"/><circle cx="73" cy="63" r="22" fill="#d4df7d"/><path d="M73 42v42M51 63h44M58 48l31 31M58 79l31-31" stroke="#fbefad" stroke-width="3"/>';
  const color=palette[id]??'#b3915e';
  return `<path d="M61 18h22v21l12 12v48q-23 10-46 0V51l12-12z" fill="${color}" stroke="#514454" stroke-width="2"/><rect x="58" y="14" width="28" height="11" rx="3" fill="#d6b578"/><rect x="54" y="57" width="36" height="26" rx="3" fill="#fff0cf"/><path d="M61 66h22m-18 8h14" stroke="${color}" stroke-width="4"/><path d="M55 49v42" stroke="#fff" opacity=".4" stroke-width="4"/>`;
}

export function cocktailGlassArt(ids:string[],ready=true,garnished=true):string {
  const color=ids.includes('wine')?'#873048':ids.includes('beer')?'#d6a239':ids.includes('whisky')||ids.includes('cognac')?'#b77836':'#b7d0a1';
  const stem=ids.includes('wine')||ids.includes('cognac')||ids.includes('syrup');
  const outline=stem?'M39 27H113L98 65Q76 88 54 65Z':'M43 24H109L102 94Q76 103 50 94Z';
  return `<g stroke="#5b5360" stroke-width="2"><path d="${outline}" fill="#f9f5e5" opacity=".85"/>${ready?`<path d="${stem?'M45 41H107L94 64Q76 79 58 64Z':'M47 44H105L99 91Q76 99 53 91Z'}" fill="${color}" stroke="none"/>`:''}${stem?'<path d="M76 76V106M54 108H98" fill="none" stroke-width="3"/>':''}${ready&&ids.includes('beer')?'<path d="M47 44h57v10q-11 6-19 0-9 7-20 0-11 5-18-2z" fill="#fff1d2" stroke="none"/>':''}${ready&&ids.includes('ice')?'<g fill="#dff2ec" opacity=".75"><rect x="58" y="49" width="17" height="16" rx="3" transform="rotate(-12 65 58)"/><rect x="78" y="67" width="16" height="15" rx="3"/></g>':''}${ready&&garnished&&ids.includes('lime')?'<path d="M93 24a18 18 0 1 1 20 21z" fill="#a2bc5d" stroke="#5f874c"/><path d="M97 28l15 13m-5-17 7 11" stroke="#e8e59f"/>':''}<path d="M51 30l5 42" stroke="#fff" opacity=".65" stroke-width="3"/></g>`;
}
