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
      // Configure to forward origin header for OAuth metadata
      '/mcp': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/.well-known': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/register': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/get-access-token': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      // OAuth token endpoints (used by MCP SDK)
      '/token': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/access-token': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/authorize': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
      '/callback': {
        target: 'http://localhost:3000',
        changeOrigin: false,
        headers: { 'X-Forwarded-Origin': 'http://localhost:5173' },
      },
    },
  },
});
