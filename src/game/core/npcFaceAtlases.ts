import metadata from '../data/npcFaceAtlases.json';
// 仅保留历史素材的异常姿势名单；NPC 始终使用清晰整图，不再生成脸部叠层。
const definitions=metadata as Record<string,{invalidBodies:string[]}>;
export function npcBodyVariantSafe(npcId:string,variant:string){
  return !definitions[npcId]?.invalidBodies.includes(variant);
}
