-- LOCAL-ONLY seed: applied automatically by `supabase db reset` / `supabase start`.
-- Never runs against production (db push does not execute seeds).
--
-- Gives local dev a ready-made playground: an admin account and a tournament
-- in full swing (groups with completed/live/pending matches + a playoff
-- bracket), fictional players only.
--
-- Login: admin@local.test / password123
BEGIN;

-- Admin user. The empty-string token fields matter: GoTrue errors with a 500
-- on login when they are NULL (it scans them as Go strings).
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, raw_app_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'ad000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'admin@local.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(),
  '{"full_name":"Erik Admin"}',
  '{"provider":"email","providers":["email"],"role":"admin"}',
  now(), now(),
  '', '', '', '', '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
  extensions.uuid_generate_v4(),
  'ad000000-0000-0000-0000-000000000001',
  'ad000000-0000-0000-0000-000000000001',
  '{"sub":"ad000000-0000-0000-0000-000000000001","email":"admin@local.test","email_verified":true}',
  'email', now(), now(), now()
)
ON CONFLICT DO NOTHING;

-- Players
INSERT INTO public.players (id, name, owner_id) VALUES
  ('a1000000-0000-0000-0000-000000000001'::uuid,'Marek Kováč','ad000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002'::uuid,'Ján Novák','ad000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000003'::uuid,'Peter Horváth','ad000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000004'::uuid,'Lukáš Tóth','ad000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000005'::uuid,'Milan Varga','ad000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000006'::uuid,'Tomáš Nagy','ad000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000007'::uuid,'Erik Baláž','ad000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000008'::uuid,'Adam Molnár','ad000000-0000-0000-0000-000000000001');

-- Tournament
INSERT INTO public.tournaments (id, name, legs_to_win, starting_score, user_id, status, tournament_type, group_settings, playoff_settings, playoffs)
VALUES (
  'b1000000-0000-0000-0000-000000000001',
  'Friday Night Cup',
  3, 501,
  'ad000000-0000-0000-0000-000000000001',
  'started',
  'groups_with_playoffs',
  '{"type":"groups","value":2,"standingsCriteriaOrder":["matchesWon","legDifference","average","headToHead"]}',
  '{"enabled":true,"playersPerGroup":2,"playoffLegsToWin":3}',
  '{
    "currentRound": 1,
    "qualifyingPlayers": [
      {"id":"a1000000-0000-0000-0000-000000000001","name":"Marek Kováč"},
      {"id":"a1000000-0000-0000-0000-000000000002","name":"Ján Novák"},
      {"id":"a1000000-0000-0000-0000-000000000005","name":"Milan Varga"},
      {"id":"a1000000-0000-0000-0000-000000000006","name":"Tomáš Nagy"}
    ],
    "rounds": [
      {"id":"f1000000-0000-0000-0000-000000000001","name":"Semifinals","isComplete":false,"matches":[
        {"id":"e1000000-0000-0000-0000-000000000001","player1":{"id":"a1000000-0000-0000-0000-000000000001","name":"Marek Kováč"},"player2":{"id":"a1000000-0000-0000-0000-000000000006","name":"Tomáš Nagy"},"status":"completed","result":{"winner":"a1000000-0000-0000-0000-000000000001","player1Legs":3,"player2Legs":1},"isPlayoff":true,"playoffRound":1,"playoffMatchNumber":1},
        {"id":"e1000000-0000-0000-0000-000000000002","player1":{"id":"a1000000-0000-0000-0000-000000000005","name":"Milan Varga"},"player2":{"id":"a1000000-0000-0000-0000-000000000002","name":"Ján Novák"},"status":"pending","result":null,"isPlayoff":true,"playoffRound":1,"playoffMatchNumber":2}
      ]},
      {"id":"f1000000-0000-0000-0000-000000000002","name":"Final","isComplete":false,"matches":[
        {"id":"e1000000-0000-0000-0000-000000000003","player1":{"id":"a1000000-0000-0000-0000-000000000001","name":"Marek Kováč"},"player2":null,"status":"pending","result":null,"isPlayoff":true,"playoffRound":2,"playoffMatchNumber":1},
        {"id":"e1000000-0000-0000-0000-000000000004","player1":{"id":"a1000000-0000-0000-0000-000000000006","name":"Tomáš Nagy"},"player2":null,"status":"pending","result":null,"isPlayoff":true,"playoffRound":2,"playoffMatchNumber":2,"isThirdPlaceMatch":true}
      ]}
    ]
  }'
);

