import React, { useEffect, useState } from 'react';
import { Minus, Plus, Save, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Manager's "correct the result" dialog: one stepper per player plus quick
// presets for the usual final scores. Replaces the two browser prompts.
export function CorrectResultDialog({ match, onSave, onCancel, t }) {
  const [legs, setLegs] = useState([0, 0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (match) setLegs([match.result?.player1Legs ?? 0, match.result?.player2Legs ?? 0]);
  }, [match]);

  if (!match) return null;

  const legsToWin = match.legsToWin || match.legs_to_win || 3;
  const players = [match.player1, match.player2];
  const names = players.map((p, i) => p?.name || t(i === 0 ? 'management.player1' : 'management.player2'));
  const [l1, l2] = legs;
  const winnerIndex = l1 > l2 ? 0 : (l2 > l1 ? 1 : -1);
  const valid = winnerIndex !== -1 && players[winnerIndex]?.id;

  const setLeg = (i, value) => setLegs((prev) => prev.map((v, k) => (k === i ? Math.max(0, value) : v)));
  const presets = Array.from({ length: legsToWin }, (_, loserLegs) => ({ winnerLegs: legsToWin, loserLegs }));

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave(l1, l2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(match)} onOpenChange={(open) => { if (!open && !saving) onCancel(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manager.correctResult')}</DialogTitle>
          <DialogDescription>{t('manager.manualMatchResultDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {players.map((player, i) => (
            <div
              key={i}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border bg-card p-4 transition-colors',
                winnerIndex === i && 'border-primary ring-1 ring-primary'
              )}
            >
              <div className="flex min-h-10 items-center gap-1.5 text-center text-sm font-medium">
                {winnerIndex === i && <Trophy className="size-4 text-primary" />}
                <span className="line-clamp-2">{names[i]}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label={`${names[i]} −1`} onClick={() => setLeg(i, legs[i] - 1)} disabled={legs[i] === 0}>
                  <Minus />
                </Button>
                <span className="w-14 text-center text-5xl font-semibold tracking-tight tabular-nums">{legs[i]}</span>
                <Button type="button" variant="outline" size="icon" aria-label={`${names[i]} +1`} onClick={() => setLeg(i, legs[i] + 1)}>
                  <Plus />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">{t('manager.legs')}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t('manager.quickScore')}</span>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((winner) => (
              <div key={winner} className="flex flex-wrap gap-1.5">
                {presets.map(({ winnerLegs, loserLegs }) => {
                  const next = winner === 0 ? [winnerLegs, loserLegs] : [loserLegs, winnerLegs];
                  const active = next[0] === l1 && next[1] === l2;
                  return (
                    <Button
                      key={loserLegs}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      className="tabular-nums"
                      disabled={!players[winner]?.id}
                      onClick={() => setLegs(next)}
                    >
                      {next[0]} : {next[1]}
                    </Button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {!valid && (
          <p className="text-sm text-destructive">{t('manager.winnerMoreLegsError')}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>{t('common.cancel')}</Button>
          <Button type="button" onClick={handleSave} disabled={!valid || saving}>
            <Save />
            {t('manager.saveResult')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
