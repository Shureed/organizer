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
        globIgnores: ['stats.html', 'assets/*.woff', 'assets/*.woff2', 'assets/utils-*.js'],
        navigateFallback: '/organizer/index.html',
        navigateFallbackDenylist: [/^\/organizer\/api\//],   // reserved; no such route today
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
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
            urlPattern: /\/organizer\/assets\/.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'view-chunks',
              expiration: { maxEntries: 40, maxAgeSeconds: 2592000 /* 30 d */ },
            },
          },
          // Supabase REST rule added in T5 (first-match wins; prepended above these two).
        ],
      },
      devOptions: { enabled: false },
    }),
    visualizer({ filename: 'dist/stats.html', template: 'treemap', gzipSize: true, brotliSize: true }),
  ],
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
