const images = import.meta.glob<string>("../assets/items/v1.48/fish/*.{png,svg}", { eager: true, query: "?url", import: "default" });
export function fishImage(species: string): string | undefined {
  const base = `../assets/items/v1.48/fish/${species}`;
  return images[`${base}.png`] ?? images[`${base}.svg`];
}
