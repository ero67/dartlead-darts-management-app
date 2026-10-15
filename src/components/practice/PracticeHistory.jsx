import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Cloud, History, Smartphone, Trash2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '../shared/EmptyState';
import { PracticeGameAbbr } from './PracticeShared';
import { sessionHeadline } from './practiceView';
import { PRACTICE_GAMES, describeSession, formatDuration, sessionHighlights, pluralSuffix } from '../../lib/practiceGames';
import { loadHistory, clearHistory } from '../../lib/practiceStorage';
import { practiceService } from '../../services/practiceService';
import { confirmDialog } from '../../lib/confirmDialog';
import { cn } from '@/lib/utils';

const PAGE = 20;
const STRIP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (timestamp) => new Date(new Date(timestamp).toDateString()).getTime();
const locale = (language) => (language === 'sk' ? 'sk-SK' : 'en-GB');

const dayLabel = (day, today, language, t) => {
  if (day === today) return t('practice.history.today');
  if (day === today - DAY_MS) return t('practice.history.yesterday');
  try {
    return new Date(day).toLocaleDateString(locale(language), { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

const shortDate = (day, language) => {
  try {
    return new Date(day).toLocaleDateString(locale(language), { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

export function PracticeHistory() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState(() => loadHistory());
  const [filter, setFilter] = useState('all');
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async (id) => {
    setError(null);
    try {
      setHistory(await practiceService.deleteSession(user?.id, id));
    } catch (err) {
      console.error('Failed to delete practice session:', err);
      setHistory(loadHistory());
      setError(t('practice.sync.deleteFailed'));
    }
  };

  const handleClearAll = async () => {
    if (!(await confirmDialog(t(user ? 'practice.history.confirmClearCloud' : 'practice.history.confirmClear'), { destructive: true }))) return;
    setError(null);
    try {
      await practiceService.deleteAll(user?.id);
      clearHistory();
      setHistory([]);
    } catch (err) {
      console.error('Failed to clear practice history:', err);
      setError(t('practice.sync.deleteFailed'));
    }
  };

  const handleFilter = (game) => {
    setFilter(game);
    setIsShowingAll(false);
  };

  const filters = [
    ['all', t('tournaments.all'), history.length],
    ...PRACTICE_GAMES.map(g => [g.id, t(`practice.games.${g.id}.title`), history.filter(e => e.game === g.id).length]).filter(([, , n]) => n > 0)
  ];
  const filtered = filter === 'all' ? history : history.filter(e => e.game === filter);
  const shown = isShowingAll ? filtered : filtered.slice(0, PAGE);

  // Darts thrown per day over the last 30 days, for the activity strip.
  const today = startOfDay(Date.now());
  const firstDay = today - (STRIP_DAYS - 1) * DAY_MS;
  const perDay = Array(STRIP_DAYS).fill(0);
  let stripSessions = 0;
  for (const e of filtered) {
    if (!e.finishedAt || e.finishedAt < firstDay) continue;
    perDay[Math.min(STRIP_DAYS - 1, Math.floor((startOfDay(e.finishedAt) - firstDay) / DAY_MS))] += e.stats?.totalDarts || 0;
    stripSessions += 1;
  }
  const stripDarts = perDay.reduce((a, b) => a + b, 0);
  const stripMax = Math.max(1, ...perDay);

  // Group the shown sessions by calendar day, newest first (history is sorted).
  const days = [];
  for (const e of shown) {
    const day = startOfDay(e.finishedAt || 0);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 text-foreground md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={() => navigate('/practice')}>
            <ArrowLeft /> {t('practice.backToPractice')}
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{t('practice.history.title')}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {user ? <Cloud className="size-3.5 text-primary" /> : <Smartphone className="size-3.5" />}
            {user ? t('practice.sync.note') : t('practice.savedLocally')}
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="outline" className="text-destructive" onClick={handleClearAll}>
            <Trash2 /> {t('practice.history.clearAll')}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {history.length === 0 ? (
        <EmptyState icon={History} title={t('practice.history.empty')} description={t('practice.history.emptyHint')} />
      ) : (
        <>
          <div role="group" className="flex flex-wrap gap-2">
            {filters.map(([id, label, count]) => (
              <Button
                key={id}
                type="button"
                variant={filter === id ? 'default' : 'outline'}
                aria-pressed={filter === id}
                className="min-h-11 rounded-full px-4"
                onClick={() => handleFilter(id)}
              >
                {label} <span className={cn('text-xs tabular-nums', filter === id ? 'opacity-80' : 'text-muted-foreground')}>{count}</span>
              </Button>
            ))}
          </div>

          <Card className="gap-2.5 px-4 py-4" aria-label={t('practice.history.last30')}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('practice.history.last30')}</span>
              <span className="text-sm text-muted-foreground [&_b]:font-display [&_b]:text-xl [&_b]:font-semibold [&_b]:text-foreground [&_b]:tabular-nums">
                <b>{stripDarts.toLocaleString()}</b> {t('practice.stats.darts').toLowerCase()} · <b>{stripSessions}</b> {t('practice.stats.sessions').toLowerCase()}
              </span>
            </div>
            <div aria-hidden="true" className="flex h-16 items-end gap-[3px]">
              {perDay.map((darts, i) => (
                <span
                  key={i}
                  className={cn('flex-1 rounded-t-sm', darts === 0 ? 'bg-muted' : i === STRIP_DAYS - 1 ? 'bg-primary' : 'bg-primary/70')}
                  style={{ height: darts ? `${Math.max(12, Math.round((darts / stripMax) * 100))}%` : '3px' }}
                />
              ))}
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{shortDate(firstDay, language)}</span>
              <span>{shortDate(firstDay + Math.floor(STRIP_DAYS / 2) * DAY_MS, language)}</span>
              <span>{t('practice.history.today')}</span>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState icon={History} title={t('practice.history.empty')} />
          ) : (
            <section className="flex flex-col gap-4">
              {days.map(({ day, items }) => {
                const darts = items.reduce((sum, e) => sum + (e.stats?.totalDarts || 0), 0);
                return (
                  <div key={day} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between px-1">
                      <h2 className="text-sm font-semibold">{dayLabel(day, today, language, t)}</h2>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {t(`practice.history.sessionCount${pluralSuffix(items.length)}`, { count: items.length })} · {t(`practice.stats.darts${pluralSuffix(darts)}`, { count: darts })}
                      </span>
                    </div>
                    <Card className="gap-0 divide-y py-0">
                      {items.map((entry) => <HistoryRow key={entry.id} entry={entry} t={t} onDelete={handleDelete} />)}
                    </Card>
                  </div>
                );
              })}
              {filtered.length > PAGE && (
                <Button variant="outline" className="self-center" onClick={() => setIsShowingAll(v => !v)}>
                  {isShowingAll ? t('practice.history.showFewer') : t('practice.history.showMore', { count: filtered.length - PAGE })}
                </Button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

// One session: game tag, title + settings, the headline result with the
// other highlights, how long it took, delete.
function HistoryRow({ entry, t, onDelete }) {
  const headline = sessionHeadline(entry, t);
  const stats = sessionHighlights(entry, t).slice(1).map(([label, value]) => `${label} ${value}`).join(' · ');
  const duration = formatDuration(entry.startedAt, entry.finishedAt);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pl-4 pr-2">
      <PracticeGameAbbr game={entry.game} />
      <span className="flex min-w-0 flex-[1_1_13rem] flex-col leading-snug">
        <span className="text-sm font-medium">{t(`practice.games.${entry.game}.title`)}</span>
        <span className="text-xs text-muted-foreground">{describeSession(entry, t)}</span>
      </span>
      <span className="flex min-w-0 flex-[1_1_12rem] flex-col leading-snug">
        <span className={cn('font-display text-xl font-bold tabular-nums', headline.isWin && 'text-primary')}>{headline.text}</span>
        {stats && <span className="truncate text-xs text-muted-foreground tabular-nums">{stats}</span>}
      </span>
      {duration && (
        <span className="inline-flex w-16 shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums" title={t('practice.history.duration')}>
          <Clock className="size-3.5" /> {duration}
        </span>
      )}
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => onDelete(entry.id)} title={t('practice.history.delete')} aria-label={t('practice.history.delete')}>
        <Trash2 />
      </Button>
    </div>
  );
}
