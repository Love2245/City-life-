import settings from '../data/npcDialogueStaging.json';
import concealedFaces from '../data/npcFaceAtlases.json';
import dialogueSheets from '../data/npcDialogueArt.json';
import type {DialoguePortrait} from './npcPortraits';

interface Head {centerX:number;top:number;height:number}
interface Actor {heightCm:number;art:Record<string,[number,number,number]>;faceSpan?:{art:Record<string,number>;concealed:Record<string,number>}}
export interface DialogueStageActor {heightCm:number;headTop:number;headSize:number;faceSize?:number;css:string}
const actors=settings as unknown as Record<string,Actor>;
const HEAD_FRACTION=.32;
const HEAD_CM=24;
// Eye line to chin in the source image. Hats and hair must not shrink the face.
const FACE_FRACTION=.14;
const sheets=dialogueSheets as Record<string,Record<string,{frames:{viewBox:number[]}[]}>>;

/** Visual staging defaults, not new player attributes or a save migration.
 * Jack's visual height is kept just above Kejie, following the portrait review.
 * Scale the whole canvas uniformly; never move individual facial features.
 */
export function dialogueStageFor(npcId:string,portrait:DialoguePortrait|null|undefined,castIds:readonly string[]=[]):{player:DialogueStageActor;npc:DialogueStageActor}{
  const playerHeight=settings.player.heightCm;
  const npc=actors[npcId];
  const npcHeight=npc?.heightCm??playerHeight;
  const tallest=Math.max(playerHeight,npcHeight,...castIds.map(id=>actors[id]?.heightCm??playerHeight));
  const headFraction=HEAD_FRACTION;
  // Every existing outfit has a face ruler. Keep it in solo and group dialogue,
  // regardless of hats, hair, or the amount of body included in the source.
  const useFaceRuler=castIds.length>1||!!npc?.faceSpan;
  const heightOffset=(heightCm:number)=>(tallest-heightCm)/HEAD_CM*headFraction;
  // A tightly cropped bust can otherwise end above the dialogue edge after
  // normalization. Lower the entire cast together, preserving relative heights.
  // Check every outfit so changing clothes or speakers cannot move the camera.
  let cameraDrop=castIds.length>1?.04:0;
  for(const id of new Set([npcId,...castIds])){
    const actor=actors[id];
    for(const [outfit,sheet] of Object.entries(sheets[id]??{})){
      const span=actor?.faceSpan?.art[outfit],head=actor?.art[outfit];
      if(!span||!head)continue;
      const bottom=heightOffset(actor.heightCm)+FACE_FRACTION/span*(sheet.frames[0].viewBox[3]-head[1]);
      cameraDrop=Math.max(cameraDrop,1.005-bottom);
    }
  }
  function stage(heightCm:number,width:number,height:number,head:Head,flip=false,faceSpan?:number):DialogueStageActor{
    const headTop=heightOffset(heightCm)+cameraDrop;
    const calibrated=useFaceRuler&&faceSpan!==undefined&&faceSpan>0;
    const scale=calibrated?FACE_FRACTION/faceSpan:headFraction/head.height;
    const artHeight=scale*height;
    const top=headTop-scale*head.top;
    const originX=(flip?width-head.centerX:head.centerX)/width*100;
    return{heightCm,headTop,headSize:calibrated?scale*head.height:headFraction,...(calibrated?{faceSize:scale*faceSpan}:{}),
      css:`--dialogue-art-height:${artHeight*100}%;--dialogue-art-top:${top*100}%;--dialogue-art-origin-x:${originX}%;`};
  }
  let width=1024,height=1536,head:Head={centerX:495,top:24,height:214},faceSpan:number|undefined;
  if(portrait?.atlas){
    width=portrait.atlas.viewBox[2];height=portrait.atlas.viewBox[3];
    const weather=portrait.atlas.outfitKey??'default';
    const box=npc?.art[weather]??npc?.art.default??[width/2,20,210];
    head={centerX:box[0],top:box[1],height:box[2]};
    faceSpan=npc?.faceSpan?.art[weather]??npc?.faceSpan?.art.default;
  }else{
    const definition=(concealedFaces as Record<string,{targets:Record<string,number[]>}>)[npcId];
    const box=definition?.targets[portrait?.assetVariant??'default']??definition?.targets.default;
    if(box){const top=Math.max(0,box[1]-80);head={centerX:box[0]+box[2]/2,top,height:box[1]+box[3]-top};}
    faceSpan=npc?.faceSpan?.concealed[portrait?.assetVariant??'default']??npc?.faceSpan?.concealed.default;
  }
  return{player:stage(playerHeight,1024,1536,settings.player.head,false,settings.player.faceSpan),
    npc:stage(npcHeight,width,height,head,!!portrait?.flipX,faceSpan)};
}
