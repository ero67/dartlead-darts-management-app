import React from 'react';
import { Play, X, Target } from 'lucide-react';
import { useLiveMatch } from '../../contexts/LiveMatchContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isCricketGame } from '@/lib/cricket';

// Match start confirmation. `match` null = closed.
export function StartMatchDialog({ match, onConfirm, onCancel, t }) {
  const { boardNumber } = useLiveMatch();
  // Gentle nudge only: the scorer may know better (board swapped, one free).
  const board = match?.assignedBoard;
  const boardHint = board && Number(boardNumber) !== board
    ? (boardNumber ? t('boards.startHintDevice', { board, device: boardNumber }) : t('boards.startHint', { board }))
    : null;
  return (
    <Dialog open={!!match} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('management.confirmStartMatch')}</DialogTitle>
          <DialogDescription>{t('management.confirmStartMatchMessage')}</DialogDescription>
        </DialogHeader>
        {match && (
          <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/40 p-4 text-center">
            <div className="flex flex-wrap items-center justify-center gap-3 text-lg font-semibold">
              <span>{match.player1?.name || t('management.player1')}</span>
              <span className="text-sm font-normal text-muted-foreground">{t('common.vs')}</span>
              <span>{match.player2?.name || t('management.player2')}</span>
            </div>
            {match.groupName && <Badge variant="secondary">{match.groupName}</Badge>}
            {match.isPlayoff && <Badge variant="outline">{t('management.playoffMatch')}</Badge>}
            {isCricketGame(match.gameType) && <Badge variant="outline">{t('common.gameTypeCricket')}</Badge>}
          </div>
        )}
        {boardHint && (
          <p role="status" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <Target className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            {boardHint}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            <X />
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm}>
            <Play />
            {t('management.startMatch')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
