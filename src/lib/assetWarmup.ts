/**
 * Warm the heavy scene chunks before the player enters the game.
 *
 * The 3D rooms are split into their own chunks and are normally fetched the first time
 * a scene opens, which is exactly when the stutter shows up. Pulling them during the
 * menu transition moves that cost behind a progress indicator instead.
 *
 * This only prefetches module chunks; it never inflates the main bundle.
 */
export interface WarmupProgress {
  done: number;
  total: number;
  label: string;
}

const SCENE_CHUNKS: { label: string; load: () => Promise<unknown> }[] = [
  { label: '住宅', load: () => import('./homeRoom3D') },
  { label: '咖啡厅', load: () => import('./cafeRoom3D') },
  { label: '便利店', load: () => import('./convenienceStore3D') },
  { label: '公司办公室', load: () => import('./companyOffice3D') },
];

export async function warmupGameAssets(onProgress?: (progress: WarmupProgress) => void,sceneMode:'3d'|'2d'='3d'): Promise<void> {
  if(sceneMode==='2d'){onProgress?.({done:0,total:0,label:'场景图片将在进入时载入'});return;}
  const total = SCENE_CHUNKS.length;
  for (let index = 0; index < total; index += 1) {
    const step = SCENE_CHUNKS[index];
    onProgress?.({ done: index, total, label: step.label });
    try {
      await step.load();
    } catch {
      // A failed prefetch must not block entering the game; the scene loads on demand.
    }
  }
  onProgress?.({ done: total, total, label: '完成' });
}
