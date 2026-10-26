import React from 'react';
import { Trophy, Plus, Link, Unlink, Check, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '../shared/StatusBadge';
import { EmptyState } from '../shared/EmptyState';
import { isTournamentRunning } from '../../utils/tournamentStatus';
import { currentSeasonName } from '../../utils/leagueSeason';
import { cn } from '@/lib/utils';

// shadcn SelectItem values must be non-empty; '' in state maps to this.
const NONE = '__none';

export function TournamentsTab({
  league, isManager, onCreateTournament, onSelectTournament,
  isLinkingTournament, loadingUnlinked, unlinkedTournaments, selectedTournamentToLink,
  linkPlayers, linkPlayerMap, setLinkPlayerMap, isLinkMapComplete, isLinking,
  onOpenLink, onCloseLink, onSelectTournamentToLink, onLinkTournament, onUnlinkTournament,
}) {
  const { t } = useLanguage();
  const members = (league.members || []).map(m => m.player).filter(Boolean);
  // Newest round at the top; round numbers count from the season's first tournament.
  const rounds = [...(league.tournaments || [])].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const seasons = league.seasons || [];
  // Rounds grouped under their season, current first; no headings before a season has ended.
  const seasonGroups = [
    { id: 'current', name: currentSeasonName(league, t), rounds: rounds.filter(r => !r.season_id) },
    ...seasons.map(s => ({ id: s.id, name: s.name, rounds: rounds.filter(r => r.season_id === s.id) }))
  ].filter(g => g.rounds.length > 0);

  const ctaLabel = (status) => {
    if (status === 'completed') return t('dashboard.viewResults');
    if (isTournamentRunning(status)) return t('manager.openTournament');
    return t('tournaments.view');
  };

  const actions = isManager && (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={onOpenLink}>
        <Link />
        {t('leagues.addExistingTournament')}
      </Button>
      {onCreateTournament && (
        <Button onClick={() => onCreateTournament(league)}>
          <Plus />
          {t('leagues.createTournament')}
        </Button>
      )}
    </div>
  );

  const renderRounds = (groupRounds) => (
    <ol className="flex flex-col">
      {groupRounds.map((tournament, index) => {
        const roundNumber = groupRounds.length - index;
        const isDone = tournament.status === 'completed';
        const isRunning = isTournamentRunning(tournament.status);
        const isLast = index === groupRounds.length - 1;
        return (
          <li key={tournament.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-4">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full border-2 font-display text-lg font-bold leading-none',
                  isDone && 'border-primary bg-primary text-primary-foreground',
                  isRunning && 'border-live bg-background text-live',
                  !isDone && !isRunning && 'border-border bg-background text-muted-foreground'
                )}
              >
                {roundNumber}
              </span>
              {!isLast && <span className={cn('min-h-4 w-0.5 flex-1', isDone ? 'bg-primary/40' : 'bg-border')} />}
            </div>
            <div className="pb-3.5">
              <Card
                className={cn(
                  'flex-row flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5',
                  isRunning && 'border-live/30 bg-gradient-to-r from-live/10 to-card to-60%',
                  tournament.status === 'open_for_registration' && 'opacity-80'
                )}
              >
                <div className="flex min-w-0 flex-[1_1_15rem] flex-col">
                  <span className="text-xs text-muted-foreground">
                    {t('leagues.roundNumber', { number: roundNumber })} · {new Date(tournament.created_at).toLocaleDateString()}
                  </span>
                  <span className="truncate text-base font-semibold">{tournament.name}</span>
                </div>
                <StatusBadge status={tournament.status} t={t} />
                <div className="ml-auto flex items-center gap-1">
                  <Button variant={isRunning ? 'default' : 'outline'} size="sm" onClick={() => onSelectTournament && onSelectTournament(tournament)}>
                    {ctaLabel(tournament.status)}
                  </Button>
                  {isManager && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); onUnlinkTournament(tournament.id); }}
                      disabled={isLinking}
                      title={t('leagues.unlinkTournament')}
                      aria-label={t('leagues.unlinkTournament')}
                    >
                      <Unlink />
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t('leagues.seasonRounds')}</h2>
        {actions}
      </div>

      {isLinkingTournament && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{t('leagues.selectTournamentToLink')}</CardTitle>
              <Button variant="ghost" size="icon-sm" onClick={onCloseLink} aria-label={t('common.cancel')}>
                <X />
              </Button>
            </div>
            {linkPlayers.length > 0 && <CardDescription>{t('leagues.mapPlayersHint')}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {loadingUnlinked ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : unlinkedTournaments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('leagues.noUnlinkedTournaments')}</p>
            ) : (
              <Select value={selectedTournamentToLink || NONE} onValueChange={(v) => onSelectTournamentToLink(v === NONE ? '' : v)}>
                <SelectTrigger className="w-full sm:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('leagues.chooseTournament')}</SelectItem>
                  {unlinkedTournaments.map(tour => (
                    <SelectItem key={tour.id} value={tour.id}>
                      {tour.name} ({tour.status}) — {new Date(tour.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {linkPlayers.length > 0 && (
              <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-2">
                {linkPlayers.map(p => (
                  <React.Fragment key={p.id}>
                    <span className="text-sm">{p.name}</span>
                    <Select
                      value={linkPlayerMap[p.id] || NONE}
                      onValueChange={(v) => setLinkPlayerMap(prev => ({ ...prev, [p.id]: v === NONE ? '' : v }))}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('leagues.chooseMember')}</SelectItem>
                        <SelectItem value="new">{t('leagues.newMember')}</SelectItem>
                        {members.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </React.Fragment>
                ))}
              </div>
            )}
          </CardContent>
          {!loadingUnlinked && unlinkedTournaments.length > 0 && (
            <CardFooter className="justify-end gap-2">
              <Button variant="outline" onClick={onCloseLink}>
                <X />
                {t('common.cancel')}
              </Button>
              <Button onClick={onLinkTournament} disabled={!isLinkMapComplete || isLinking}>
                <Check />
                {t('common.add')}
              </Button>
            </CardFooter>
          )}
        </Card>
      )}

      {rounds.length > 0 ? (
        seasonGroups.map(group => (
          <section key={group.id} className="flex flex-col gap-3">
            {seasons.length > 0 && <h3 className="text-base font-semibold tracking-tight">{group.name}</h3>}
            {renderRounds(group.rounds)}
          </section>
        ))
      ) : (
        <EmptyState icon={Trophy} title={t('leagues.noTournamentsYet')}>
          {actions}
        </EmptyState>
      )}
    </div>
  );
}
