import React from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Final screen after the last leg: winner, final score, back to the tournament.
export function MatchCompleteCard({ winnerName, player1Legs, player2Legs, onBack }) {
  const { t } = useLanguage();
  return (
    <div className="dark-mode flex flex-1 flex-col items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-sm items-center gap-4 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-green-950 text-green-200">
          <CheckCircle className="size-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('match.matchComplete')}</h1>
        <p className="text-sm text-muted-foreground">{t('match.winner')}: {winnerName}</p>
        <div className="text-5xl font-semibold tracking-tight tabular-nums">{player1Legs} - {player2Legs}</div>
        <Button size="lg" className="w-full" onClick={onBack}>
          <ArrowLeft />
          {t('match.backToTournament')}
        </Button>
      </Card>
    </div>
  );
}
