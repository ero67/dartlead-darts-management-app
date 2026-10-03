import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

const OPTION = 'flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent';
const OPTION_ACTIVE = 'border-primary ring-1 ring-primary';

// Asked when a 3-dart total lands exactly on zero: how many darts did the
// finish take, and did it end on a double? `pending` is
// { total, dartsUsed: 1|2|3, finishedOnDouble: boolean }. The two hints under
// the outcome cards can be overridden where "leg won" is the wrong words (the
// checkout trainer scores attempts, not legs).
export function CheckoutDialog({ pending, onChange, onConfirm, onCancel, doubleOutHint, bustHint }) {
  const { t } = useLanguage();
  if (!pending) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      {/* Portalled to <body>: carries its own tw scope, and the board theme (scoring screens are dark). */}
      <DialogContent className="text-foreground sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="flex-row items-center justify-between text-left">
          <DialogTitle>{t('match.checkout.title')}</DialogTitle>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">{pending.total}</span>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <DialogDescription>{t('match.checkout.dartsLabel')}</DialogDescription>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            className="grid w-full grid-cols-3"
            value={String(pending.dartsUsed)}
            onValueChange={(v) => { if (v) onChange({ ...pending, dartsUsed: Number(v) }); }}
          >
            {[1, 2, 3].map(n => (
              <ToggleGroupItem
                key={n}
                value={String(n)}
                className="h-14 w-full flex-col gap-0 rounded-lg data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                <span className="text-xl font-semibold tabular-nums">{n}</span>
                <span className="text-xs opacity-80">{t(n === 1 ? 'match.checkout.dartUnitOne' : 'match.checkout.dartUnitMany')}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <DialogDescription>{t('match.checkout.outcomeLabel')}</DialogDescription>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={cn(OPTION, pending.finishedOnDouble && OPTION_ACTIVE)}
              aria-pressed={pending.finishedOnDouble}
              onClick={() => onChange({ ...pending, finishedOnDouble: true })}
            >
              <CheckCircle className="size-5 text-primary" />
              <span className="text-sm font-semibold">{t('match.checkout.doubleOut')}</span>
              <span className="text-xs text-muted-foreground">{doubleOutHint || t('match.checkout.doubleOutHint')}</span>
            </button>
            <button
              type="button"
              className={cn(OPTION, !pending.finishedOnDouble && 'border-destructive ring-1 ring-destructive')}
              aria-pressed={!pending.finishedOnDouble}
              onClick={() => onChange({ ...pending, finishedOnDouble: false })}
            >
              <XCircle className="size-5 text-destructive" />
              <span className="text-sm font-semibold">{t('match.checkout.bust')}</span>
              <span className="text-xs text-muted-foreground">{bustHint || t('match.checkout.bustHint')}</span>
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={pending.finishedOnDouble ? 'default' : 'destructive'}
            onClick={() => onConfirm(pending)}
          >
            {t('match.checkout.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
