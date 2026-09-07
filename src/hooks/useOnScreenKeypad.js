import { useState, useEffect } from 'react';

const detect = () => {
  if (typeof window === 'undefined') return true;
  const isCoarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
  const isTabletOrMobileWidth = window.innerWidth <= 1024;
  return isCoarsePointer || isTabletOrMobileWidth;
};

// Whether the 3-dart-total input should render an on-screen keypad (touch
// devices and narrow screens) or a plain text field for keyboard entry.
export function useOnScreenKeypad() {
  const [useOnScreenKeypad, setUseOnScreenKeypad] = useState(detect);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
    const update = () => setUseOnScreenKeypad(detect());

    update();
    window.addEventListener('resize', update);
    if (media) {
      // Safari uses addListener/removeListener
      if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
      else if (typeof media.addListener === 'function') media.addListener(update);
    }

    return () => {
      window.removeEventListener('resize', update);
      if (media) {
        if (typeof media.removeEventListener === 'function') media.removeEventListener('change', update);
        else if (typeof media.removeListener === 'function') media.removeListener(update);
      }
    };
  }, []);

  return useOnScreenKeypad;
}
