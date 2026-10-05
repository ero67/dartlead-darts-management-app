import React from 'react';
import { Trophy, Plus, Link, Unlink, Calendar, Check, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '../shared/StatusBadge';
import { EmptyState } from '../shared/EmptyState';

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

  const actions = isManager && (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={onOpenLink}>
        <Link />
        {t('leagues.addExistingTournament') || 'Add Existing'}
      </Button>
      {onCreateTournament && (
        <Button onClick={() => onCreateTournament(league)}>
          <Plus />
          {t('leagues.createTournament')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{t('tournaments.title')}</h2>
        {actions}
      </div>

      {isLinkingTournament && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>{t('leagues.selectTournamentToLink') || 'Select a tournament to add to this league'}</CardTitle>
              <Button variant="ghost" size="icon-sm" onClick={onCloseLink} aria-label={t('common.cancel')}>
                <X />
              </Button>
            </div>
            {linkPlayers.length > 0 && <CardDescription>{t('leagues.mapPlayersHint')}</CardDescription>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {loadingUnlinked ? (
              <p className="text-sm text-muted-foreground">{t('common.loading') || 'Loading...'}</p>
            ) : unlinkedTournaments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('leagues.noUnlinkedTournaments') || 'No unlinked tournaments found. All your tournaments are already in a league.'}
              </p>
            ) : (
              <Select value={selectedTournamentToLink || NONE} onValueChange={(v) => onSelectTournamentToLink(v === NONE ? '' : v)}>
                <SelectTrigger className="w-full sm:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('leagues.chooseTournament') || '-- Choose tournament --'}</SelectItem>
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

      {league.tournaments && league.tournaments.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {league.tournaments.map(tournament => (
            <Card key={tournament.id} className="gap-4">
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-base font-semibold leading-6">{tournament.name}</h3>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge status={tournament.status} t={t} />
                    {isManager && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="-mr-2 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onUnlinkTournament(tournament.id); }}
                        disabled={isLinking}
                        title={t('leagues.unlinkTournament') || 'Remove from league'}
                        aria-label={t('leagues.unlinkTournament') || 'Remove from league'}
                      >
                        <Unlink />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4" />
                  {new Date(tournament.created_at).toLocaleDateString()}
                </span>
              </CardContent>
              <CardFooter>
                <Button variant="outline" onClick={() => onSelectTournament && onSelectTournament(tournament)}>
                  {t('tournaments.view')}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={Trophy} title={t('leagues.noTournamentsYet')}>
          {actions}
        </EmptyState>
      )}
    </div>
  );
}
