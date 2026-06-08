import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    proxy: {
      // Backend API under /api prefix to avoid collision with SvelteKit /room/[id] route
      '/api':       { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true }
    }
  }
});
