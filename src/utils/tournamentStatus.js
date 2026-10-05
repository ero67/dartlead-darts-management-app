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

// Tailwind classes for the status badge (shadcn Badge variant="outline").
const STATUS_BADGE_CLASS = {
  open_for_registration: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  completed: 'border-transparent bg-secondary text-secondary-foreground',
  running: 'border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
};
export const tournamentStatusClass = (status) =>
  isTournamentRunning(status) ? STATUS_BADGE_CLASS.running : (STATUS_BADGE_CLASS[status] ?? STATUS_BADGE_CLASS.completed);
