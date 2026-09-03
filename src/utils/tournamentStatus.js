// Tournament lifecycle: open_for_registration -> started -> completed.
// ('active' and 'in_progress' are legacy values still found on old rows.)
export const isTournamentRunning = (status) =>
  status === 'started' || status === 'in_progress' || status === 'active';

// Human-readable label for a tournament status value.
export const tournamentStatusLabel = (status, t) => {
  if (status === 'open_for_registration') return t('tournaments.statusOpenForRegistration');
  if (isTournamentRunning(status)) return t('tournaments.statusStarted');
  if (status === 'completed') return t('tournaments.statusCompleted');
  return status;
};
