import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
// Production deploys live under the /organizer/ path on GH Pages; CF Pages
// previews serve the dist root at "/", so we let the workflow override via
// VITE_BASE_PATH to avoid 404s on the /organizer/-prefixed asset URLs baked
// into index.html.
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/organizer/'

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'prompt',
      injectRegister: false,   // T3 owns registration
      manifest: false,         // use existing public/manifest.json (fixed in T4)
      workbox: {
        globPatterns: [
          'index.html',
          'assets/*.js',
          'assets/*.css',
          'assets/*.wasm',
          'favicon.svg',
          'icon-192.png',
          'icon-512.png',
          'manifest.json',
        ],
        globIgnores: ['stats.html', 'assets/*.woff', 'assets/*.woff2', 'assets/utils-*.js'],
        // Precache .wasm too — the sqlite3 worker fetches it during init,
        // and on the very first session the runtime cache hasn't populated
        // yet (SW install is still completing). Without precache, an offline
        // reload after a single warm load fails: db.worker can't fetch the
        // wasm. ~2MB precache cost; required for the airplane-read flow.
        // Workbox precache size cap. The default 2MB rejects per-chunk; bump
        // to a generous 10MB so the full lazy-chunk graph (~2-3MB total)
        // lands in precache. Exceeding this on a single file is a real
        // signal — it'd mean a vendor chunk grew unexpectedly.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // navigateFallback must use the actual served path. GH Pages production
        // serves at /organizer/index.html; CF Pages preview serves at /index.html.
        // VITE_BASE_PATH determines which one this build deploys to.
        navigateFallback: BASE_PATH + 'index.html',
        navigateFallbackDenylist: [new RegExp(`^${BASE_PATH}api/`)],   // reserved; no such route today
        // skipWaiting + clientsClaim: a fresh-install SW must take control of
        // the current page so the *next* navigation (e.g. an offline reload)
        // is SW-served. With both false, the new SW stays "waiting" until all
        // clients close — and `page.reload()` doesn't close the client, so
        // the reload navigates without SW control and fails offline.
        // The previous false/false config was safe for production update
        // flows (avoids surprise upgrades mid-session) but breaks the
        // first-install-then-go-offline path that the airplane-read e2e
        // covers and that real users hit on first PWA install + airplane mode.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // sw-uid-handler.js listens for SET_CACHE_UID messages from the page
        // and writes __SB_UID__ into the SW's globalThis so the
        // cacheKeyWillBeUsed plugin below can partition cache keys per user.
        importScripts: ['sw-uid-handler.js'],
        runtimeCaching: [
          // T12: supabase-rest StaleWhileRevalidate cache retired — SQLite is now
          // the authoritative read source for authenticated users (plan §4.9).
          // The cache entry is removed; no fallback rule is added because
          // unauthenticated first-boot does not hit /rest/v1/* and the SQLite
          // flag gates all authenticated reads through the local DB.
          {
            // Match assets/ regardless of base-path prefix. GH Pages production
            // serves at /organizer/assets/...; CF Pages preview at /assets/...
            // The hardcoded /organizer/ prefix was an `airplane-read` blocker:
            // on CF preview, lazy chunks weren't runtime-cached because the
            // pattern never matched, so offline reload couldn't serve them.
            urlPattern: /\/assets\/.*\.(woff2?|ttf)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // T4: include .wasm alongside .js so sqlite3.wasm gets runtime-cached.
            // maxEntries bumped 40 → 60 to accommodate the worker + wasm chunks.
            urlPattern: /\/assets\/.*\.(js|wasm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'view-chunks',
              expiration: { maxEntries: 60, maxAgeSeconds: 2592000 /* 30 d */ },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    visualizer({ filename: 'dist/stats.html', template: 'treemap', gzipSize: true, brotliSize: true }),
  ],
  // T1: exclude sqlite-wasm from Vite's dep optimizer — it ships its own wasm
  // and must not be pre-bundled.
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  // T1: build workers as ES modules (required for dynamic import inside the worker)
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (/\/node_modules\/(@supabase\/[^/]+|phoenix)\//.test(id)) return 'supabase-vendor'
        },
      },
    },
  },
})
