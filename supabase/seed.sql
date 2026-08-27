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

COMMIT;
