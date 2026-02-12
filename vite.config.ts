import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Shared proxy configuration for all backend endpoints
const proxyConfig = {
  target: 'http://localhost:3000',
  changeOrigin: false,
  headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
};

export default defineConfig({
  plugins: [react()],
  root: './client',
  publicDir: 'static',
  build: {
    outDir: '../dist/client',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy MCP and API requests to backend during dev
      '/mcp': proxyConfig,
      '/api': proxyConfig,
      '/auth': proxyConfig,
      '/.well-known': proxyConfig,
      '/register': proxyConfig,
      '/get-access-token': proxyConfig,
      // OAuth token endpoints (used by MCP SDK)
      '/token': proxyConfig,
      '/access-token': proxyConfig,
      '/authorize': proxyConfig,
      '/callback': proxyConfig,
      '/encrypt': proxyConfig,
    },
  },
});
