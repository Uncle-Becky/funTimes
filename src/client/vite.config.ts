import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [visualizer({ template: 'raw-data', filename: '../../stats.json' })],
  build: {
    outDir: '../../webroot',
    emptyOutDir: true,
    sourcemap: true,
    minify: true,
    chunkSizeWarningLimit: 1500,
  },
});
