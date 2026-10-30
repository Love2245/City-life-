import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Type checking must not load production asset plugins or the external portrait library.
// Keep CSS preprocessing enabled with an isolated Vite config.
export default {
  preprocess: vitePreprocess({ style: { configFile: false } }),
};
