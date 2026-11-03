import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` produit le site pour GitHub Pages (chemins relatifs).
// `npm run build:single` produit un seul fichier HTML autonome.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
