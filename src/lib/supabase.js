import { Capacitor } from '@capacitor/core'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

// Hall WiFi: a request that never completes used to hang forever, and with it
// everything waiting on it (silent refreshes stay blocked behind an in-flight
// match completion). Give up after 20 s instead; writers already queue and
// retry, readers just refresh again.
const REQUEST_TIMEOUT_MS = 20000
const fetchWithTimeout = (url, options = {}) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = options.signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([options.signal, timeout])
    : (options.signal || timeout)
  return fetch(url, { ...options, signal })
}

// Native: PKCE, so a code caught by another app claiming our deep-link scheme
// is useless without the verifier kept in this WebView. Web keeps implicit.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: { fetch: fetchWithTimeout },
  auth: { flowType: Capacitor.isNativePlatform() ? 'pkce' : 'implicit' }
})

// Password-reset links open in the phone's browser, which never has the PKCE
// verifier the app stored, so the app requests them through an implicit-flow
// client. The link lands on the https site, not the deep link.
export const createImplicitAuthClient = () =>
  createClient(supabaseUrl, supabaseKey, {
    global: { fetch: fetchWithTimeout },
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'dartlead-implicit-auth' }
  })

// Helper function to generate UUIDs (for when we don't have uuid extension)
export const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
