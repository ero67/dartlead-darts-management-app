import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

const LEGS_OPTIONS = [1, 2, 3, 4, 5, 7, 9];
const PLAYOFF_LEGS_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const PLAYOFF_ROUNDS = [
  [32, 'management.top32'],
  [16, 'management.top16'],
  [8, 'management.quarterFinals'],
  [4, 'management.semiFinals'],
  [2, 'management.final'],
];
const START_ROUNDS = [
  [2, 'management.final', 'Final (2 players)'],
  [4, 'management.semiFinals', 'Semi-finals (4 players)'],
  [8, 'management.quarterFinals', 'Quarter-finals (8 players)'],
  [16, 'management.top16', 'Round of 16 (16 players)'],
  [32, 'management.top32', 'Round of 32 (32 players)'],
];
const ALL_PLAYERS_VALUE = 9999; // Special value to represent "all players"

const radioCard = 'flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-primary/30';
const radioRow = 'flex cursor-pointer items-center gap-2 text-sm font-normal';

// Same form as TournamentCreation, but editing the registration page's
// `tournamentSettings` object in place.
export function EditSettingsDialog({ open, onClose, settings, setSettings, playersCount, isSaving, onSave }) {
  const { t } = useLanguage();
  const isGroups = settings.tournamentType === 'groups_with_playoffs';
  const legsLabel = (n) => (n === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: n }));
  const criterionLabels = {
    matchesWon: t('registration.matchesWon'),
    legDifference: t('registration.legDifference'),
    average: t('registration.average'),
    headToHead: t('registration.headToHead')
  };

  const moveCriterion = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= settings.standingsCriteriaOrder.length) return;
    const newOrder = [...settings.standingsCriteriaOrder];
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setSettings({ ...settings, standingsCriteriaOrder: newOrder });
  };

  const setPlayoff = (patch) => setSettings({
    ...settings,
    playoffSettings: { ...settings.playoffSettings, ...patch }
  });
  const setGroup = (patch) => setSettings({
    ...settings,
    groupSettings: { ...settings.groupSettings, ...patch }
  });

  // Calculate max players per group based on group settings
  const maxPlayersPerGroup = settings.groupSettings.type === 'groups'
    ? Math.ceil(playersCount / settings.groupSettings.value)
    : settings.groupSettings.value;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('registration.editTournamentSettings')}</DialogTitle>
        </DialogHeader>

        <div className="-mx-6 flex max-h-[80vh] flex-col gap-6 overflow-y-auto px-6">
          <section className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold">{t('registration.tournamentType') || 'Tournament Type'}</h4>
            <RadioGroup
              value={settings.tournamentType}
              onValueChange={(value) => setSettings(prev => ({
                ...prev,
                tournamentType: value,
                playoffSettings: {
                  ...prev.playoffSettings,
                  // If switching back to groups, keep playoffs enabled toggle as-is;
                  // playoff-only tournaments must have playoffs enabled
                  enabled: value === 'playoff_only' ? true : (prev.playoffSettings.enabled ?? false)
                }
              }))}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Label htmlFor="edit-type-groups" className={radioCard}>
                <RadioGroupItem id="edit-type-groups" value="groups_with_playoffs" className="mt-0.5" />
                <span>{t('registration.tournamentTypeGroupsWithPlayoffs') || 'Group stage with optional playoffs'}</span>
              </Label>
              <Label htmlFor="edit-type-playoff" className={radioCard}>
                <RadioGroupItem id="edit-type-playoff" value="playoff_only" className="mt-0.5" />
                <span>{t('registration.tournamentTypePlayoffOnly') || 'Playoff only (no group stage)'}</span>
              </Label>
            </RadioGroup>
          </section>

          <Separator />

          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold">{t('registration.matchSettings')}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-legs-to-win">{t('registration.legsToWin')}</Label>
                <Select value={String(settings.legsToWin)} onValueChange={(v) => setSettings({ ...settings, legsToWin: parseInt(v) })}>
                  <SelectTrigger id="edit-legs-to-win" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGS_OPTIONS.map(n => (
                      <SelectItem key={n} value={String(n)}>{legsLabel(n)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-starting-score">{t('registration.startingScore')}</Label>
                <Select value={String(settings.startingScore)} onValueChange={(v) => setSettings({ ...settings, startingScore: parseInt(v) })}>
                  <SelectTrigger id="edit-starting-score" className="w-full tabular-nums">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[301, 501, 701].map(n => (
                      <SelectItem key={n} value={String(n)} className="tabular-nums">{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t('registration.scoringMode')}</Label>
              <RadioGroup
                value={settings.defaultScoringMode === 'turnTotal' ? 'turnTotal' : 'dart'}
                onValueChange={(v) => setSettings(prev => ({ ...prev, defaultScoringMode: v }))}
                className="gap-2"
              >
                <Label htmlFor="edit-scoring-dart" className={radioRow}>
                  <RadioGroupItem id="edit-scoring-dart" value="dart" />
                  {t('registration.scoringModeDart')}
                </Label>
                <Label htmlFor="edit-scoring-turnTotal" className={radioRow}>
                  <RadioGroupItem id="edit-scoring-turnTotal" value="turnTotal" />
                  {t('registration.scoringModeTurnTotal')}
                </Label>
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-auto-scorer" className="cursor-pointer font-normal">
                <Checkbox
                  id="edit-auto-scorer"
                  checked={settings.groupSettings?.autoScorerAssignment === true}
                  onCheckedChange={(checked) => setGroup({ autoScorerAssignment: checked === true })}
                />
                {t('registration.autoScorerAssignment')}
              </Label>
              <p className="pl-6 text-sm text-muted-foreground">{t('registration.autoScorerAssignmentHint')}</p>
            </div>
          </section>

          {isGroups && (
            <>
              <Separator />
              <section className="flex flex-col gap-3">
                <div>
                  <h4 className="text-sm font-semibold">{t('registration.standingsCriteriaOrder')}</h4>
                  <p className="text-sm text-muted-foreground">
                    {t('registration.standingsCriteriaOrderDescription') || 'Set the order of criteria for sorting in group standings.'}
                  </p>
                </div>
                <ol className="flex flex-col divide-y rounded-lg border">
                  {settings.standingsCriteriaOrder.map((criterion, index) => (
                    <li key={criterion} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-6 text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}.</span>
                      <span className="flex-1 text-sm">{criterionLabels[criterion] || criterion}</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveCriterion(index, -1)} title={t('registration.moveUp')} disabled={index === 0}>
                          <ChevronUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveCriterion(index, 1)} title={t('registration.moveDown')} disabled={index === settings.standingsCriteriaOrder.length - 1}>
                          <ChevronDown />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <Separator />
              <section className="flex flex-col gap-4">
                <h4 className="text-sm font-semibold">{t('registration.groupSettings')}</h4>
                <RadioGroup value={settings.groupSettings.type} onValueChange={(v) => setGroup({ type: v })} className="gap-2">
                  <Label htmlFor="edit-group-type-groups" className={radioRow}>
                    <RadioGroupItem id="edit-group-type-groups" value="groups" />
                    {t('registration.numberOfGroups')}
                  </Label>
                  <Label htmlFor="edit-group-type-ppg" className={radioRow}>
                    <RadioGroupItem id="edit-group-type-ppg" value="playersPerGroup" />
                    {t('registration.playersPerGroup')}
                  </Label>
                </RadioGroup>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-group-value">
                    {settings.groupSettings.type === 'groups' ? t('registration.numberOfGroups') : t('registration.playersPerGroup')}
                  </Label>
                  <Input
                    id="edit-group-value"
                    type="number"
                    min="1"
                    max={settings.groupSettings.type === 'groups' ? '16' : '8'}
                    className="w-32 tabular-nums"
                    value={settings.groupSettings.value}
                    onChange={(e) => setGroup({ value: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </section>
            </>
          )}

          <Separator />
          <section className="flex flex-col gap-5">
            <h4 className="text-sm font-semibold">{t('registration.playoffSettings')}</h4>
            {isGroups && (
              <Label htmlFor="edit-enable-playoffs" className="cursor-pointer gap-3">
                <Switch
                  id="edit-enable-playoffs"
                  checked={settings.playoffSettings.enabled}
                  onCheckedChange={(checked) => setPlayoff({ enabled: checked })}
                />
                {t('registration.enablePlayoffs')}
              </Label>
            )}

            {settings.playoffSettings.enabled && (
              <>
                {isGroups ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label>{t('registration.qualificationMode')}</Label>
                      <RadioGroup
                        value={settings.playoffSettings.qualificationMode}
                        onValueChange={(v) => setPlayoff({ qualificationMode: v })}
                        className="gap-2"
                      >
                        <Label htmlFor="edit-qual-perGroup" className={radioRow}>
                          <RadioGroupItem id="edit-qual-perGroup" value="perGroup" />
                          {t('registration.qualificationModePerGroup')}
                        </Label>
                        <Label htmlFor="edit-qual-total" className={radioRow}>
                          <RadioGroupItem id="edit-qual-total" value="totalPlayers" />
                          {t('registration.qualificationModeTotalPlayers')}
                        </Label>
                      </RadioGroup>
                    </div>

                    {settings.playoffSettings.qualificationMode === 'perGroup' ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="edit-players-per-group">{t('registration.playersAdvancingPerGroup')}</Label>
                        <Select
                          value={String(settings.playoffSettings.playersPerGroup)}
                          onValueChange={(v) => setPlayoff({ playersPerGroup: parseInt(v) })}
                        >
                          <SelectTrigger id="edit-players-per-group" className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: maxPlayersPerGroup }, (_, i) => i + 1).map(num => (
                              <SelectItem key={num} value={String(num)} className="tabular-nums">{num}</SelectItem>
                            ))}
                            <SelectItem value={String(ALL_PLAYERS_VALUE)}>{t('registration.all') || 'All'}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="edit-total-advance">{t('registration.totalPlayersToAdvance')}</Label>
                        <Input
                          id="edit-total-advance"
                          type="number"
                          min="1"
                          max="64"
                          className="w-32 tabular-nums"
                          value={settings.playoffSettings.totalPlayersToAdvance || 8}
                          onChange={(e) => setPlayoff({ totalPlayersToAdvance: parseInt(e.target.value) || 8 })}
                        />
                        <p className="text-sm text-muted-foreground">{t('registration.totalPlayersDescription')}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="edit-starting-round">{t('registration.playoffStartStage') || 'Playoff starts from'}</Label>
                    <Select
                      value={String(settings.playoffSettings.startingRoundPlayers || 8)}
                      onValueChange={(v) => setPlayoff({ startingRoundPlayers: parseInt(v) })}
                    >
                      <SelectTrigger id="edit-starting-round" className="w-full sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {START_ROUNDS.map(([value, labelKey, fallback]) => (
                          <SelectItem key={value} value={String(value)}>{t(labelKey) || fallback}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      {t('registration.playoffStartStageDescription') || 'This defines from which round the knockout bracket begins.'}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <Label>{t('registration.playoffLegsToWin')}</Label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {PLAYOFF_ROUNDS.map(([round, labelKey]) => (
                      <div key={round} className="flex flex-col gap-1.5">
                        <Label htmlFor={`edit-playoff-legs-${round}`} className="text-xs text-muted-foreground">{t(labelKey)}</Label>
                        <Select
                          value={String(settings.playoffSettings.legsToWinByRound?.[round] || 3)}
                          onValueChange={(v) => setPlayoff({
                            legsToWinByRound: { ...settings.playoffSettings.legsToWinByRound, [round]: parseInt(v) }
                          })}
                        >
                          <SelectTrigger id={`edit-playoff-legs-${round}`} size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLAYOFF_LEGS_OPTIONS.map(n => (
                              <SelectItem key={n} value={String(n)}>{legsLabel(n)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? t('common.loading') : t('registration.updateSettings')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
