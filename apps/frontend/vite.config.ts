import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: '0.0.0.0',                       // expose sur LAN (mobile/autre laptop sur le Wi-Fi)
    port: 5173,
    strictPort: true,
    proxy: {
      // Backend API sous /api pour éviter collision avec SvelteKit /room/[id]
      '/api':       { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true }
    }
  }
});
