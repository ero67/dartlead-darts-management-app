import React, { useState } from 'react';
import { ClipboardList, Copy, ExternalLink, Monitor, Target } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useLiveMatch } from '../../contexts/LiveMatchContext';
import { DeviceSettings } from '../DeviceSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { getPublicAppUrl } from '../../utils/publicUrl';

function Row({ icon, title, hint, children }) {
  const Icon = icon;
  return (
    <div className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-7">{children}</div>
    </div>
  );
}

// Manager view before Start: everything the venue needs (TV, scorers, this
// phone's board) in one place, so it can be ready before players arrive.
export function VenueSetup({ tournamentId, scorersAnchorId }) {
  const { t } = useLanguage();
  const { boardNumber } = useLiveMatch();
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const tvPath = `/tv/${tournamentId}`;

  const handleCopyTvLink = async () => {
    const link = `${getPublicAppUrl()}${tvPath}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('venue.tvLinkCopied'));
    } catch {
      // No clipboard (non-secure origin, old browser): show the link to copy by hand.
      toast.message(link);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('venue.title')}</CardTitle>
        <CardDescription>{t('venue.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Row icon={Monitor} title={t('venue.tvTitle')} hint={t('venue.tvHint')}>
          <Button variant="outline" size="sm" asChild>
            <a href={tvPath} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              {t('venue.openTv')}
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopyTvLink}>
            <Copy />
            {t('venue.copyTvLink')}
          </Button>
        </Row>

        <Row icon={ClipboardList} title={t('venue.scorersTitle')} hint={t('venue.scorersHint')}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById(scorersAnchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {t('venue.manageScorers')}
          </Button>
        </Row>

        <Row
          icon={Target}
          title={t('venue.boardTitle')}
          hint={boardNumber ? t('venue.boardSet', { board: boardNumber }) : t('venue.boardNotSet')}
        >
          <Button variant="outline" size="sm" onClick={() => setShowDeviceSettings(true)}>
            {t('venue.setBoard')}
          </Button>
        </Row>

        <p className="text-xs text-muted-foreground">{t('venue.boardsAfterStart')}</p>
      </CardContent>
      <DeviceSettings isOpen={showDeviceSettings} onClose={() => setShowDeviceSettings(false)} />
    </Card>
  );
}
