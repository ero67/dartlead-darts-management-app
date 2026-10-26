#!/usr/bin/env node
// Seeds the DEMO LEAGUE (sales demo: public tournament pages, TV view, league
// leaderboard) into any environment, through the app's own code and RLS.
//
//   DEMO_EMAIL=demo@example.com DEMO_PASSWORD=... node scripts/seed-demo-league.mjs [--mode development] [--reset]
//
// --mode   Vite mode whose env files give VITE_SUPABASE_URL / _ANON_KEY
//          (development -> .env.local, production -> .env.production.local, ...)
// --reset  soft-delete an existing demo league and its rounds first; without
//          it the script refuses to run when the demo league already exists
// --port   dev server port (default 5199)
//
// How: starts a Vite dev server in the chosen mode, opens it in headless
// Chromium (playwright-core from the npx cache; set PLAYWRIGHT_CORE to its
// directory to override), signs in through the login form as DEMO_EMAIL (an
// ordinary manager account, no service key) and calls the real services in the
// page: league + members, tournament creation and start, startMatch +
// saveMatchResult for every match, completePlayoffMatch for the bracket and
// calculateTournamentPlacements for league points. "Start Playoffs" is clicked
// in the real UI because the bracket is generated in TournamentManagement.
// Matches are played by the app's engines and bots (scripts/demo-match-sim.mjs)
// with a fixed seed, so every run produces the same results. See docs/DEMO_LEAGUE.md.
/* global process */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer, loadEnv } from 'vite';
import { rngFrom, simulateCricket, simulateX01, skillFor } from './demo-match-sim.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// ---- The demo (fictional people and place) ----------------------------------
const LEAGUE_NAME = 'Demo Liga Šípky';
const LEAGUE_DESCRIPTION = 'Ukážková liga DartLead: piatkové kolá, skupiny a play-off. Všetky mená sú vymyslené.';
const SCORING_RULES = { placementPoints: { 1: 12, 2: 9, 3: 7, 4: 5, 5: 3, default: 1 }, allowManualOverride: true };

// name -> target 3-dart average of the bot playing them
const PLAYERS = [
  ['Rastislav Hudák', 86], ['Igor Benko', 79], ['Zuzana Kollárová', 73], ['Dušan Mikuš', 70],
  ['Pavol Žiak', 67], ['Branislav Kubica', 64], ['Andrej Kučera', 62], ['Katarína Fialová', 60],
  ['Matúš Ondrejka', 58], ['Viktor Šimko', 55], ['Roman Pekár', 53], ['Juraj Halás', 51],
  ['Oliver Brezina', 48], ['Daniel Repka', 45]
];

// Fridays, oldest first; the last one is the "most interesting" round to show.
const ROUNDS = [
  { name: '1. kolo', gameType: 'x01', legsToWin: 2, playoffLegs: 3, absent: [] },
  { name: '2. kolo', gameType: 'x01', legsToWin: 2, playoffLegs: 3, absent: ['Juraj Halás', 'Pavol Žiak'] },
  { name: '3. kolo – Cricket', gameType: 'cricket', legsToWin: 2, playoffLegs: 2, absent: ['Oliver Brezina', 'Viktor Šimko'] },
  { name: '4. kolo', gameType: 'x01', legsToWin: 2, playoffLegs: 3, absent: [] }
];
const SHOWCASE_ROUND = 3;

// ---- Setup -------------------------------------------------------------------
const { values: args } = parseArgs({
  options: { mode: { type: 'string', default: 'development' }, reset: { type: 'boolean', default: false }, port: { type: 'string', default: '5199' } }
});
const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
if (!DEMO_EMAIL || !DEMO_PASSWORD) {
  console.error('Set DEMO_EMAIL and DEMO_PASSWORD (the demo manager account). See docs/DEMO_LEAGUE.md.');
  process.exit(1);
}
const env = loadEnv(args.mode, root, 'VITE_');
if (!env.VITE_SUPABASE_URL) {
  console.error(`No VITE_SUPABASE_URL in the env files for mode "${args.mode}".`);
  process.exit(1);
}
console.log(`Target: ${env.VITE_SUPABASE_URL} (mode ${args.mode}) as ${DEMO_EMAIL}`);

