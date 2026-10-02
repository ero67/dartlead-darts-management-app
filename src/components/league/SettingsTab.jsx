import React from 'react';
import { Plus, X, Save, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { LeagueManagersPanel } from '../LeagueManagersPanel';
import { ScorersPanel } from '../ScorersPanel';
import { SeedingPresetLibrary } from '../SeedingPresetLibrary';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

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

const radioCard = 'flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-primary/30';
const radioRow = 'flex cursor-pointer items-center gap-2 text-sm font-normal';

export function SettingsTab({
  league, canEditManagers,
  scoringRules, onScoringRuleChange, isFallbackRule, onRemovePlacement,
  roundPointsRules, setRoundPointsRules,
  newPlacement, setNewPlacement, onAddPlacement,
  isSavingScoring, onSaveScoringRules,
  tournamentDefaults, setTournamentDefaults, isSavingDefaults, onSaveDefaults, onResetDefaults,
}) {
  const { t } = useLanguage();

  const getPlacementLabel = (position) => {
    if (position === 'playoffDefault') return t('leagues.playoffParticipant') || '🏟️ Other Playoff Participants';
    if (position === 'default') return t('leagues.nonPlayoffParticipant') || '👥 Non-Playoff Participants';
    if (position === 1) return `${t('leagues.1stPlace')} 🥇`;
    if (position === 2) return `${t('leagues.2ndPlace')} 🥈`;
    if (position === 3) return `${t('leagues.3rdPlace')} 🥉`;
    return `${position}. ${t('leagues.position').replace(':', '')}`;
  };

  const roundLabel = (round) => round === 32
    ? (t('leagues.roundOf32') || 'Round of 32')
    : round === 16
      ? (t('leagues.roundOf16') || 'Round of 16')
      : (t('leagues.quarterfinals') || 'Quarterfinals');

  const legsLabel = (n) => (n === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: n }));
  const isGroups = tournamentDefaults.tournamentType === 'groups_with_playoffs';
  const playoff = tournamentDefaults.playoffSettings;
  const setPlayoff = (patch) => setTournamentDefaults({ ...tournamentDefaults, playoffSettings: { ...playoff, ...patch } });
  const setGroup = (patch) => setTournamentDefaults({ ...tournamentDefaults, groupSettings: { ...tournamentDefaults.groupSettings, ...patch } });
  const criterionLabels = {
    matchesWon: t('registration.matchesWon'),
    legDifference: t('registration.legDifference'),
    average: t('registration.average'),
    headToHead: t('registration.headToHead')
  };
  const moveCriterion = (index, delta) => {
    const order = tournamentDefaults.standingsCriteriaOrder;
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const newOrder = [...order];
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setTournamentDefaults({ ...tournamentDefaults, standingsCriteriaOrder: newOrder });
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold tracking-tight">{t('leagues.leagueSettings')}</h2>

      <LeagueManagersPanel leagueId={league.id} canEdit={canEditManagers} />

      <ScorersPanel type="league" entityId={league.id} />

      {/* Scoring Rules Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{t('leagues.scoringRules')}</CardTitle>
          <CardDescription>{t('leagues.scoringRulesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scoringRules.map((rule, index) => (
              <div key={rule.position} className="flex flex-col gap-2">
                <Label htmlFor={`placement-${rule.position}`} className={cn(rule.position <= 3 && 'font-semibold')}>
                  {getPlacementLabel(rule.position)}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`placement-${rule.position}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    className="tabular-nums"
                    value={rule.points}
                    onChange={(e) => onScoringRuleChange(index, 'points', e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground">{t('common.pts')}</span>
                  {!isFallbackRule(rule) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemovePlacement(index)}
                      title={t('leagues.removePlacement')}
                      aria-label={t('leagues.removePlacement')}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Points by Playoff Round */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <div>
              <h4 className="text-sm font-semibold">{t('leagues.roundPointsTitle') || 'Points by Playoff Round'}</h4>
              <p className="text-sm text-muted-foreground">{t('leagues.roundPointsDescription') || 'Set points for reaching each playoff round'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {roundPointsRules.map((rule, index) => (
                <div key={rule.round} className={cn('flex flex-col gap-2 rounded-lg border p-3', rule.enabled ? 'bg-card' : 'border-transparent opacity-60')}>
                  <Label htmlFor={`round-enabled-${rule.round}`} className={cn('cursor-pointer', rule.enabled ? 'font-medium' : 'font-normal')}>
                    <Checkbox
                      id={`round-enabled-${rule.round}`}
                      checked={rule.enabled}
                      onCheckedChange={(checked) => {
                        const updated = [...roundPointsRules];
                        updated[index] = { ...updated[index], enabled: checked === true };
                        setRoundPointsRules(updated);
                      }}
                    />
                    {roundLabel(rule.round)}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      className="tabular-nums"
                      value={rule.points}
                      disabled={!rule.enabled}
                      onChange={(e) => {
                        const updated = [...roundPointsRules];
                        updated[index] = { ...updated[index], points: parseInt(e.target.value) || 0 };
                        setRoundPointsRules(updated);
                      }}
                    />
                    <span className="text-sm text-muted-foreground">{t('common.pts')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add New Placement */}
          <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
            <p className="text-sm text-muted-foreground">{t('leagues.addNewPlacement')}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-placement-position" className="text-muted-foreground">{t('leagues.position')}</Label>
                <Input
                  id="new-placement-position"
                  type="text"
                  placeholder="e.g. 6"
                  className="w-24 text-center"
                  value={newPlacement.position}
                  onChange={(e) => setNewPlacement({ ...newPlacement, position: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-placement-points" className="text-muted-foreground">{t('leagues.points')}:</Label>
                <Input
                  id="new-placement-points"
                  type="number"
                  min="0"
                  placeholder="e.g. 2"
                  className="w-24 text-center tabular-nums"
                  value={newPlacement.points}
                  onChange={(e) => setNewPlacement({ ...newPlacement, points: e.target.value })}
                />
              </div>
              <Button variant="outline" onClick={onAddPlacement}>
                <Plus />
                {t('common.add')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('leagues.defaultPlacementTip')}</p>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={onSaveScoringRules} disabled={isSavingScoring}>
            <Save />
            {isSavingScoring ? t('common.saving') : t('leagues.saveChanges')}
          </Button>
        </CardFooter>
      </Card>

      {/* Default Tournament Settings Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{t('leagues.defaultTournamentSettings')}</CardTitle>
          <CardDescription>{t('leagues.defaultTournamentSettingsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Tournament Type */}
          <div className="flex flex-col gap-2">
            <Label>{t('leagues.defaultTournamentType')}</Label>
            <RadioGroup
              value={tournamentDefaults.tournamentType}
              onValueChange={(v) => setTournamentDefaults({ ...tournamentDefaults, tournamentType: v })}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Label htmlFor="default-type-groups_with_playoffs" className={radioCard}>
                <RadioGroupItem id="default-type-groups_with_playoffs" value="groups_with_playoffs" className="mt-0.5" />
                <span>{t('registration.tournamentTypeGroupsWithPlayoffs') || 'Group stage with optional playoffs'}</span>
              </Label>
              <Label htmlFor="default-type-playoff_only" className={radioCard}>
                <RadioGroupItem id="default-type-playoff_only" value="playoff_only" className="mt-0.5" />
                <span>{t('registration.tournamentTypePlayoffOnly') || 'Playoff only (no group stage)'}</span>
              </Label>
            </RadioGroup>
          </div>

          {/* Match Settings */}
          <div className="flex flex-col gap-4">
            <Label>{t('registration.matchSettings')}</Label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="default-legs-to-win" className="text-muted-foreground">{t('leagues.defaultLegsToWin')}</Label>
                <Select value={String(tournamentDefaults.legsToWin)} onValueChange={(v) => setTournamentDefaults({ ...tournamentDefaults, legsToWin: parseInt(v) })}>
                  <SelectTrigger id="default-legs-to-win" className="w-full">
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
                <Label htmlFor="default-starting-score" className="text-muted-foreground">{t('leagues.defaultStartingScore')}</Label>
                <Select value={String(tournamentDefaults.startingScore)} onValueChange={(v) => setTournamentDefaults({ ...tournamentDefaults, startingScore: parseInt(v) })}>
                  <SelectTrigger id="default-starting-score" className="w-full tabular-nums">
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
              <Label className="text-muted-foreground">{t('registration.scoringMode')}</Label>
              <RadioGroup
                value={tournamentDefaults.defaultScoringMode === 'turnTotal' ? 'turnTotal' : 'dart'}
                onValueChange={(v) => setTournamentDefaults(prev => ({ ...prev, defaultScoringMode: v }))}
                className="gap-2"
              >
                <Label htmlFor="default-scoring-dart" className={radioRow}>
                  <RadioGroupItem id="default-scoring-dart" value="dart" />
                  {t('registration.scoringModeDart')}
                </Label>
                <Label htmlFor="default-scoring-turnTotal" className={radioRow}>
                  <RadioGroupItem id="default-scoring-turnTotal" value="turnTotal" />
                  {t('registration.scoringModeTurnTotal')}
                </Label>
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="default-auto-scorer" className="cursor-pointer font-normal">
                <Checkbox
                  id="default-auto-scorer"
                  checked={tournamentDefaults.groupSettings?.autoScorerAssignment === true}
                  onCheckedChange={(checked) => setGroup({ autoScorerAssignment: checked === true })}
                />
                {t('registration.autoScorerAssignment')}
              </Label>
              <p className="pl-6 text-sm text-muted-foreground">{t('registration.autoScorerAssignmentHint')}</p>
            </div>
          </div>

          {/* Group Settings - only for groups_with_playoffs */}
          {isGroups && (
            <>
              <div className="flex flex-col gap-3">
                <Label>{t('leagues.defaultGroupSettings')}</Label>
                <RadioGroup
                  value={tournamentDefaults.groupSettings.type}
                  onValueChange={(v) => setGroup({ type: v })}
                  className="gap-2"
                >
                  <Label htmlFor="default-group-type-groups" className={radioRow}>
                    <RadioGroupItem id="default-group-type-groups" value="groups" />
                    {t('registration.numberOfGroups')}
                  </Label>
                  <Label htmlFor="default-group-type-playersPerGroup" className={radioRow}>
                    <RadioGroupItem id="default-group-type-playersPerGroup" value="playersPerGroup" />
                    {t('registration.playersPerGroup')}
                  </Label>
                </RadioGroup>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="default-group-value" className="text-muted-foreground">
                    {tournamentDefaults.groupSettings.type === 'groups' ? t('registration.numberOfGroupsLabel') : t('registration.playersPerGroupLabel')}
                  </Label>
                  <Input
                    id="default-group-value"
                    type="number"
                    min="1"
                    max={tournamentDefaults.groupSettings.type === 'groups' ? '16' : '8'}
                    className="w-32 tabular-nums"
                    value={tournamentDefaults.groupSettings.value}
                    onChange={(e) => setGroup({ value: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              {/* Standings Criteria Order */}
              <div className="flex flex-col gap-2">
                <Label>{t('leagues.defaultStandingsCriteria')}</Label>
                <p className="text-sm text-muted-foreground">
                  {t('registration.standingsCriteriaOrderDescription') || 'Set the order of criteria for sorting in group standings.'}
                </p>
                <ol className="flex flex-col divide-y rounded-lg border">
                  {tournamentDefaults.standingsCriteriaOrder.map((criterion, index) => (
                    <li key={criterion} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-6 text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}.</span>
                      <span className="flex-1 text-sm">{criterionLabels[criterion] || criterion}</span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => moveCriterion(index, -1)} disabled={index === 0}>
                          <ChevronUp />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => moveCriterion(index, 1)}
                          disabled={index === tournamentDefaults.standingsCriteriaOrder.length - 1}
                        >
                          <ChevronDown />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {/* Playoff Settings */}
          <div className="flex flex-col gap-4">
            <Label>{t('leagues.defaultPlayoffSettings')}</Label>

            {isGroups && (
              <Label htmlFor="default-enable-playoffs" className="cursor-pointer gap-3 font-normal">
                <Switch
                  id="default-enable-playoffs"
                  checked={playoff.enabled}
                  onCheckedChange={(checked) => setPlayoff({ enabled: checked })}
                />
                {t('registration.enablePlayoffs')}
              </Label>
            )}

            {playoff.enabled && (
              <>
                {isGroups ? (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label className="text-muted-foreground">{t('leagues.defaultQualificationMode')}</Label>
                      <RadioGroup
                        value={playoff.qualificationMode}
                        onValueChange={(v) => setPlayoff({ qualificationMode: v })}
                        className="gap-2"
                      >
                        <Label htmlFor="default-qualification-perGroup" className={radioRow}>
                          <RadioGroupItem id="default-qualification-perGroup" value="perGroup" />
                          {t('registration.qualificationModePerGroup')}
                        </Label>
                        <Label htmlFor="default-qualification-totalPlayers" className={radioRow}>
                          <RadioGroupItem id="default-qualification-totalPlayers" value="totalPlayers" />
                          {t('registration.qualificationModeTotalPlayers')}
                        </Label>
                      </RadioGroup>
                    </div>

                    {playoff.qualificationMode === 'perGroup' ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="default-players-per-group" className="text-muted-foreground">{t('leagues.defaultPlayersPerGroup')}</Label>
                        <Select value={String(playoff.playersPerGroup)} onValueChange={(v) => setPlayoff({ playersPerGroup: parseInt(v) })}>
                          <SelectTrigger id="default-players-per-group" className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 8 }, (_, i) => i + 1).map(num => (
                              <SelectItem key={num} value={String(num)} className="tabular-nums">{num}</SelectItem>
                            ))}
                            <SelectItem value="9999">{t('registration.all')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="default-total-players-advance" className="text-muted-foreground">{t('leagues.defaultTotalPlayersToAdvance')}</Label>
                        <Input
                          id="default-total-players-advance"
                          type="number"
                          min="1"
                          max="64"
                          className="w-32 tabular-nums"
                          value={playoff.totalPlayersToAdvance || 8}
                          onChange={(e) => setPlayoff({ totalPlayersToAdvance: parseInt(e.target.value) || 8 })}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="default-starting-round" className="text-muted-foreground">{t('leagues.defaultStartingRoundPlayers')}</Label>
                    <Select value={String(playoff.startingRoundPlayers)} onValueChange={(v) => setPlayoff({ startingRoundPlayers: parseInt(v) })}>
                      <SelectTrigger id="default-starting-round" className="w-full sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {START_ROUNDS.map(([value, labelKey, fallback]) => (
                          <SelectItem key={value} value={String(value)}>{t(labelKey) || fallback}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 3rd Place Match */}
                <div className="flex flex-col gap-2">
                  <Label className="text-muted-foreground">{t('leagues.defaultThirdPlaceMatch')}</Label>
                  <RadioGroup
                    value={playoff.thirdPlaceMatch === true ? 'true' : playoff.thirdPlaceMatch === false ? 'false' : ''}
                    onValueChange={(v) => setPlayoff({ thirdPlaceMatch: v === 'true' })}
                    className="gap-2"
                  >
                    <Label htmlFor="default-third-place-yes" className={radioRow}>
                      <RadioGroupItem id="default-third-place-yes" value="true" />
                      {t('registration.thirdPlaceMatchYes') || 'Yes - Semifinal losers play for 3rd/4th place'}
                    </Label>
                    <Label htmlFor="default-third-place-no" className={radioRow}>
                      <RadioGroupItem id="default-third-place-no" value="false" />
                      {t('registration.thirdPlaceMatchNo') || 'No - Both semifinal losers share 3rd place'}
                    </Label>
                  </RadioGroup>
                </div>

                {/* Prepared seeding configs (library) */}
                <div className="flex flex-col gap-2">
                  <Label>{t('registration.presetLibraryLabel')}</Label>
                  <p className="text-sm text-muted-foreground">{t('registration.presetLibraryDescription')}</p>
                  <SeedingPresetLibrary
                    presets={playoff.seedingPresets || {}}
                    onChange={(seedingPresets) => setPlayoff({ seedingPresets })}
                  />
                </div>

                {/* Playoff Legs by Round */}
                <div className="flex flex-col gap-3">
                  <Label>{t('leagues.defaultPlayoffLegs')}:</Label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {PLAYOFF_ROUNDS.map(([round, labelKey]) => (
                      <div key={round} className="flex flex-col gap-1.5">
                        <Label htmlFor={`default-playoff-legs-${round}`} className="text-xs text-muted-foreground">{t(labelKey)}:</Label>
                        <Select
                          value={String(playoff.legsToWinByRound?.[round] || 3)}
                          onValueChange={(v) => setPlayoff({ legsToWinByRound: { ...playoff.legsToWinByRound, [round]: parseInt(v) } })}
                        >
                          <SelectTrigger id={`default-playoff-legs-${round}`} size="sm" className="w-full">
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
          </div>
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onResetDefaults}>
            <RotateCcw />
            {t('leagues.resetDefaults')}
          </Button>
          <Button onClick={onSaveDefaults} disabled={isSavingDefaults}>
            <Save />
            {isSavingDefaults ? t('common.saving') : t('leagues.saveChanges')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
