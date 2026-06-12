import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Generate an updated service worker on each build. We deliberately do NOT
      // skipWaiting / clientsClaim: a new SW waits until the user accepts the
      // in-app "refresh" banner, so an update never reloads the page mid-match.
      registerType: 'autoUpdate',
      injectRegister: null, // we register manually via virtual:pwa-register in OfflineContext
      includeAssets: ['favicon.ico', 'favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'DartLead',
        short_name: 'DartLead',
        description: 'Darts tournament management',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Updates wait for user acceptance (see OfflineContext.applyUpdate)
        skipWaiting: false,
        clientsClaim: false,
        // Precache the app shell so it loads/reloads with no network
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // The landing-page logos are ~2.7MB combined and not needed for the
        // scoring/management flow — keep them out of the install so the SW
        // installs fast on poor WiFi (they still load normally when online).
        globIgnores: ['**/assets/logo-*.png', '**/assets/logo-icon-*.png'],
        // SPA fallback – pairs with the Vercel rewrite for client-side routing
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Cache Supabase GET reads so views render offline from last data.
            // Writes never hit this — they go through the app's offline queue.
            urlPattern: ({ url, request }) =>
              url.hostname.endsWith('.supabase.co') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        // Keep the SW off during `vite dev` (test via build + preview)
        enabled: false
      }
    })
  ]
})
