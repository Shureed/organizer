import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/organizer/',
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
          'assets/rolldown-runtime-*.js',
          'assets/preload-helper-*.js',
          'assets/react-vendor-*.js',
          'assets/supabase-vendor-*.js',
          'assets/index-*.js',
          'assets/index-*.css',
          'favicon.svg',
          'icon-192.png',
          'icon-512.png',
          'manifest.json',
        ],
        globIgnores: ['stats.html', 'assets/*.woff', 'assets/*.woff2', 'assets/utils-*.js', 'assets/*.wasm'],
        navigateFallback: '/organizer/index.html',
        navigateFallbackDenylist: [/^\/organizer\/api\//],   // reserved; no such route today
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        // sw-uid-handler.js listens for SET_CACHE_UID messages from the page
        // and writes __SB_UID__ into the SW's globalThis so the
        // cacheKeyWillBeUsed plugin below can partition cache keys per user.
        importScripts: ['sw-uid-handler.js'],
        runtimeCaching: [
          // Supabase REST — StaleWhileRevalidate, 24 h TTL, 50-entry cap.
          // Must be first (first-match wins). POST/PATCH/DELETE are excluded via method guard.
          // Cache key is partitioned per-user via cacheKeyWillBeUsed (T6, __SB_UID__ global).
          {
            urlPattern: ({ url, request }: { url: URL; request: Request }) =>
              request.method === 'GET' &&
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.startsWith('/rest/v1/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'supabase-rest',
              expiration: { maxAgeSeconds: 86400, maxEntries: 50 },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
                    const uid = (globalThis as unknown as { __SB_UID__?: string }).__SB_UID__ ?? 'anon'
                    const url = new URL(request.url)
                    url.searchParams.set('__u', uid)
                    return url.toString()
                  },
                },
              ],
            },
          },
          {
            urlPattern: /\/organizer\/assets\/.*\.(woff2?|ttf)$/,
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
            urlPattern: /\/organizer\/assets\/.*\.(js|wasm)$/,
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
