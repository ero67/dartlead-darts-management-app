-- League self-registration table.
-- Players register (pending), league managers approve/reject.
-- Mirrors tournament_registrations pattern.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS league_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES auth.users(id),
    UNIQUE(league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_registrations_league ON league_registrations(league_id);
CREATE INDEX IF NOT EXISTS idx_league_registrations_user ON league_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_league_registrations_status ON league_registrations(status);

ALTER TABLE league_registrations ENABLE ROW LEVEL SECURITY;

-- Anyone can view registrations
CREATE POLICY "Anyone can view league registrations" ON league_registrations
    FOR SELECT USING (true);

-- Users can only register as themselves
CREATE POLICY "Users can register for leagues" ON league_registrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- League managers can approve/reject registrations
CREATE POLICY "League managers can manage registrations" ON league_registrations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM leagues
            WHERE leagues.id = league_registrations.league_id
            AND (leagues.created_by = auth.uid() OR auth.uid() = ANY(leagues.manager_ids))
        )
    );

-- Admins can manage registrations
CREATE POLICY "Admins can manage league registrations" ON league_registrations
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM auth.users
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Users can withdraw their own pending registrations
CREATE POLICY "Users can withdraw own league registrations" ON league_registrations
    FOR DELETE USING (auth.uid() = user_id AND status = 'pending');
