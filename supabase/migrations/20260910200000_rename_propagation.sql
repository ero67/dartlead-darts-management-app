-- Renaming yourself must show up everywhere.
--
-- rename_my_player only updated the linked players row. The name is also
-- frozen in: pending registrations (player_name, which approval then uses to
-- create a *second* player under the old name), and the playoff bracket JSONB
-- (tournaments.playoffs stores {id, name} player objects). It also failed with
-- an opaque unique-violation when the new name collided with another player
-- in the same roster — after the account name had already been changed, so
-- the two disagreed. Now: one function, clear errors, all copies updated.

CREATE OR REPLACE FUNCTION public.rename_my_player(new_name text)
  RETURNS TABLE (id uuid, name text, user_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  cleaned text := btrim(regexp_replace(COALESCE(new_name, ''), '\s+', ' ', 'g'));
  pid uuid;
  trow RECORD;
  po jsonb;
  r int;
  m int;
  q int;
  changed boolean;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF length(cleaned) < 2 OR length(cleaned) > 60 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  -- 1. The linked player row (unique per (owner_id, name)).
  BEGIN
    UPDATE public.players p SET name = cleaned WHERE p.user_id = uid
    RETURNING p.id INTO pid;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'name_taken';
  END;

  -- 2. Registrations still waiting for approval carry the name the manager
  --    will approve under.
  UPDATE public.tournament_registrations SET player_name = cleaned
  WHERE tournament_registrations.user_id = uid AND status = 'pending';
  UPDATE public.league_registrations SET player_name = cleaned
  WHERE league_registrations.user_id = uid AND status = 'pending';

  -- 3. Playoff brackets that embed this player. Only tournaments whose JSONB
  --    mentions the id are touched; each match slot and the qualifiers list
  --    are rewritten in place.
  IF pid IS NOT NULL THEN
    FOR trow IN
      SELECT t.id AS tid, t.playoffs
      FROM public.tournaments t
      WHERE t.playoffs IS NOT NULL
        AND t.playoffs::text LIKE '%' || pid::text || '%'
    LOOP
      po := trow.playoffs;
      changed := false;

      IF jsonb_typeof(po -> 'rounds') = 'array' THEN
        FOR r IN 0 .. jsonb_array_length(po -> 'rounds') - 1 LOOP
          IF jsonb_typeof(po -> 'rounds' -> r -> 'matches') <> 'array' THEN CONTINUE; END IF;
          FOR m IN 0 .. jsonb_array_length(po -> 'rounds' -> r -> 'matches') - 1 LOOP
            IF po -> 'rounds' -> r -> 'matches' -> m -> 'player1' ->> 'id' = pid::text THEN
              po := jsonb_set(po, ARRAY['rounds', r::text, 'matches', m::text, 'player1', 'name'], to_jsonb(cleaned));
              changed := true;
            END IF;
            IF po -> 'rounds' -> r -> 'matches' -> m -> 'player2' ->> 'id' = pid::text THEN
              po := jsonb_set(po, ARRAY['rounds', r::text, 'matches', m::text, 'player2', 'name'], to_jsonb(cleaned));
              changed := true;
            END IF;
          END LOOP;
        END LOOP;
      END IF;

      IF jsonb_typeof(po -> 'qualifyingPlayers') = 'array' THEN
        FOR q IN 0 .. jsonb_array_length(po -> 'qualifyingPlayers') - 1 LOOP
          IF po -> 'qualifyingPlayers' -> q ->> 'id' = pid::text THEN
            po := jsonb_set(po, ARRAY['qualifyingPlayers', q::text, 'name'], to_jsonb(cleaned));
            changed := true;
          END IF;
        END LOOP;
      END IF;

      IF changed THEN
        UPDATE public.tournaments SET playoffs = po WHERE tournaments.id = trow.tid;
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT p.id, p.name::text, p.user_id FROM public.players p WHERE p.user_id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_my_player(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_my_player(text) TO authenticated;
