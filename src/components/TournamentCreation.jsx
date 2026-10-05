import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, ArrowLeft, ChevronUp, ChevronDown, Check, Plus, Users, ClipboardList, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useLeague } from '../contexts/LeagueContext';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { UserSearchPicker } from './UserSearchPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const LEGS_OPTIONS = [1, 2, 3, 4, 5, 7, 9];
const PLAYOFF_LEGS_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const PLAYOFF_ROUNDS = [
  [32, 'management.top32'],
  [16, 'management.top16'],
  [8, 'management.quarterFinals'],
  [4, 'management.semiFinals'],
  [2, 'management.final'],
];
const TOURNAMENT_TYPES = [
  ['groups_with_playoffs', 'registration.tournamentTypeGroupsWithPlayoffs', 'Group stage with optional playoffs'],
  ['playoff_only', 'registration.tournamentTypePlayoffOnly', 'Playoff only (no group stage)'],
];
const START_ROUNDS = [
  [2, 'management.final', 'Final (2 players)'],
  [4, 'management.semiFinals', 'Semi-finals (4 players)'],
  [8, 'management.quarterFinals', 'Quarter-finals (8 players)'],
  [16, 'management.top16', 'Round of 16 (16 players)'],
  [32, 'management.top32', 'Round of 32 (32 players)'],
];

// Generate unique ID for tournaments
const generateId = () => {
  return crypto.randomUUID();
};

