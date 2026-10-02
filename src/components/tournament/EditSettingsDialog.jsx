import React from 'react';
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react';
import { BracketSeedingEditor } from '../BracketSeedingEditor';
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

const radioRow = 'flex cursor-pointer items-center gap-2 text-sm font-normal';

function Section({ title, description, children }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function EditSettingsDialog({ open, onClose, onSave, tournament, tournamentSettings, setTournamentSettings, hasTournamentStarted, t }) {
  const legsLabel = (n) => (n === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: n }));
  const criterionLabels = {
    matchesWon: t('registration.matchesWon'),
    legDifference: t('registration.legDifference'),
    average: t('registration.average'),
    headToHead: t('registration.headToHead')
  };
  const setPlayoff = (patch) => setTournamentSettings({
    ...tournamentSettings,
    playoffSettings: { ...tournamentSettings.playoffSettings, ...patch }
  });

  const renderLegsSelect = (id, value, onChange, options) => (
    <Select value={String(value)} onValueChange={(v) => onChange(parseInt(v))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(n => (
          <SelectItem key={n} value={String(n)}>{legsLabel(n)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderPlayoffOptions = () => {
    // Calculate max players per group from actual tournament groups
    const calculateMaxPlayersPerGroup = () => {
      if (tournament?.groups && tournament.groups.length > 0) {
        return Math.max(...tournament.groups.map(group =>
          group.players?.length || group.standings?.length || 0
        ));
      }
      // Fallback: calculate from group settings if groups not yet created
      if (tournamentSettings.groupSettings.type === 'groups') {
        const totalPlayers = tournament?.players?.length || 0;
        return totalPlayers > 0 ? Math.ceil(totalPlayers / tournamentSettings.groupSettings.value) : 4;
      } else {
        return tournamentSettings.groupSettings.value || 4;
      }
    };
    const maxPlayersPerGroup = calculateMaxPlayersPerGroup();
    const allPlayersValue = 9999; // Special value to represent "all players"

    const renderGroupMatchups = () => {
      const groups = tournament.groups || [];
      const matchups = tournamentSettings.playoffSettings.groupMatchups || [];

      // Initialize matchups if empty
      if (matchups.length === 0 && groups.length >= 2) {
        const defaultMatchups = [];
        for (let i = 0; i < Math.floor(groups.length / 2); i++) {
          const group1Index = i;
          const group2Index = groups.length - 1 - i;
          defaultMatchups.push({
            group1: groups[group1Index]?.name || `Group ${String.fromCharCode(65 + group1Index)}`,
            group2: groups[group2Index]?.name || `Group ${String.fromCharCode(65 + group2Index)}`
          });
        }
        setTimeout(() => {
          setPlayoff({ groupMatchups: defaultMatchups });
        }, 0);
        return null;
      }

      const availableGroups = groups.map(g => g.name);
      const renderGroupSelect = (value, onChange) => (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableGroups.map(groupName => (
              <SelectItem key={groupName} value={groupName}>{groupName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

      return matchups.map((matchup, index) => (
        <div key={index} className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
          {renderGroupSelect(matchup.group1, (value) => {
            const newMatchups = [...matchups];
            newMatchups[index].group1 = value;
            setPlayoff({ groupMatchups: newMatchups });
          })}
          <span className="text-sm font-semibold">{t('common.vs')}</span>
          {renderGroupSelect(matchup.group2, (value) => {
            const newMatchups = [...matchups];
            newMatchups[index].group2 = value;
            setPlayoff({ groupMatchups: newMatchups });
          })}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setPlayoff({ groupMatchups: matchups.filter((_, i) => i !== index) })}
            aria-label={t('common.close')}
          >
            <X />
          </Button>
        </div>
      ));
    };

    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{t('registration.qualificationMode')}</Label>
          <RadioGroup
            name="qualificationMode"
            value={tournamentSettings.playoffSettings.qualificationMode}
            onValueChange={(v) => setPlayoff({ qualificationMode: v })}
            className="gap-2"
          >
            <Label htmlFor="mgmt-qualification-perGroup" className={radioRow}>
              <RadioGroupItem id="mgmt-qualification-perGroup" value="perGroup" />
              {t('registration.qualificationModePerGroup')}
            </Label>
            <Label htmlFor="mgmt-qualification-totalPlayers" className={radioRow}>
              <RadioGroupItem id="mgmt-qualification-totalPlayers" value="totalPlayers" />
              {t('registration.qualificationModeTotalPlayers')}
            </Label>
          </RadioGroup>
        </div>

        {tournamentSettings.playoffSettings.qualificationMode === 'perGroup' ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="mgmt-players-per-group">{t('registration.playersAdvancingPerGroup')}</Label>
            <Select
              value={String(tournamentSettings.playoffSettings.playersPerGroup)}
              onValueChange={(v) => setPlayoff({ playersPerGroup: parseInt(v) })}
            >
              <SelectTrigger id="mgmt-players-per-group" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: maxPlayersPerGroup }, (_, i) => i + 1).map(num => (
                  <SelectItem key={num} value={String(num)} className="tabular-nums">{num}</SelectItem>
                ))}
                <SelectItem value={String(allPlayersValue)}>{t('registration.all')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="mgmt-total-players-advance">{t('registration.totalPlayersToAdvance')}</Label>
            <Input
              id="mgmt-total-players-advance"
              type="number"
              min="1"
              max="64"
              className="w-32 tabular-nums"
              value={tournamentSettings.playoffSettings.totalPlayersToAdvance || 8}
              onChange={(e) => setPlayoff({ totalPlayersToAdvance: parseInt(e.target.value) || 8 })}
            />
            <p className="text-sm text-muted-foreground">{t('registration.totalPlayersDescription')}</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>{t('registration.seedingMethod')}</Label>
          <RadioGroup
            name="seedingMethod"
            value={tournamentSettings.playoffSettings.seedingMethod}
            onValueChange={(v) => setPlayoff({ seedingMethod: v })}
            className="gap-2"
          >
            <Label htmlFor="mgmt-seeding-standard" className={radioRow}>
              <RadioGroupItem id="mgmt-seeding-standard" value="standard" />
              {t('registration.seedingMethodStandard')}
            </Label>
            <Label htmlFor="mgmt-seeding-groupBased" className={radioRow}>
              <RadioGroupItem id="mgmt-seeding-groupBased" value="groupBased" />
              {t('registration.seedingMethodGroupBased')}
            </Label>
          </RadioGroup>
        </div>

        {tournamentSettings.playoffSettings.seedingMethod === 'groupBased' && (
          <div className="flex flex-col gap-2">
            <Label>{t('registration.groupMatchups')}</Label>
            {tournament?.groups && tournament.groups.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">{t('registration.groupMatchupsDescription')}</p>
                <div className="flex flex-col gap-3">
                  {renderGroupMatchups()}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                      const groups = tournament.groups || [];
                      const availableGroups = groups.map(g => g.name);
                      if (availableGroups.length >= 2) {
                        setPlayoff({
                          groupMatchups: [
                            ...(tournamentSettings.playoffSettings.groupMatchups || []),
                            { group1: availableGroups[0], group2: availableGroups[1] }
                          ]
                        });
                      }
                    }}
                  >
                    <Plus />
                    {t('registration.addGroupMatchup')}
                  </Button>
                </div>
              </>
            ) : (
              <p className="rounded-lg border bg-muted/40 p-3 text-sm italic text-muted-foreground">{t('registration.groupMatchupsNote')}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>{t('registration.customSeedingLabel')}</Label>
          <p className="text-sm text-muted-foreground">{t('registration.customSeedingDescription')}</p>
          <BracketSeedingEditor
            playoffSettings={tournamentSettings.playoffSettings}
            groups={tournament?.groups || []}
            value={tournamentSettings.playoffSettings.customSeeding || null}
            onChange={(customSeeding) => setPlayoff({ customSeeding })}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Label>{t('registration.playoffLegsToWin')}</Label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PLAYOFF_ROUNDS.map(([round, labelKey]) => (
              <div key={round} className="flex flex-col gap-1.5">
                <Label htmlFor={`mgmt-playoff-legs-${round}`} className="text-xs text-muted-foreground">{t(labelKey)}</Label>
                {renderLegsSelect(
                  `mgmt-playoff-legs-${round}`,
                  tournamentSettings.playoffSettings.legsToWinByRound?.[round] || 3,
                  (n) => setPlayoff({
                    legsToWinByRound: { ...tournamentSettings.playoffSettings.legsToWinByRound, [round]: n }
                  }),
                  PLAYOFF_LEGS_OPTIONS
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('registration.editTournamentSettings')}</DialogTitle>
        </DialogHeader>

        <div className="-mx-6 flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-1">
          <Section title={t('registration.matchSettings')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="mgmt-legs-to-win">{t('registration.legsToWin')}</Label>
                {renderLegsSelect(
                  'mgmt-legs-to-win',
                  tournamentSettings.legsToWin,
                  (n) => setTournamentSettings({ ...tournamentSettings, legsToWin: n }),
                  LEGS_OPTIONS
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mgmt-starting-score">{t('tournaments.startingScore')}</Label>
                <Select
                  value={String(tournamentSettings.startingScore)}
                  onValueChange={(v) => setTournamentSettings({ ...tournamentSettings, startingScore: parseInt(v) })}
                >
                  <SelectTrigger id="mgmt-starting-score" className="w-full tabular-nums">
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
                name="scoringModeMgmt"
                value={tournamentSettings.defaultScoringMode === 'turnTotal' ? 'turnTotal' : 'dart'}
                onValueChange={(v) => setTournamentSettings(prev => ({ ...prev, defaultScoringMode: v }))}
                className="gap-2"
              >
                <Label htmlFor="mgmt-scoring-mode-dart" className={radioRow}>
                  <RadioGroupItem id="mgmt-scoring-mode-dart" value="dart" />
                  {t('registration.scoringModeDart')}
                </Label>
                <Label htmlFor="mgmt-scoring-mode-turnTotal" className={radioRow}>
                  <RadioGroupItem id="mgmt-scoring-mode-turnTotal" value="turnTotal" />
                  {t('registration.scoringModeTurnTotal')}
                </Label>
              </RadioGroup>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mgmt-auto-scorer-assignment" className="cursor-pointer font-normal">
                <Checkbox
                  id="mgmt-auto-scorer-assignment"
                  checked={tournamentSettings.groupSettings?.autoScorerAssignment === true}
                  onCheckedChange={(checked) => setTournamentSettings({
                    ...tournamentSettings,
                    groupSettings: {
                      ...tournamentSettings.groupSettings,
                      autoScorerAssignment: checked === true
                    }
                  })}
                />
                {t('registration.autoScorerAssignment')}
              </Label>
              <p className="pl-6 text-sm text-muted-foreground">{t('registration.autoScorerAssignmentHint')}</p>
            </div>
          </Section>

          <Separator />

          <Section title={t('registration.standingsCriteriaOrder')} description={t('registration.standingsCriteriaOrderDescription')}>
            <ol className="flex flex-col divide-y rounded-lg border">
              {tournamentSettings.standingsCriteriaOrder.map((criterion, index) => (
                <li key={criterion} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-6 text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}.</span>
                  <span className="flex-1 text-sm">{criterionLabels[criterion] || criterion}</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        if (index > 0) {
                          const newOrder = [...tournamentSettings.standingsCriteriaOrder];
                          [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                          setTournamentSettings({ ...tournamentSettings, standingsCriteriaOrder: newOrder });
                        }
                      }}
                      title={t('registration.moveUp')}
                      disabled={index === 0}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        if (index < tournamentSettings.standingsCriteriaOrder.length - 1) {
                          const newOrder = [...tournamentSettings.standingsCriteriaOrder];
                          [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                          setTournamentSettings({ ...tournamentSettings, standingsCriteriaOrder: newOrder });
                        }
                      }}
                      title={t('registration.moveDown')}
                      disabled={index === tournamentSettings.standingsCriteriaOrder.length - 1}
                    >
                      <ChevronDown />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Separator />

          <Section title={t('registration.groupSettings')} description={hasTournamentStarted ? t('registration.groupSettingsLocked') : undefined}>
            <RadioGroup
              name="groupType"
              value={tournamentSettings.groupSettings.type}
              disabled={hasTournamentStarted}
              onValueChange={(v) => setTournamentSettings({
                ...tournamentSettings,
                groupSettings: { ...tournamentSettings.groupSettings, type: v }
              })}
              className="gap-2"
            >
              <Label htmlFor="mgmt-group-type-groups" className={radioRow}>
                <RadioGroupItem id="mgmt-group-type-groups" value="groups" />
                {t('registration.numberOfGroups')}
              </Label>
              <Label htmlFor="mgmt-group-type-playersPerGroup" className={radioRow}>
                <RadioGroupItem id="mgmt-group-type-playersPerGroup" value="playersPerGroup" />
                {t('registration.playersPerGroup')}
              </Label>
            </RadioGroup>
            <div className="flex flex-col gap-2">
              <Label htmlFor="mgmt-group-value">
                {tournamentSettings.groupSettings.type === 'groups' ? t('registration.numberOfGroupsLabel') : t('registration.playersPerGroupLabel')}
              </Label>
              <Input
                id="mgmt-group-value"
                type="number"
                min="1"
                max={tournamentSettings.groupSettings.type === 'groups' ? '16' : '8'}
                className="w-32 tabular-nums"
                value={tournamentSettings.groupSettings.value}
                disabled={hasTournamentStarted}
                onChange={(e) => setTournamentSettings({
                  ...tournamentSettings,
                  groupSettings: { ...tournamentSettings.groupSettings, value: parseInt(e.target.value) || 1 }
                })}
              />
            </div>
          </Section>

          <Separator />

          <Section title={t('registration.playoffSettings')}>
            <Label htmlFor="mgmt-enable-playoffs" className="cursor-pointer gap-3">
              <Switch
                id="mgmt-enable-playoffs"
                checked={tournamentSettings.playoffSettings.enabled}
                onCheckedChange={(checked) => setPlayoff({ enabled: checked })}
              />
              {t('registration.enablePlayoffs')}
            </Label>
            {tournamentSettings.playoffSettings.enabled && renderPlayoffOptions()}
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('registration.cancel')}</Button>
          <Button onClick={onSave}>{t('registration.updateSettings')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
