import React from 'react';
import { CalendarClock, MapPin } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatRoundDate, toDateTimeInput, fromDateTimeInput } from '../../utils/roundSchedule';
import { cn } from '@/lib/utils';

// Planned date/time and venue of a round; renders nothing when neither is set.
export function RoundSchedule({ startsAt, venue, className }) {
  const { language } = useLanguage();
  if (!startsAt && !venue) return null;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground', className)}>
      {startsAt && (
        <span className="flex items-center gap-1.5">
          <CalendarClock className="size-4 shrink-0" />
          <time dateTime={startsAt}>{formatRoundDate(startsAt, language)}</time>
        </span>
      )}
      {venue && (
        <span className="flex min-w-0 items-center gap-1.5">
          <MapPin className="size-4 shrink-0" />
          <span className="truncate">{venue}</span>
        </span>
      )}
    </div>
  );
}

// Date/time + venue inputs shared by tournament creation and both edit dialogs.
// `value` = { startsAt: ISO | null, venue: string }.
export function RoundScheduleFields({ idPrefix, value, onChange }) {
  const { t } = useLanguage();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${idPrefix}-starts-at`}>{t('schedule.startsAt')}</Label>
        <Input
          id={`${idPrefix}-starts-at`}
          type="datetime-local"
          value={toDateTimeInput(value.startsAt)}
          onChange={(e) => onChange({ ...value, startsAt: fromDateTimeInput(e.target.value) })}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${idPrefix}-venue`}>{t('schedule.venue')}</Label>
        <Input
          id={`${idPrefix}-venue`}
          type="text"
          value={value.venue || ''}
          onChange={(e) => onChange({ ...value, venue: e.target.value })}
          placeholder={t('schedule.venuePlaceholder')}
          maxLength={200}
        />
      </div>
    </div>
  );
}
