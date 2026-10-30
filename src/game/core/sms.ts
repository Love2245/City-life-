import type { GameState, SmsMessage } from "../types";
import { fromLinearDay, gameDay, START_EPOCH } from "./calendar";

type EstimatedSmsMessage = SmsMessage & { timestampEstimated?: boolean };

const SENDER_CONTACT_IDS: Record<string, string> = {
  "妈妈": "parent_mother",
  "妈": "parent_mother",
  "母亲": "parent_mother",
  "爸爸": "parent_father",
  "爸": "parent_father",
  "父亲": "parent_father",
  "组长": "factory_leader",
  "工厂组长": "factory_leader",
  "棋摊大爷": "park_chess_grandpa",
  "书法大爷": "park_calligraphy_grandpa",
  "程序员小哥": "library_coder",
  "咖啡店员": "cafe_clerk",
  "便利店店长": "convenience_clerk",
  "房东": "landlord",
};

function cleanSender(sender: string): string {
  return sender.trim().replace(/[：:]$/, "");
}

/** Resolve a durable conversation identity without relying on the visible display name. */
export function conversationIdForMessage(
  state: GameState,
  message: Pick<SmsMessage, "sender"> & Partial<Pick<SmsMessage, "conversationId" | "contactId" | "npcId" | "dir" | "replyToId" | "id">>,
): string {
  const sender = cleanSender(message.sender);
  // Grandmother is a family conversation, never a normal contact thread. Some old saves
  // have inconsistent contact metadata, so the actual sender identity takes precedence.
  if ((sender === "奶奶" || sender === "姥姥") && message.dir !== "out") return "family:grandmother";

  // Old desktop saves could persist a standalone `我` conversation. A reply still has
  // the recipient's original message available through replyToId, so recover its thread.
  const legacyParentId = message.id?.match(/^(?:out|resp)_(.+)$/)?.[1];
  const linkedMessageId = message.replyToId ?? legacyParentId;
  if (linkedMessageId) {
    const parent = state.smsInbox.find((candidate) => candidate.id === linkedMessageId);
    if (parent && parent.id !== (message as SmsMessage).id) {
      const parentSender = cleanSender(parent.sender);
      if (parentSender === "奶奶" || parentSender === "姥姥") return "family:grandmother";
      if (parent.contactId) return `contact:${parent.contactId}`;
      if (parent.npcId) return `npc:${parent.npcId}`;
      if (parent.conversationId && parent.conversationId !== "system:outgoing" && parent.conversationId !== "sender:我") {
        return parent.conversationId;
      }
      return conversationIdForMessage(state, parent);
    }
  }

  if (message.conversationId && message.conversationId !== "system:outgoing" && message.conversationId !== "sender:我") {
    return message.conversationId;
  }
  if (message.contactId) return `contact:${message.contactId}`;
  if (message.npcId) return `npc:${message.npcId}`;

  const exactMatches = state.contacts.filter((contact) => contact.name === sender);
  if (exactMatches.length === 1) return `contact:${exactMatches[0].id}`;
  const mappedId = SENDER_CONTACT_IDS[sender];
  if (mappedId && state.contacts.some((contact) => contact.id === mappedId)) return `contact:${mappedId}`;
  if (sender === "我") return "system:outgoing";
  return `sender:${sender || "unknown"}`;
}

export interface SmsThread {
  key: string;
  name: string;
  icon: string;
  msgs: SmsMessage[];
  last: SmsMessage;
  unread: number;
}

function messageTimestamp(message: SmsMessage): number {
  return message.sentAt ?? message.day * 1440;
}

/** Shared phone and laptop conversation grouping; both surfaces must resolve the same recipient. */
export function groupSmsThreads(state: GameState): SmsThread[] {
  const map = new Map<string, { key: string; name: string; icon: string; msgs: SmsMessage[] }>();
  for (const message of state.smsInbox) {
    const originalKey = conversationIdForMessage(state, message);
    // Once a person is in the address book, old NPC/name threads share that contact's inbox.
    const resolvedContact = originalKey.startsWith('npc:')
      ? state.contacts.find(c=>c.npcId===originalKey.slice(4))
      : originalKey.startsWith('sender:') ? state.contacts.find(c=>c.name===originalKey.slice(7)) : undefined;
    const key = resolvedContact ? `contact:${resolvedContact.id}` : originalKey;
    const contactId = contactIdFromConversationId(key);
    const contact = contactId
      ? state.contacts.find((candidate) => candidate.id === contactId)
      : key.startsWith("npc:")
        ? state.contacts.find((candidate) => candidate.npcId === key.slice("npc:".length))
        : undefined;
    let thread = map.get(key);
    if (!thread) {
      const sender = cleanSender(message.sender);
      const name = contact?.name ?? (key === "family:grandmother"
        ? "奶奶"
        : sender === "我" ? "待识别会话" : sender);
      const icon = contact?.avatar ?? (key === "family:grandmother" ? "👵" : message.senderIcon);
      thread = { key, name, icon, msgs: [] };
      map.set(key, thread);
    } else if (thread.name === "待识别会话" && cleanSender(message.sender) !== "我") {
      thread.name = cleanSender(message.sender);
      thread.icon = message.senderIcon;
    }
    thread.msgs.push(message);
  }

  return [...map.values()].map((thread) => {
    const msgs = [...thread.msgs].sort((a, b) => messageTimestamp(a) - messageTimestamp(b));
    const last = msgs[msgs.length - 1];
    return {
      ...thread,
      msgs,
      last,
      unread: msgs.filter((message) => !message.replied && !message.read && message.dir === "in").length,
    };
  }).sort((a, b) => messageTimestamp(b.last) - messageTimestamp(a.last));
}

