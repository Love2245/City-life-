import { roadVehicleSymbols } from './deliveryRoadArt';
import { deliveryTheme } from './deliveryArt';
export function deliveryRoadPreview(key:string,mode:string) {
  const t=deliveryTheme(key,mode),night=key.includes('taxi'),glass=mode==='rideshare'&&!night;
  const houses=[-1,1].map(side=>[0,1,2,3].map(i=>{
    const s=.5+i*.32,y=170+i*75,x=500+side*(130+i*106);
    return `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-47" y="${glass?-130:-81}" width="94" height="${glass?150:101}" fill="${night?'#846b73':glass?'#8fb9c1':mode==='parcel'?'#b8cac4':'#d8c69f'}"/><path d="M-56-81L0-115l56 34z" fill="${night?'#ab8373':t.roof}"/><path d="M-28-61h16v21h-16m40-21h16v21H12" fill="${night?'#ffca7f':'#71969b'}"/><path d="M-45-18h90v10h-90" fill="${t.accent}"/><path d="M-10-10h20v30h-20" fill="#536c75"/></g>`;
  }).join('')).join('');
  const vehicle=mode==='parcel'?'van':mode==='food'?'rider':'car';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 570"><defs>${roadVehicleSymbols}<linearGradient id="previewSky" x2="0" y2="1"><stop stop-color="${night?'#253854':'#a0cbd3'}"/><stop offset="1" stop-color="${night?'#b48176':'#f2e6c9'}"/></linearGradient></defs><rect width="1000" height="570" fill="url(#previewSky)"/><circle cx="810" cy="59" r="30" fill="#ffe2aa"/><path d="M0 162h1000v408H0z" fill="${t.land}"/>${key.includes('fulltime')||glass?'<path d="M0 221l375-66-192 415H0z" fill="#7aadb8"/>':''}<path d="M402 154h196l398 416H4z" fill="${t.curb}"/><path d="M425 154h150l330 416H95z" fill="${t.road}"/>${houses}<path d="M473 198l-4 15m-10 42-8 22m-15 52-13 35m-29 71-20 47M527 198l4 15m10 42 8 22m15 52 13 35m29 71 20 47" stroke="#eae6c9" stroke-width="5"/><g transform="translate(683 306) scale(.6)" style="color:#d1b075"><use href="#road-car" x="-62" y="-110" width="124" height="125"/></g><g transform="translate(500 493)" style="color:${night?'#e1b260':t.accent}"><use href="#road-${vehicle}" x="${vehicle==='rider'?-57:vehicle==='van'?-65:-62}" y="${vehicle==='rider'?-150:vehicle==='van'?-145:-110}" width="${vehicle==='rider'?114:vehicle==='van'?130:124}" height="${vehicle==='rider'?165:vehicle==='van'?155:125}"/></g></svg>`;
}