-- Groups
INSERT INTO public.groups (id, tournament_id, name) VALUES
  ('c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Group A'),
  ('c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','Group B');

INSERT INTO public.tournament_players (tournament_id, player_id)
SELECT 'b1000000-0000-0000-0000-000000000001', id FROM public.players WHERE owner_id = 'ad000000-0000-0000-0000-000000000001';

INSERT INTO public.group_players (group_id, player_id) VALUES
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003'),
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004'),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000005'),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000006'),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000007'),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000008');

-- Group matches: helper result builder is inline JSON.
-- Group A: 6 matches (4 completed, 1 in_progress, 1 pending)
INSERT INTO public.matches (id, group_id, tournament_id, player1_id, player2_id, winner_id, status, player1_legs, player2_legs, legs_to_win, starting_score, match_starter, completed_at, result) VALUES
  ('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','completed',3,1,3,501,0, now() - interval '3 hours',
   '{"winner":"a1000000-0000-0000-0000-000000000001","player1Legs":3,"player2Legs":1,"player1Stats":{"totalScore":1620,"totalDarts":58,"average":83.79,"oneEighties":1,"legAverages":[85.2,80.1,86.0],"checkouts":[{"leg":3,"checkout":76,"darts":2,"totalDarts":15}],"legs":[]},"player2Stats":{"totalScore":1401,"totalDarts":52,"average":80.82,"oneEighties":0,"legAverages":[78.3],"checkouts":[],"legs":[]}}'),
  ('d1000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000004','completed',2,3,3,501,1, now() - interval '2 hours',
   '{"winner":"a1000000-0000-0000-0000-000000000004","player1Legs":2,"player2Legs":3,"player1Stats":{"totalScore":2105,"totalDarts":76,"average":83.09,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]},"player2Stats":{"totalScore":2210,"totalDarts":78,"average":85.0,"oneEighties":2,"legAverages":[],"checkouts":[{"leg":5,"checkout":120,"darts":3,"totalDarts":17}],"legs":[]}}'),
  ('d1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001','completed',3,0,3,501,0, now() - interval '90 minutes',
   '{"winner":"a1000000-0000-0000-0000-000000000001","player1Legs":3,"player2Legs":0,"player1Stats":{"totalScore":1503,"totalDarts":49,"average":92.02,"oneEighties":1,"legAverages":[],"checkouts":[{"leg":3,"checkout":40,"darts":1,"totalDarts":13}],"legs":[]},"player2Stats":{"totalScore":1155,"totalDarts":45,"average":77.0,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]}}'),
  ('d1000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000002','completed',3,2,3,501,1, now() - interval '1 hour',
   '{"winner":"a1000000-0000-0000-0000-000000000002","player1Legs":3,"player2Legs":2,"player1Stats":{"totalScore":2255,"totalDarts":81,"average":83.52,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]},"player2Stats":{"totalScore":2180,"totalDarts":80,"average":81.75,"oneEighties":1,"legAverages":[],"checkouts":[],"legs":[]}}'),
  ('d1000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000004',NULL,'in_progress',1,1,3,501,0,NULL,NULL),
  ('d1000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003',NULL,'pending',0,0,3,501,NULL,NULL,NULL);

UPDATE public.matches
SET current_leg = 3, player1_current_score = 301, player2_current_score = 174,
    current_player = 1, live_device_name = 'Board 1 tablet', live_board_number = 1,
    live_device_id = 'seed-device', live_started_at = now() - interval '20 minutes',
    last_activity_at = now() - interval '30 seconds'
WHERE id = 'd1000000-0000-0000-0000-000000000005';

