/** Stable outfit IDs reuse the original upper-garment IDs; no duplicate save state. */
export const PLAYER_OUTFIT_SETS = [
  { id: 'white_vest', pants: 'black_pants', name: '基础背心套装' },
  { id: 'cyan_jacket', pants: 'black_pants', name: '青色外套套装' },
  { id: 'olive_overshirt', pants: 'sand_chinos', name: '橄榄绿休闲套装' },
  { id: 'navy_hoodie', pants: 'jeans', name: '藏蓝卫衣套装' },
  { id: 'plain_white_tee', pants: 'jeans', name: '白 T 牛仔套装' },
  { id: 'plain_black_tee', pants: 'charcoal_relaxed_jeans', name: '黑 T 休闲套装' },
  { id: 'plain_gray_tee', pants: 'khaki_pants', name: '灰 T 卡其套装' },
  { id: 'football_jersey', pants: 'sports_shorts', name: '绿茵足球套装' },
  { id: 'basketball_jersey', pants: 'sports_shorts', name: '街头篮球套装' },
  { id: 'farm_workwear', pants: 'khaki_pants', name: '田园工作套装' },
  { id: 'luxury_coat', pants: 'black_pants', name: '羊绒大衣套装' },
  { id: 'shirt', pants: 'plain_gray_pants', name: '浅色衬衫套装' },
  { id: 'suit', pants: 'black_pants', name: '深色正装套装' },
  { id: 'pinstripe_shirt', pants: 'brown_wide_trousers', name: '条纹衬衫套装' },
  { id: 'taupe_double_suit', pants: 'taupe_suit_trousers', name: '灰褐双排扣套装' },
  { id: 'cable_knit_sweater', pants: 'brown_wide_trousers', name: '绞花针织套装' },
  { id: 'cream_relaxed_shirt', pants: 'sage_wide_trousers', name: '奶油色衬衫套装' },
  { id: 'factory_uniform', pants: 'plain_gray_pants', name: '电子厂工作套装' },
  { id: 'service_apron', pants: 'black_pants', name: '咖啡服务套装' },
  { id: 'delivery_vest', pants: 'black_pants', name: '配送工作套装' },
] as const;
export type PlayerOutfitSet = (typeof PLAYER_OUTFIT_SETS)[number];
export function playerOutfitSet(id?: string): PlayerOutfitSet | undefined {
  return PLAYER_OUTFIT_SETS.find(set => set.id === id);
}
/** Only used for an old single-piece item, never to unlock sibling outfits. */
export const LEGACY_OUTFIT_ITEM: Readonly<Record<string, string>> = {
  sand_chinos: 'olive_overshirt', jeans: 'navy_hoodie', plain_gray_pants: 'shirt',
  black_pants: 'white_vest', khaki_pants: 'plain_gray_tee', brown_wide_trousers: 'pinstripe_shirt',
  taupe_suit_trousers: 'taupe_double_suit', charcoal_relaxed_jeans: 'plain_black_tee',
  sage_wide_trousers: 'cream_relaxed_shirt', sports_shorts: 'football_jersey',
  blue_collared_shirt: 'shirt', underlayer_white: 'white_vest', underlayer_gray: 'plain_gray_tee', underlayer_black: 'plain_black_tee',
};
export function outfitSetForItem(id: string) { return playerOutfitSet(id) ?? playerOutfitSet(LEGACY_OUTFIT_ITEM[id]); }
export function outfitParts(set: PlayerOutfitSet): ['clothes' | 'underlayer' | 'pants', string][] {
  return [['clothes', set.id], ['underlayer', 'underlayer_white'], ['pants', set.pants]];
}