// playwright-core from the npx cache whose headless shell is installed.
const findPlaywright = () => {
  if (process.env.PLAYWRIGHT_CORE) return process.env.PLAYWRIGHT_CORE;
  const npx = join(homedir(), '.npm/_npx');
  const browsers = join(homedir(), '.cache/ms-playwright');
  for (const dir of existsSync(npx) ? readdirSync(npx) : []) {
    const pkg = join(npx, dir, 'node_modules/playwright-core');
    if (!existsSync(join(pkg, 'browsers.json'))) continue;
    const shell = JSON.parse(readFileSync(join(pkg, 'browsers.json'), 'utf8')).browsers
      .find((b) => b.name === 'chromium-headless-shell');
    if (shell && existsSync(join(browsers, `chromium_headless_shell-${shell.revision}`))) return pkg;
  }
  throw new Error('playwright-core not found: run `npx -y playwright@1.58.2 install chromium-headless-shell` or set PLAYWRIGHT_CORE.');
};

const server = await createServer({ root, mode: args.mode, logLevel: 'error', server: { port: Number(args.port), host: '127.0.0.1' } });
await server.listen();
const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, '');
const { chromium } = await import(pathToFileURL(join(findPlaywright(), 'index.mjs')).href);
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => console.error('[page error]', error.message));

const done = async (code) => {
  await browser.close();
  await server.close();
  process.exit(code);
};

// Call a method of an app service inside the page (same module instance and
// Supabase session as the app itself).
const call = (file, service, method, ...params) => page.evaluate(
  async ([f, s, m, p]) => (await import(f))[s][m](...p),
  [file, service, method, params]
);
const ts = (method, ...p) => call('/src/services/tournamentService.js', 'tournamentService', method, ...p);
const ms = (method, ...p) => call('/src/services/tournamentService.js', 'matchService', method, ...p);
const ls = (method, ...p) => call('/src/services/leagueService.js', 'leagueService', method, ...p);
// No service sets a match's completion time; same RLS-checked update the app's client would make.
const setCompletedAt = (matchId, iso) => page.evaluate(async ([id, at]) => {
  const { supabase } = await import('/src/lib/supabase.js');
  const { error } = await supabase.from('matches').update({ completed_at: at }).eq('id', id);
  if (error) throw new Error(error.message);
}, [matchId, iso]);

