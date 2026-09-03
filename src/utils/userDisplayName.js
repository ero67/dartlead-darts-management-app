// The name a signed-in account is shown under.
//
// `display_name` is the user's own choice (editable on their profile) and is
// never touched by OAuth. `full_name` / `name` are what Google writes on every
// sign-in, so they can't hold an edit — they are only the fallback.
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;

export function getUserDisplayName(user) {
  const meta = user?.user_metadata || {};
  const candidates = [meta.display_name, meta.full_name, meta.name];
  const found = candidates.find(v => typeof v === 'string' && v.trim().length > 0);
  return found ? found.trim() : '';
}

// Collapse inner whitespace and trim; returns '' when the result is unusable.
export function normalizeDisplayName(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length < DISPLAY_NAME_MIN || cleaned.length > DISPLAY_NAME_MAX) return '';
  return cleaned;
}
