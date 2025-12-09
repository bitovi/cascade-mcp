import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: '.', // Project root
  publicDir: 'static', // Existing static folder
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy MCP and API requests to backend during dev
      '/mcp': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/.well-known': 'http://localhost:3000',
      '/register': 'http://localhost:3000',
      '/get-access-token': 'http://localhost:3000',
    },
  },
});
