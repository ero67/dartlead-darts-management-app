import React from 'react';
import { BadgeCheck, Check, ClipboardList, Crown, Plus, Search, Star, UserPlus, Users, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '../shared/EmptyState';
import { UserSearchPicker } from '../UserSearchPicker';
import { cn } from '@/lib/utils';

const hint = 'text-sm text-muted-foreground';

// Players card: add-player modes (managers) and the player grid.
export function PlayersSection({
  tournament,
  players,
  maxPlayers,
  canManage,
  onViewProfile,
  // add modes
  addMode,
  setAddMode,
  singlePlayerInputRef,
  newPlayerName,
  setNewPlayerName,
  onAddPlayer,
  bulkPlayerNames,
  setBulkPlayerNames,
  bulkPreview,
  isBulkAdding,
  onAddBulkPlayers,
  onAddUserFromSearch,
  leaguePlayerPool,
  visibleLeaguePool,
  selectedLeaguePlayerIds,
  setSelectedLeaguePlayerIds,
  selectedInPool,
  leaguePlayerFilter,
  setLeaguePlayerFilter,
  onToggleLeaguePlayer,
  onAddLeaguePlayers,
  addingLeaguePlayers,
  // seeding + removal
  seededPlayerIds,
  onToggleSeeded,
  onRemovePlayer,
}) {
  const { t } = useLanguage();
  const isFull = players.length >= maxPlayers;
  const isOpen = tournament.status === 'open_for_registration';
  const hasGroups = tournament.tournamentType !== 'playoff_only';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" />
          {t('registration.players')}
          <Badge variant="secondary" className="tabular-nums">{players.length} / {maxPlayers}</Badge>
        </CardTitle>
        {players.length < 2 && <CardDescription>{t('registration.minPlayersHint')}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {canManage && (
          <Tabs value={addMode} onValueChange={setAddMode}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="name"><UserPlus />{t('registration.addModeSingle')}</TabsTrigger>
              <TabsTrigger value="bulk"><ClipboardList />{t('registration.addModeBulk')}</TabsTrigger>
              <TabsTrigger value="users"><Search />{t('registration.addModeUsers')}</TabsTrigger>
              {tournament.leagueId && (
                <TabsTrigger value="league"><Crown />{t('registration.addModeLeague')}</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="name" className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  ref={singlePlayerInputRef}
                  type="text"
                  placeholder={t('registration.enterPlayerName')}
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onAddPlayer()}
                  maxLength={50}
                />
                <Button onClick={onAddPlayer} disabled={!newPlayerName.trim() || isFull}>
                  <Plus />
                  {t('registration.addPlayer')}
                </Button>
              </div>
              <p className={hint}>{t('registration.quickAddHint')}</p>
            </TabsContent>

            <TabsContent value="bulk" className="flex flex-col gap-3">
              <Textarea
                placeholder={t('registration.playersBulkPlaceholder')}
                value={bulkPlayerNames}
                onChange={(e) => setBulkPlayerNames(e.target.value)}
                rows={4}
                maxLength={2000}
              />
              {bulkPreview.fresh.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {bulkPreview.fresh.map((name) => (
                    <Badge key={name.toLowerCase()} variant="secondary" className="font-normal">{name}</Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={onAddBulkPlayers} disabled={isBulkAdding || bulkPreview.fresh.length === 0 || isFull}>
                  <Plus />
                  {bulkPreview.fresh.length > 0
                    ? t('registration.addNPlayers', { count: bulkPreview.fresh.length })
                    : t('registration.addPlayers')}
                </Button>
                {bulkPreview.skipped > 0 && (
                  <span className={hint}>{t('registration.bulkSkipped', { count: bulkPreview.skipped })}</span>
                )}
              </div>
              <p className={hint}>{t('registration.playersBulkHelp')}</p>
            </TabsContent>

            <TabsContent value="users" className="flex flex-col gap-2">
              <UserSearchPicker
                onSelect={onAddUserFromSearch}
                excludeIds={players.map((p) => p.user_id).filter(Boolean)}
              />
              <p className={hint}>{t('registration.fromUsersHint')}</p>
            </TabsContent>

            {tournament.leagueId && (
              <TabsContent value="league" className="flex flex-col gap-3">
                {leaguePlayerPool.length === 0 ? (
                  <p className={hint}>{t('registration.allLeaguePlayersAdded')}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(hint, 'mr-auto tabular-nums')}>
                        {t('tournaments.selectedCount', { selected: selectedInPool.length, total: leaguePlayerPool.length })}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLeaguePlayerIds(new Set(leaguePlayerPool.map((p) => p.id)))}
                        disabled={selectedInPool.length === leaguePlayerPool.length}
                      >
                        {t('tournaments.selectAllPlayers')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLeaguePlayerIds(new Set())}
                        disabled={selectedInPool.length === 0}
                      >
                        {t('tournaments.clearSelection')}
                      </Button>
                    </div>
                    {leaguePlayerPool.length > 12 && (
                      <Input
                        type="text"
                        placeholder={t('tournaments.filterPlayers')}
                        value={leaguePlayerFilter}
                        onChange={(e) => setLeaguePlayerFilter(e.target.value)}
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      {visibleLeaguePool.map((player) => {
                        const isSelected = selectedLeaguePlayerIds.has(player.id);
                        return (
                          <Button
                            key={player.id}
                            type="button"
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            className="h-9 rounded-full"
                            aria-pressed={isSelected}
                            onClick={() => onToggleLeaguePlayer(player.id)}
                          >
                            {isSelected ? <Check /> : <Plus />}
                            {player.name}
                          </Button>
                        );
                      })}
                      {visibleLeaguePool.length === 0 && (
                        <span className={hint}>{t('tournaments.noPlayersMatchFilter')}</span>
                      )}
                    </div>
                    <div>
                      <Button onClick={onAddLeaguePlayers} disabled={selectedInPool.length === 0 || addingLeaguePlayers || isFull}>
                        <Plus />
                        {addingLeaguePlayers
                          ? t('common.loading')
                          : t('registration.addSelectedPlayers', { count: selectedInPool.length })}
                      </Button>
                    </div>
                    <p className={hint}>{t('registration.leaguePoolHint')}</p>
                  </>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        {canManage && hasGroups && players.length > 0 && (
          <p className={cn(hint, 'flex items-center gap-1.5')}>
            <Star className="size-3.5 shrink-0" />
            <span>
              {t('registration.seededHint')}
              {seededPlayerIds.size > 0 && (
                <span className="tabular-nums">{' — '}{seededPlayerIds.size} {t('registration.seeded')}</span>
              )}
            </span>
          </p>
        )}

        {players.length === 0 ? (
          <EmptyState icon={Users} title={t('registration.noPlayersYet')} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {players.map((player, index) => {
              const isSeeded = seededPlayerIds.has(player.id);
              return (
                <div key={player.id} data-testid="player-card" className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-1.5">
                  <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
                    onClick={() => onViewProfile(player.id)}
                    title={t('playerProfile.viewProfile')}
                  >
                    {player.name}
                  </button>
                  {player.user_id && (
                    <Badge variant="outline" title={t('common.registeredAccount')}>
                      <BadgeCheck />
                      <span className="sr-only">{t('common.registeredAccount')}</span>
                    </Badge>
                  )}
                  {isOpen && canManage && hasGroups && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={isSeeded ? 'text-amber-500 hover:text-amber-500' : 'text-muted-foreground'}
                      onClick={() => onToggleSeeded(player.id)}
                      title={t('registration.toggleSeeded') || 'Toggle seeded'}
                      aria-label={t('registration.toggleSeeded') || 'Toggle seeded'}
                      aria-pressed={isSeeded}
                    >
                      <Star className={cn(isSeeded && 'fill-current')} />
                    </Button>
                  )}
                  {isOpen && canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      data-testid="remove-player-btn"
                      onClick={() => onRemovePlayer(player.id)}
                      title={t('registration.removePlayer') || 'Remove player'}
                      aria-label={t('registration.removePlayer') || 'Remove player'}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
