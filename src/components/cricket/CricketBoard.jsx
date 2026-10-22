import React, { useId } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { SEGMENTS } from '../../lib/botPlayer';
import { dartFromInput } from '../../lib/x01Engine';
import { isCricketNumber } from '../../lib/cricket';
import { MarkPaths } from './MarkGlyph';
import { markCount, numberState } from './cricketView';
import { cn } from '@/lib/utils';

// Stylised radii (double wire = 100): the treble, double and bull rings are
// wider than on a real board so each one is a fair tap target on a phone.
const R = { bullIn: 8, bullOut: 17, trebleIn: 45, trebleOut: 59, doubleIn: 82, doubleOut: 100, band: 121 };
const NUMBER_R = 110.5;
const HALF = 9; // degrees either side of a wedge's centre

const pt = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [+(r * Math.sin(a)).toFixed(2), +(-r * Math.cos(a)).toFixed(2)];
};
const sector = (r1, r2, a1, a2) => {
  const [x1, y1] = pt(r2, a1);
  const [x2, y2] = pt(r2, a2);
  const [x3, y3] = pt(r1, a2);
  const [x4, y4] = pt(r1, a1);
  return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
};
const disc = (r) => `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
const annulus = (r1, r2) => `${disc(r2)}${disc(r1)}`;

// [ring, r1, r2] of the four tappable regions of a wedge.
const WEDGE_REGIONS = [
  ['single', R.bullOut, R.trebleIn],
  ['triple', R.trebleIn, R.trebleOut],
  ['single', R.trebleOut, R.doubleIn],
  ['double', R.doubleIn, R.doubleOut]
];
const RING_MID = { single: (R.trebleOut + R.doubleIn) / 2, triple: (R.trebleIn + R.trebleOut) / 2, double: (R.doubleIn + R.doubleOut) / 2 };

// Fill per region kind ('single' | 'ring') and wedge parity (dark / light
// wedge, as on a real board). Colour means state; inactive numbers stay faint.
const FILL = {
  inactive: { single: ['fill-foreground/[.07]', 'fill-foreground/[.03]'], ring: ['fill-foreground/[.12]', 'fill-foreground/[.09]'] },
  open: { single: ['fill-foreground/[.32]', 'fill-foreground/[.16]'], ring: ['fill-foreground/[.55]', 'fill-foreground/[.42]'] },
  scoring: { single: ['fill-primary/80', 'fill-primary/60'], ring: ['fill-primary', 'fill-primary'] },
  danger: { single: ['fill-destructive/35', 'fill-destructive/25'], ring: ['fill-destructive/60', 'fill-destructive/60'] },
  dead: { single: ['fill-muted', 'fill-muted'], ring: ['fill-muted-foreground/25', 'fill-muted-foreground/25'] }
};
const BULL_FILL = {
  open: ['fill-foreground/[.42]', 'fill-foreground/[.6]'],
  scoring: ['fill-primary', 'fill-primary'],
  danger: ['fill-destructive/40', 'fill-destructive/60'],
  dead: ['fill-muted', 'fill-muted-foreground/25']
};
const TAPPABLE = 'cursor-pointer outline-none transition-opacity hover:opacity-80 active:opacity-60 focus-visible:stroke-ring focus-visible:[stroke-width:3]';
const NUMBER_TEXT = {
  inactive: 'fill-muted-foreground/45 text-[11px] font-medium',
  open: 'fill-foreground text-[15px] font-semibold',
  scoring: 'fill-primary text-[15px] font-semibold',
  danger: 'fill-destructive text-[15px] font-semibold',
  dead: 'fill-muted-foreground/60 text-[15px] font-semibold'
};

// A visit dart as a dart object; engine state and live_state keep labels ('T20', '25', 'D25', '0').
const toDart = (dart) => {
  if (typeof dart !== 'string') return dart;
  const number = Number(dart.replace(/^[SDT]/, '')) || 0;
  return { number, multiplier: dart[0] === 'T' ? 3 : dart[0] === 'D' ? 2 : 1 };
};

// Where a dart of the visit sits: the middle of the region it hit. Darts in
// the same region fan out a little so each stays visible.
const dartPosition = (dart, i) => {
  if (dart.number === 25) return dart.multiplier === 2 ? [(i - 1) * 4, 0] : pt((R.bullIn + R.bullOut) / 2, i * 120 + 60);
  const idx = SEGMENTS.indexOf(dart.number);
  const ring = dart.multiplier === 3 ? 'triple' : dart.multiplier === 2 ? 'double' : 'single';
  return pt(RING_MID[ring], idx * 18 + (i - 1) * 4.5);
};

// Interactive cricket dartboard. `marks` = [m0, m1] ({20: n, ..., 25: n}),
// coloured from `thrower`'s side: their progress fills a wedge from the
// centre out (one third per mark), closed-and-scoring is solid green, a
// number only the opponent has closed is red, closed by both is hatched grey.
// Beside every cricket number the thrower's marks (bold) and the opponent's
// (faint). `visitDarts` (dart objects or labels) are pinned where they hit.
// With `onDart` every region is a button giving that dart (the number band
// outside the double wire is a miss).
export function CricketBoard({ marks, thrower = 0, onDart, visitDarts, disabled = false, className }) {
  const { t } = useLanguage();
  const hatchId = `cricket-hatch-${useId().replace(/:/g, '')}`;
  const isInteractive = Boolean(onDart) && !disabled;
  const opponent = 1 - thrower;

  const regionProps = (number, ring, label) => (isInteractive
    ? {
      role: 'button',
      tabIndex: 0,
      'aria-label': label,
      onClick: () => onDart(dartFromInput(number, ring)),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onDart(dartFromInput(number, ring));
        }
      }
    }
    : {});
  const ringLabel = (number, ring) => t(`cricket.board.${ring}`, { n: number });

  const bullState = numberState(marks, thrower, 25);
  const bullMine = markCount(marks?.[thrower], 25);

  return (
    <svg
      viewBox={`${-R.band - 2} ${-R.band - 2} ${2 * R.band + 4} ${2 * R.band + 4}`}
      role={isInteractive ? 'group' : 'img'}
      aria-label={t('cricket.board.label')}
      className={cn('block aspect-square w-full touch-manipulation select-none', className)}
    >
      <defs>
        <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" className="stroke-muted-foreground/45" strokeWidth="1.6" />
        </pattern>
      </defs>

      {/* Number band: tapping it is a miss. */}
      <path
        d={annulus(R.doubleOut, R.band)}
        fillRule="evenodd"
        strokeWidth="0.8"
        {...regionProps(0, 'single', t('cricket.board.miss'))}
        className={cn('fill-foreground/[.06] stroke-border', isInteractive && TAPPABLE)}
      />

      {SEGMENTS.map((number, idx) => {
        const centre = idx * 18;
        const parity = idx % 2;
        const isCricket = isCricketNumber(number);
        const state = isCricket ? numberState(marks, thrower, number) : 'inactive';
        const mine = isCricket ? markCount(marks?.[thrower], number) : 0;
        const fills = FILL[state];
        return (
          <g key={number}>
            {WEDGE_REGIONS.map(([ring, r1, r2]) => (
              <path
                key={r1}
                d={sector(r1, r2, centre - HALF, centre + HALF)}
                strokeWidth="0.7"
                {...regionProps(number, ring, ringLabel(number, ring))}
                // One "Single n" stop per wedge for keyboards and screen readers.
                {...(isInteractive && r1 === R.bullOut ? { tabIndex: -1, 'aria-hidden': true } : {})}
                className={cn('stroke-background', fills[ring === 'single' ? 'single' : 'ring'][parity], isInteractive && TAPPABLE)}
              />
            ))}
            <g className="pointer-events-none">
              {(state === 'open' || state === 'danger') && mine > 0 && (
                <path d={sector(R.bullOut, R.bullOut + ((R.doubleOut - R.bullOut) * mine) / 3, centre - HALF, centre + HALF)} className="fill-primary/55" />
              )}
              {state === 'dead' && <path d={sector(R.bullOut, R.doubleOut, centre - HALF, centre + HALF)} fill={`url(#${hatchId})`} />}
            </g>
          </g>
        );
      })}

      {/* Bull: outer (single) and inner (double). */}
      <path d={annulus(R.bullIn, R.bullOut)} fillRule="evenodd" strokeWidth="0.7" {...regionProps(25, 'single', t('cricket.board.outerBull'))} className={cn('stroke-background', BULL_FILL[bullState][0], isInteractive && TAPPABLE)} />
      <path d={disc(R.bullIn)} strokeWidth="0.7" {...regionProps(25, 'double', t('cricket.board.bull'))} className={cn('stroke-background', BULL_FILL[bullState][1], isInteractive && TAPPABLE)} />
      <g className="pointer-events-none">
        {(bullState === 'open' || bullState === 'danger') && bullMine > 0 && (
          <circle r={bullMine === 1 ? R.bullIn : (R.bullIn + R.bullOut) / 2 + 1} className="fill-primary/55 stroke-background" strokeWidth="0.7" />
        )}
        {bullState === 'dead' && <circle r={R.bullOut} fill={`url(#${hatchId})`} />}
      </g>

      {/* Numbers, with the marks of both players beside the cricket ones. */}
      <g className="pointer-events-none font-display">
        {SEGMENTS.map((number, idx) => {
          const isCricket = isCricketNumber(number);
          const state = isCricket ? numberState(marks, thrower, number) : 'inactive';
          const [x, y] = pt(NUMBER_R, idx * 18);
          return (
            <g key={number}>
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className={NUMBER_TEXT[state]}>{number}</text>
              {state === 'dead' && <line x1={x - 9} y1={y} x2={x + 9} y2={y} className="stroke-muted-foreground" strokeWidth="1.4" />}
              {isCricket && (
                <>
                  <MarkAt pos={pt(NUMBER_R, idx * 18 - 9.6)} size={11} count={markCount(marks?.[thrower], number)} className={state === 'scoring' ? 'text-primary' : 'text-foreground'} />
                  <MarkAt pos={pt(NUMBER_R, idx * 18 + 9.6)} size={8.5} count={markCount(marks?.[opponent], number)} className={state === 'danger' ? 'text-destructive' : 'text-muted-foreground'} />
                </>
              )}
            </g>
          );
        })}
        {/* The bull has no number on the band: its label and marks sit in the top-left corner. */}
        <g transform={`translate(${-R.band + 4} ${-R.band + 6})`}>
          <text x="0" y="0" dominantBaseline="central" className={cn(NUMBER_TEXT[bullState], 'text-[13px] uppercase')}>
            {t('cricket.board.bullShort')}
          </text>
          <MarkAt pos={[6, 15]} size={11} count={bullMine} className={bullState === 'scoring' ? 'text-primary' : 'text-foreground'} />
          <MarkAt pos={[19, 15]} size={8.5} count={markCount(marks?.[opponent], 25)} className={bullState === 'danger' ? 'text-destructive' : 'text-muted-foreground'} />
        </g>
      </g>

      {/* Darts of the visit in progress, numbered in throwing order. */}
      <g className="pointer-events-none">
        {(visitDarts || []).map(toDart).map((dart, i) => {
          if (!dart?.number) return null;
          const [x, y] = dartPosition(dart, i);
          return (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle r="6" className="fill-foreground stroke-background" strokeWidth="1.6" />
              <text textAnchor="middle" dominantBaseline="central" className="fill-background font-display text-[8.5px] font-semibold">{i + 1}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// A MarkGlyph drawn inside the board SVG, centred on `pos`.
function MarkAt({ pos, size, count, className }) {
  const s = size / 24;
  return (
    <g transform={`translate(${pos[0] - size / 2} ${pos[1] - size / 2}) scale(${s})`} className={className}>
      <MarkPaths count={count} />
    </g>
  );
}
