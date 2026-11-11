import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Builds the whole app into one self-contained HTML file (dist-single/index.html).
export default defineConfig({
  plugins: [svelte(), viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: 'dist-single', assetsInlineLimit: 100_000_000 },
});
