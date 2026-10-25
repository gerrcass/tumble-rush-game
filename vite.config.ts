import { defineConfig } from 'vite';

/**
 * GitHub Pages serves this project from a subpath. Every asset URL is produced
 * by Vite so the same build works locally at "/" and in production at
 * "/tumble-rush-game/".
 */
const pages = process.env.GITHUB_PAGES === 'true';
const base = pages ? '/tumble-rush-game/' : '/';

export default defineConfig({
  base,
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
    // Keep the initial payload lean; Three.js is the only large dependency.
    chunkSizeWarningLimit: 900,
  },
});
