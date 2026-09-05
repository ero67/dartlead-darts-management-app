// Canonical public web address of the app, for links that leave the app:
// share links, password-reset emails. In the browser this is simply the
// current origin. Inside the Capacitor shell window.location.origin is a fake
// local address, so the native build must provide VITE_PUBLIC_APP_URL (set it
// in .env.production.local on the machine that builds the app).
export const getPublicAppUrl = () =>
  (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '');
