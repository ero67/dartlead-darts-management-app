import React from 'react';
import { Play, List, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { isCricketGame } from '@/lib/cricket';

const Versus = ({ match, t }) => (
  <div className="flex flex-wrap items-center justify-center gap-3 text-2xl font-semibold">
    <span>{match.player1?.name || t('management.player1')}</span>
    <span className="text-base font-normal text-muted-foreground">{t('common.vs')}</span>
    <span>{match.player2?.name || t('management.player2')}</span>
  </div>
);

// What a tablet fixed to one board shows between matches: the match the
// manager queued for this board with one big Start, the rest of the queue,
// and a way out to the full match list. `ownLive` is this device's own
// unfinished match, which comes first so a scorer never has to dig for it.
export function BoardWaitingScreen({ tournament, boardNumber, next, then, ownLive, onStart, onContinue, onPickMatch, t }) {
  const featured = ownLive || next;
  return (
    <Card className="mx-auto w-full max-w-xl gap-5 p-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="size-4" />
          {tournament.name}
        </span>
        <h2 className="text-3xl font-bold tabular-nums">{t('boards.screenTitle', { board: boardNumber })}</h2>
      </div>

      {featured ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/40 p-5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {ownLive ? t('boards.continueOwn') : t('boards.nextUp')}
          </span>
          <Versus match={featured} t={t} />
          <div className="flex flex-wrap justify-center gap-2">
            {(featured.label || featured.groupName) && <Badge variant="secondary">{featured.label || featured.groupName}</Badge>}
            {isCricketGame(featured.gameType || tournament.gameType) && <Badge variant="outline">{t('common.gameTypeCricket')}</Badge>}
          </div>
          <Button size="lg" className="mt-2 h-14 w-full text-lg" onClick={() => (ownLive ? onContinue(ownLive) : onStart(next))}>
            <Play />
            {ownLive ? t('management.continueMatch') : t('management.startMatch')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed p-5">
          <span className="font-medium">{t('boards.nothingQueued', { board: boardNumber })}</span>
          <span className="text-sm text-muted-foreground">{t('boards.waitingForManager')}</span>
        </div>
      )}

      {then.length > 0 && (
        <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
          {then.map((m) => (
            <li key={m.id}>
              {t('boards.then')}: {m.player1?.name} {t('common.vs')} {m.player2?.name}
            </li>
          ))}
        </ol>
      )}

      <Button variant="outline" size="lg" className="h-12 w-full" onClick={onPickMatch}>
        <List />
        {t('boards.pickMatch')}
      </Button>
    </Card>
  );
}
