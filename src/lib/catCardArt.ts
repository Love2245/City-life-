const modules=import.meta.glob<string>('../assets/cat-cards/abstract/*.svg',{eager:true,query:'?url',import:'default'});
const art=Object.fromEntries(Object.entries(modules).map(([path,url])=>[path.split('/').pop()!.replace('.svg',''),url]));
export const CAT_CARD_ART_IDS=Object.keys(art).sort();
export function catCardEffectArt(baseId:string):string|undefined{return art[baseId.replace(/_plus$/,'')];}
