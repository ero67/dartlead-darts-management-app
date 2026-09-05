// Canonical public web address of the app, for links that leave the app:
// share links, password-reset emails. In the browser this is simply the
// current origin. Inside the Capacitor shell window.location.origin is a fake
// local address, so the native build must provide VITE_PUBLIC_APP_URL (set it
// in .env.production.local on the machine that builds the app).
export const getPublicAppUrl = () =>
  (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '');

// Contact address shown on the privacy policy and account-deletion pages.
// A business mailbox, not a secret; overridable per environment.
export const getSupportEmail = () => import.meta.env.VITE_SUPPORT_EMAIL || 'info@dartlead.app';
