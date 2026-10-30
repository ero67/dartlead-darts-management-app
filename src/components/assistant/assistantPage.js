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
