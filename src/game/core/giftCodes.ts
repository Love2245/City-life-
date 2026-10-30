import type { GameState } from "../types";
import { recordMoney } from "./weekly";
import { reserveGiftCodeOnInstallation } from "../../lib/installation";
import {addItem,applyItem,getItem,itemCount} from './items';
import {GIFT_CODES} from '../data/giftCodes';
export {GIFT_CODES,type GiftCodeDef} from '../data/giftCodes';

const CODE_BY_TEXT = new Map(GIFT_CODES.map((code) => [code.normalizedCode, code]));

/** Normalize width, case, and accidental repeated whitespace while preserving code punctuation. */
export function normalizeGiftCodeInput(input: string): string {
  return (input ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export type GiftCodeRedemption =
  | { kind: "not_code" }
  | { kind: "expired"; codeId: string }
  | { kind: "unavailable"; codeId: string }
  | { kind: "redeemed"; codeId: string; amount: number; itemId?:string; itemName?:string };

/** Reserve a recognized code for this life; the save layer commits it after a successful write. */
export function redeemGiftCode(state: GameState, rawText: string): GiftCodeRedemption {
  const code = CODE_BY_TEXT.get(normalizeGiftCodeInput(rawText));
  if (!code) return { kind: "not_code" };
  if (state.flags[code.saveFlag]) return { kind: "expired", codeId: code.id };
  const item=code.itemId?getItem(code.itemId):undefined;
  if(code.itemId&&!item)return{kind:'unavailable',codeId:code.id};
  const reservation = reserveGiftCodeOnInstallation(code.id, state.rng.seed);
  if (!reservation.ok) {
    return reservation.reason === "storage_unavailable"
      ? { kind: "unavailable", codeId: code.id }
      : { kind: "expired", codeId: code.id };
  }
  state.flags[code.saveFlag] = true;
  if(code.amount){
    state.player.money=(Math.round(state.player.money*100)+Math.round(code.amount*100))/100;
    recordMoney(state, code.amount);
  }
  if(item){
    if(itemCount(state,item.id)<1)addItem(state,item.id,1);
    if(!state.flags[`item_${item.id}`])applyItem(state,item.id);
    return{kind:'redeemed',codeId:code.id,amount:code.amount,itemId:item.id,itemName:item.name};
  }
  return { kind: "redeemed", codeId: code.id, amount: code.amount };
}
