import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build de produção apenas. O frontend é buildado em dist/ e servido pelo
// backend Express em http://127.0.0.1:4242 (server/index.js).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
