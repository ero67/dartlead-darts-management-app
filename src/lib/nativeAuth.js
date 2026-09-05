import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase.js';

// OAuth inside the Capacitor shell.
//
// A WebView cannot receive the OAuth redirect the way a browser tab does, so
// on Android/iOS we (1) ask Supabase for the provider URL without redirecting,
// (2) open it in the system browser (Chrome Custom Tab), and (3) let the
// provider bounce back to our custom URL scheme, which Android routes to the
// app as an `appUrlOpen` event. The tokens ride in the URL fragment (implicit
// flow, the client's default) and are handed to supabase-js with setSession().
// `?code=` is handled too, so switching the client to PKCE later needs no
// change here.
//
// Requirements outside this file:
//   - android/app/src/main/AndroidManifest.xml: VIEW intent filter for
//     @string/custom_url_scheme (com.dartlead.app)
//   - Supabase dashboard -> Authentication -> URL Configuration -> Redirect
//     URLs must contain NATIVE_AUTH_CALLBACK

export const NATIVE_AUTH_CALLBACK = 'com.dartlead.app://auth/callback';

export const isNativePlatform = () => Capacitor.isNativePlatform();

// Start the provider flow in the system browser. Resolves as soon as the
// browser is open; the session arrives later via completeNativeSignIn().
export async function startNativeOAuth(provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true }
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No OAuth URL returned');
  await Browser.open({ url: data.url, windowName: '_self' });
  return data;
}

// Turn a callback URL into a session. Returns false for unrelated URLs,
// true when a session was established, throws when the provider reported an
// error or the URL carried nothing usable.
export async function completeNativeSignIn(url) {
  if (!url || !url.startsWith(NATIVE_AUTH_CALLBACK)) return false;

  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const fragment = new URLSearchParams(hashIndex >= 0 ? url.slice(hashIndex + 1) : '');
  const query = new URLSearchParams(
    queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : ''
  );

  const oauthError = fragment.get('error') || query.get('error');
  if (oauthError) {
    throw new Error(fragment.get('error_description') || query.get('error_description') || oauthError);
  }

  const code = query.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }

  const access_token = fragment.get('access_token');
  const refresh_token = fragment.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return true;
  }

  throw new Error('Sign-in callback did not contain a session');
}

// Wire up deep-link handling. Call once from the auth provider on native.
// onError receives a message for the UI; returns a cleanup function.
export function listenForNativeSignIn(onError) {
  let handle = null;
  let disposed = false;

  const handleUrl = async (url) => {
    try {
      const done = await completeNativeSignIn(url);
      if (done) {
        // Custom Tabs on Android close on their own when the app takes focus;
        // this is for platforms where they don't. Never fatal.
        Browser.close().catch(() => {});
      }
    } catch (error) {
      console.error('Native sign-in failed:', error);
      onError?.(error?.message || String(error));
    }
  };

  CapacitorApp.addListener('appUrlOpen', ({ url }) => handleUrl(url)).then((h) => {
    if (disposed) h.remove();
    else handle = h;
  });
  // Cold start straight from the callback link (app was not running).
  CapacitorApp.getLaunchUrl().then((launch) => launch?.url && handleUrl(launch.url)).catch(() => {});

  return () => {
    disposed = true;
    handle?.remove();
  };
}
