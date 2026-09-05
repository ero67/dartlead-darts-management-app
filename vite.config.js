/* global process */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Build identity shown in Device Settings ("which version are you on?").
// Vercel exposes the commit; locally we ask git; either may be unavailable.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const buildSha = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'dev' }
})()

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new service worker WAITS until the app tells it to take over
      // (see OfflineContext), so an update can never reload the page mid-match.
      // NB: 'autoUpdate' would silently force skipWaiting/clientsClaim on and
      // reload as soon as the new worker activates, ignoring the workbox flags
      // below — that is what the previous config did, despite its comment.
      registerType: 'prompt',
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
        // Updates wait until OfflineContext applies them at a safe moment
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
            // Cache ONLY Supabase REST data reads (/rest/v1) so views can render
            // offline from the last data. We deliberately exclude /auth/v1 and
            // /realtime — caching auth responses can serve a stale/empty session
            // right after reconnect, which made authenticated writes (e.g. saving
            // a match result) fail. Auth and realtime must always hit the network.
            urlPattern: ({ url, request }) =>
              url.hostname.endsWith('.supabase.co') &&
              url.pathname.startsWith('/rest/v1') &&
              request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
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