-- Group B: 6 matches (3 completed, 3 pending)
INSERT INTO public.matches (id, group_id, tournament_id, player1_id, player2_id, winner_id, status, player1_legs, player2_legs, legs_to_win, starting_score, match_starter, completed_at, result) VALUES
  ('d2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000005','completed',3,1,3,501,0, now() - interval '3 hours',
   '{"winner":"a1000000-0000-0000-0000-000000000005","player1Legs":3,"player2Legs":1,"player1Stats":{"totalScore":1610,"totalDarts":55,"average":87.82,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]},"player2Stats":{"totalScore":1380,"totalDarts":51,"average":81.18,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]}}'),
  ('d2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000008','completed',1,3,3,501,1, now() - interval '2 hours',
   '{"winner":"a1000000-0000-0000-0000-000000000008","player1Legs":1,"player2Legs":3,"player1Stats":{"totalScore":1350,"totalDarts":50,"average":81.0,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]},"player2Stats":{"totalScore":1590,"totalDarts":56,"average":85.18,"oneEighties":1,"legAverages":[],"checkouts":[],"legs":[]}}'),
  ('d2000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000005','completed',3,2,3,501,0, now() - interval '1 hour',
   '{"winner":"a1000000-0000-0000-0000-000000000005","player1Legs":3,"player2Legs":2,"player1Stats":{"totalScore":2222,"totalDarts":79,"average":84.38,"oneEighties":1,"legAverages":[],"checkouts":[],"legs":[]},"player2Stats":{"totalScore":2145,"totalDarts":80,"average":80.44,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]}}'),
  ('d2000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000008',NULL,'pending',0,0,3,501,NULL,NULL,NULL),
  ('d2000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000008',NULL,'pending',0,0,3,501,NULL,NULL,NULL),
  ('d2000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000007',NULL,'pending',0,0,3,501,NULL,NULL,NULL);

-- Playoff match rows (completed semifinal + pending semifinal)
INSERT INTO public.matches (id, group_id, tournament_id, player1_id, player2_id, winner_id, status, player1_legs, player2_legs, legs_to_win, starting_score, is_playoff, playoff_round, playoff_match_number, match_starter, completed_at, result) VALUES
  ('e1000000-0000-0000-0000-000000000001',NULL,'b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','completed',3,1,3,501,true,1,1,0, now() - interval '30 minutes',
   '{"winner":"a1000000-0000-0000-0000-000000000001","player1Legs":3,"player2Legs":1,"player1Stats":{"totalScore":1600,"totalDarts":54,"average":88.89,"oneEighties":1,"legAverages":[],"checkouts":[{"leg":4,"checkout":100,"darts":3,"totalDarts":16}],"legs":[]},"player2Stats":{"totalScore":1420,"totalDarts":52,"average":81.92,"oneEighties":0,"legAverages":[],"checkouts":[],"legs":[]}}'),
  ('e1000000-0000-0000-0000-000000000002',NULL,'b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000002',NULL,'pending',0,0,3,501,true,1,2,NULL,NULL,NULL);


-- ---------------------------------------------------------------------------
-- League playground: 16 more players in a league, with a 16-player tournament
-- (4 groups fully played) whose playoffs start at the quarter finals.
INSERT INTO public.players (id, name, owner_id) VALUES
  ('a2000000-0000-0000-0000-000000000001'::uuid,'Peter Novák','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000002'::uuid,'Jana Kováčová','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000003'::uuid,'Marek Horváth','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000004'::uuid,'Lukáš Varga','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000005'::uuid,'Tomáš Baláž','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000006'::uuid,'Martin Hudák','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000007'::uuid,'Eva Tóthová','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000008'::uuid,'Michal Šimko','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000009'::uuid,'Andrej Molnár','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000010'::uuid,'Katarína Lukáčová','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000011'::uuid,'Dávid Polák','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000012'::uuid,'Simona Révészová','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000013'::uuid,'Roman Gajdoš','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000014'::uuid,'Zuzana Mrázová','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000015'::uuid,'Filip Urban','ad000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000016'::uuid,'Lenka Sabová','ad000000-0000-0000-0000-000000000001');

