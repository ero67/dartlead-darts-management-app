// Turn a speech-recognition transcript into a 3-dart total (0–180) or a
// command. Recognisers usually emit digits for numbers ("140"); the word
// tables are the fallback for "one forty", "stoštyridsať", "ton eighty".
// Returns { score, submit? } ("140 ok" submits in one breath), { command: 'submit' }
// or null when nothing parsed.

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const WORDS = {
  en: {
    hundred: 100, ton: 100, ninety: 90, eighty: 80, seventy: 70, sixty: 60, fifty: 50, forty: 40, thirty: 30, twenty: 20,
    nineteen: 19, eighteen: 18, seventeen: 17, sixteen: 16, fifteen: 15, fourteen: 14, thirteen: 13, twelve: 12, eleven: 11, ten: 10,
    nine: 9, eight: 8, seven: 7, six: 6, five: 5, four: 4, three: 3, two: 2, one: 1, zero: 0
  },
  sk: {
    sto: 100, devatdesiat: 90, osemdesiat: 80, sedemdesiat: 70, sestdesiat: 60, patdesiat: 50, styridsat: 40, tridsat: 30, dvadsat: 20,
    devatnast: 19, osemnast: 18, sedemnast: 17, sestnast: 16, patnast: 15, strnast: 14, trinast: 13, dvanast: 12, jedenast: 11, desat: 10,
    devat: 9, osem: 8, sedem: 7, sest: 6, pat: 5, styri: 4, tri: 3, dve: 2, dva: 2, jedna: 1, jeden: 1, nula: 0
  }
};

const ZERO = /\b(bust|no score|miss(ed)?|nothing|nic|bez bodov|prestrel(il)?|preslo|mimo)\b/;
const SUBMIT = /\b(ok|okay|enter|submit|confirm|potvrd(it|ene)?|hotovo|zapis)\b/;

// Longest word first so "sixty" wins over "six" and "stoosemdesiat" splits
// into sto + osemdesiat without spaces.
const patterns = Object.fromEntries(
  Object.entries(WORDS).map(([lang, table]) => [lang, new RegExp(Object.keys(table).sort((a, b) => b.length - a.length).join('|'), 'g')])
);

const inRange = (n) => (Number.isInteger(n) && n >= 0 && n <= 180 ? { score: n } : null);

export const parseSpokenScore = (transcript, lang = 'en') => {
  if (!transcript) return null;
  const text = strip(transcript).trim();
  const submit = SUBMIT.test(text);

  // Streaming transcripts accumulate ("60 no 100 ok"), so the last number wins.
  const digits = text.match(/\d+/g);
  let parsed = digits ? inRange(Number(digits[digits.length - 1])) : null;
  if (!parsed && ZERO.test(text)) parsed = { score: 0 };

  if (!parsed) {
    const table = WORDS[lang] || WORDS.en;
    const tokens = [];
    text.replace(patterns[lang] || patterns.en, (w) => { tokens.push(table[w]); return ' '; });
    if (tokens.length > 0) {
      // "one forty" → 140, "one hundred and forty" → 140, "ton eighty" → 180,
      // "twenty six" → 26, "sto styridsat" → 140.
      let total = 0;
      for (const n of tokens) {
        if (n === 100) total = total > 0 && total < 10 ? total * 100 : total + 100;
        else if (total > 0 && total < 10 && n >= 10) total = total * 100 + n;
        else total += n;
      }
      parsed = inRange(total);
    }
  }

  if (parsed) return submit ? { ...parsed, submit: true } : parsed;
  return submit ? { command: 'submit' } : null;
};

export const speechLocale = (lang) => (lang === 'sk' ? 'sk-SK' : 'en-GB');
