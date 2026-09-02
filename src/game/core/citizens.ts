/**
 * v1.3 市民作者池（论坛发帖 / Moments 市民动态）
 * 随机路人，用于侧面教学城市玩法与丰富社交氛围。
 */
import citizensData from "../data/citizens.json";
import type { CitizenAuthor } from "../types";

interface CitizenDef {
  id: string;
  name: string;
  avatar: string;
  tag: string;
  /** v1.3b8 论坛显示用网名（优先于 name，如"深夜干饭王"） */
  netName?: string;
  /** v1.3b8 论坛显示用网络头像（优先于 avatar） */
  netAvatar?: string;
}

const CITIZENS: CitizenDef[] = (citizensData as { citizens: CitizenDef[] }).citizens;

/** 全部市民定义 */
export function allCitizens(): CitizenAuthor[] {
  // v1.3b8 修复：透传 netName/netAvatar（此前被丢弃，导致论坛网名显示失效）
  return CITIZENS.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, tag: c.tag, netName: c.netName, netAvatar: c.netAvatar }));
}

/** 按 id 取市民 */
export function getCitizen(id: string): CitizenAuthor | undefined {
  const c = CITIZENS.find((x) => x.id === id);
  return c ? { id: c.id, name: c.name, avatar: c.avatar, tag: c.tag, netName: c.netName, netAvatar: c.netAvatar } : undefined;
}
