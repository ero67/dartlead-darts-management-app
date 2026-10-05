import React, { useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  enumerateSeedSlots,
  signaturesEqual,
  slotId,
} from '../utils/seedSlots';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const BYE = '__bye';

// Editor for the configurable playoff seed-slot template. The user assigns
// abstract seed slots ("A1", "B4", or global seed "3") to first-round bracket
// positions. At playoff-generation time each slot is resolved to the real
// qualified player (or a bye). See src/utils/seedSlots.js.
//
// Controlled component: holds no internal slot state, lifts the full
// customSeeding object to the parent via onChange.
export function BracketSeedingEditor({ playoffSettings, groups, value, onChange, bracketSizeOverride, hideToggle = false }) {
  const { t } = useLanguage();

  const { mode, bracketSize, signature, pool } = useMemo(
    () => enumerateSeedSlots(playoffSettings, groups, bracketSizeOverride ? { bracketSize: bracketSizeOverride } : {}),
    [playoffSettings, groups, bracketSizeOverride]
  );

  const poolById = useMemo(() => {
    const map = {};
    pool.forEach((p) => { map[p.id] = p; });
    return map;
  }, [pool]);

  // Standard seeded bracket position order (1 vs N, etc.) for a power-of-two size.
  const standardBracketOrder = (size) => {
    let rounds = [1, 2];
    while (rounds.length < size) {
      const next = [];
      const sum = rounds.length * 2 + 1;
      rounds.forEach((s) => {
        next.push(s);
        next.push(sum - s);
      });
      rounds = next;
    }
    return rounds; // 1-based seed positions
  };

  const enabled = !!(value && value.enabled);
  const slots = (value && Array.isArray(value.slots)) ? value.slots : new Array(bracketSize).fill(null);

  // Detect a stale template (settings changed since it was built).
  const isStale = enabled && value?.signature && !signaturesEqual(value.signature, signature);

  const usedIds = useMemo(() => {
    const set = new Set();
    slots.forEach((s) => { const id = slotId(s); if (id) set.add(id); });
    return set;
  }, [slots]);

  const emit = (nextSlots) => {
    onChange({
      enabled: true,
      mode,
      bracketSize,
      signature,
      slots: nextSlots,
    });
  };

  const handleToggle = (checked) => {
    if (checked === true) {
      emit(new Array(bracketSize).fill(null));
    } else {
      onChange(null); // disable -> remove template, fall back to automatic seeding
    }
  };

  const handleSlotChange = (slotIndex, optionId) => {
    const next = slots.slice();
    // Pad/truncate to current bracketSize.
    while (next.length < bracketSize) next.push(null);
    next.length = bracketSize;
    next[slotIndex] = optionId ? poolById[optionId] : null;
    // Store the minimal slot reference (drop the label).
    if (next[slotIndex]) {
      const s = next[slotIndex];
      next[slotIndex] = s.seed != null ? { seed: s.seed } : { group: s.group, rank: s.rank };
    }
    emit(next);
  };

  const handleAutoFill = () => {
    // Map standard bracket seed positions to the pool order. In perGroup mode the
    // pool is ordered group-major (A1,A2,...,B1,...), which is a reasonable default;
    // organizers can then tweak. Missing positions become byes.
    const order = standardBracketOrder(bracketSize); // 1-based positions
    const next = order.map((seedPos) => {
      const poolItem = pool[seedPos - 1];
      if (!poolItem) return null;
      return poolItem.seed != null ? { seed: poolItem.seed } : { group: poolItem.group, rank: poolItem.rank };
    });
    emit(next);
  };

  const handleClear = () => emit(new Array(bracketSize).fill(null));

  if (pool.length === 0) {
    return (
      <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground italic">
        {t('registration.customSeedingNoSlots')}
      </p>
    );
  }

  const numMatches = bracketSize / 2;

  const showBody = hideToggle ? true : enabled;

  return (
    <div className="flex flex-col gap-3 text-foreground">
      {!hideToggle && (
        <Label htmlFor="custom-seeding-enabled" className="cursor-pointer font-semibold">
          <Checkbox id="custom-seeding-enabled" checked={enabled} onCheckedChange={handleToggle} />
          {t('registration.customSeedingEnable')}
        </Label>
      )}

      {showBody && (
        <>
          {isStale && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400 bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
              {t('registration.customSeedingStale')}
              <Button type="button" variant="outline" size="xs" className="border-amber-400 text-amber-800 dark:text-amber-200" onClick={handleClear}>
                {t('registration.customSeedingRebuild')}
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleAutoFill}>{t('registration.customSeedingAutoFill')}</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleClear}>{t('registration.customSeedingClear')}</Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: numMatches }, (_, m) => {
              const p1Index = m * 2;
              const p2Index = m * 2 + 1;
              return (
                <div key={m} className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-xs font-bold text-muted-foreground tabular-nums">{m + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {[p1Index, p2Index].map((slotIndex) => {
                      const current = slots[slotIndex];
                      const currentId = slotId(current);
                      return (
                        <Select
                          key={slotIndex}
                          value={currentId || BYE}
                          onValueChange={(v) => handleSlotChange(slotIndex, v === BYE ? '' : v)}
                        >
                          <SelectTrigger
                            size="sm"
                            className={cn('w-full bg-background', currentId ? 'border-primary ring-2 ring-primary/30' : 'text-muted-foreground')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={BYE}>{t('registration.customSeedingBye')}</SelectItem>
                            {pool.map((p) => (
                              <SelectItem
                                key={p.id}
                                value={p.id}
                                disabled={p.id !== currentId && usedIds.has(p.id)}
                              >
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
