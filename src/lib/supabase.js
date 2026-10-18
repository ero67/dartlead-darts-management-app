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

export const supabase = createClient(supabaseUrl, supabaseKey, { global: { fetch: fetchWithTimeout } })

// Helper function to generate UUIDs (for when we don't have uuid extension)
export const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
