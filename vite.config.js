import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      // gnugo-loader is a classic script loaded via <script> tag in public/,
      // treat GnuGoLoader as an external global so Vite won't try to bundle it.
      external: [],
    },
  },
});
