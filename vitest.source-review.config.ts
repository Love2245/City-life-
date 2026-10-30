// Source-only review checks; this does not replace the complete asset-dependent test suite.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    include: [
      'tests/mobileScenePerformance1498.test.ts',
      'tests/mobileGraphicsSafety1498.test.ts',
      'tests/releaseAssets1498.test.ts',
      'tests/sceneTextureCanvas.test.ts',
      'tests/stillContactShadows.test.ts',
      'tests/sceneBatching.test.ts',
      'tests/versionMetadata1498.test.ts',
      'tests/versionConsistency.test.ts',
    ],
  },
});
