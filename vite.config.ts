import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base ensures static assets and ./data/*.csv work identically on:
  // 1) GitHub Pages subpath (https://hadealahmad.github.io/jar-of-links/)
  // 2) Custom root domain later (https://jar.hadealahmad.com/)
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    target: 'es2022',
  },
});
