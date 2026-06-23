import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',     // SPA — backend = API only
      precompress: false,
      strict: false
    }),
    alias: { $lib: 'src/lib' },

    // Lot J — Content Security Policy.
    // SvelteKit injects per-build hashes for inline scripts/styles automatically.
    // 'self'              = own origin (app + statics)
    // wss:/ws:            = Socket.io WebSocket
    // fonts.googleapis    = stylesheet for Google Fonts
    // fonts.gstatic       = font binaries for Google Fonts
    // data:               = inline favicon / SVG
    // blob:               = file previews from FilesModule (object URLs)
    csp: {
      mode: 'auto',     // hash in static prerender, nonce in SSR (we're static-only here)
      directives: {
        'default-src':     ["'self'"],
        'script-src':      ["'self'"],
        'style-src':       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src':        ["'self'", 'https://fonts.gstatic.com'],
        'img-src':         ["'self'", 'data:', 'blob:'],
        'connect-src':     ["'self'", 'http://localhost:47931', 'ws://localhost:47931', 'http://127.0.0.1:47931', 'ws://127.0.0.1:47931', 'http://localhost:3001', 'ws://localhost:3001', 'wss:', 'ws:', 'https:'],
        'manifest-src':    ["'self'"],
        'worker-src':      ["'self'"],
        'frame-ancestors': ["'none'"],   // anti-clickjacking (replaces X-Frame-Options)
        'base-uri':        ["'self'"],
        'form-action':     ["'self'"],
        'object-src':      ["'none'"],
      },
    },
  }
};

export default config;
