import React, { useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
  enumerateSeedSlots,
  signaturesEqual,
  slotId,
} from '../utils/seedSlots';
import './BracketSeedingEditor.css';

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

  const handleToggle = (e) => {
    if (e.target.checked) {
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
      <p className="seeding-editor-note">
        {t('registration.customSeedingNoSlots')}
      </p>
    );
  }

  const numMatches = bracketSize / 2;

  const showBody = hideToggle ? true : enabled;

  return (
    <div className="bracket-seeding-editor">
      {!hideToggle && (
        <label className="seeding-editor-toggle">
          <input type="checkbox" checked={enabled} onChange={handleToggle} />
          {t('registration.customSeedingEnable')}
        </label>
      )}

      {showBody && (
        <>
          {isStale && (
            <div className="seeding-editor-stale">
              {t('registration.customSeedingStale')}
              <button type="button" className="seeding-editor-rebuild" onClick={handleClear}>
                {t('registration.customSeedingRebuild')}
              </button>
            </div>
          )}

          <div className="seeding-editor-actions">
            <button type="button" onClick={handleAutoFill}>{t('registration.customSeedingAutoFill')}</button>
            <button type="button" onClick={handleClear}>{t('registration.customSeedingClear')}</button>
          </div>

          <div className="seeding-editor-matches">
            {Array.from({ length: numMatches }, (_, m) => {
              const p1Index = m * 2;
              const p2Index = m * 2 + 1;
              return (
                <div key={m} className="seeding-editor-match">
                  <span className="seeding-editor-match-num">{m + 1}</span>
                  <div className="seeding-editor-slots">
                    {[p1Index, p2Index].map((slotIndex) => {
                      const current = slots[slotIndex];
                      const currentId = slotId(current);
                      return (
                        <select
                          key={slotIndex}
                          className="seeding-editor-select"
                          value={currentId}
                          onChange={(e) => handleSlotChange(slotIndex, e.target.value)}
                        >
                          <option value="">{t('registration.customSeedingBye')}</option>
                          {pool.map((p) => (
                            <option
                              key={p.id}
                              value={p.id}
                              disabled={p.id !== currentId && usedIds.has(p.id)}
                            >
                              {p.label}
                            </option>
                          ))}
                        </select>
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
