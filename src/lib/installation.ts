/** Stable local installation identity and installation-scoped gift-code ledger. */
import type { GameState } from "../game/types";
import {GIFT_CODES} from '../game/data/giftCodes';

const INSTALLATION_ID_KEY = "urban_life_installation_id";
const REDEEMED_CODES_KEY_PREFIX = "urban_life_redeemed_gift_codes_";
const inMemoryLedger = new Map<string, GiftCodeLedgerEntry>();
let fallbackInstallationId: string | null = null;

interface GiftCodeLedgerEntry {
  /** Stable for a life and shared by its manual/automatic save copies. */
  ownerSeed: number | null;
  status: "pending" | "committed";
}

type GiftCodeLedger = Map<string, GiftCodeLedgerEntry>;

function localStore(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function createInstallationId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  } catch {
    // Older WebViews can expose crypto while withholding randomUUID.
  }
  return `install-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Returns the stable local ID, creating and persisting it on first use. */
export function installationId(): string {
  const storage = localStore();
  if (storage) {
    try {
      const existing = storage.getItem(INSTALLATION_ID_KEY);
      if (existing) return existing;
      const created = createInstallationId();
      storage.setItem(INSTALLATION_ID_KEY, created);
      return created;
    } catch {
      // Keep the feature usable if this browser has disabled storage.
    }
  }
  fallbackInstallationId ??= createInstallationId();
  return fallbackInstallationId;
}

function ledgerKey(): string {
  return `${REDEEMED_CODES_KEY_PREFIX}${installationId()}`;
}

function parseLedger(raw: string | null): GiftCodeLedger {
  const ledger: GiftCodeLedger = new Map();
  if (!raw) return ledger;
  try {
    const value: unknown = JSON.parse(raw);
    // v1 ledger used string arrays and represents completed redemptions.
    if (Array.isArray(value)) {
      for (const id of value) {
        if (typeof id === "string") ledger.set(id, { ownerSeed: null, status: "committed" });
      }
      return ledger;
    }
    if (!value || typeof value !== "object") return ledger;
    const codes = (value as { codes?: unknown }).codes;
    if (!codes || typeof codes !== "object" || Array.isArray(codes)) return ledger;
    for (const [id, rawEntry] of Object.entries(codes)) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as { ownerSeed?: unknown; status?: unknown };
      if (entry.status !== "pending" && entry.status !== "committed") continue;
      ledger.set(id, {
        ownerSeed: typeof entry.ownerSeed === "number" && Number.isFinite(entry.ownerSeed)
          ? entry.ownerSeed
          : null,
        status: entry.status,
      });
    }
  } catch {
    // A corrupt ledger is treated as empty; normal game saves still carry their per-save flags.
  }
  return ledger;
}

function readLedger(): GiftCodeLedger {
  const storage = localStore();
  if (!storage) return new Map(inMemoryLedger);
  try {
    return parseLedger(storage.getItem(ledgerKey()));
  } catch {
    return new Map(inMemoryLedger);
  }
}

function writeLedger(ledger: GiftCodeLedger): boolean {
  const storage = localStore();
  if (!storage) {
    inMemoryLedger.clear();
    for (const [id, entry] of ledger) inMemoryLedger.set(id, entry);
    return true;
  }
  const payload = JSON.stringify({ version: 2, codes: Object.fromEntries(ledger) });
  try {
    storage.setItem(ledgerKey(), payload);
    inMemoryLedger.clear();
    for (const [id, entry] of ledger) inMemoryLedger.set(id, entry);
    return true;
  } catch {
    return false;
  }
}

export type GiftCodeReservationResult =
  | { ok: true }
  | { ok: false; reason: "already_redeemed" | "storage_unavailable" };

/** Reserve a code for one life before granting it; that life may recover a pending reservation. */
export function reserveGiftCodeOnInstallation(codeId: string, ownerSeed: number): GiftCodeReservationResult {
  const ledger = readLedger();
  const existing = ledger.get(codeId);
  if (existing?.status === "committed") return { ok: false, reason: "already_redeemed" };
  if (existing?.status === "pending") {
    return existing.ownerSeed === ownerSeed
      ? { ok: true }
      : { ok: false, reason: "already_redeemed" };
  }

  ledger.set(codeId, { ownerSeed, status: "pending" });
  return writeLedger(ledger)
    ? { ok: true }
    : { ok: false, reason: "storage_unavailable" };
}

/** Commit a pending code only after a save containing its per-save flag has been written. */
export function commitGiftCodeOnInstallation(codeId: string, ownerSeed: number): boolean {
  const ledger = readLedger();
  const existing = ledger.get(codeId);
  if (existing?.status === "committed") return true;
  // A loaded/imported save is durable evidence that the code was already redeemed.
  // Reconcile it even when an old pending ledger was cleared or belongs to a prior
  // installation identity, so restoring that save cannot redeem the code again.
  ledger.set(codeId, { ownerSeed, status: "committed" });
  return writeLedger(ledger);
}

/** Commit old or imported saves that already contain a redeemed-code flag. */
export function commitGiftCodesFromSave(state: Pick<GameState, "flags" | "rng">): void {
  for (const code of GIFT_CODES) {
    if (state.flags?.[code.saveFlag]) commitGiftCodeOnInstallation(code.id, state.rng.seed);
  }
}
