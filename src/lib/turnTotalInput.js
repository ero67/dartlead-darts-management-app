// Input rules for the 3-dart-total entry field, shared by the match screen and
// practice mode. Kept apart from the keypad component so Fast Refresh keeps
// working (component files must export only components).

// Normalise typed digits: digits only, max three characters, no leading zeros.
// Never auto-corrects out-of-range values — the caller blocks submit and shows
// a warning instead.
export const normalizeTurnTotalInput = (value) => {
  const digitsOnly = String(value).replace(/\D/g, '').slice(0, 3);
  if (digitsOnly === '') return '';
  return digitsOnly.replace(/^0+(?=\d)/, '');
};

export const appendTurnTotalDigit = (prev, digit) => {
  const next = `${prev}${digit}`;
  if (next.length > 3) return prev;
  const normalized = next.replace(/^0+(?=\d)/, '');
  const n = normalized === '' ? 0 : Number(normalized);
  if (!Number.isFinite(n) || n > 180) return prev;
  return normalized;
};

// Empty input counts as 0: a bust or three misses is entered with a bare OK.
export const parseTurnTotal = (input) => {
  if (!input) return 0;
  const n = Number.parseInt(input, 10);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < 0 || n > 180) return null;
  return n;
};