export function TournamentCreation({ onTournamentCreated, onBack }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { currentLeague, selectLeague } = useLeague();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const leagueId = searchParams.get('leagueId');
  
  // Seed from league defaults only when creating FOR that league — currentLeague
  // otherwise still holds whatever league was viewed last.
  const leagueDefaults = (leagueId && currentLeague?.id === leagueId)
    ? (currentLeague.defaultTournamentSettings || {})
    : {};
  
  const [tournamentName, setTournamentName] = useState('');
  const [legsToWin, setLegsToWin] = useState(leagueDefaults.legsToWin || 3);
  const [startingScore, setStartingScore] = useState(leagueDefaults.startingScore || 501);
  const [tournamentType, setTournamentType] = useState(leagueDefaults.tournamentType || 'groups_with_playoffs');
  const [groupSettings, setGroupSettings] = useState(leagueDefaults.groupSettings || {
    type: 'groups',
    value: 2
  });
  const [standingsCriteriaOrder, setStandingsCriteriaOrder] = useState(
    leagueDefaults.standingsCriteriaOrder || [
      'matchesWon',
      'legDifference',
      'average',
      'headToHead'
    ]
  );
  const [playoffSettings, setPlayoffSettings] = useState(leagueDefaults.playoffSettings || {
    enabled: true,
    qualificationMode: 'perGroup',
    playersPerGroup: 1,
    totalPlayersToAdvance: 8,
    startingRoundPlayers: 8,
    seedingMethod: 'groupBased',
    groupMatchups: [],
    thirdPlaceMatch: true, // Whether to play a 3rd place match or both semifinal losers share 3rd
    legsToWinByRound: {
      32: 3,
      16: 3,
      8: 3,
      4: 3,
      2: 3
    }
  });
  const [defaultScoringMode, setDefaultScoringMode] = useState(leagueDefaults.defaultScoringMode || 'dart');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  // Registered users who may count matches on their own devices. Saved right
  // after the tournament row is created (tournamentService.createTournament);
  // the manager never needs to be listed — they can always count.
  const [scorers, setScorers] = useState([]);

  const handleAddScorer = (picked) => {
    if (!picked?.email) return;
    setScorers(prev => (prev.some(s => s.id === picked.id) ? prev : [...prev, picked]));
  };

  const handleRemoveScorer = (userId) => {
    setScorers(prev => prev.filter(s => s.id !== userId));
  };

  // Load league if leagueId is provided
  useEffect(() => {
    if (leagueId && (!currentLeague || currentLeague.id !== leagueId)) {
      selectLeague(leagueId);
    }
  }, [leagueId, currentLeague, selectLeague]);

  // Apply league defaults when league is loaded asynchronously
  useEffect(() => {
    if (currentLeague && leagueId && currentLeague.id === leagueId) {
      const defaults = currentLeague.defaultTournamentSettings;
      if (defaults) {
        if (defaults.legsToWin !== undefined) setLegsToWin(defaults.legsToWin);
        if (defaults.startingScore !== undefined) setStartingScore(defaults.startingScore);
        if (defaults.tournamentType !== undefined) setTournamentType(defaults.tournamentType);
        if (defaults.groupSettings) setGroupSettings(prev => ({ ...prev, ...defaults.groupSettings }));
        if (defaults.standingsCriteriaOrder) setStandingsCriteriaOrder(defaults.standingsCriteriaOrder);
        if (defaults.defaultScoringMode) setDefaultScoringMode(defaults.defaultScoringMode);
        if (defaults.playoffSettings) setPlayoffSettings(prev => ({
          ...prev,
          ...defaults.playoffSettings,
          legsToWinByRound: {
            ...prev.legsToWinByRound,
            ...(defaults.playoffSettings.legsToWinByRound || {})
          }
        }));
      }
      // Players are NOT auto-selected — the manager picks who is coming
      // from the league pool below.
    }
  }, [currentLeague, leagueId]);

  // Active league members, alphabetical — the pool to pick attendees from.
  const leaguePlayerPool = useMemo(() => {
    if (!leagueId || !currentLeague || currentLeague.id !== leagueId) return [];
    return (currentLeague.members || [])
      .filter(m => m.isActive && m.player)
      .map(m => m.player)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [currentLeague, leagueId]);

  const [playerFilter, setPlayerFilter] = useState('');

  const visiblePoolPlayers = useMemo(() => {
    const query = playerFilter.trim().toLowerCase();
    if (!query) return leaguePlayerPool;
    return leaguePlayerPool.filter(p => p.name.toLowerCase().includes(query));
  }, [leaguePlayerPool, playerFilter]);

  const selectedPlayerIds = useMemo(
    () => new Set(selectedPlayers.map(p => p.id)),
    [selectedPlayers]
  );

  const togglePlayerSelection = (player) => {
    setSelectedPlayers(prev => (
      prev.some(p => p.id === player.id)
        ? prev.filter(p => p.id !== player.id)
        : [...prev, player]
    ));
  };

  const createTournament = () => {
    if (!tournamentName.trim()) {
      toast.error(t('tournaments.pleaseEnterName'));
      return;
    }

    const tournament = {
      id: generateId(),
      name: tournamentName.trim(),
      players: selectedPlayers.length > 0 ? selectedPlayers : [], // Pre-populate with league members if available
      groups: [], // Groups will be generated when tournament starts
      legsToWin: legsToWin,
      startingScore: startingScore,
      groupSettings: groupSettings,
      playoffSettings: playoffSettings,
      tournamentType,
      defaultScoringMode,
      standingsCriteriaOrder: standingsCriteriaOrder,
      playoffs: null, // Playoffs will be created only when user clicks "Start Playoffs"
      leagueId: leagueId || null, // Link to league if created from league
      scorers: scorers.map(s => ({ id: s.id, email: s.email })),
      createdAt: new Date().toISOString(),
      status: 'open_for_registration' // Tournament is open for player registration
    };

    onTournamentCreated(tournament);
  };

  const legsLabel = (n) => (n === 1 ? t('tournaments.firstToLeg', { count: 1 }) : t('tournaments.firstToLegs', { count: n }));
  const typeLabel = (value) => {
    const entry = TOURNAMENT_TYPES.find(([v]) => v === value);
    return entry ? (t(entry[1]) || entry[2]) : value;
  };
  const yesNo = (v) => (v ? t('common.yes') : t('common.no'));
  const isGroups = tournamentType === 'groups_with_playoffs';
  const criterionLabels = {
    matchesWon: t('registration.matchesWon'),
    legDifference: t('registration.legDifference'),
    average: t('registration.average'),
    headToHead: t('registration.headToHead')
  };

  const moveCriterion = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= standingsCriteriaOrder.length) return;
    const newOrder = [...standingsCriteriaOrder];
    [newOrder[index], newOrder[target]] = [newOrder[target], newOrder[index]];
    setStandingsCriteriaOrder(newOrder);
  };

  const summaryRows = [
    [t('registration.tournamentType') || 'Tournament Type', typeLabel(tournamentType)],
    [t('tournaments.defaultLegsToWin'), legsLabel(legsToWin)],
    [t('tournaments.startingScore'), startingScore],
    ...(isGroups ? [[
      groupSettings.type === 'groups' ? t('registration.numberOfGroups') : t('registration.playersPerGroup'),
      groupSettings.value,
    ]] : []),
    ...(isGroups ? [[t('registration.enablePlayoffs'), yesNo(playoffSettings.enabled)]] : []),
    ...(playoffSettings.enabled && isGroups && playoffSettings.qualificationMode === 'perGroup'
      ? [[t('registration.playersAdvancingPerGroup'), playoffSettings.playersPerGroup === 9999 ? t('registration.all') : playoffSettings.playersPerGroup]]
      : []),
    ...(playoffSettings.enabled && isGroups && playoffSettings.qualificationMode === 'totalPlayers'
      ? [[t('registration.totalPlayersToAdvance'), playoffSettings.totalPlayersToAdvance || 8]]
      : []),
    ...(playoffSettings.enabled && !isGroups
      ? [[t('registration.playoffStartStage') || 'Playoff starts from', (() => { const r = START_ROUNDS.find(([v]) => v === playoffSettings.startingRoundPlayers); return r ? (t(r[1]) || r[2]) : playoffSettings.startingRoundPlayers; })()]]
      : []),
    ...(playoffSettings.enabled ? [[t('registration.thirdPlaceMatch') || '3rd Place Match', yesNo(playoffSettings.thirdPlaceMatch === true)]] : []),
  ];

  const radioCard = 'flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-muted/50 has-data-[state=checked]:border-primary has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-primary/30';
  const radioRow = 'flex cursor-pointer items-center gap-2 text-sm font-normal';

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          {t('common.backToDashboard')}
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Trophy className="size-6 text-primary" />
          {t('tournaments.createNew')}
        </h1>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:max-w-[760px]">
          <Card>
            <CardHeader>
              <CardTitle>{t('registration.tournamentType') || 'Tournament Type'}</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={tournamentType} onValueChange={setTournamentType} className="grid gap-3 sm:grid-cols-2">
                {TOURNAMENT_TYPES.map(([value, labelKey, fallback]) => (
                  <Label key={value} htmlFor={`tournament-type-${value}`} className={radioCard}>
                    <RadioGroupItem id={`tournament-type-${value}`} value={value} className="mt-0.5" />
                    <span>{t(labelKey) || fallback}</span>
                  </Label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('tournaments.tournamentName')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Label htmlFor="tournament-name">{t('tournaments.tournamentName')}</Label>
              <Input
                id="tournament-name"
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder={t('tournaments.enterTournamentName')}
                maxLength={50}
              />
            </CardContent>
          </Card>

          {leaguePlayerPool.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4" />
                  {t('tournaments.leaguePlayersTitle')}
                </CardTitle>
                <CardDescription>{t('tournaments.leaguePlayersHint')}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm text-muted-foreground tabular-nums">
                    {t('tournaments.selectedCount', { selected: selectedPlayers.length, total: leaguePlayerPool.length })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlayers([...leaguePlayerPool])}
                    disabled={selectedPlayers.length === leaguePlayerPool.length}
                  >
                    {t('tournaments.selectAllPlayers')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPlayers([])}
                    disabled={selectedPlayers.length === 0}
                  >
                    {t('tournaments.clearSelection')}
                  </Button>
                </div>
                {leaguePlayerPool.length > 12 && (
                  <Input
                    type="text"
                    placeholder={t('tournaments.filterPlayers')}
                    value={playerFilter}
                    onChange={(e) => setPlayerFilter(e.target.value)}
                  />
                )}
                <div className="flex flex-wrap gap-2">
                  {visiblePoolPlayers.map(player => {
                    const isSelected = selectedPlayerIds.has(player.id);
                    return (
                      <Button
                        key={player.id}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        className="h-9 rounded-full"
                        aria-pressed={isSelected}
                        onClick={() => togglePlayerSelection(player)}
                      >
                        {isSelected ? <Check /> : <Plus />}
                        {player.name}
                      </Button>
                    );
                  })}
                  {visiblePoolPlayers.length === 0 && (
                    <span className="text-sm text-muted-foreground">{t('tournaments.noPlayersMatchFilter')}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="size-4" />
                {t('tournaments.scorersTitle')}
              </CardTitle>
              <CardDescription>{t('tournaments.scorersHint')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <UserSearchPicker
                onSelect={handleAddScorer}
                excludeIds={[...scorers.map(s => s.id), ...(user?.id ? [user.id] : [])]}
              />
              {scorers.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {scorers.map(scorer => (
                    <li key={scorer.id}>
                      <Badge variant="secondary" className="gap-1 py-1 pr-1 pl-2.5 text-sm font-normal">
                        <span className="truncate">
                          {scorer.fullName && scorer.fullName !== scorer.email
                            ? `${scorer.fullName} (${scorer.email})`
                            : scorer.email}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="rounded-full"
                          onClick={() => handleRemoveScorer(scorer.id)}
                          aria-label={t('scorers.remove')}
                          title={t('scorers.remove')}
                        >
                          <X />
                        </Button>
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('tournaments.scorersEmpty')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('registration.matchSettings')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="legs-to-win">{t('tournaments.defaultLegsToWin')}</Label>
                  <Select value={String(legsToWin)} onValueChange={(v) => setLegsToWin(parseInt(v))}>
                    <SelectTrigger id="legs-to-win" className="w-full">
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
                  <Label htmlFor="starting-score">{t('tournaments.startingScore')}</Label>
                  <Select value={String(startingScore)} onValueChange={(v) => setStartingScore(parseInt(v))}>
                    <SelectTrigger id="starting-score" className="w-full tabular-nums">
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
                <RadioGroup value={defaultScoringMode} onValueChange={setDefaultScoringMode} className="gap-2">
                  <Label htmlFor="scoring-mode-dart" className={radioRow}>
                    <RadioGroupItem id="scoring-mode-dart" value="dart" />
                    {t('registration.scoringModeDart')}
                  </Label>
                  <Label htmlFor="scoring-mode-turnTotal" className={radioRow}>
                    <RadioGroupItem id="scoring-mode-turnTotal" value="turnTotal" />
                    {t('registration.scoringModeTurnTotal')}
                  </Label>
                </RadioGroup>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auto-scorer-assignment" className="cursor-pointer font-normal">
                  <Checkbox
                    id="auto-scorer-assignment"
                    checked={groupSettings.autoScorerAssignment === true}
                    onCheckedChange={(checked) => setGroupSettings({
                      ...groupSettings,
                      autoScorerAssignment: checked === true
                    })}
                  />
                  {t('registration.autoScorerAssignment')}
                </Label>
                <p className="pl-6 text-sm text-muted-foreground">{t('registration.autoScorerAssignmentHint')}</p>
              </div>
            </CardContent>
          </Card>

          {isGroups && (
            <Card>
              <CardHeader>
                <CardTitle>{t('registration.standingsCriteriaOrder')}</CardTitle>
                <CardDescription>
                  {t('registration.standingsCriteriaOrderDescription') || 'Set the order of criteria for sorting in group standings. Criteria will be used in this order when values are equal.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col divide-y rounded-lg border">
                  {standingsCriteriaOrder.map((criterion, index) => (
                    <li key={criterion} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-6 text-sm font-semibold text-muted-foreground tabular-nums">{index + 1}.</span>
                      <span className="flex-1 text-sm">{criterionLabels[criterion] || criterion}</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => moveCriterion(index, -1)}
                          title={t('registration.moveUp')}
                          disabled={index === 0}
                        >
                          <ChevronUp />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => moveCriterion(index, 1)}
                          title={t('registration.moveDown')}
                          disabled={index === standingsCriteriaOrder.length - 1}
                        >
                          <ChevronDown />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {isGroups && (
            <Card>
              <CardHeader>
                <CardTitle>{t('registration.groupSettings')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <RadioGroup
                  value={groupSettings.type}
                  onValueChange={(v) => setGroupSettings({ ...groupSettings, type: v })}
                  className="gap-2"
                >
                  <Label htmlFor="group-type-groups" className={radioRow}>
                    <RadioGroupItem id="group-type-groups" value="groups" />
                    {t('registration.numberOfGroups')}
                  </Label>
                  <Label htmlFor="group-type-playersPerGroup" className={radioRow}>
                    <RadioGroupItem id="group-type-playersPerGroup" value="playersPerGroup" />
                    {t('registration.playersPerGroup')}
                  </Label>
                </RadioGroup>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="group-value">
                    {groupSettings.type === 'groups' ? t('registration.numberOfGroupsLabel') : t('registration.playersPerGroupLabel')}
                  </Label>
                  <Input
                    id="group-value"
                    type="number"
                    min="1"
                    max={groupSettings.type === 'groups' ? '16' : '8'}
                    className="w-32 tabular-nums"
                    value={groupSettings.value}
                    onChange={(e) => setGroupSettings({
                      ...groupSettings,
                      value: parseInt(e.target.value) || 1
                    })}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('registration.playoffSettings')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {isGroups && (
                <Label htmlFor="enable-playoffs" className="cursor-pointer gap-3">
                  <Switch
                    id="enable-playoffs"
                    checked={playoffSettings.enabled}
                    onCheckedChange={(checked) => setPlayoffSettings({
                      ...playoffSettings,
                      enabled: checked
                    })}
                  />
                  {t('registration.enablePlayoffs')}
                </Label>
              )}

              {playoffSettings.enabled && (
                <>
                  {isGroups ? (
                    <>
                      <div className="flex flex-col gap-2">
                        <Label>{t('registration.qualificationMode')}</Label>
                        <RadioGroup
                          value={playoffSettings.qualificationMode}
                          onValueChange={(v) => setPlayoffSettings({ ...playoffSettings, qualificationMode: v })}
                          className="gap-2"
                        >
                          <Label htmlFor="qualification-perGroup" className={radioRow}>
                            <RadioGroupItem id="qualification-perGroup" value="perGroup" />
                            {t('registration.qualificationModePerGroup')}
                          </Label>
                          <Label htmlFor="qualification-totalPlayers" className={radioRow}>
                            <RadioGroupItem id="qualification-totalPlayers" value="totalPlayers" />
                            {t('registration.qualificationModeTotalPlayers')}
                          </Label>
                        </RadioGroup>
                      </div>

                      {playoffSettings.qualificationMode === 'perGroup' ? (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="players-per-group">{t('registration.playersAdvancingPerGroup')}</Label>
                          <Select
                            value={String(playoffSettings.playersPerGroup)}
                            onValueChange={(v) => setPlayoffSettings({ ...playoffSettings, playersPerGroup: parseInt(v) })}
                          >
                            <SelectTrigger id="players-per-group" className="w-40">
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
                          <Label htmlFor="total-players-advance">{t('registration.totalPlayersToAdvance')}</Label>
                          <Input
                            id="total-players-advance"
                            type="number"
                            min="1"
                            max="64"
                            className="w-32 tabular-nums"
                            value={playoffSettings.totalPlayersToAdvance || 8}
                            onChange={(e) => setPlayoffSettings({
                              ...playoffSettings,
                              totalPlayersToAdvance: parseInt(e.target.value) || 8
                            })}
                          />
                          <p className="text-sm text-muted-foreground">{t('registration.totalPlayersDescription')}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="starting-round">{t('registration.playoffStartStage') || 'Playoff starts from'}</Label>
                      <Select
                        value={String(playoffSettings.startingRoundPlayers)}
                        onValueChange={(v) => setPlayoffSettings({ ...playoffSettings, startingRoundPlayers: parseInt(v) })}
                      >
                        <SelectTrigger id="starting-round" className="w-full sm:w-72">
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

                  <div className="flex flex-col gap-2">
                    <Label>{t('registration.thirdPlaceMatch') || '3rd Place Match'}</Label>
                    <RadioGroup
                      value={String(playoffSettings.thirdPlaceMatch)}
                      onValueChange={(v) => setPlayoffSettings({ ...playoffSettings, thirdPlaceMatch: v === 'true' })}
                      className="gap-2"
                    >
                      <Label htmlFor="third-place-yes" className={radioRow}>
                        <RadioGroupItem id="third-place-yes" value="true" />
                        {t('registration.thirdPlaceMatchYes') || 'Yes - Semifinal losers play for 3rd/4th place'}
                      </Label>
                      <Label htmlFor="third-place-no" className={radioRow}>
                        <RadioGroupItem id="third-place-no" value="false" />
                        {t('registration.thirdPlaceMatchNo') || 'No - Both semifinal losers share 3rd place'}
                      </Label>
                    </RadioGroup>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Label>{t('registration.playoffLegsToWin')}</Label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {PLAYOFF_ROUNDS.map(([round, labelKey]) => (
                        <div key={round} className="flex flex-col gap-1.5">
                          <Label htmlFor={`playoff-legs-${round}`} className="text-xs text-muted-foreground">{t(labelKey)}</Label>
                          <Select
                            value={String(playoffSettings.legsToWinByRound?.[round] || 3)}
                            onValueChange={(v) => setPlayoffSettings({
                              ...playoffSettings,
                              legsToWinByRound: {
                                ...playoffSettings.legsToWinByRound,
                                [round]: parseInt(v)
                              }
                            })}
                          >
                            <SelectTrigger id={`playoff-legs-${round}`} size="sm" className="w-full">
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
            </CardContent>
          </Card>
        </div>

        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-80">
          <Card>
            <CardHeader>
              <CardTitle className="truncate">{tournamentName.trim() || t('tournaments.tournamentName')}</CardTitle>
              <CardDescription>{typeLabel(tournamentType)}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                {summaryRows.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className={cn('text-right font-medium', typeof value === 'number' && 'tabular-nums')}>{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-2">
              <Button
                size="lg"
                onClick={createTournament}
                disabled={!tournamentName.trim()}
              >
                <Trophy />
                {t('tournaments.create')}
              </Button>
              {!tournamentName.trim() && (
                <p className="text-center text-xs text-muted-foreground">{t('tournaments.pleaseEnterName')}</p>
              )}
            </CardFooter>
          </Card>
        </aside>
      </div>
    </div>
  );
}
