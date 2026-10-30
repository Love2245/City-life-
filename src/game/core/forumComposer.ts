import type { MomentCategory, Post } from "../types";
import type { GameState } from "../types";
import { postToForum } from "./forum";
import { redeemGiftCode,normalizeGiftCodeInput } from "./giftCodes";
import {allCitizens} from './citizens';

export type ForumComposerResult =
  | { kind: "empty" }
  | { kind: "posted"; post: Post }
  | { kind: "redeemed"; codeId: string; amount: number; itemId?:string; itemName?:string }
  | { kind: "expired"; codeId: string }
  | { kind: "unavailable"; codeId: string };

/** Route exact composer input to redemption before it can become a public forum post. */
export function submitForumComposer(
  state: GameState,
  rawText: string,
  category: MomentCategory = "daily",
): ForumComposerResult {
  const text = (rawText ?? "").trim();
  if (!text) return { kind: "empty" };

  const redemption = redeemGiftCode(state, text);
  if (redemption.kind === "redeemed" || redemption.kind === "expired" || redemption.kind === "unavailable") return redemption;

  const post = postToForum(state, text, category);
  if(post&&normalizeGiftCodeInput(text)==='mj'){
    post.comments=allCitizens().map(author=>({
      id:`${post.id}_mj_${author.id}`,authorId:author.id,
      authorName:author.netName??author.name,authorIcon:author.netAvatar??author.avatar,
      text:'mj',day:post.day,
    }));
  }
  return post ? { kind: "posted", post } : { kind: "empty" };
}
