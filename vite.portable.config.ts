import {optimizeAssets} from './vite.optimizeAssets';
import {assetUsage} from './vite.assetUsage';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { npcPortraitLibrary } from './vite.npcPortraitLibrary';
import {mobileModels} from './vite.mobileModels';
export default defineConfig({plugins:[mobileModels(),npcPortraitLibrary(),svelte(),optimizeAssets(),assetUsage(),viteSingleFile({useRecommendedBuildConfig:false,inlinePattern:['**/*.js','**/*.css']})],base:'./',build:{outDir:'dist-portable',target:'es2020',assetsInlineLimit:0,cssCodeSplit:false,modulePreload:false,rollupOptions:{output:{inlineDynamicImports:true,assetFileNames:'[name]-[hash][extname]'}}}});
