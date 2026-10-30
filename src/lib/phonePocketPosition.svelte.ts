const POSITION_KEY='urban-life-phone-pocket-position-v1';
function readPosition():number|null {
  try {const raw=localStorage.getItem(POSITION_KEY);if(raw===null)return null;const n=Number(raw);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):null;}catch{return null;}
}
/** A screen preference shared by indoor/outdoor pockets, independent of saves. */
export const phonePocketPosition=$state<{ratio:number|null}>({ratio:readPosition()});
export function setPhonePocketPosition(ratio:number,persist=false){
  phonePocketPosition.ratio=Math.max(0,Math.min(1,ratio));
  if(persist)try{localStorage.setItem(POSITION_KEY,String(phonePocketPosition.ratio));}catch{/* The current session still retains the chosen position. */}
}
