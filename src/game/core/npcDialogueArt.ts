import definitions from '../data/npcDialogueArt.json';
import type {DialogueEmotionCategory} from './npcDialogueEmotion';
// @ts-expect-error Resolved by the Vite NPC portrait library plugin.
import {npcLibraryPortraitSources} from 'virtual:npc-portrait-library';

const sources=npcLibraryPortraitSources as Record<string,string>;

interface Sheet {file:string;width:number;height:number;frames?:Array<{viewBox:number[];clipPath:string;rowClipPath?:string}>}
interface CharacterSheets {default:Sheet;summer?:Sheet;rain?:Sheet;winter?:Sheet;autumn?:Sheet;service?:Sheet}
export interface DialogueArtFrame {
  key:string;
  source:string;
  width:number;
  height:number;
  viewBox:[number,number,number,number];
  clipPath?:string;
  rowClipPath?:string;
  outfitKey:string;
}
const tileFor:Record<DialogueEmotionCategory,number>={neutral:0,happy:1,sad:2,angry:3,surprised:4,embarrassed:5,worried:6,confident:7,thoughtful:8};

/** Each tile is a complete authored portrait. Never join a face to another body. */
export function npcDialogueArtFor(npcId:string,category:DialogueEmotionCategory,weather?:string|null):DialogueArtFrame|undefined {
  const sheets=(definitions as Record<string,CharacterSheets>)[npcId];
  const sheet=weather?sheets?.[weather as keyof CharacterSheets]:sheets?.default;
  if(!sheet)return;
  const source=sources[`/src/assets/portraits/npc_dialogue/${npcId}/${sheet.file}`];
  if(!source)return;
  const tile=tileFor[category],width=sheet.width/3,height=sheet.height/3;
  const frame=sheet.frames?.[tile];
  const viewBox:[number,number,number,number]=frame
    ?[frame.viewBox[0],frame.viewBox[1],frame.viewBox[2],frame.viewBox[3]]
    :[tile%3*width,Math.floor(tile/3)*height,width,height];
  return{key:`${npcId}-${sheet.file}-${tile}`,source,width:sheet.width,height:sheet.height,viewBox,clipPath:frame?.clipPath,rowClipPath:frame?.rowClipPath,outfitKey:weather??'default'};
}
