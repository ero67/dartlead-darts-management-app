import React, { useState } from 'react';
import { Check, Crown, Flag, Pencil, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { PlayerLink } from './PlayerLink';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { leagueService } from '../../services/leagueService';
import { currentSeasonName, defaultSeasonName, seasonStartYear } from '../../utils/leagueSeason';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const formatDate = (date) => new Date(date).toLocaleDateString();

// "Current season / past seasons / all time" for statistics and head-to-head.
// Nothing to choose until a season has ended.
export function SeasonSelect({ league, value, onChange, disabled }) {
  const { t } = useLanguage();
  if (!league.seasons?.length) return null;
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size="sm" className="w-full sm:w-56" aria-label={t('leagues.season')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="current">{currentSeasonName(league, t)}</SelectItem>
        {league.seasons.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        <SelectItem value="all">{t('leagues.allTime')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function EndSeasonDialog({ league, onEnded }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [endedName, setEndedName] = useState('');
  const [nextName, setNextName] = useState('');
  const [isEnding, setIsEnding] = useState(false);

  // Prefill on open: the current name, and the season after it.
  const handleOpenChange = (isOpen) => {
    if (isOpen) {
      setEndedName(currentSeasonName(league, t));
      const nextYear = Math.max(seasonStartYear(Date.now()), seasonStartYear(league.seasonStartedAt || Date.now()) + 1);
      setNextName(defaultSeasonName(nextYear, t));
    }
    setOpen(isOpen);
  };

  const handleEnd = async () => {
    if (isEnding || !endedName.trim()) return;
    setIsEnding(true);
    try {
      await leagueService.endSeason(league.id, endedName.trim(), nextName.trim());
      toast.success(t('leagues.seasonEnded', { name: endedName.trim() }));
      setOpen(false);
      await onEnded();
    } catch (error) {
      console.error('Error ending season:', error);
      const code = error?.message;
      toast.error(code === 'round_in_progress' ? t('leagues.endSeasonRoundRunning')
        : code === 'empty_season' ? t('leagues.endSeasonEmpty')
        : t('leagues.endSeasonFailed'));
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Flag />
        {t('leagues.endSeason')}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('leagues.endSeason')}</DialogTitle>
            <DialogDescription>{t('leagues.endSeasonDescription')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ended-season-name">{t('leagues.endedSeasonName')}</Label>
              <Input id="ended-season-name" value={endedName} maxLength={100} onChange={(e) => setEndedName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="next-season-name">{t('leagues.nextSeasonName')}</Label>
              <Input id="next-season-name" value={nextName} maxLength={100} onChange={(e) => setNextName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleEnd} disabled={isEnding || !endedName.trim()}>
              <Flag />
              {isEnding ? t('common.loading') : t('leagues.endSeason')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// The frozen final table of an ended season; managers can rename it.
function SeasonDialog({ season, isManager, onClose, onRenamed }) {
  const { t } = useLanguage();
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const standings = season?.standings || [];

  const handleRename = async () => {
    if (isSaving || !name.trim()) return;
    setIsSaving(true);
    try {
      await leagueService.renameSeason(season.id, name.trim());
      setIsRenaming(false);
      await onRenamed();
    } catch (error) {
      console.error('Error renaming season:', error);
      toast.error(t('leagues.renameSeasonFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!season} onOpenChange={(isOpen) => { if (!isOpen) { setIsRenaming(false); onClose(); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {season && (
          <>
            <DialogHeader>
              {isRenaming ? (
                <div className="flex items-center gap-2 pr-6">
                  <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} aria-label={t('leagues.seasonName')} autoFocus />
                  <Button size="icon" onClick={handleRename} disabled={isSaving || !name.trim()} aria-label={t('common.save')}><Check /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setIsRenaming(false)} aria-label={t('common.cancel')}><X /></Button>
                </div>
              ) : (
                <DialogTitle className="flex items-center gap-2 pr-6">
                  {season.name}
                  {isManager && (
                    <Button variant="ghost" size="icon-sm" onClick={() => { setName(season.name); setIsRenaming(true); }} aria-label={t('leagues.renameSeason')} title={t('leagues.renameSeason')}>
                      <Pencil />
                    </Button>
                  )}
                </DialogTitle>
              )}
              <DialogDescription>
                {t('leagues.finalStandings')} · {formatDate(season.started_at)} – {formatDate(season.ended_at)}
              </DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>{t('leagues.player')}</TableHead>
                  <TableHead className="text-right">{t('leagues.points')}</TableHead>
                  <TableHead className="text-right">{t('leagues.played')}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t('leagues.legs')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map(row => (
                  <TableRow key={row.player_id}>
                    <TableCell className={cn('font-display text-lg font-semibold', row.rank <= 3 ? 'text-primary' : 'text-muted-foreground')}>{row.rank}</TableCell>
                    <TableCell><PlayerLink player={{ id: row.player_id, name: row.name }} className="text-left" /></TableCell>
                    <TableCell className="text-right font-display text-lg font-semibold">{row.points}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.played}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{row.legs_won}:{row.legs_lost}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PastSeasons({ league, isManager, onChanged }) {
  const { t } = useLanguage();
  const [openSeasonId, setOpenSeasonId] = useState(null);
  const seasons = league.seasons || [];
  if (!seasons.length) return null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-semibold tracking-tight">{t('leagues.pastSeasons')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {seasons.map(season => {
          const champion = season.standings?.[0];
          return (
            <Card key={season.id} className="flex-row items-center gap-4 px-4 py-3.5">
              <Crown className="size-6 shrink-0 text-amber-500" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{season.name}</span>
                <span className="text-xs text-muted-foreground">{formatDate(season.started_at)} – {formatDate(season.ended_at)}</span>
                <span className="truncate text-sm">
                  {champion ? t('leagues.champion', { name: champion.name, points: champion.points }) : t('leagues.noResultsYet')}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOpenSeasonId(season.id)}>{t('leagues.viewTable')}</Button>
            </Card>
          );
        })}
      </div>
      <SeasonDialog
        season={seasons.find(s => s.id === openSeasonId) || null}
        isManager={isManager}
        onClose={() => setOpenSeasonId(null)}
        onRenamed={onChanged}
      />
    </section>
  );
}
