// Human-readable label for a tournament status value.
export const tournamentStatusLabel = (status, t) => {
  if (status === 'open_for_registration') return t('tournaments.statusOpenForRegistration');
  if (status === 'started') return t('tournaments.statusStarted');
  if (status === 'active') return t('common.active');
  if (status === 'completed') return t('tournaments.statusCompleted');
  return status;
};
