import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds the whole app into one self-contained HTML file (dist-single/index.html).
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000 },
});
