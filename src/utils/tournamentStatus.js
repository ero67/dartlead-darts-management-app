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

// Where a tournament is in its lifecycle, for the phase bar: the steps it has
// (registration, groups unless playoff-only, playoffs when enabled), the index
// of the current one (steps.length once completed), how far through it is,
// and `percent` of all matches played. Hydrated tournaments know their phase
// from the match lists; list summaries only have match counts, so for those
// the bar fills across all playing steps and `step` stays generic ('running').
export const getTournamentPhase = (tournament) => {
  const hasGroups = tournament.tournamentType !== 'playoff_only';
  const hasPlayoffs = !hasGroups || !!tournament.playoffSettings?.enabled;
  const steps = ['registration', hasGroups && 'groups', hasPlayoffs && 'playoffs'].filter(Boolean);
  if (tournament.status === 'completed') return { steps, current: steps.length, progress: 1, percent: 100, step: 'completed' };
  if (!isTournamentRunning(tournament.status)) return { steps, current: 0, progress: 1, percent: 0, step: 'registration' };

  const groupMatches = (tournament.groups || []).flatMap(g => g.matches || []);
  const playoffMatches = tournament.playoffMatches || [];
  const isDone = m => m.status === 'completed';

  if (groupMatches.length === 0 && playoffMatches.length === 0) {
    const total = tournament.totalMatches || 0;
    const overall = total > 0 ? (tournament.completedMatches || 0) / total : 0;
    const playing = steps.length - 1;
    const position = overall * playing;
    const index = Math.min(playing - 1, Math.floor(position));
    return { steps, current: 1 + index, progress: position - index, percent: Math.round(overall * 100), step: 'running' };
  }

  const inPlayoffs = hasPlayoffs && (
    !hasGroups || playoffMatches.some(m => m.status !== 'pending') ||
    (groupMatches.length > 0 && groupMatches.every(isDone))
  );
  const counted = inPlayoffs ? playoffMatches : groupMatches;
  const progress = counted.length > 0 ? counted.filter(isDone).length / counted.length : 0;
  return {
    steps,
    current: steps.indexOf(inPlayoffs ? 'playoffs' : 'groups'),
    progress,
    percent: Math.round(progress * 100),
    step: inPlayoffs ? 'playoffs' : 'groups'
  };
};

// Label for the phase returned by getTournamentPhase.
export const tournamentPhaseLabel = (phase, t) => {
  if (phase.step === 'completed') return t('tournaments.statusCompleted');
  if (phase.step === 'registration') return t('dashboard.phaseRegistration');
  if (phase.step === 'groups') return t('management.groups');
  if (phase.step === 'playoffs') return t('management.playoffs');
  return t('tournaments.statusStarted');
};
