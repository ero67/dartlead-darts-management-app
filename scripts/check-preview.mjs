// Self-check for api/preview.js: run `node scripts/check-preview.mjs`.
import assert from 'node:assert/strict';
import { buildPreview } from '../api/preview.js';

process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon';
const ID = '11111111-2222-3333-4444-555555555555';
const reply = (rows, ok = true) => async () => ({ ok, json: async () => rows });
const origin = 'https://dartlead.app';

let html = await buildPreview({ kind: 'tournament', id: ID, origin },
  reply([{ name: 'Friday <Cup> & "Co"', status: 'completed', game_type: 'x01', starting_score: 501, legs_to_win: 3, tournament_players: [{ count: 16 }] }]));
assert.match(html, /og:title" content="Friday &lt;Cup&gt; &amp; &quot;Co&quot;"/);
assert.match(html, /Ukončený · 16 hráčov · 501 · prvý do 3 legov/);
assert.match(html, new RegExp(`og:url" content="${origin}/tournament/${ID}"`));

html = await buildPreview({ kind: 'tv', id: ID, origin }, reply([{ name: 'Cup', status: 'started', game_type: 'cricket', tournament_players: [{ count: 8 }] }]));
assert.match(html, /Cup · živý prenos/);
assert.match(html, /Prebieha · 8 hráčov · Cricket/);

html = await buildPreview({ kind: 'player', id: ID, origin }, reply([{ name: 'Jana' }]));
assert.match(html, /Jana · profil hráča/);
html = await buildPreview({ kind: 'tournament', id: ID, origin }, reply([{ name: 'Duel', status: 'started', legs_to_win: 1, tournament_players: [{ count: 3 }] }]));
assert.match(html, /Prebieha · 3 hráči · 501 · prvý do 1 legu/);

// Bad ids, deleted rows, errors and missing rows all give the generic card.
for (const [args, f] of [
  [{ kind: 'tournament', id: "x' or 1=1", origin }, reply([])],
  [{ kind: 'tournament', id: ID, origin }, reply([{ name: 'Gone', deleted: true }])],
  [{ kind: 'tournament', id: ID, origin }, async () => { throw new Error('down'); }],
  [{ kind: 'player', id: ID, origin }, reply([], false)],
]) {
  html = await buildPreview(args, f);
  assert.match(html, /og:title" content="DartLead"/);
}
console.log('link preview: all checks passed');