INSERT INTO public.leagues (id, name, description, status, created_by)
VALUES ('b3000000-0000-0000-0000-000000000001', 'Thursday League 2026', 'Weekly club league. Points by tournament placement; best 6 results count.', 'active', 'ad000000-0000-0000-0000-000000000001');

INSERT INTO public.league_members (league_id, player_id) VALUES
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000005'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000006'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000007'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000008'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000009'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000010'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000011'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000012'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000013'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000014'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000015'),
  ('b3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000016');

INSERT INTO public.tournaments (id, name, legs_to_win, starting_score, user_id, status, tournament_type, league_id, group_settings, playoff_settings, playoffs, created_at)
VALUES ('b2000000-0000-0000-0000-000000000001', 'Spring Open 2026', 3, 501, 'ad000000-0000-0000-0000-000000000001', 'started', 'groups_with_playoffs', 'b3000000-0000-0000-0000-000000000001',
  '{"type": "groups", "value": 4, "standingsCriteriaOrder": ["matchesWon", "legDifference", "average", "headToHead"]}', '{"enabled": true, "qualificationMode": "perGroup", "playersPerGroup": 2, "totalPlayersToAdvance": 8, "startingRoundPlayers": 8, "seedingMethod": "groupBased", "groupMatchups": [], "thirdPlaceMatch": true, "legsToWinByRound": {"32": 3, "16": 3, "8": 3, "4": 3, "2": 3}}', '{"currentRound": 1, "qualifyingPlayers": [{"id": "a2000000-0000-0000-0000-000000000001", "name": "Peter Nov\u00e1k"}, {"id": "a2000000-0000-0000-0000-000000000002", "name": "Jana Kov\u00e1\u010dov\u00e1"}, {"id": "a2000000-0000-0000-0000-000000000005", "name": "Tom\u00e1\u0161 Bal\u00e1\u017e"}, {"id": "a2000000-0000-0000-0000-000000000006", "name": "Martin Hud\u00e1k"}, {"id": "a2000000-0000-0000-0000-000000000009", "name": "Andrej Moln\u00e1r"}, {"id": "a2000000-0000-0000-0000-000000000010", "name": "Katar\u00edna Luk\u00e1\u010dov\u00e1"}, {"id": "a2000000-0000-0000-0000-000000000013", "name": "Roman Gajdo\u0161"}, {"id": "a2000000-0000-0000-0000-000000000014", "name": "Zuzana Mr\u00e1zov\u00e1"}], "rounds": [{"id": "f2000000-0000-0000-0000-000000000001", "name": "Quarter Final", "isComplete": false, "matches": [{"id": "e2000000-0000-0000-0000-000000000001", "player1": {"id": "a2000000-0000-0000-0000-000000000001", "name": "Peter Nov\u00e1k"}, "player2": {"id": "a2000000-0000-0000-0000-000000000006", "name": "Martin Hud\u00e1k"}, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 1, "playoffMatchNumber": 1}, {"id": "e2000000-0000-0000-0000-000000000002", "player1": {"id": "a2000000-0000-0000-0000-000000000009", "name": "Andrej Moln\u00e1r"}, "player2": {"id": "a2000000-0000-0000-0000-000000000014", "name": "Zuzana Mr\u00e1zov\u00e1"}, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 1, "playoffMatchNumber": 2}, {"id": "e2000000-0000-0000-0000-000000000003", "player1": {"id": "a2000000-0000-0000-0000-000000000005", "name": "Tom\u00e1\u0161 Bal\u00e1\u017e"}, "player2": {"id": "a2000000-0000-0000-0000-000000000002", "name": "Jana Kov\u00e1\u010dov\u00e1"}, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 1, "playoffMatchNumber": 3}, {"id": "e2000000-0000-0000-0000-000000000004", "player1": {"id": "a2000000-0000-0000-0000-000000000013", "name": "Roman Gajdo\u0161"}, "player2": {"id": "a2000000-0000-0000-0000-000000000010", "name": "Katar\u00edna Luk\u00e1\u010dov\u00e1"}, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 1, "playoffMatchNumber": 4}]}, {"id": "f2000000-0000-0000-0000-000000000002", "name": "Semifinals", "isComplete": false, "matches": [{"id": "e2000000-0000-0000-0000-000000000005", "player1": null, "player2": null, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 2, "playoffMatchNumber": 1}, {"id": "e2000000-0000-0000-0000-000000000006", "player1": null, "player2": null, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 2, "playoffMatchNumber": 2}]}, {"id": "f2000000-0000-0000-0000-000000000003", "name": "Final", "isComplete": false, "matches": [{"id": "e2000000-0000-0000-0000-000000000007", "player1": null, "player2": null, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 3, "playoffMatchNumber": 1}, {"id": "e2000000-0000-0000-0000-000000000008", "player1": null, "player2": null, "status": "pending", "result": null, "isPlayoff": true, "playoffRound": 3, "playoffMatchNumber": 2, "isThirdPlaceMatch": true}]}]}', now() - interval '2 days');

