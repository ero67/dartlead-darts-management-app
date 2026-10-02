import React from 'react';
import { ArrowLeft, Eye } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// Portalled to <body>: carries its own tw scope and the dark board theme.
const CONTENT = 'tw dark-mode text-foreground sm:max-w-md';
const stay = (e) => e.preventDefault();

// Pre-match "who starts" — cannot be dismissed, the match needs a starter.
export function StarterDialog({ players, scoringMode, onScoringModeChange, onSelect }) {
  const { t } = useLanguage();
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className={CONTENT} showCloseButton={false} onEscapeKeyDown={stay} onPointerDownOutside={stay} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('match.whoStarts')}</DialogTitle>
        </DialogHeader>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          className="grid w-full grid-cols-2"
          value={scoringMode}
          onValueChange={(v) => { if (v) onScoringModeChange(v); }}
        >
          <ToggleGroupItem value="dart" className="h-12 w-full rounded-lg data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {t('registration.scoringModeDart')}
          </ToggleGroupItem>
          <ToggleGroupItem value="turnTotal" className="h-12 w-full rounded-lg data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {t('registration.scoringModeTurnTotal')}
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex flex-col gap-2">
          {players.map((player, idx) => (
            <Button key={idx} type="button" variant="outline" className="h-16 w-full flex-col gap-0" onClick={() => onSelect(idx)}>
              <span className="max-w-full truncate text-base font-semibold">{player.name}</span>
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{player.legs} {t('match.legs')}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pre-match screen for visitors who may not score: explain and send them back.
export function ViewOnlyDialog({ description, onBack }) {
  const { t } = useLanguage();
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className={CONTENT} showCloseButton={false} onEscapeKeyDown={stay} onPointerDownOutside={stay}>
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <Eye className="size-10 text-muted-foreground" />
          <DialogTitle>{t('match.viewOnlyMode')}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Button size="lg" className="w-full" onClick={onBack}>
          <ArrowLeft />
          {t('match.backToTournament')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Over-long leg: pick who won the bull-up (no checkout is recorded).
export function BullupDialog({ open, onOpenChange, players, onPick }) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CONTENT} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('match.bullup.title')}</DialogTitle>
          <DialogDescription>{t('match.bullup.prompt')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {players.map((player, idx) => (
            <Button key={idx} type="button" className="h-14 min-w-0 text-base" onClick={() => onPick(idx)}>
              <span className="truncate">{player.name}</span>
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
