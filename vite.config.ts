import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
//
// `base` must match the GitHub Pages project path so the built JS/CSS
// bundle URLs resolve correctly. For Jayc92/trackside-tales served at
// https://Jayc92.github.io/trackside-tales/ that path is /trackside-tales/.
//
// Hash routing (#/home, #/beers, …) is unaffected — the fragment is
// resolved client-side and never hits the server, so no SPA fallback is
// required.
export default defineConfig({
  plugins: [react()],
  base: '/trackside-tales/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