try {
  // ---- Sign in through the login form ---------------------------------------
  await page.goto(`${baseUrl}/`);
  await page.evaluate(() => localStorage.setItem('language', 'en'));
  await page.goto(`${baseUrl}/login`);
  await page.fill('#email', DEMO_EMAIL);
  await page.fill('#password', DEMO_PASSWORD);
  await page.press('#password', 'Enter');
  await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')), null, { timeout: 15000 })
    .catch(() => { throw new Error('Login failed: check DEMO_EMAIL / DEMO_PASSWORD.'); });
  const me = await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.js');
    const { data } = await supabase.auth.getUser();
    return { id: data.user.id, role: data.user.app_metadata?.role };
  });
  if (!['manager', 'admin'].includes(me.role)) throw new Error(`${DEMO_EMAIL} is not a manager (role: ${me.role || 'none'}).`);

  // ---- Existing demo league --------------------------------------------------
  const existing = (await ls('getLeagues')).filter((l) => l.name === LEAGUE_NAME && l.createdBy === me.id);
  if (existing.length && !args.reset) {
    console.error(`"${LEAGUE_NAME}" already exists (${existing.map((l) => l.id).join(', ')}). Rerun with --reset to replace it.`);
    await done(1);
  }
  for (const old of existing) {
    for (const t of (await ls('getLeague', old.id)).tournaments) await ts('deleteTournament', t.id);
    await ls('deleteLeague', old.id);
    console.log(`Removed previous demo league ${old.id}`);
  }

  // ---- League and members ----------------------------------------------------
  const rng = rngFrom('demo-league');
  const fridays = ROUNDS.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (((d.getDay() + 2) % 7) || 7) - 7 * (ROUNDS.length - 1 - i));
    d.setHours(19, 0, 0, 0);
    return d;
  });
  const league = await ls('createLeague', {
    id: await page.evaluate(() => crypto.randomUUID()),
    name: LEAGUE_NAME,
    description: LEAGUE_DESCRIPTION,
    status: 'active',
    scoringRules: SCORING_RULES,
    defaultTournamentSettings: null,
    players: PLAYERS.map(([name]) => ({ name }))
  });
  const leagueStart = new Date(fridays[0].getTime() - 5 * 86400000).toISOString();
  await ls('updateLeague', league.id, { created_at: leagueStart });
  const members = (await ls('getMembers', league.id)).map((m) => m.player);
  const playerByName = new Map(members.map((p) => [p.name, { id: p.id, name: p.name }]));
  const skillById = new Map(PLAYERS.map(([name, avg]) => [playerByName.get(name).id, skillFor(avg)]));

  // ---- Rounds ----------------------------------------------------------------
  const playMatch = async (tournament, match, key, completedAt) => {
    await ms('startMatch', match.id, me.id, match);
    const skills = [skillById.get(match.player1.id), skillById.get(match.player2.id)];
    const result = tournament.gameType === 'cricket' ? simulateCricket(match, skills, key) : simulateX01(match, skills, key);
    await ms('saveMatchResult', result);
    await setCompletedAt(match.id, completedAt.toISOString());
    return result;
  };

  const created = [];
  for (const [index, round] of ROUNDS.entries()) {
    const date = fridays[index];
    const attendees = PLAYERS.filter(([name]) => !round.absent.includes(name)).map(([name]) => playerByName.get(name));
    const legsByRound = Object.fromEntries([32, 16, 8, 4, 2].map((size) => [size, round.playoffLegs]));
    const groupSettings = { type: 'groups', value: 2 };
    const tournament = await ts('createTournament', {
      id: await page.evaluate(() => crypto.randomUUID()),
      name: `${LEAGUE_NAME} – ${round.name}`,
      players: attendees,
      groups: [],
      gameType: round.gameType,
      legsToWin: round.legsToWin,
      startingScore: 501,
      groupSettings,
      playoffSettings: {
        enabled: true, qualificationMode: 'perGroup', playersPerGroup: 4, totalPlayersToAdvance: 8,
        startingRoundPlayers: 8, seedingMethod: 'groupBased', groupMatchups: [], thirdPlaceMatch: true,
        legsToWinByRound: legsByRound
      },
      tournamentType: 'groups_with_playoffs',
      defaultScoringMode: 'dart',
      standingsCriteriaOrder: ['matchesWon', 'legDifference', 'average', 'headToHead'],
      playoffs: null,
      leagueId: league.id,
      scorers: [],
      status: 'open_for_registration'
    });
    await ts('updateTournament', tournament.id, { created_at: new Date(date.getTime() - 30 * 60000).toISOString() });

    // Groups as a manager would seed them: strongest players spread (snake),
    // order inside a group shuffled.
    const ranked = [...attendees].sort((a, b) => skillById.get(b.id).average - skillById.get(a.id).average);
    const buckets = [[], []];
    ranked.forEach((p, i) => buckets[[0, 1, 1, 0][i % 4]].push(p));
    const customGroups = buckets.map((players, g) => ({
      name: `Group ${'AB'[g]}`,
      players: players.map((p) => [rng(), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p)
    }));
    let full = await ts('startTournament', tournament.id, groupSettings, customGroups);

    // Group stage: two boards per group, ~14 minutes a match, from 19:00.
    for (const group of full.groups) {
      for (const [i, match] of group.matches.entries()) {
        const at = new Date(date.getTime() + (i * 7 + 9 + Math.floor(rng() * 5) + (group.name === 'Group B' ? 3 : 0)) * 60000);
        await playMatch(full, match, `${round.name}|${group.name}|${i}`, at);
      }
    }
    console.log(`${round.name}: group stage played (${full.groups.reduce((n, g) => n + g.matches.length, 0)} matches)`);

    // Playoffs: the bracket is generated by the tournament page.
    await page.goto(`${baseUrl}/tournament/${tournament.id}?tab=playoffs`);
    await page.getByRole('button', { name: 'Start Playoffs' }).click({ timeout: 20000 });
    await page.waitForFunction(async (id) => {
      const { supabase } = await import('/src/lib/supabase.js');
      const { data } = await supabase.from('tournaments').select('playoffs').eq('id', id).single();
      return data?.playoffs?.rounds?.length > 0;
    }, tournament.id, { timeout: 20000 });
    await page.goto(`${baseUrl}/leagues`);

    // Playoff rounds start at 21:45 and are played side by side, ~35 minutes a round.
    const playoffStart = date.getTime() + 165 * 60000;
    let status = null;
    for (;;) {
      full = await ts('getTournament', tournament.id);
      const rounds = full.playoffs.rounds;
      const roundIndex = rounds.findIndex((r) => r.matches.some((m) => m.player1 && m.player2 && m.status !== 'completed'));
      if (roundIndex < 0) break;
      const bracketRound = rounds[roundIndex];
      const match = bracketRound.matches.find((m) => m.player1 && m.player2 && m.status !== 'completed');
      // Same match data PlayoffsTab hands to the scoring screen.
      const roundSize = Math.max(2, bracketRound.matches.filter((m) => !m.isThirdPlaceMatch).length * 2);
      const matchData = {
        ...match,
        gameType: full.gameType,
        legsToWin: full.playoffSettings.legsToWinByRound[roundSize] || 3,
        startingScore: full.startingScore,
        defaultScoringMode: full.defaultScoringMode,
        isPlayoff: true,
        tournamentId: full.id
      };
      const at = new Date(playoffStart + ((match.playoffRound - 1) * 35 + match.playoffMatchNumber * 3 + 20) * 60000);
      const result = await playMatch(full, matchData, `${round.name}|playoff|${match.playoffRound}|${match.playoffMatchNumber}`, at);
      status = (await ts('completePlayoffMatch', full.id, match.id, result)).status;
    }
    if (status !== 'completed') throw new Error(`${round.name}: bracket did not complete`);
    // What TournamentContext.completeMatch does after the last playoff match.
    await ts('updateTournamentStatus', tournament.id, 'completed');
    await ls('calculateTournamentPlacements', league.id, tournament.id, await ts('getTournament', tournament.id));
    console.log(`${round.name}: playoffs played, league points awarded`);
    created.push({ ...round, id: tournament.id });
  }

  // ---- Summary ---------------------------------------------------------------
  const publicUrl = (env.VITE_PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const leaderboard = await ls('getLeaderboard', league.id);
  console.log(`\nLeague ${league.id}  ${publicUrl}/league/${league.id}`);
  for (const t of created) console.log(`  ${t.name.padEnd(18)} ${t.id}`);
  console.log(`\nLeader: ${leaderboard[0]?.player?.name} (${leaderboard[0]?.totalPoints} pts)`);
  const showcase = created[SHOWCASE_ROUND];
  console.log(`Showcase (${showcase.name}):\n  ${publicUrl}/tournament/${showcase.id}\n  ${publicUrl}/tv/${showcase.id}`);
  await done(0);
} catch (error) {
  console.error(error.message || error);
  await done(1);
}
