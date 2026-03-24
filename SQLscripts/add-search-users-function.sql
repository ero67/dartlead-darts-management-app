-- Search users by name or email.
-- Available to managers and admins (not regular users).

CREATE OR REPLACE FUNCTION search_users(search_term TEXT)
RETURNS TABLE (
    id UUID,
    email TEXT,
    full_name TEXT,
    role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller_record RECORD;
BEGIN
    SELECT * INTO caller_record
    FROM auth.users u
    WHERE u.id = auth.uid();

    IF caller_record IS NULL OR (
        COALESCE(caller_record.raw_user_meta_data->>'role', '') NOT IN ('admin', 'manager') AND
        COALESCE(caller_record.raw_app_meta_data->>'role', '') NOT IN ('admin', 'manager')
    ) THEN
        RAISE EXCEPTION 'Only managers and administrators can search users';
    END IF;

    RETURN QUERY
    SELECT
        u.id,
        u.email::TEXT,
        COALESCE(
            u.raw_user_meta_data->>'full_name',
            u.raw_user_meta_data->>'name',
            NULL
        )::TEXT as full_name,
        COALESCE(
            u.raw_user_meta_data->>'role',
            u.raw_app_meta_data->>'role',
            'user'
        )::TEXT as role
    FROM auth.users u
    WHERE
        u.email ILIKE '%' || search_term || '%'
        OR u.raw_user_meta_data->>'full_name' ILIKE '%' || search_term || '%'
        OR u.raw_user_meta_data->>'name' ILIKE '%' || search_term || '%'
    ORDER BY u.created_at DESC
    LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION search_users(TEXT) TO authenticated;
