-- Check for statistics issues in the database
-- This script helps identify if statistics from other tournaments are appearing in new tournaments

-- 1. Check if there are matches from other tournaments in groups
-- This query finds matches that belong to groups from different tournaments
SELECT 
    m.id as match_id,
    m.group_id,
    g.id as group_id_from_group,
    g.tournament_id as group_tournament_id,
    m.status,
    m.is_playoff,
    p1.name as player1_name,
    p2.name as player2_name
FROM matches m
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
WHERE m.group_id IS NOT NULL
ORDER BY g.tournament_id, m.id;

-- 2. Check for orphaned matches (matches with group_id that doesn't exist in groups table)
SELECT 
    m.id as match_id,
    m.group_id,
    'ORPHANED - group does not exist' as issue,
    p1.name as player1_name,
    p2.name as player2_name,
    m.status
FROM matches m
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
WHERE m.group_id IS NOT NULL 
  AND g.id IS NULL;

-- 3. Check for matches in groups that belong to different tournaments
-- This should return 0 rows if everything is correct
SELECT 
    g1.id as group1_id,
    g1.tournament_id as group1_tournament,
    g2.id as group2_id,
    g2.tournament_id as group2_tournament,
    m.id as match_id,
    m.group_id,
    p1.name as player1_name,
    p2.name as player2_name
FROM matches m
JOIN groups g1 ON m.group_id = g1.id
JOIN groups g2 ON m.group_id = g2.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
WHERE g1.tournament_id != g2.tournament_id;

-- 4. List all tournaments with their group and match counts
SELECT 
    t.id as tournament_id,
    t.name as tournament_name,
    t.status,
    COUNT(DISTINCT g.id) as group_count,
    COUNT(DISTINCT m.id) as match_count,
    COUNT(DISTINCT CASE WHEN m.status = 'completed' THEN m.id END) as completed_matches
FROM tournaments t
LEFT JOIN groups g ON g.tournament_id = t.id
LEFT JOIN matches m ON m.group_id = g.id
WHERE t.deleted = false
GROUP BY t.id, t.name, t.status
ORDER BY t.created_at DESC;

-- 5. Check for duplicate groups (same name in same tournament)
SELECT 
    tournament_id,
    name,
    COUNT(*) as duplicate_count,
    array_agg(id) as group_ids
FROM groups
GROUP BY tournament_id, name
HAVING COUNT(*) > 1;

-- 6. Check match_player_stats for matches that might belong to wrong tournament
SELECT 
    mps.id,
    mps.match_id,
    mps.player_id,
    p.name as player_name,
    m.group_id,
    g.tournament_id,
    t.name as tournament_name,
    p1.name as match_player1_name,
    p2.name as match_player2_name,
    m.status
FROM match_player_stats mps
JOIN matches m ON mps.match_id = m.id
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN tournaments t ON g.tournament_id = t.id
LEFT JOIN players p ON mps.player_id = p.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
ORDER BY t.created_at DESC, m.id;

-- 7. Find all matches for a specific tournament (replace TOURNAMENT_ID_HERE)
-- SELECT 
--     m.id,
--     m.group_id,
--     g.tournament_id,
--     m.status,
--     p1.name as player1_name,
--     p2.name as player2_name,
--     m.player1_id,
--     m.player2_id
-- FROM matches m
-- JOIN groups g ON m.group_id = g.id
-- LEFT JOIN players p1 ON m.player1_id = p1.id
-- LEFT JOIN players p2 ON m.player2_id = p2.id
-- WHERE g.tournament_id = 'TOURNAMENT_ID_HERE'
-- ORDER BY m.id;

-- 8. Find matches with NULL group_id or group_id pointing to non-existent group
-- These are orphaned matches that might appear in wrong tournaments
SELECT 
    m.id as match_id,
    m.group_id,
    CASE 
        WHEN m.group_id IS NULL THEN 'NULL group_id'
        WHEN g.id IS NULL THEN 'group_id points to non-existent group'
        ELSE 'group exists'
    END as issue_type,
    p1.name as player1_name,
    p2.name as player2_name,
    m.status,
    m.is_playoff,
    m.created_at
FROM matches m
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
WHERE m.group_id IS NULL 
   OR g.id IS NULL
ORDER BY m.created_at DESC;

-- 9. Find matches where group exists but belongs to different tournament than expected
-- This finds matches that might be showing in wrong tournament statistics
SELECT 
    m.id as match_id,
    m.group_id,
    g.id as group_exists,
    g.tournament_id as group_tournament_id,
    t.name as tournament_name,
    p1.name as player1_name,
    p2.name as player2_name,
    m.status,
    m.is_playoff,
    m.created_at
FROM matches m
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN tournaments t ON g.tournament_id = t.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
WHERE m.group_id IS NOT NULL
  AND (g.id IS NULL OR g.tournament_id IS NULL)
ORDER BY m.created_at DESC;

-- 10. Find all matches sharing the same group_id (potential duplicate group issue)
SELECT 
    m.group_id,
    g.tournament_id,
    t.name as tournament_name,
    COUNT(*) as match_count,
    array_agg(m.id) as match_ids,
    array_agg(p1.name || ' vs ' || p2.name) as match_players
FROM matches m
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN tournaments t ON g.tournament_id = t.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
WHERE m.group_id IS NOT NULL
GROUP BY m.group_id, g.tournament_id, t.name
HAVING COUNT(*) > 1
ORDER BY match_count DESC;

-- 11. CLEANUP: Delete orphaned matches (matches with NULL group_id or invalid group_id)
-- UNCOMMENT AND RUN CAREFULLY - This will delete matches!
-- DELETE FROM matches
-- WHERE id IN (
--     SELECT m.id
--     FROM matches m
--     LEFT JOIN groups g ON m.group_id = g.id
--     WHERE m.group_id IS NULL 
--        OR (m.group_id IS NOT NULL AND g.id IS NULL)
--        OR (m.group_id IS NOT NULL AND g.tournament_id IS NULL)
-- );

-- 12. CLEANUP: Show what would be deleted (run this first to see what will be deleted)
SELECT 
    m.id as match_id,
    m.group_id,
    p1.name as player1_name,
    p2.name as player2_name,
    m.status,
    m.created_at,
    CASE 
        WHEN m.group_id IS NULL THEN 'Will delete: NULL group_id'
        WHEN g.id IS NULL THEN 'Will delete: Invalid group_id'
        WHEN g.tournament_id IS NULL THEN 'Will delete: Group has NULL tournament_id'
        ELSE 'KEEP'
    END as action
FROM matches m
LEFT JOIN groups g ON m.group_id = g.id
LEFT JOIN players p1 ON m.player1_id = p1.id
LEFT JOIN players p2 ON m.player2_id = p2.id
WHERE m.group_id IS NULL 
   OR (m.group_id IS NOT NULL AND g.id IS NULL)
   OR (m.group_id IS NOT NULL AND g.tournament_id IS NULL)
ORDER BY m.created_at DESC;

