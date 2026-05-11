import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = `http://127.0.0.1:${process.env.BACKEND_PORT ?? 4242}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': backendTarget,
      '/ws': {
        target: backendTarget,
        ws: true,
      },
    },
  },
});
