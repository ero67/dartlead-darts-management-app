// sessionStorage key for the page to return to after login. Needed because
// Google OAuth does a full-page round trip and loses router state.
export const POST_LOGIN_REDIRECT_KEY = 'postLoginRedirect';

// Only allow internal app paths — never absolute URLs ("//evil.com" included).
export const isSafeRedirectPath = (path) =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
