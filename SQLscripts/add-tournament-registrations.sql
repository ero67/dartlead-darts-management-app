-- Tournament self-registration table.
-- Players register (pending), managers approve/reject.
-- Approved registrations create a tournament_players entry.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS tournament_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES auth.users(id),
    UNIQUE(tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_registrations_tournament ON tournament_registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_user ON tournament_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_registrations_status ON tournament_registrations(status);

ALTER TABLE tournament_registrations ENABLE ROW LEVEL SECURITY;

-- Anyone can view registrations (matches public tournament data pattern)
CREATE POLICY "Anyone can view tournament registrations" ON tournament_registrations
    FOR SELECT USING (true);

-- Users can only register as themselves
CREATE POLICY "Users can register for tournaments" ON tournament_registrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Tournament owners can approve/reject registrations
CREATE POLICY "Tournament owners can manage registrations" ON tournament_registrations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.id = tournament_registrations.tournament_id
            AND tournaments.user_id = auth.uid()
        )
    );

-- Admins can manage registrations
CREATE POLICY "Admins can manage registrations" ON tournament_registrations
    FOR UPDATE USING (
        auth.uid() IN (
            SELECT id FROM auth.users
            WHERE raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Users can withdraw their own pending registrations
CREATE POLICY "Users can withdraw own pending registrations" ON tournament_registrations
    FOR DELETE USING (auth.uid() = user_id AND status = 'pending');
