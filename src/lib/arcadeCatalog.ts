export interface ArcadeCatalogEntry<TConfig> {
  key: string;
  cfg: TConfig;
}

/** Collapse equivalent minigame configs for the catalogue, preserving the first canonical job entry. */
export function uniqueMiniGameEntries<TConfig>(entries: readonly ArcadeCatalogEntry<TConfig>[]): ArcadeCatalogEntry<TConfig>[] {
  const seen = new Set<string | undefined>();
  return entries.filter(({ cfg }) => {
    const signature = JSON.stringify(cfg);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
