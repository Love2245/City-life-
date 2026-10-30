import npcData from '../data/npcs.json';
import type {GameState} from '../types';

/** 只替换旧版自动网名；保留存档里另起的称呼，所有联系人/会话 ID 不变。 */
const LEGACY_NAMES:Record<string,readonly string[]>={
  npc_lin_xiaoyu:['拿铁不加糖'],npc_zhao_gang:['老炮儿刚子'],npc_chen_jie:['掌勺陈姐'],
  npc_wang_lei:[],npc_netbar_boss:['深夜在线'],npc_librarian:['书页之间'],
  npc_flower_market_owner:['花市苏姐'],npc_snack_street_vendor:['小吃街马叔'],npc_suburb_farmer:['陈叔的田埂'],
  npc_fan_kejie:[],npc_jack_fanma:[],npc_fan_kexi:[],
};
const profiles=new Map((npcData as Array<{id:string;name:string;netName?:string}>).map(n=>[n.id,n]));
export function npcOnlineName(npcId:string|undefined,name:string):string {
  const profile=npcId?profiles.get(npcId):undefined;
  return profile?.netName&&(name===profile.name||LEGACY_NAMES[npcId!]?.includes(name))?profile.netName:name;
}
export function contactNpcId(id:string,npcId?:string):string|undefined {
  return npcId??(id.startsWith('npc_')&&profiles.has(id.slice(4))?id.slice(4):undefined);
}
export function normalizeNpcOnlineNames(state:GameState):void {
  const renamed=new Map<string,{before:string;after:string;npcId:string}>();
  for(const contact of state.contacts??[]){
    const npcId=contactNpcId(contact.id,contact.npcId);if(!npcId)continue;
    const name=npcOnlineName(npcId,contact.name);if(name===contact.name)continue;
    renamed.set(contact.id,{before:contact.name,after:name,npcId});contact.name=name;
  }
  for(const message of state.smsInbox??[]){
    for(const [id,change]of renamed){
      if(message.conversationId===`sender:${change.before}`&&(!message.npcId||message.npcId===change.npcId)){
        message.conversationId=`contact:${id}`;message.contactId??=id;break;
      }
    }
    if(message.dir==='out')continue;
    const identity=message.contactId??message.conversationId?.replace(/^contact:/,'');
    const change=identity?renamed.get(identity):undefined;
    if(change&&message.sender===change.before)message.sender=change.after;
    else if(message.npcId||message.conversationId?.startsWith('npc:'))message.sender=npcOnlineName(message.npcId??message.conversationId!.slice(4),message.sender);
  }
}
