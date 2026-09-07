import { useState, useEffect } from 'react';
import {
  loadActiveSession, saveActiveSession, clearActiveSession, appendHistory,
  newSessionId, loadGameSettings, saveGameSettings
} from '../lib/practiceStorage';
import { hapticMatchWon } from '../lib/haptics';
import { useAuth } from '../contexts/AuthContext';
import { practiceService } from '../services/practiceService';

// Setup → play → summary lifecycle shared by the practice games: restores an
// unfinished session of this game, persists every change, remembers the last
// settings and writes the history entry when the session ends.
export function usePracticeSession(game, { defaultSettings, sanitize, computeStats }) {
  const { user } = useAuth();
  const [session, setSession] = useState(() => {
    const active = loadActiveSession();
    return active?.game === game ? active.state : null;
  });
  const [settings, setSettings] = useState(() => sanitize(session?.settings || loadGameSettings(game) || defaultSettings));
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (session) saveActiveSession(game, session);
  }, [game, session]);

  const start = (create) => {
    saveGameSettings(game, settings);
    setSummary(null);
    setSession(create(settings));
  };

  const finish = (state) => {
    const entry = {
      id: newSessionId(),
      game,
      settings: state.settings,
      stats: computeStats(state),
      startedAt: state.startedAt,
      finishedAt: state.finishedAt || Date.now()
    };
    appendHistory(entry);
    clearActiveSession();
    hapticMatchWon();
    setSummary(entry);
    setSession(null);
    // Best effort: a failed upload stays pending and goes up on the next sync.
    if (user?.id) practiceService.uploadSession(user.id, entry).catch(() => {});
  };

  const discard = () => {
    clearActiveSession();
    setSession(null);
  };

  return { session, setSession, settings, setSettings, summary, setSummary, start, finish, discard };
}
