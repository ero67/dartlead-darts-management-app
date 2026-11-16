import React from 'react';
import { cn } from '@/lib/utils';

// Decorative: the league or tournament name always sits next to it.
export function LeagueLogo({ src, className }) {
  if (!src) return null;
  return <img src={src} alt="" loading="lazy" className={cn('shrink-0 object-contain', className)} />;
}
