import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { BracketSeedingEditor } from './BracketSeedingEditor';
import { presetKey, nextPow2 } from '../utils/seedSlots';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// A library of prepared seeding configs, each keyed by (number of groups, bracket
// start size). At tournament time the matching preset is auto-selected by
// resolveActiveTemplate (see seedSlots.js). Lives in league default settings.
//
// Stored shape: playoffSettings.seedingPresets = {
//   "4-16": { enabled, mode:'perGroup', bracketSize:16, numGroups:4, signature, slots:[...] },
//   ...
// }
const GROUP_OPTIONS = [2, 3, 4, 5, 6, 8];
const BRACKET_START_OPTIONS = [4, 8, 16, 32];

export function SeedingPresetLibrary({ presets, onChange }) {
  const { t } = useLanguage();
  const [newGroups, setNewGroups] = useState(4);
  const [newBracket, setNewBracket] = useState(16);

  const library = presets && typeof presets === 'object' ? presets : {};
  const entries = Object.entries(library);

  const synthesizeGroups = (numGroups) =>
    Array.from({ length: numGroups }, (_, i) => ({ name: `Group ${String.fromCharCode(65 + i)}` }));

  const addPreset = () => {
    const key = presetKey(newGroups, newBracket);
    if (library[key]) return; // already exists
    onChange({
      ...library,
      [key]: {
        enabled: true,
        mode: 'perGroup',
        bracketSize: newBracket,
        numGroups: newGroups,
        slots: new Array(newBracket).fill(null),
      },
    });
  };

  const updatePreset = (key, customSeeding) => {
    if (!customSeeding) {
      // Editor disabled -> remove the preset entirely.
      removePreset(key);
      return;
    }
    onChange({
      ...library,
      [key]: {
        ...customSeeding,
        numGroups: library[key]?.numGroups,
      },
    });
  };

  const removePreset = (key) => {
    const next = { ...library };
    delete next[key];
    onChange(next);
  };

  const bracketLabel = (size) => t('registration.presetBracketTop', { count: size });

  return (
    <div className="flex flex-col gap-4 text-foreground">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/40 p-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preset-groups" className="text-xs text-muted-foreground">{t('registration.presetGroups')}</Label>
          <Select value={String(newGroups)} onValueChange={(v) => setNewGroups(parseInt(v, 10))}>
            <SelectTrigger id="preset-groups" className="w-24 bg-background tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="tabular-nums">{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="preset-bracket" className="text-xs text-muted-foreground">{t('registration.presetBracketStart')}</Label>
          <Select value={String(newBracket)} onValueChange={(v) => setNewBracket(parseInt(v, 10))}>
            <SelectTrigger id="preset-bracket" className="w-36 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRACKET_START_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{bracketLabel(n)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          onClick={addPreset}
          disabled={!!library[presetKey(newGroups, newBracket)]}
        >
          <Plus />
          {t('registration.presetAdd')}
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground italic">{t('registration.presetEmpty')}</p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {entries
            .sort((a, b) => (b[1].numGroups - a[1].numGroups) || (b[1].bracketSize - a[1].bracketSize))
            .map(([key, preset]) => {
              const numGroups = preset.numGroups || 0;
              return (
                <Card key={key} className="gap-4 py-4">
                  <CardHeader className="flex items-center justify-between px-4">
                    <CardTitle>
                      {t('registration.presetCardTitle', { groups: numGroups, bracket: preset.bracketSize })}
                    </CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removePreset(key)}
                      aria-label={t('registration.presetRemove')}
                    >
                      <Trash2 />
                    </Button>
                  </CardHeader>
                  <CardContent className="px-4">
                    <BracketSeedingEditor
                      playoffSettings={{ qualificationMode: 'perGroup' }}
                      groups={synthesizeGroups(numGroups)}
                      bracketSizeOverride={preset.bracketSize || nextPow2(numGroups)}
                      value={preset}
                      onChange={(customSeeding) => updatePreset(key, customSeeding)}
                      hideToggle
                    />
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
