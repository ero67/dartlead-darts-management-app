import React from 'react';
import { Play, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Match start confirmation. `match` null = closed.
export function StartMatchDialog({ match, onConfirm, onCancel, t }) {
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
          </div>
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
