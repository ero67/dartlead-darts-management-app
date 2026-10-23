import React from 'react';
import { cn } from '@/lib/utils';

// The strokes of a cricket mark in a 24x24 box, in currentColor: 0 a faint
// dot, 1 "/", 2 "X", 3+ a circled X. Shared by MarkGlyph and the board SVG.
export function MarkPaths({ count = 0 }) {
  if (count <= 0) return <circle cx="12" cy="12" r="1.6" fill="currentColor" opacity="0.3" />;
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
      <path d={count >= 3 ? 'M8 16 16 8' : 'M6 18 18 6'} />
      {count >= 2 && <path d={count >= 3 ? 'M8 8l8 8' : 'M6 6l12 12'} />}
      {count >= 3 && <circle cx="12" cy="12" r="9.2" />}
    </g>
  );
}

export function MarkGlyph({ count = 0, className }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-5 shrink-0', className)}>
      <MarkPaths count={count} />
    </svg>
  );
}
