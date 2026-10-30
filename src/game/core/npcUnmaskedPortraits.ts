// @ts-expect-error Resolved by the Vite NPC portrait library plugin.
import { npcLibraryPortraitSources } from "virtual:npc-portrait-library";

/**
 * NPC 清晰原图资源表。首次相遇、对话和场景预览统一使用此表，
 * 资源 URL 同步可用，图片由浏览器按需解码，便携版会将图片一并内联。
 */
const projectPortraitSources = import.meta.glob([
  "/src/assets/portraits/unmasked-clean/**/*.png",
  "!/src/assets/portraits/unmasked-clean/npc_*/emotion_*.png",
  "!/src/assets/portraits/unmasked-clean/npc_li_na/**/*.png",
  "!/src/assets/portraits/unmasked-clean/npc_oldtown_station_clerk/**/*.png",
  "!/src/assets/portraits/unmasked-clean/npc_school_coordinator/**/*.png",
  "!/src/assets/portraits/unmasked-clean/npc_pharmacist/**/*.png",
  "!/src/assets/portraits/unmasked-clean/npc_suburb_station_staff/**/*.png",
], {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

export const unmaskedPortraitSources = {
  ...projectPortraitSources,
  ...npcLibraryPortraitSources,
} as Record<string, string>;
