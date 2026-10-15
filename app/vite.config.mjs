import { defineConfig } from 'vite';

// Assets use the site root so clean nested routes can load directly.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    // three.js (~590 KB minified) in a file of its own: it changes only with a three.js upgrade,
    // so a returning visitor keeps it cached when the app changes.
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } },
      // jsPDF can import these for html() and SVG, which the book never calls (it only adds JPEG
      // pages): leave them out of the build instead of shipping ~380 KB nobody loads.
      external: ['html2canvas', 'dompurify', 'canvg'],
    },
    // three.js itself cannot be split further; anything else this large would be new.
    chunkSizeWarningLimit: 650,
  },
});