/** Absolute in-game minute, suitable for sorting messages across days. */
export function currentSmsTimestamp(state: GameState): number {
  return gameDay(state.time) * 1440 + state.time.hour * 60 + state.time.minute;
}

/** Allocate an ID that remains unique even when an old save already contains a long inbox. */
export function nextSmsId(state: GameState, prefix = "sms"): string {
  let sequence = typeof state.flags.sms_sequence === "number" && Number.isSafeInteger(state.flags.sms_sequence)
    ? Math.max(0, state.flags.sms_sequence)
    : 0;
  let id = "";
  do {
    sequence += 1;
    id = `${prefix}_${sequence}`;
  } while (state.smsInbox.some((message) => message.id === id));
  state.flags.sms_sequence = sequence;
  return id;
}

function isSyntheticLegacyAcknowledgement(message: SmsMessage): boolean {
  const option = message.options?.length === 1 ? message.options[0] : undefined;
  return message.dir === "in" && message.id.startsWith("sys_") && option?.label === "好的" && option.reply === "👍";
}

/**
 * Fill in metadata for pre-v1.48 saves. This is idempotent and preserves every message,
 * meaningful pending option, and already-settled reply. Only the old fake "好的 / 👍"
 * auto-reply that was generated for notifications is removed.
 */
export function normalizeMessages(state: GameState): void {
  const usedIds = new Set<string>();
  state.smsInbox = (state.smsInbox ?? []).map((message, index) => {
    const normalized = message as EstimatedSmsMessage;
    if (!Array.isArray(normalized.options)) normalized.options = [];
    if (isSyntheticLegacyAcknowledgement(normalized)) normalized.options = [];

    if (!normalized.id || usedIds.has(normalized.id)) {
      const base = normalized.id || "legacy_sms";
      let replacement = `${base}_legacy_${index + 1}`;
      while (usedIds.has(replacement)) replacement += "_";
      normalized.id = replacement;
    }
    usedIds.add(normalized.id);

    const legacyParentId = normalized.id.match(/^(?:out|resp)_(.+)$/)?.[1];
    const linkedMessageId = normalized.replyToId ?? legacyParentId;
    const parent = linkedMessageId ? state.smsInbox.find((candidate) => candidate.id === linkedMessageId) : undefined;
    if (parent && parent.id !== normalized.id) normalized.replyToId ??= parent.id;
    const inferredConversation = parent
      ? conversationIdForMessage(state, parent)
      : conversationIdForMessage(state, normalized);
    const isGrandmotherMessage = (cleanSender(normalized.sender) === "奶奶" || cleanSender(normalized.sender) === "姥姥") && normalized.dir !== "out";
    if (isGrandmotherMessage) {
      normalized.conversationId = "family:grandmother";
    } else if (!normalized.conversationId || normalized.conversationId === "system:outgoing" || normalized.conversationId === "sender:我" || parent) {
      normalized.conversationId = inferredConversation;
    }
    if (!Number.isFinite(normalized.sentAt)) {
      const day = Number.isFinite(normalized.day) ? normalized.day : gameDay(state.time);
      // Existing messages lack clock time; preserve their inbox order within the day.
      normalized.sentAt = day * 1440 + Math.min(index, 1439);
      normalized.timestampEstimated = true;
    }
    return normalized;
  });
}

export function formatSmsTimestamp(timestamp: number | undefined, fallbackDay = 0, estimated = false): string {
  if (!Number.isFinite(timestamp)) return `D${fallbackDay + 1}`;
  const value = Math.max(0, Math.floor(timestamp!));
  const day = Math.floor(value / 1440);
  const minuteOfDay = value % 1440;
  const date = fromLinearDay(START_EPOCH + day);
  if (estimated) return `${date.month}/${date.day} · 时间未记载`;
  const hour = Math.floor(minuteOfDay / 60).toString().padStart(2, "0");
  const minute = (minuteOfDay % 60).toString().padStart(2, "0");
  return `${date.month}/${date.day} ${hour}:${minute}`;
}

export function contactIdFromConversationId(conversationId: string | null | undefined): string | undefined {
  if (!conversationId) return undefined;
  return conversationId.startsWith("contact:") ? conversationId.slice("contact:".length) : undefined;
}

