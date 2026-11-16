// Self-check: the production CSP lets Supabase Storage images (league logos,
// player photos) load. node scripts/check-csp.mjs → "ok"
import assert from 'node:assert/strict';
import fs from 'node:fs';

const headers = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).headers;
const csp = headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
const imgSrc = csp.split(';').map(s => s.trim()).find(s => s.startsWith('img-src'));
assert.ok(imgSrc.split(/\s+/).includes('https://*.supabase.co'), `img-src misses Supabase Storage: ${imgSrc}`);
console.log('ok');
