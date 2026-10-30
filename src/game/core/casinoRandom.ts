/** 赌场使用系统随机源；不读取或保存人生事件的 seed / calls。 */
export function casinoRandomInt(min:number,max:number):number{
 if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||max<min||max-min>=0x100000000)throw new Error('Invalid casino random range');
 const source=globalThis.crypto;
 if(!source?.getRandomValues)throw new Error('System randomness unavailable');
 const span=max-min+1,limit=Math.floor(0x100000000/span)*span,word=new Uint32Array(1);
 do{source.getRandomValues(word);}while(word[0]>=limit);
 return min+word[0]%span;
}
export function shuffleCasinoCards(cards:readonly number[]):number[]{
 const result=[...cards];
 for(let i=result.length-1;i>0;i--){const j=casinoRandomInt(0,i);[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
