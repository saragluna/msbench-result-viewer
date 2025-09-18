import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Allow overriding the base path for GitHub Pages deployments where the site is served from /<repo-name>/
// Use env var VITE_BASE_PATH if provided by the workflow, else default to '/' for local dev.
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [svelte()],
});
