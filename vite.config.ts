import {optimizeAssets} from './vite.optimizeAssets';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { npcPortraitLibrary } from './vite.npcPortraitLibrary';
import {assetUsage} from './vite.assetUsage';
import {mobileModels} from './vite.mobileModels';
export default defineConfig({
  plugins: [mobileModels(),npcPortraitLibrary(), svelte(),optimizeAssets(),assetUsage()],
  base: './',
  server: {
    host: '127.0.0.1', port: 1420, strictPort: true,
    // Windows can report EBUSY when large portable HTML files are replaced.
    // Build output and backups are not source inputs and must not restart the preview.
    watch: { ignored: ['**/.cache/**', '**/dist-portable/**', '**/artifacts/**', '**/待清理文件/**', '**/[0-9]*.html', '**/docs/**/before/**', '**/docs/**/ai-art/**', '**/都市生活_v*.html', '**/urban-life-v*.html', '**/src-tauri/target/**', '**/src-tauri/gen/android/**'] },
  },
  build: { target: 'es2020' },
  // Let the browser request the app's modules directly instead of crawling the
  // entire static asset graph before Vite serves the first page.
  optimizeDeps: { noDiscovery: true },
});

