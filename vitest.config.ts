import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { npcPortraitLibrary } from './vite.npcPortraitLibrary';
export default defineConfig({plugins:[npcPortraitLibrary(),svelte({hot:false})],resolve:{conditions:['browser']},test:{include:['tests/**/*.test.ts'],environment:'node',maxWorkers:2,minWorkers:1}});
