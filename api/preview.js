// Link previews for shared links. Crawlers (WhatsApp, Facebook, Slack...) do
// not run JavaScript, so vercel.json rewrites only their requests for public
// pages here; people always get the normal app. Returns a tiny HTML page with
// Open Graph tags filled from the database through the public anon key.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_SK = {
  open_for_registration: 'Registrácia otvorená',
  started: 'Prebieha',
  in_progress: 'Prebieha',
  completed: 'Ukončený',
};

const playersSk = (n) => `${n} ${n === 1 ? 'hráč' : n < 5 ? 'hráči' : 'hráčov'}`;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function fetchRow(fetchImpl, table, id, select) {
  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  const res = await fetchImpl(`${base}/rest/v1/${table}?id=eq.${id}&select=${encodeURIComponent(select)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// kind: 'tournament' | 'tv' | 'player'. Unknown or missing rows fall back to
// the generic card, never an error page.
export async function buildPreview({ kind, id, origin }, fetchImpl = fetch) {
  const page = { title: 'DartLead', description: 'Turnaje, ligy a živé skórovanie šípok v jednej aplikácii.', path: '/' };
  try {
    if (UUID.test(id || '') && (kind === 'tournament' || kind === 'tv')) {
      const t = await fetchRow(fetchImpl, 'tournaments', id, 'name,status,game_type,starting_score,legs_to_win,deleted,tournament_players(count)');
      if (t && !t.deleted) {
        const players = t.tournament_players?.[0]?.count;
        const game = t.game_type === 'cricket' ? 'Cricket' : String(t.starting_score || 501);
        page.title = kind === 'tv' ? `${t.name} · živý prenos` : t.name;
        page.description = [STATUS_SK[t.status], players ? playersSk(players) : null, game, t.legs_to_win ? `prvý do ${t.legs_to_win} ${t.legs_to_win === 1 ? 'legu' : 'legov'}` : null]
          .filter(Boolean).join(' · ');
        page.path = `/${kind}/${id}`;
      }
    } else if (UUID.test(id || '') && kind === 'player') {
      const p = await fetchRow(fetchImpl, 'players', id, 'name');
      if (p) {
        page.title = `${p.name} · profil hráča`;
        page.description = 'Výsledky, priemery a forma hráča na DartLead.';
        page.path = `/player/${id}`;
      }
    }
  } catch {
    // Network or parse failure: keep the generic card.
  }
  const url = `${origin}${page.path}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DartLead">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(origin)}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
</head><body><a href="${escapeHtml(url)}">${title}</a></body></html>`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const html = await buildPreview({
    kind: url.searchParams.get('kind'),
    id: url.searchParams.get('id'),
    origin: url.origin,
  });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
