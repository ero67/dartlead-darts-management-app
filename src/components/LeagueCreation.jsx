import React, { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const PLACEMENTS = [
  ['1', 'leagues.1stPlace'],
  ['2', 'leagues.2ndPlace'],
  ['3', 'leagues.3rdPlace'],
  ['4', 'leagues.4thPlace'],
  ['5', 'leagues.5thPlace'],
  ['default', 'leagues.defaultSixthPlus'],
];

export function LeagueCreation({ onLeagueCreated, onBack }) {
  const { t } = useLanguage();
  const [leagueName, setLeagueName] = useState('');
  const [description, setDescription] = useState('');
  const [scoringRules, setScoringRules] = useState({
    placementPoints: { '1': 12, '2': 9, '3': 7, '4': 5, '5': 3, default: 1 },
    allowManualOverride: true,
  });

  const createLeague = () => {
    if (!leagueName.trim()) {
      toast.error(t('leagues.pleaseEnterLeagueName'));
      return;
    }
    onLeagueCreated({
      id: crypto.randomUUID(),
      name: leagueName.trim(),
      description: description.trim() || null,
      status: 'active',
      scoringRules,
      defaultTournamentSettings: null, // Can be set later in settings
      players: [], // Players can be added after creation
    });
  };

  const updatePlacementPoints = (placement, value) => {
    setScoringRules(prev => ({
      ...prev,
      placementPoints: { ...prev.placementPoints, [placement]: parseInt(value) || 0 },
    }));
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 text-foreground md:p-8">
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground" onClick={onBack}>
          <ArrowLeft />
          {t('leagues.backToLeagues')}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t('leagues.createNewLeague')}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('leagues.leagueName')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="league-name">{t('leagues.leagueName')} *</Label>
            <Input
              id="league-name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              placeholder={t('leagues.enterLeagueName')}
              maxLength={100}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="league-description">{t('leagues.descriptionOptional')}</Label>
            <Textarea
              id="league-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('leagues.describeLeague')}
              rows={3}
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('leagues.scoringRules')}</CardTitle>
          <CardDescription>{t('leagues.scoringRulesCreateDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {PLACEMENTS.map(([key, labelKey]) => (
              <div key={key} className="flex flex-col gap-2">
                <Label htmlFor={`points-${key}`}>{t(labelKey)}</Label>
                <Input
                  id={`points-${key}`}
                  type="number"
                  min="0"
                  inputMode="numeric"
                  className="tabular-nums"
                  value={scoringRules.placementPoints[key] || 0}
                  onChange={(e) => updatePlacementPoints(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={createLeague} disabled={!leagueName.trim()}>
          <Save />
          {t('leagues.createLeague')}
        </Button>
      </div>
    </div>
  );
}
