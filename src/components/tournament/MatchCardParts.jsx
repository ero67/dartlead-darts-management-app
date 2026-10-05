import React from 'react';
import { Play, Eye, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { confirmDialog } from '../../lib/confirmDialog';

// Shared pieces of the group and playoff match cards.

// Pending (outline) / live (red, pulsing dot) / completed (secondary).
export function MatchStatusBadge({ status, isLive, children }) {
  if (isLive || status === 'in_progress') {
    return (
      <Badge className="bg-destructive text-white">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-white" />
        </span>
        {children}
      </Badge>
    );
  }
  if (status === 'completed') return <Badge variant="secondary">{children}</Badge>;
  return <Badge variant="outline">{children}</Badge>;
}

// Name + tabular score. `score` null renders a dash.
export function PlayerScoreRow({ name, score, isWinner, isLoser, hint }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('min-w-0 truncate text-sm', isWinner && 'font-semibold', isLoser && 'text-muted-foreground')}>
        {name}
        {hint}
      </span>
      <span className={cn('text-base font-semibold tabular-nums', isLoser && 'text-muted-foreground')}>
        {score ?? '–'}
      </span>
    </div>
  );
}

// Shown in place of "Start match" to a signed-in user who is not a scorer.
export function NotScorerHint({ t }) {
  return (
    <span
      className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground"
      title={t('management.notScorerHint')}
      onClick={() => toast.info(t('management.notScorerHint'))}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toast.info(t('management.notScorerHint')); }}
    >
      <Lock className="size-3" />
      {t('management.notScorer')}
    </span>
  );
}

export function LoginHint({ t }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={t('management.loginToStartMatch')}>
      <Lock className="size-3" />
      {t('navigation.login')}
    </span>
  );
}

// Start / Continue / Admin take over / Live (other device) / Admin score.
// `canStart` is the card-specific pending condition (playoff cards also need
// both players); `buildMatchData(kind)` returns the payload for 'start',
// 'resume' or 'admin' exactly as the legacy card assembled it.
export function MatchActions({
  match, canStart, isLive, isLiveHere, user, canScore, canManage, isAdmin, t,
  onRequestStart, onMatchStart, buildMatchData
}) {
  return (
    <>
      {canStart && !isLive && (
        !user ? null : canScore === false ? <NotScorerHint t={t} /> : (
          <Button size="sm" disabled={canScore !== true} onClick={() => onRequestStart(buildMatchData('start'))}>
            <Play />
            {t('management.startMatch')}
          </Button>
        )
      )}
      {/* Same device, match in progress here (scorer backed out of the match
          view) — resume from the locally saved state. */}
      {isLive && isLiveHere && user && (
        <Button size="sm" onClick={() => onMatchStart(buildMatchData('resume'))}>
          <Play />
          {t('management.continueMatch')}
        </Button>
      )}
      {isLive && !isLiveHere && (
        isAdmin && user ? (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const ok = (await confirmDialog(t('management.adminTakeOverConfirm')));
              if (!ok) return;
              onMatchStart(buildMatchData('admin'));
            }}
          >
            <Play />
            {t('management.adminTakeOver')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            <Eye />
            {t('management.liveOtherDevice')}
          </Button>
        )
      )}
      {/* Emergency: match is in progress but not detected as live on this device */}
      {match.status === 'in_progress' && !isLive && canManage && user && (
        <Button size="sm" variant="outline" onClick={() => onMatchStart(buildMatchData('admin'))} title={t('management.adminOverride')}>
          <Play />
          {t('management.adminScore')}
        </Button>
      )}
    </>
  );
}
