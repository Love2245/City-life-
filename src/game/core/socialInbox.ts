import type { GameState } from '../types';
import { contactIdFromConversationId, groupSmsThreads, type SmsThread } from './sms';

export type SocialChannel = 'chat' | 'services' | 'requests';
export interface SocialThread extends SmsThread { channel:SocialChannel; preview:string; pending:number }
/** Classify presentation only: keep all inbox messages and their original reply contracts. */
export function socialThreadsOf(state:GameState):SocialThread[] {
  return groupSmsThreads(state).map(thread=>{
    const contactId=contactIdFromConversationId(thread.key);
    const known=!!state.contacts.find(c=>c.id===contactId || (c.npcId && thread.key===`npc:${c.npcId}`));
    const pending=thread.msgs.filter(m=>m.dir==='in'&&!m.replied&&m.options?.length>0).length;
    const service=/银行|运营商|物流|快递通知|平台|系统|招聘|账单|缴费|客服|广告|促销|抽奖|中奖|商城|都市生活|天气|提醒|交通|医院|电商/.test(thread.name)
      || thread.key.startsWith('system:');
    const channel:SocialChannel=known||thread.key==='family:grandmother'?'chat':service?'services':'requests';
    const last=thread.last;
    const preview=(last.dir==='out'?'我：':'')+(last.replied?(last.replyText??last.text):last.text);
    return {...thread,channel,preview:preview.replace(/\s+/g,' '),pending};
  });
}
