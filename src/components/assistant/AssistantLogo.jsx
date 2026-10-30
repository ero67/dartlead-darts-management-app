import React from 'react';

import { cn } from '@/lib/utils';

// The assistant's own version of the logo: the same red and navy target, with a gold spark for the bull. An SVG,
// so it stays sharp from the 14px trace icon to the 64px empty chat.
const SPARK_PATH = 'M0-21Q4-4 21 0 4 4 0 21-4 4-21 0-4-4 0-21Z';

// Animations tell the logo's own story, a dart landing in the bull (keyframes in src/tailwind.css):
//   static   - no motion (header)
//   intro    - once: the board lands like a thrown dart, the spark lights up, a shockwave leaves it; hover replays
//   thinking - while the assistant works: a dart lands every 1.6 s, the spark turns, a shockwave spreads
const BADGE = {
  static: '',
  intro: 'motion-safe:animate-[logo-land_900ms_cubic-bezier(.2,.8,.2,1)_both] motion-safe:hover:animate-[logo-hit_700ms_ease-out]',
  thinking: 'motion-safe:animate-[logo-hit_1.6s_ease-out_infinite]',
};
const SPARK = {
  static: '',
  intro: 'motion-safe:animate-[spark-pop_600ms_cubic-bezier(.2,.8,.2,1)_420ms_both] motion-safe:group-hover:animate-[spark-spin_700ms_ease-out]',
  thinking: 'motion-safe:animate-[spark-turn_1.6s_ease-out_infinite]',
};
const RINGS = {
  intro: ['motion-safe:animate-[impact-ring_1s_ease-out_450ms_both]', 'motion-safe:animate-[impact-ring_1s_ease-out_600ms_both]'],
  thinking: ['motion-safe:animate-[impact-ring_1.6s_ease-out_infinite]', 'motion-safe:animate-[impact-ring_1.6s_ease-out_150ms_infinite]'],
};

export function AssistantLogo({ mode = 'static', className, label }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('relative inline-flex size-5 shrink-0', className)}
    >
      <svg viewBox="-62 -62 124 124" className={cn('group size-full rounded-full shadow-sm', BADGE[mode])}>
        <circle r="62" fill="#E63C35" />
        <circle r="51" fill="#fff" />
        <circle r="42" fill="#1C2A56" />
        <circle r="32" fill="#fff" />
        <circle r="23" fill="#1C2A56" />
        {/* fill-box: the spark scales and turns around its own centre. */}
        <path d={SPARK_PATH} fill="#F2B632" className={cn('origin-center [transform-box:fill-box]', SPARK[mode])} />
      </svg>
      {/* Shockwaves start at the bull and spread past the badge, so they sit outside its clipping. */}
      {(RINGS[mode] || []).map((animation, i) => (
        <span
          key={i}
          className={cn('pointer-events-none absolute inset-0 m-auto size-1/3 rounded-full border-2 border-[#e9b33a] opacity-0', animation)}
        />
      ))}
    </span>
  );
}