INSERT INTO public.groups (id, tournament_id, name) VALUES
  ('c2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','Group A'),
  ('c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','Group B'),
  ('c2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','Group C'),
  ('c2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','Group D');

INSERT INTO public.tournament_players (tournament_id, player_id)
SELECT 'b2000000-0000-0000-0000-000000000001', id FROM public.players WHERE id::text LIKE 'a2000000-%';

INSERT INTO public.group_players (group_id, player_id) VALUES
  ('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004'),
  ('c2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000005'),
  ('c2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000006'),
  ('c2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000007'),
  ('c2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000008'),
  ('c2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000009'),
  ('c2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000010'),
  ('c2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000011'),
  ('c2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000012'),
  ('c2000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000013'),
  ('c2000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000014'),
  ('c2000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000015'),
  ('c2000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000016');

INSERT INTO public.matches (id, group_id, tournament_id, player1_id, player2_id, winner_id, status, player1_legs, player2_legs, legs_to_win, starting_score, match_starter, match_order, completed_at, result) VALUES
  ('d3000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000001','completed',3,1,3,501,1,1, now() - interval '48 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000001", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1952, "totalDarts": 74, "average": 79.15, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 32, "darts": 1, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1966, "totalDarts": 81, "average": 72.82, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 3, "totalDarts": 16}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000003','completed',3,1,3,501,1,2, now() - interval '47 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000003", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1958, "totalDarts": 67, "average": 87.66, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 1, "totalDarts": 16}], "legs": []}, "player2Stats": {"totalScore": 1958, "totalDarts": 72, "average": 81.56, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 40, "darts": 1, "totalDarts": 18}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000001','completed',3,1,3,501,1,3, now() - interval '46 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000001", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1959, "totalDarts": 86, "average": 68.33, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 2, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 1956, "totalDarts": 97, "average": 60.49, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 32, "darts": 3, "totalDarts": 15}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000004','c2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000002','completed',3,1,3,501,1,4, now() - interval '44 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000002", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1969, "totalDarts": 71, "average": 83.21, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 76, "darts": 3, "totalDarts": 16}], "legs": []}, "player2Stats": {"totalScore": 1963, "totalDarts": 81, "average": 72.7, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 60, "darts": 1, "totalDarts": 18}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000005','c2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004','a2000000-0000-0000-0000-000000000001','completed',3,1,3,501,0,5, now() - interval '42 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000001", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1969, "totalDarts": 93, "average": 63.53, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 96, "darts": 3, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 1965, "totalDarts": 97, "average": 60.78, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 76, "darts": 1, "totalDarts": 17}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000006','c2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000002','completed',3,1,3,501,0,6, now() - interval '41 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000002", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1963, "totalDarts": 91, "average": 64.71, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 2, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 1957, "totalDarts": 107, "average": 54.87, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 60, "darts": 1, "totalDarts": 16}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000007','c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000005','a2000000-0000-0000-0000-000000000006','a2000000-0000-0000-0000-000000000005','completed',3,1,3,501,0,1, now() - interval '40 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000005", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1965, "totalDarts": 74, "average": 79.65, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 3, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1972, "totalDarts": 79, "average": 74.88, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 96, "darts": 2, "totalDarts": 18}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000008','c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000007','a2000000-0000-0000-0000-000000000008','a2000000-0000-0000-0000-000000000007','completed',3,0,3,501,0,2, now() - interval '38 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000007", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1473, "totalDarts": 67, "average": 65.95, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 96, "darts": 3, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1469, "totalDarts": 69, "average": 63.87, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000009','c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000005','a2000000-0000-0000-0000-000000000007','a2000000-0000-0000-0000-000000000005','completed',3,0,3,501,1,3, now() - interval '36 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000005", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1468, "totalDarts": 55, "average": 80.06, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 60, "darts": 2, "totalDarts": 16}], "legs": []}, "player2Stats": {"totalScore": 1470, "totalDarts": 63, "average": 69.98, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000010','c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000006','a2000000-0000-0000-0000-000000000008','a2000000-0000-0000-0000-000000000006','completed',3,1,3,501,1,4, now() - interval '35 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000006", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1963, "totalDarts": 69, "average": 85.37, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 32, "darts": 3, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1957, "totalDarts": 71, "average": 82.7, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 32, "darts": 2, "totalDarts": 18}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000011','c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000005','a2000000-0000-0000-0000-000000000008','a2000000-0000-0000-0000-000000000005','completed',3,2,3,501,1,5, now() - interval '34 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000005", "player1Legs": 3, "player2Legs": 2, "player1Stats": {"totalScore": 2447, "totalDarts": 117, "average": 62.75, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 5, "checkout": 76, "darts": 1, "totalDarts": 17}], "legs": []}, "player2Stats": {"totalScore": 2445, "totalDarts": 123, "average": 59.64, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 5, "checkout": 40, "darts": 3, "totalDarts": 18}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000012','c2000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000006','a2000000-0000-0000-0000-000000000007','a2000000-0000-0000-0000-000000000006','completed',3,1,3,501,1,6, now() - interval '32 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000006", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1951, "totalDarts": 73, "average": 80.2, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 1, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 1972, "totalDarts": 81, "average": 73.04, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 40, "darts": 2, "totalDarts": 16}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000013','c2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000009','a2000000-0000-0000-0000-000000000010','a2000000-0000-0000-0000-000000000009','completed',3,0,3,501,0,1, now() - interval '30 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000009", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1479, "totalDarts": 66, "average": 67.21, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 40, "darts": 3, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1467, "totalDarts": 71, "average": 61.97, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000014','c2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000011','a2000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000011','completed',3,0,3,501,0,2, now() - interval '29 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000011", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1466, "totalDarts": 68, "average": 64.69, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 40, "darts": 3, "totalDarts": 16}], "legs": []}, "player2Stats": {"totalScore": 1474, "totalDarts": 73, "average": 60.56, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000015','c2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000009','a2000000-0000-0000-0000-000000000011','a2000000-0000-0000-0000-000000000009','completed',3,1,3,501,1,3, now() - interval '28 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000009", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1959, "totalDarts": 68, "average": 86.43, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 76, "darts": 2, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 1964, "totalDarts": 79, "average": 74.58, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 3, "totalDarts": 16}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000016','c2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000010','a2000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000010','completed',3,1,3,501,1,4, now() - interval '26 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000010", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1972, "totalDarts": 87, "average": 68.0, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 60, "darts": 2, "totalDarts": 16}], "legs": []}, "player2Stats": {"totalScore": 1957, "totalDarts": 97, "average": 60.52, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 76, "darts": 3, "totalDarts": 18}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000017','c2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000009','a2000000-0000-0000-0000-000000000012','a2000000-0000-0000-0000-000000000009','completed',3,1,3,501,1,5, now() - interval '24 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000009", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1963, "totalDarts": 72, "average": 81.8, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 96, "darts": 2, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 1966, "totalDarts": 82, "average": 71.93, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 76, "darts": 1, "totalDarts": 15}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000018','c2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000010','a2000000-0000-0000-0000-000000000011','a2000000-0000-0000-0000-000000000010','completed',3,1,3,501,0,6, now() - interval '23 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000010", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1965, "totalDarts": 76, "average": 77.57, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 96, "darts": 2, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1953, "totalDarts": 80, "average": 73.24, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 32, "darts": 3, "totalDarts": 17}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000019','c2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000013','a2000000-0000-0000-0000-000000000014','a2000000-0000-0000-0000-000000000013','completed',3,2,3,501,1,1, now() - interval '22 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000013", "player1Legs": 3, "player2Legs": 2, "player1Stats": {"totalScore": 2463, "totalDarts": 106, "average": 69.71, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 5, "checkout": 32, "darts": 1, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 2455, "totalDarts": 124, "average": 59.4, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 5, "checkout": 96, "darts": 1, "totalDarts": 16}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000020','c2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000015','a2000000-0000-0000-0000-000000000016','a2000000-0000-0000-0000-000000000015','completed',3,0,3,501,1,2, now() - interval '20 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000015", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1474, "totalDarts": 54, "average": 81.86, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 76, "darts": 2, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1483, "totalDarts": 61, "average": 72.94, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000021','c2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000013','a2000000-0000-0000-0000-000000000015','a2000000-0000-0000-0000-000000000013','completed',3,1,3,501,0,3, now() - interval '18 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000013", "player1Legs": 3, "player2Legs": 1, "player1Stats": {"totalScore": 1968, "totalDarts": 68, "average": 86.84, "oneEighties": 0, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 120, "darts": 2, "totalDarts": 15}], "legs": []}, "player2Stats": {"totalScore": 1973, "totalDarts": 72, "average": 82.23, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 4, "checkout": 76, "darts": 1, "totalDarts": 17}], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000022','c2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000014','a2000000-0000-0000-0000-000000000016','a2000000-0000-0000-0000-000000000014','completed',3,0,3,501,1,4, now() - interval '17 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000014", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1466, "totalDarts": 63, "average": 69.82, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 60, "darts": 1, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1475, "totalDarts": 71, "average": 62.31, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000023','c2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000013','a2000000-0000-0000-0000-000000000016','a2000000-0000-0000-0000-000000000013','completed',3,0,3,501,0,5, now() - interval '16 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000013", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1472, "totalDarts": 60, "average": 73.62, "oneEighties": 1, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 120, "darts": 2, "totalDarts": 18}], "legs": []}, "player2Stats": {"totalScore": 1464, "totalDarts": 64, "average": 68.64, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}'),
  ('d3000000-0000-0000-0000-000000000024','c2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000014','a2000000-0000-0000-0000-000000000015','a2000000-0000-0000-0000-000000000014','completed',3,0,3,501,0,6, now() - interval '14 hours',
   '{"winner": "a2000000-0000-0000-0000-000000000014", "player1Legs": 3, "player2Legs": 0, "player1Stats": {"totalScore": 1476, "totalDarts": 64, "average": 69.19, "oneEighties": 2, "legAverages": [], "checkouts": [{"leg": 3, "checkout": 120, "darts": 3, "totalDarts": 16}], "legs": []}, "player2Stats": {"totalScore": 1469, "totalDarts": 72, "average": 61.2, "oneEighties": 0, "legAverages": [], "checkouts": [], "legs": []}}');

INSERT INTO public.matches (id, group_id, tournament_id, player1_id, player2_id, status, legs_to_win, starting_score, is_playoff, playoff_round, playoff_match_number, match_order) VALUES
  ('e2000000-0000-0000-0000-000000000001',NULL,'b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000006','pending',3,501,true,1,1,1),
  ('e2000000-0000-0000-0000-000000000002',NULL,'b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000009','a2000000-0000-0000-0000-000000000014','pending',3,501,true,1,2,2),
  ('e2000000-0000-0000-0000-000000000003',NULL,'b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000005','a2000000-0000-0000-0000-000000000002','pending',3,501,true,1,3,3),
  ('e2000000-0000-0000-0000-000000000004',NULL,'b2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000013','a2000000-0000-0000-0000-000000000010','pending',3,501,true,1,4,4);

COMMIT;
