import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { standOfflinePlugin } from './scripts/stand-offline-plugin.mjs';

// Build de produção apenas. O frontend é buildado em dist/ e servido pelo
// backend Express em http://127.0.0.1:4242 (server/index.js).
export default defineConfig({
  plugins: [react(), standOfflinePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src'),
    },
  },
});
