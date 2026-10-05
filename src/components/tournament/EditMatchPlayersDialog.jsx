import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// SelectItem values must be non-empty; this stands in for "no opponent (bye)".
const NONE = '__none';

// Component for editing playoff match players
function EditPlayoffMatchForm({ match, qualifyingPlayers, allRounds, onSave, onCancel, t }) {
  const [selectedPlayer1, setSelectedPlayer1] = useState(match.player1);
  const [selectedPlayer2, setSelectedPlayer2] = useState(match.player2);

  const currentRoundIndex = allRounds.findIndex(round =>
    round.matches.some(m => m.id === match.id)
  );

  // Build a stable pool of all players who are in playoffs (qualified + anyone already present in the bracket)
  const playoffPlayersPool = useMemo(() => {
    const byId = new Map();

    (qualifyingPlayers || []).forEach(qp => {
      const p = qp?.player || qp;
      if (p?.id) byId.set(p.id, p);
    });

    (allRounds || []).forEach(r => {
      (r?.matches || []).forEach(m => {
        if (m?.player1?.id) byId.set(m.player1.id, m.player1);
        if (m?.player2?.id) byId.set(m.player2.id, m.player2);
      });
    });

    return Array.from(byId.values());
  }, [qualifyingPlayers, allRounds]);

  // Check if previous round is complete
  const isPreviousRoundComplete = () => {
    if (currentRoundIndex === 0) return true; // First round, no previous round
    const previousRound = allRounds[currentRoundIndex - 1];
    if (!previousRound) return false;
    return previousRound.matches.every(m => m.status === 'completed');
  };

  // Allow selecting from ALL playoff players to make manual bracket editing possible.
  // Players already in other matches are still selectable for flexibility.
  const getAvailablePlayers = (excludePlayerId = null) => {
    const basePlayers = playoffPlayersPool.length > 0
      ? playoffPlayersPool
      : (qualifyingPlayers || []).map(qp => qp.player || qp);

    return basePlayers.filter(player => {
      // Exclude the other selected player in the same dropdown (can't have same player twice in one match)
      if (excludePlayerId && player.id === excludePlayerId) {
        return false;
      }
      // Allow all playoff players to be selected - no exclusion based on other match assignments
      return true;
    });
  };

  const handleSave = () => {
    // A playoff match may legitimately have only one player: that player gets a
    // bye (free pass) to the next round. So we require at least one player, not two.
    if (!selectedPlayer1 && !selectedPlayer2) {
      toast.error(t('management.pleaseSelectAtLeastOnePlayer'));
      return;
    }
    if (selectedPlayer1 && selectedPlayer2 && selectedPlayer1.id === selectedPlayer2.id) {
      toast.error(t('management.playersMustBeDifferent'));
      return;
    }
    onSave(selectedPlayer1 || null, selectedPlayer2 || null);
  };

  const availablePlayers1 = getAvailablePlayers(selectedPlayer2?.id);
  const availablePlayers2 = getAvailablePlayers(selectedPlayer1?.id);
  const previousRoundComplete = isPreviousRoundComplete();

  const renderPlayerSelect = (id, label, selected, available, setSelected) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={selected?.id || NONE}
        onValueChange={(value) => {
          const player = available.find(p => p.id === value);
          setSelected(player || null);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('management.noOpponentBye')}</SelectItem>
          {available.map(player => (
            <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        {currentRoundIndex > 0 && (
          <p className={cn('rounded-lg border px-3 py-2 text-sm', !previousRoundComplete
            ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
            : 'bg-muted/40 text-muted-foreground')}>
            {/* We still show a warning if previous round isn't complete, but allow manual selection. */}
            {!previousRoundComplete
              ? t('management.completePreviousRoundFirst', {
                roundName: allRounds[currentRoundIndex - 1]?.name || t('management.previousRound')
              })
              : t('management.youCanSelectAnyPlayoffPlayer')}
          </p>
        )}
        {renderPlayerSelect('edit-match-player1', t('management.player1'), selectedPlayer1, availablePlayers1, setSelectedPlayer1)}
        {renderPlayerSelect('edit-match-player2', t('management.player2'), selectedPlayer2, availablePlayers2, setSelectedPlayer2)}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>{t('registration.cancel')}</Button>
        <Button onClick={handleSave}>{t('common.save')}</Button>
      </DialogFooter>
    </>
  );
}

// `match` null = closed. The form remounts per match so its selections reset.
export function EditMatchPlayersDialog({ match, qualifyingPlayers, allRounds, onSave, onCancel, t }) {
  return (
    <Dialog open={!!match} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('management.editMatchPlayers')}</DialogTitle>
        </DialogHeader>
        {match && (
          <EditPlayoffMatchForm
            key={match.id}
            match={match}
            qualifyingPlayers={qualifyingPlayers}
            allRounds={allRounds}
            onSave={onSave}
            onCancel={onCancel}
            t={t}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
