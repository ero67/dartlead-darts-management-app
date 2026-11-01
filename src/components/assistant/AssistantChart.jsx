import React from 'react';

import { useLanguage } from '@/contexts/LanguageContext';

const round = (v) => Math.round(v * 100) / 100;
const num = (v) => (Number.isFinite(v) ? v : 0);

// A line, a ranking or a comparison the assistant chose to draw (the "chart" stream event, see
// assistant/src/assistant/server.py). Presentational; text stays in HTML because stretched SVG text distorts.
export function AssistantChart({ chart }) {
  const { t, language } = useLanguage();
  const { kind, unit = null } = chart;
  const points = chart.points ?? [];
  const rows = chart.rows ?? [];
  if (kind === 'versus' ? !rows.length : points.length < 3) return null;

  const statName = (stat) => {
    const key = `assistant.chart.stat.${stat}`;
    const name = t(key);
    return name === key ? stat : name;
  };
  const value = (v) => `${round(num(v))}${unit ?? ''}`;
  // Labels are ISO days, shown short in the app's language; "" or an unparseable label shows as is.
  const day = (label) => {
    const date = new Date(label);
    if (!label || Number.isNaN(date.getTime())) return label;
    return date.toLocaleDateString(language === 'sk' ? 'sk-SK' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  const stat = statName(chart.stat);
  const subject = chart.subject ?? '';
  const title = chart.chart === 'ranking'
    ? t(subject ? 'assistant.chart.rankingIn' : 'assistant.chart.ranking', { subject, stat })
    : t(`assistant.chart.${chart.chart}`, { subject, stat });

  let summary;
  let body;

  if (kind === 'line') {
    const values = points.map((p) => num(p.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const x = (i) => (i / (values.length - 1)) * 100;
    const y = (v) => (max === min ? 50 : (1 - (v - min) / (max - min)) * 100);
    const last = values.length - 1;
    const first = points[0];
    const end = points[last];
    summary = `${day(first.label)} ${value(first.value)}, ${day(end.label)} ${value(end.value)}`;
    body = (
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs font-medium">
          <span>{value(first.value)}</span>
          <span>{value(end.value)}</span>
        </div>
        <div className="relative h-24 w-full">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            <line x1="0" x2="100" y1="50" y2="50" className="stroke-muted-foreground/40" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <polyline
              points={values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')}
              fill="none"
              className="stroke-primary"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {[0, last].map((i) => (
            <span
              key={i}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary"
              style={{ left: `${x(i)}%`, top: `${y(values[i])}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{day(first.label)}</span>
          <span>{day(end.label)}</span>
        </div>
      </div>
    );
  } else if (kind === 'bars') {
    const max = Math.max(...points.map((p) => num(p.value)));
    summary = points.map((p) => `${p.label} ${value(p.value)}`).join(', ');
    body = (
      <div className="flex flex-col gap-2">
        {points.map((p, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex justify-between gap-2 text-xs">
              <span className="min-w-0 truncate">{p.label}</span>
              <span className="shrink-0 font-medium">{value(p.value)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: max > 0 ? `${(Math.max(num(p.value), 0) / max) * 100}%` : '0%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (kind === 'versus') {
    const [a, b] = chart.players ?? [];
    summary = rows.map((r) => `${statName(r.stat)} (${t(`assistant.chart.${r.scope}`)}) ${a} ${round(num(r.a))}, ${b} ${round(num(r.b))}`).join('; ');
    body = (
      <div className="flex flex-col gap-3">
        <div className="flex justify-between gap-3 text-xs font-medium">
          <span className="flex min-w-0 items-center gap-1.5"><span className="size-2 shrink-0 rounded-full bg-primary" /><span className="truncate">{a}</span></span>
          <span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{b}</span><span className="size-2 shrink-0 rounded-full bg-chart-5" /></span>
        </div>
        {['direct', 'career'].map((scope) => {
          const group = rows.filter((r) => r.scope === scope);
          return group.length > 0 && (
            <div key={scope} className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`assistant.chart.${scope}`)}</span>
              {group.map((r, i) => {
                const sum = num(r.a) + num(r.b);
                const share = sum > 0 ? (num(r.a) / sum) * 100 : 50;
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="shrink-0 font-medium">{round(num(r.a))}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{statName(r.stat)}</span>
                      <span className="shrink-0 font-medium">{round(num(r.b))}</span>
                    </div>
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${share}%` }} />
                      <div className="h-full flex-1 bg-chart-5" />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  } else {
    return null;
  }

  return (
    <figure className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div role="img" aria-label={`${title}. ${summary}`}>{body}</div>
      {chart.lower_is_better && <p className="text-xs text-muted-foreground">{t('assistant.chart.lowerIsBetter')}</p>}
    </figure>
  );
}
