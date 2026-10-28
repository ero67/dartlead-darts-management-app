import React from 'react';

import { cn } from '@/lib/utils';
import logo from '@/assets/logo-256.webp';

// The logo's target, cropped to a round badge: the board fills the middle ~55% of the image, the bull sits at
// its centre (50% across, 43% down), so a 180% wide image shifted by these offsets centres the bull.
const CROP = { width: '180%', left: '-40%', top: '-27%' };

// Animations tell the logo's own story, a dart landing in the bull (keyframes in src/tailwind.css):
//   static   - no motion (header)
//   intro    - once: the board lands like a thrown dart, a shockwave leaves the bull; hover replays the hit
//   thinking - while the assistant works: a dart lands every 1.6 s, the board recoils, a shockwave spreads
const BADGE = {
  static: '',
  intro: 'motion-safe:animate-[logo-land_900ms_cubic-bezier(.2,.8,.2,1)_both] motion-safe:hover:animate-[logo-hit_700ms_ease-out]',
  thinking: 'motion-safe:animate-[logo-hit_1.6s_ease-out_infinite]',
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
      <span className={cn('relative size-full overflow-hidden rounded-full bg-white shadow-sm', BADGE[mode])}>
        <img src={logo} alt="" draggable={false} className="absolute max-w-none select-none" style={CROP} />
      </span>
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
