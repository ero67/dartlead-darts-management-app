import { matchPath } from 'react-router-dom';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['league', 'tournament', 'match', 'player'];

// The page the user is on -> what /chat accepts as `page` ({ kind, id }; practice has no id), or null.
// The API rejects the whole question for an id that is not a UUID, so an old slug sends no page at all.
export function pageFromPath(pathname) {
  for (const kind of KINDS) {
    const match = matchPath(`/${kind}/:id`, pathname);
    if (match) return UUID.test(match.params.id) ? { kind, id: match.params.id } : null;
  }
  if (matchPath('/practice', pathname) || matchPath('/practice/*', pathname)) return { kind: 'practice' };
  return null;
}

const s = (name, params) => ({ key: `assistant.suggestions.${name}`, params });

// Exactly four suggestions ({ key, params } for t()) for the page the user is on. `names` comes from
// getSuggestionNames; a missing name picks the plain question, never a template with a hole in it.
export function suggestionsFor(page, names = {}) {
  const h2h = names.a && names.b ? s('h2h', { a: names.a, b: names.b }) : null;
  switch (page?.kind) {
    case 'practice':
      return [s('practiceHow'), s('practiceImprove'), s('practiceTrouble'), s('practiceAroundTheClock')];
    case 'league':
      return [h2h || s('leagueTop180Plain'), s('leagueLeader'), s('leagueTop180'), s('leaguesInApp')];
    case 'tournament':
      return [h2h || s('tournamentWinner'), s('tournamentCheckout'), s('tournamentRecap'), s('tournamentsRunning')];
    case 'player': {
      const versus = names.player && names.opponent ? s('playerVsOpponent', { player: names.player, opponent: names.opponent }) : null;
      return [versus || s('playerRecord'), s('playerImproving'), s('playerAverage'), s('top180')];
    }
    default:
      return [h2h || s('leaguesInApp'), s('top180'), s('highestCheckout'), s('finishSingle20')];
  }
}
